# Adding a new set

The card catalogue is static JSON checked into the repo
(`src/server/data/cards.json`), and card art lives in object storage. A new set
is a three-step manual routine: rebuild the catalogue, mirror the art, verify.

Nothing here runs at request time, so a set can be prepared and merged before it
goes live in-game.

## 1. Fetch the source datasets

Both inputs are gitignored under `.cache/`, so refetch them first:

```bash
mkdir -p .cache
curl -sSL -o .cache/flib.json \
  https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/cards.json
curl -sSL -o .cache/chase.json \
  https://raw.githubusercontent.com/chase-manning/pokemon-tcg-pocket-cards/main/data/v4/cards.json
```

`.cache/flib.json` must be an array; `.cache/chase.json` must also parse as an
array (the upstream has moved this path before — a 404 there silently costs
every card its energy type).

## 2. Register the set

In `scripts/build-cards.ts`, add the new set prefix to `SET_ORDER` (oldest →
newest; order drives the picker and `LATEST_SET`) and its English name to
`SET_NAMES`. Set codes are how the community refers to sets, so the prefix must
match the upstream `set` value lowercased (`b4b` → `B4b`).

Promos and non-numbered sets are dropped automatically — they aren't tradeable.

## 3. Rebuild the catalogue

```bash
bun run scripts/build-cards.ts
```

Only tradeable rarities survive the filter (◆1–◆4, ★1, ★2, ✵1, ✵2). The output
is indented so the diff shows the new set as added lines rather than one
rewritten megabyte — skim it before committing.

## 4. Mirror the art

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

## 5. Verify

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
