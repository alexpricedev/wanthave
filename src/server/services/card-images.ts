// Card art proxy + cache. The browser and the OG renderer both get card images
// from our own origin: it keeps img-src 'self' intact (no CSP hole) and gives
// the OG renderer local bytes to composite. Art lives in our own S3 bucket
// (populated by scripts/sync-card-art.ts) rather than being proxied from a
// community CDN, so a new set's images are available the day the set is.
// Images are immutable, so once read they're cached on disk and in memory
// forever and the bucket is hit at most once per card per boot.

import sharp from "sharp";
import { artObjectKey, getCardById } from "./cards";
import { log } from "./logger";

const CACHE_DIR = ".cache/cards";
const memoryCache = new Map<string, Uint8Array>();
const inflight = new Map<string, Promise<Uint8Array | null>>();

const cachePath = (id: string): string => `${CACHE_DIR}/${id}.webp`;

const fetchAndCache = async (id: string): Promise<Uint8Array | null> => {
  const card = getCardById(id);
  if (!card) return null;

  const onDisk = Bun.file(cachePath(id));
  if (await onDisk.exists()) {
    const bytes = new Uint8Array(await onDisk.arrayBuffer());
    memoryCache.set(id, bytes);
    return bytes;
  }

  try {
    const object = Bun.s3.file(artObjectKey(card));
    if (!(await object.exists())) {
      // A card in the catalogue whose art hasn't been synced yet — expected in
      // the window between a set landing and sync-card-art.ts running. The
      // proxy serves a placeholder tile for this; nothing is cached, so it
      // resolves itself once the sync happens.
      log.warn("card-images", `No art in bucket for ${id}`);
      return null;
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    await Bun.write(cachePath(id), bytes);
    memoryCache.set(id, bytes);
    return bytes;
  } catch (error) {
    log.warn(
      "card-images",
      `Read failed for ${id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
};

// Returns the webp bytes for a card, or null if the id is unknown or the fetch
// failed. Concurrent requests for the same id share one fetch.
export const getCardImageBytes = async (
  id: string,
): Promise<Uint8Array | null> => {
  const cached = memoryCache.get(id);
  if (cached) return cached;

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
