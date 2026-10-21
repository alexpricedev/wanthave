# Credits & third-party notices

The MIT licence in [LICENSE](LICENSE) covers the application source code. Some
bundled assets and data carry their own terms, listed here.

## Card catalogue (`src/server/data/cards.json`)

The tradeable-card catalogue is built by `scripts/build-cards.ts`, which merges
two community datasets on set + card number:

| Source | Licence | Fields used |
| --- | --- | --- |
| [flibustier/pokemon-tcg-pocket-database](https://github.com/flibustier/pokemon-tcg-pocket-database) | MIT | Sets, names, numbers, rarity codes, packs |
| [chase-manning/pokemon-tcg-pocket-cards](https://github.com/chase-manning/pokemon-tcg-pocket-cards) (now [PocketDecks](https://github.com/PocketDecks/pokemon-tcg-pocket-cards)) | AGPL-3.0 | `ex`, full-art and `type` attributes |

The generated catalogue is a derivative of both, so the checked-in
`cards.json` carries those upstream terms rather than the MIT licence. If you
want an MIT-only catalogue, rebuild with an empty `.cache/chase.json`:

```bash
mkdir -p .cache && printf '[]' > .cache/chase.json   # after fetching flib.json
bun run scripts/build-cards.ts
```

Every field has a flib-only fallback: `ex` and `fullart` are reproduced from the
card name suffix and rarity code, and Trainer detection comes from the image
filename (`cTR_`). Card ids and counts don't change. What you lose is the
Pokémon energy type (null for ~3,300 cards) and the multi-pack label — `pack`
falls back to the first pack listed upstream, so `Shared(Genetic Apex)` becomes
a specific pack for ~1,450 cards. Neither field is displayed anywhere today.

## Card art

No card images are stored in this repository. `scripts/sync-card-art.ts` fetches
them from the flibustier dataset's GitHub release and mirrors them into your own
object storage. The artwork is © Nintendo / Creatures Inc. / GAME FREAK inc. and
The Pokémon Company; it is not covered by this project's licence. If you deploy
this, you are responsible for how that art is hosted and served.

## Fonts

| Asset | Licence |
| --- | --- |
| `public/Forque.ttf` — Forque by [Tup Wanders](https://www.tupwanders.nl) | Free for personal and commercial use per its [DaFont listing](https://www.dafont.com/forque.font); no licence file ships with the font, so no further terms are asserted here |
| `public/fonts/archivo-latin-var.woff2` — Archivo by Omnibus-Type | SIL Open Font License 1.1 |
| `public/fonts/ibm-plex-mono-*.woff2` — IBM Plex Mono by IBM | SIL Open Font License 1.1 |

The generated brand assets in `public/` (wordmark, favicons, `og-image.png`) are
produced from these faces by `scripts/build-brand.ts` and are covered by the MIT
licence as part of this project.

## Pokémon

Pokémon and Pokémon TCG Pocket are trademarks of their respective owners.
wanthave is an independent, unofficial tool and is not affiliated with,
endorsed by, or sponsored by Nintendo, Creatures Inc., GAME FREAK inc., or The
Pokémon Company.
