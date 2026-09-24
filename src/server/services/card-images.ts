// Card art proxy + cache. The browser and the OG renderer both get card images
// from our own origin: it keeps img-src 'self' intact (no CSP hole) and gives
// the OG renderer local bytes to composite. Art lives in our own S3 bucket
// (populated by scripts/sync-card-art.ts) rather than being proxied from a
// community CDN, so a new set's images are available the day the set is.
// Images are immutable, so once read they're cached on disk forever and the
// bucket is hit at most once per card per boot. The in-memory tier in front of
// that disk cache is bounded (see MAX_CACHE_BYTES) — it saves a file read, not
// a bucket read, so it can be evicted freely.

import sharp from "sharp";
import { artObjectKey, getCardById } from "./cards";
import { log } from "./logger";

// "We don't have this" and "we couldn't find out" need telling apart. `absent`
// is a normal state with a known remedy (run the sync) and is safe to answer
// with a cacheable placeholder. `error` means the bucket didn't answer, which is
// never safe to cache — a blank tile pinned at the CDN would outlive the blip
// that caused it — and, if the S3 credentials are wrong, is the only signal that
// anything is broken at all.
export type CardImage =
  | { status: "ok"; bytes: Uint8Array }
  | { status: "absent" }
  | { status: "error" };

const CACHE_DIR = ".cache/cards";

// The memory cache is a bound on what art costs us, not a bound on what art we
// can serve: every entry is also on disk, so an eviction costs a local file read
// on the next request, never a bucket round-trip. Without a cap the Map grows to
// the whole catalogue — ~3600 cards at ~48KB each, about 175MB resident — and
// since art is reached by browsing as well as by unfurling, a crawler walking
// /img/card/:id is enough to get there.
const MAX_CACHE_BYTES = 32 * 1024 * 1024;

// A Map that evicts its least recently used entries to stay under a byte
// budget. Exported so the eviction rule can be tested on its own, without
// standing up a bucket or writing megabytes to disk.
export class ByteCappedCache {
  private readonly entries = new Map<string, Uint8Array>();
  private total = 0;

  constructor(private readonly maxBytes: number) {}

  get size(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.total;
  }

  // Reading counts as use: Map iterates in insertion order, so re-inserting on
  // every hit leaves the least recently used key at the front and makes
  // eviction a walk from there.
  get(id: string): Uint8Array | undefined {
    const value = this.entries.get(id);
    if (!value) return undefined;
    this.entries.delete(id);
    this.entries.set(id, value);
    return value;
  }

  set(id: string, value: Uint8Array): void {
    const existing = this.entries.get(id);
    if (existing) this.total -= existing.byteLength;
    this.entries.delete(id);
    this.entries.set(id, value);
    this.total += value.byteLength;

    for (const [oldest, evicted] of this.entries) {
      if (this.total <= this.maxBytes) break;
      // Never evict what was just stored — the caller is about to use it. An
      // entry larger than the whole budget therefore stays, alone, rather than
      // the cache thrashing itself empty on every write.
      if (oldest === id) break;
      this.entries.delete(oldest);
      this.total -= evicted.byteLength;
    }
  }

  clear(): void {
    this.entries.clear();
    this.total = 0;
  }

  values(): IterableIterator<Uint8Array> {
    return this.entries.values();
  }
}

const memoryCache = new ByteCappedCache(MAX_CACHE_BYTES);
const inflight = new Map<string, Promise<CardImage>>();

const cachePath = (id: string): string => `${CACHE_DIR}/${id}.webp`;

const fetchAndCache = async (id: string): Promise<CardImage> => {
  const card = getCardById(id);
  if (!card) return { status: "absent" };

  const onDisk = Bun.file(cachePath(id));
  if (await onDisk.exists()) {
    const bytes = new Uint8Array(await onDisk.arrayBuffer());
    memoryCache.set(id, bytes);
    return { status: "ok", bytes };
  }

  try {
    const object = Bun.s3.file(artObjectKey(card));
    if (!(await object.exists())) {
      // A card in the catalogue whose art hasn't been synced yet — expected in
      // the window between a set landing and sync-card-art.ts running. Nothing
      // is cached, so it resolves itself once the sync happens.
      log.warn("card-images", `No art in bucket for ${id}`);
      return { status: "absent" };
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    await Bun.write(cachePath(id), bytes);
    memoryCache.set(id, bytes);
    return { status: "ok", bytes };
  } catch (error) {
    // Logged at error, not warn: every card failing this way means the bucket is
    // unreachable or misconfigured, and that should be loud.
    log.error(
      "card-images",
      `Read failed for ${id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { status: "error" };
  }
};

// Returns a card's webp bytes, or why we haven't got them. Concurrent requests
// for the same id share one read.
export const getCardImage = async (id: string): Promise<CardImage> => {
  const cached = memoryCache.get(id);
  if (cached) return { status: "ok", bytes: cached };

  const existing = inflight.get(id);
  if (existing) return existing;

  const promise = fetchAndCache(id).finally(() => inflight.delete(id));
  inflight.set(id, promise);
  return promise;
};

// A blank card-shaped tile, served for a card whose art isn't in the bucket —
// the window between adding a set to the catalogue and running
// scripts/sync-card-art.ts, where the newest cards would otherwise render as
// broken-image icons. The name already sits in the caption beside the art, so
// the tile carries no text of its own.
let placeholder: Uint8Array | null = null;

export const getPlaceholderImageBytes = async (): Promise<Uint8Array> => {
  if (placeholder) return placeholder;
  const svg = `<svg width="367" height="512" xmlns="http://www.w3.org/2000/svg">
    <rect width="367" height="512" rx="18" fill="#1b1a20"/>
    <rect x="1" y="1" width="365" height="510" rx="17" fill="none"
      stroke="#ffffff" stroke-opacity="0.08" stroke-width="2"/>
  </svg>`;
  placeholder = new Uint8Array(
    await sharp(Buffer.from(svg)).webp({ quality: 90 }).toBuffer(),
  );
  return placeholder;
};

// Exact size of the in-memory art cache. Read by the memory probe: Bun does not
// populate `arrayBuffers` in process.memoryUsage() and under-reports `external`,
// so the only trustworthy measure of what this Map holds is summing it directly.
export const cardImageCacheStats = (): { entries: number; bytes: number } => {
  let bytes = 0;
  for (const value of memoryCache.values()) bytes += value.byteLength;
  return { entries: memoryCache.size, bytes };
};
