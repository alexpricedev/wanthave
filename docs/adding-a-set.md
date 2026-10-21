# Adding a new set

The card catalogue is static JSON checked into the repo
(`src/server/data/cards.json`), and card art lives in object storage. A new set
is a three-step manual routine: register it, rebuild the catalogue, mirror the
art.

Nothing here runs at request time, so a set can be prepared and merged before it
goes live in-game.

## How the builder is wired

`bun run scripts/build-cards.ts` merges two kinds of provider from
`src/tools/cards/`:

- **`CARD_SOURCE`** — one dataset that stands alone as the catalogue. The default
  (`flibustier`) supplies sets, names, numbers, rarity and packs, and maps them
  to the app's normalized shape.
- **`CARD_ENRICHERS`** — optional datasets layered on top, field by field, by
  card id. The default (`pocketdecks`) adds energy type and multi-pack labels.

Inputs are cached under `.cache/` and only downloaded when absent — delete a file
to refresh it. Both ids are configurable:

```bash
bun run scripts/build-cards.ts                          # defaults
CARD_ENRICHERS= bun run scripts/build-cards.ts          # source only (MIT-only catalogue)
CARD_SOURCE=mine bun run scripts/build-cards.ts         # your own catalogue provider
```

To plug in a different dataset, add a file next to the existing providers that
exports a `CardSource` or `CardEnricher` (see `types.ts`), register it in
`src/tools/cards/index.ts`, and select it by id. A `CardSource` only has to emit
normalized cards and an ordered set list; a `CardEnricher` returns partial
fields keyed by card id and can know about as few or as many cards as it likes.

## 1. Register the set

In `src/tools/cards/flibustier.ts`, add the new prefix to `SET_ORDER` (oldest →
newest; order drives the picker and `LATEST_SET`) and its English name to
`SET_NAMES`. Set codes are how the community refers to sets, so the prefix must
match the upstream `set` value lowercased (`b4c` → `B4c`).

Promos and non-numbered sets are dropped automatically — they aren't tradeable.

If you use your own source, its `load()` returns the set list in order instead,
and this step doesn't apply.

## 2. Rebuild the catalogue

```bash
rm -f .cache/flib.json .cache/chase.json   # only if you want fresh inputs
bun run scripts/build-cards.ts
```

Only tradeable rarities survive (◆1–◆4, ★1, ★2, ✵1, ✵2). The output is indented
so the diff shows the new set as added lines rather than one rewritten megabyte
— skim it before committing. Watch the logged provider line: it tells you which
datasets (and which licences) went into the file.

## 3. Mirror the art

`scripts/sync-card-art.ts` streams images out of a pinned release of the
[flibustier database](https://github.com/flibustier/pokemon-tcg-pocket-database)
and writes them to your bucket as `cards/<card-id>.webp`.

Bump `RELEASE` in that script to the release that contains the new set, then:

```bash
bun run scripts/sync-card-art.ts            # new art only
bun run scripts/sync-card-art.ts --set B4c  # one set
bun run scripts/sync-card-art.ts --dry-run  # report without writing
```

It needs the `S3_*` variables (see `.env.example`). Re-running is cheap: objects
that already exist are skipped unless you pass `--force`.

The sync script is specific to the flibustier release layout. If you swapped
`CARD_SOURCE`, upload `cards/<id>.webp` yourself — the app only cares about the
bucket key, not where the bytes came from.

## 4. Verify

```bash
bun run check
bun run test
```

Then, against a running dev server:

- `/new` lists the set in the picker, with the right name and card count.
- A card from the new set opens its art at `/img/card/<id>` (a placeholder means
  the sync didn't run or the bucket env is wrong).
- A list containing new-set cards renders an OG image at
  `/l/<slug>/og.png` with real art.

## Licence note

The catalogue is derived from the datasets above, which carry their own terms —
see [NOTICE.md](../NOTICE.md). Only the tradeable fields are stored; no image
bytes are committed.
