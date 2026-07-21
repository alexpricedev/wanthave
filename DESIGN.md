# WantHave — Design System

Identity system **v1** · `wanthave.trade`

> Forque is the single display voice; **hue is the only seam** between the two
> halves. **foil-amber = WANT**, **holo-ice = HAVE**. IBM Plex Mono carries
> counts and utility. Everything else is quiet, dark, and out of the way so the
> cards and the two brand hues do the talking.

This document is the source of truth for the visual language. The tokens live in
[`src/client/style.css`](src/client/style.css) (the `:root` block); the fonts
are wired up in [`src/server/components/layouts.tsx`](src/server/components/layouts.tsx).

---

## 1. Principles

- **Two halves, one seam.** The product is built around WANT (looking for) and
  HAVE (for trade). The _only_ thing that distinguishes them is colour —
  foil-amber vs holo-ice. Never rely on a second signal (icon, weight, box) to
  tell them apart; the hue is the system.
- **Dark by default.** The app is dark-only. Surfaces are near-black and layer
  lightest-on-top over the `--color-void` background.
- **One display voice.** Forque is used for the wordmark, vertical labels, and
  headings — nothing else. It never sets body copy.
- **Mono means "this is data."** Counts, badges, code paths, and meta labels are
  IBM Plex Mono. If a number matters, it's mono.

---

## 2. Colour tokens

CSS custom properties, defined on `:root`. Reference them as
`var(--color-…)` — never hard-code a hex.

### Surfaces (dark → light, layered over the void)

| Token                | Value     | Use                                        |
| -------------------- | --------- | ------------------------------------------ |
| `--color-void`       | `#0c0b0e` | Page background                            |
| `--color-ground`     | `#121114` | Cards, panels                              |
| `--color-sleeve`     | `#17161a` | Raised surfaces, hovers, avatar ground     |
| `--color-well`       | `#1b1a20` | Insets: badges, chips, inputs              |
| `--color-edge`       | `#2c2934` | Borders                                    |
| `--color-edge-soft`  | `#26232c` | Softer panel borders                       |

### Text (bone → muted)

| Token                     | Value     | Use                       |
| ------------------------- | --------- | ------------------------- |
| `--color-bone`            | `#ece9e2` | Primary text; light ground |
| `--color-text-secondary`  | `#b5b0ba` | Secondary / lead copy     |
| `--color-text-tertiary`   | `#8b8794` | Meta, mono labels         |
| `--color-text-quaternary` | `#6f6a7a` | Captions, disabled        |

### Brand — the only seam

| Token               | Value     | Notes                                   |
| ------------------- | --------- | --------------------------------------- |
| `--color-want`      | `#e5b35b` | **foil-amber** · `oklch(0.8 0.11 80)`   |
| `--color-want-hover`| `#f0c87e` | WANT hover                              |
| `--color-want-ink`  | `#8a6420` | WANT on **light** grounds (for contrast) |
| `--color-have`      | `#7fcbd9` | **holo-ice** · `oklch(0.8 0.11 200)`    |
| `--color-have-hover`| `#a3dbe6` | HAVE hover                              |
| `--color-have-ink`  | `#20707e` | HAVE on **light** grounds               |

> On a bone/white ground the standard hues wash out. Use the `-ink` variants
> (`#8a6420` / `#20707e`) whenever WANT/HAVE sit on `--color-bone` or white.

### Interactive & status

| Token                | Value                 | Use                            |
| -------------------- | --------------------- | ------------------------------ |
| `--color-primary`    | → `--color-want`      | Links, filled CTAs, focus ring |
| `--color-primary-hover` | → `--color-want-hover` | Hover for the above         |
| `--color-on-primary` | → `--color-void`      | Text on a filled amber surface |
| `--color-success`    | `#6bd6a0`             | Confirmations                  |
| `--color-danger`     | `#f0776b`             | Destructive / errors           |
| `--color-warning`    | `#e0975a`             | Cautions (kept off the amber)  |

The interactive accent **is** WANT. Filled amber buttons take dark
(`--color-on-primary`) text — never white — for contrast.

---

## 3. Typography

Three families, three jobs. All three are **self-hosted** (latin subset) from
`public/` — Forque from `public/Forque.ttf`, Archivo and IBM Plex Mono from
`public/fonts/`. They're declared as inline `@font-face` rules in the document
head (`FONT_FACES` in `layouts.tsx`), same-origin so the hardened CSP's
`font-src 'self'` allows them and nothing is fetched cross-origin.

| Token            | Family                     | Role                              |
| ---------------- | -------------------------- | --------------------------------- |
| `--font-display` | **Forque**                 | Wordmark, vertical labels, headings |
| `--font-body`    | **Archivo** (+ system)     | UI text, paragraphs               |
| `--font-mono`    | **IBM Plex Mono** (+ mono) | Counts, badges, meta, code        |

- Forque is **display-scale only**. It reads poorly small, so never set it below
  **~1.5rem / 24px**. Use it for the wordmark and the two largest heading levels
  (`h1`, `h2`) at weight `500`.
- Smaller headings (`h3`–`h6`) and any heading shrunk to body scale (e.g. a card
  title like `.login-title`) use `--font-body` (Archivo) at weight `600` so they
  stay legible.
- Body inherits `--font-body`.
- Mono weight `600` for counts and badges.

---

## 4. Shape & elevation

| Token           | Value   | Use                             |
| --------------- | ------- | ------------------------------- |
| `--radius-sm`   | `8px`   | Controls: buttons, inputs, chips |
| `--radius`      | `14px`  | Cards, panels                   |
| `--radius-lg`   | `20px`  | Large avatars, hero surfaces    |
| `--radius-pill` | `999px` | Badges, count pills             |
| `--shadow`      | `0 12px 40px #00000066` | Floating card art   |

---

## 5. Identity components

### Wordmark

The lockup is a single lowercase word, no space between the halves, in Forque:
<span style="color:#e5b35b">want</span><span style="color:#7fcbd9">have</span>.

- Component: [`Wordmark`](src/server/components/wordmark.tsx) — used in the
  header, footer, and home hero.
- Class: `.wordmark` (with inner `.want` / `.have`). Drop it into an `h1` and it
  inherits the heading size.
- Variants (from the identity sheet): primary on dark; on a light ground use the
  `-ink` hues; a one-colour fallback in `--color-bone`.

### Count badge

The signature element — hue-coded halves split by an interpunct, always Plex
Mono 600. In the product this reads e.g. `LF 8 · FT 23` (Looking For / For
Trade).

```html
<span class="count-badge">
  <span class="count-want">LF 8</span>
  <span class="count-sep">·</span>
  <span class="count-have">FT 23</span>
</span>
```

### Vertical labels

WANT / HAVE set vertically act as section dividers in the product (label + a hue
rule). Use `.vlabel` with `.vlabel-want` / `.vlabel-have`.

### Favicon / avatar

**WH** in Forque. Bone by default; a two-hue (`W` amber / `H` ice) variant for
avatars; a mono light variant on a white ground. Sits on a `--color-sleeve`
tile at `--radius-lg`.

### Utility classes

- `.want` / `.have` — tint any text with the brand hue.
- `.wordmark`, `.count-badge`, `.vlabel` — as above.

---

## 6. Rules of thumb

1. Reach for a token, not a hex. If a value you need isn't a token, add one.
2. WANT is always amber, HAVE is always ice — in that order, everywhere.
3. Counts and identifiers are mono; prose is Archivo; only the display voice is
   Forque.
4. On light grounds, switch to the `-ink` brand hues.
5. Keep the surfaces quiet — let the cards and the two hues carry the colour.

---

_Source design: `Wanthave Identity.dc.html` (Claude Design handoff, identity
system v1)._
