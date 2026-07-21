// Card art proxy + cache. The browser and the OG renderer both get card images
// from our own origin, never hotlinking the Limitless CDN directly: it keeps
// img-src 'self' intact (no CSP hole), survives a CDN that blocks hotlinking,
// and gives the OG renderer local bytes to composite. Images are immutable, so
// once fetched they're cached on disk and in memory forever.

import { getCardById, limitlessUrl } from "./cards";
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
    const res = await fetch(limitlessUrl(card));
    if (!res.ok) {
      log.warn("card-images", `Upstream ${res.status} for ${id}`);
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    await Bun.write(cachePath(id), bytes);
    memoryCache.set(id, bytes);
    return bytes;
  } catch (error) {
    log.warn(
      "card-images",
      `Fetch failed for ${id}: ${error instanceof Error ? error.message : String(error)}`,
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
