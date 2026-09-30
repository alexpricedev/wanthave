#!/usr/bin/env bun
/**
 * Mirror the card art for our catalogue into the app's S3 bucket.
 *
 * Art comes from the `flibustier/pokemon-tcg-pocket-database` GitHub release,
 * which ships every set's images under `dist/images/cards-by-set/{SET}/{N}.webp`
 * — the same 367x512 webp renders the Limitless CDN serves (spot-checked across
 * B3b: mean pixel difference ~1.5/255, i.e. the same art re-encoded). That repo
 * is already our catalogue's source of truth (see build-cards.ts), and it cuts a
 * release the same day a set's data lands, whereas Limitless uploads the art
 * days later. Mirroring it ourselves is what removes that gap.
 *
 * The release is a ~380MB zip, but we never download it whole. Zip is a
 * random-access format: the central directory at the tail lists every file with
 * its offset, so we fetch that once and then issue one ranged request per image
 * we actually need. A first full sync moves ~171MB; later runs move only the new
 * set.
 *
 * Run: `bun run scripts/sync-card-art.ts [--set B4] [--force] [--dry-run]`
 * Needs the S3_* env vars (Railway injects these; Bun.s3 reads them natively).
 */

import {
  artObjectKey,
  type Card,
  getCardsBySet,
  SETS,
} from "../src/server/services/cards";

// Pin the release explicitly. A new set means bumping this and re-running, which
// is the one manual step this mirror costs us — and it's a deliberate one, since
// an unpinned "latest" would silently change art under us.
const RELEASE =
  "https://github.com/flibustier/pokemon-tcg-pocket-database/releases/download/2.11.0/dist.zip";

const IMAGE_PATH = /\/cards-by-set\/([^/]+)\/(\d+)\.webp$/;

const args = new Set(Bun.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");
const setFilter = (() => {
  const i = Bun.argv.indexOf("--set");
  return i === -1 ? null : Bun.argv[i + 1];
})();

interface ZipEntry {
  set: string;
  number: number;
  /** Compression method: 0 = stored, 8 = deflate. */
  method: number;
  compressedSize: number;
  /** Byte offset of this file's local header within the zip. */
  localHeaderOffset: number;
}

const ranged = async (url: string, from: number, to?: number): Promise<Uint8Array> => {
  const res = await fetch(url, {
    headers: { Range: `bytes=${from}-${to ?? ""}` },
  });
  if (!res.ok) throw new Error(`Range request failed: ${res.status} ${url}`);
  return new Uint8Array(await res.arrayBuffer());
};

// Read the zip's central directory: the End Of Central Directory record sits in
// the last 64KB and points at the full index.
const readIndex = async (url: string): Promise<Map<string, ZipEntry>> => {
  const head = await fetch(url, { method: "HEAD", redirect: "follow" });
  const size = Number(head.headers.get("content-length"));
  if (!size) throw new Error("Could not determine release size");

  const tail = await ranged(url, Math.max(0, size - 65536));
  const tdv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tdv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("No End Of Central Directory record found");

  const cdSize = tdv.getUint32(eocd + 12, true);
  const cdOffset = tdv.getUint32(eocd + 16, true);
  const cd = await ranged(url, cdOffset, cdOffset + cdSize - 1);
  const dv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const decoder = new TextDecoder();

  const entries = new Map<string, ZipEntry>();
  let i = 0;
  while (i < cd.length - 46) {
    if (dv.getUint32(i, true) !== 0x02014b50) {
      i++;
      continue;
    }
    const nameLen = dv.getUint16(i + 28, true);
    const extraLen = dv.getUint16(i + 30, true);
    const commentLen = dv.getUint16(i + 32, true);
    const name = decoder.decode(cd.subarray(i + 46, i + 46 + nameLen));
    const match = name.match(IMAGE_PATH);
    if (match) {
      entries.set(`${match[1]}/${Number(match[2])}`, {
        set: match[1],
        number: Number(match[2]),
        method: dv.getUint16(i + 10, true),
        compressedSize: dv.getUint32(i + 20, true),
        localHeaderOffset: dv.getUint32(i + 42, true),
      });
    }
    i += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
};

// Pull one file out of the zip. The local header repeats the name and extra
// fields, whose lengths we only learn by reading it, so overshoot the range by
// enough to cover them and slice the payload out of the result.
const LOCAL_HEADER_SLACK = 1024;

const extract = async (url: string, entry: ZipEntry): Promise<Uint8Array> => {
  const from = entry.localHeaderOffset;
  const to = from + 30 + LOCAL_HEADER_SLACK + entry.compressedSize;
  const buf = await ranged(url, from, to);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x04034b50) {
    throw new Error(`Bad local header for ${entry.set}/${entry.number}`);
  }
  const at = 30 + dv.getUint16(26, true) + dv.getUint16(28, true);
  const payload = buf.subarray(at, at + entry.compressedSize);
  return entry.method === 8 ? Bun.inflateSync(payload) : payload;
};

const targets: Card[] = (setFilter ? [setFilter] : SETS.map((s) => s.code)).flatMap(
  (code) => getCardsBySet(code),
);
if (targets.length === 0) {
  throw new Error(setFilter ? `No cards in set ${setFilter}` : "Empty catalogue");
}

console.log(`Indexing ${RELEASE.split("/").slice(-2)[0]}…`);
const index = await readIndex(RELEASE);
console.log(`  ${index.size} images in release`);

// Skip what's already uploaded so a re-run after a new set only moves that set.
const pending: Card[] = [];
const absent: string[] = [];
for (const card of targets) {
  if (!index.has(`${card.set}/${card.number}`)) {
    absent.push(card.id);
    continue;
  }
  if (!force && (await Bun.s3.file(artObjectKey(card)).exists())) continue;
  pending.push(card);
}

if (absent.length > 0) {
  console.warn(
    `WARNING: ${absent.length} catalogue cards have no image in this release: ${absent.slice(0, 10).join(", ")}${absent.length > 10 ? "…" : ""}`,
  );
}
console.log(
  `${targets.length} card(s) targeted · ${pending.length} to upload · ${targets.length - pending.length - absent.length} already present`,
);
if (dryRun || pending.length === 0) {
  console.log(dryRun ? "Dry run — nothing uploaded." : "Nothing to do.");
  process.exit(0);
}

// Modest concurrency: enough to keep the pipe busy, not enough to get us
// rate-limited by GitHub on a 3500-file first run.
const CONCURRENCY = 12;
let done = 0;
let bytes = 0;
const failures: string[] = [];

const worker = async (queue: Card[]): Promise<void> => {
  for (;;) {
    const card = queue.pop();
    if (!card) return;
    const entry = index.get(`${card.set}/${card.number}`);
    if (!entry) continue;
    try {
      const image = await extract(RELEASE, entry);
      await Bun.s3.write(artObjectKey(card), image, { type: "image/webp" });
      bytes += image.length;
    } catch (error) {
      failures.push(`${card.id}: ${error instanceof Error ? error.message : error}`);
    }
    done++;
    if (done % 100 === 0 || done === pending.length) {
      console.log(`  ${done}/${pending.length} (${(bytes / 1048576).toFixed(0)}MB)`);
    }
  }
};

const queue = [...pending];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

console.log(
  `Uploaded ${done - failures.length}/${pending.length} images (${(bytes / 1048576).toFixed(0)}MB).`,
);
if (failures.length > 0) {
  console.error(`${failures.length} failed:\n  ${failures.slice(0, 20).join("\n  ")}`);
  process.exit(1);
}
