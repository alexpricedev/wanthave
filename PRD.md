# wanthave — Functional Spec

## Problem

Pokémon TCG Pocket players trading via Discord currently:

- Manually type card lists using community slang ("RR chsr EX"), re-typing or re-screenshotting notes every time they post.
- Build in-game boards and screenshot them, which are static, unclickable, and can't be updated.
- Share their friend ID / QR code as a separate step, requiring a trip back into the game.

There is no single shareable artifact that combines *wants*, *haves*, and *contact* in one place.

## Goal (MVP)

A user can, without an account, build a trade list and generate a public link. When posted in Discord, the link unfurls with an OG image showing the cards they're **looking for**. Clicking through shows their full wants, haves, and friend ID.

## Name

**wanthave** — domain **wanthave.trade**.

- The brand names the product's two-list structure directly: *want* (looking for) and *have* (for trade). Spoken aloud, "wanthave dot trade" is a complete description of the product.
- It works as a community noun: "drop your wanthave," "check my wanthave." The goal is for the community to adopt the word as the name of the artifact itself.
- No Pokémon IP in the name — the brand stands alone and can extend to other TCGs later.
- Defensive registration: wanthave.io redirects to wanthave.trade.
- The name informs visual identity: the OG image and public page structure around WANT / HAVE zones, echoing the brand on every unfurl.

## Non-goals (MVP)

- Trade matching or discovery between users
- Messaging, offers, or negotiation
- Notifications
- Collection tracking beyond the two lists
- Displaying trade costs (Shinedust/stamina)
- Verifying card ownership

## Users

1. **Anonymous sharer** — wants a link in under two minutes, no signup. The majority case.
2. **Registered user** — trades regularly, wants to save lists, edit them, and keep a stable link.

## Core flows

### 1. Build a trade list

A list has two sections:

- **Looking for** (wants)
- **For trade** (haves)

Cards are added via either method, both available from day one:

- **Visual browser** — browse by set (A1 → current), filtered to tradeable cards only. Tap to add.
- **Slang-aware search** — a search box that resolves community abbreviations and shorthand (e.g. "RR chsr EX" → the ex-rarity Charizard variants) alongside full card names. Fuzzy matching; ambiguous input shows candidates to pick from.

Per-card options:

- Quantity (default 1)
- Cards can appear in either list, not both
- **Ordering** — list order determines OG image appearance (first ~3 wants are the unfurl), so reordering matters. MVP uses simple **up/down buttons** per card, not drag-and-drop: reliable on mobile, zero gesture conflicts with scrolling.

**Mobile-first is a hard requirement across the whole product**, not just the public page — the builder, account flows, everything. Users are on their phones, often mid-Discord-session with the game open. Every interaction should work one-handed on a phone screen; desktop is the adaptation, not the target.

**Rarity rules are enforced strictly:**

- Only tradeable rarities can be added: ◆1–◆4 and ★1. Higher rarities and promos are not selectable and don't appear in the browser.
- The rules stay current with in-game changes (e.g. new sets, rule updates) — the card database is a maintained input to the product.
- The UI groups lists by rarity, since Pocket trades are same-rarity swaps. This helps a viewer instantly see what they could trade against.

### 2. Add contact details

- **Friend ID** — 16-digit code, entered once, validated for format, shown on the public page with one-tap copy. No QR support — the copy-paste friend ID is sufficient and viewers add friends by code in-game anyway.

### 3. Generate and share the link

- One tap produces a public link with an unguessable URL.
- **OG image**: see dedicated section below.
- The link unfurls correctly in Discord, plus Reddit/X/iMessage as a byproduct.

### 4. View a shared link (the public page)

Ordered for the viewer's decision-making:

1. **Looking for** — card grid, grouped by rarity
2. **For trade** — card grid, grouped by rarity
3. **Friend ID** — copy button
4. **Flywheel CTA** — every public page carries a prominent "Create your own trade list" action leading straight into the builder. This is the product's only growth loop in the MVP, so it's a first-class requirement, not a footer link: visible without scrolling past the wants, and repeated after the haves. The OG image also carries the site mark so the brand travels with every Discord post.

Page is mobile-first (Discord mobile is the dominant context). No login required to view.

### 5. Anonymous lifecycle

- Anonymous links are **immutable**. To change a list, create a new one.
- The builder pre-fills from the last list created on that device (local memory), so "make a new one" is an edit-and-regenerate flow, not starting from scratch.
- **Anonymous links expire after 90 days.** An expired link never 404s — it resolves to a page saying the list has expired, with the flywheel CTA front and centre. The OG image degrades gracefully to a generic branded card so old Discord posts don't look broken.
- Expiry is the natural account hook: accounts exist so links live forever.

### 6. Accounts (post-link upsell, never a gate)

Creating an account allows:

- **A name on your links** — an optional display name, stored once on the account and used on every list the user shares. It leads the public page's meta title ("Alex—B4 wants"), so a Discord embed says whose list it is before anything else, and it's set opposite the wordmark on the OG image. Not a handle: names aren't unique, nothing resolves a list by name, and leaving it blank shares anonymously. It's asked for at the share moment (an inline prompt on a fresh link and on the list index), offered as a field in the builder's details step, and editable at `/account` — where a change re-renders the images on links already posted.
- **Permanent links** — account-owned links never expire
- Saving multiple named lists (e.g. "B4 wants", "Spare EXs")
- Editing a list **in place** — the existing link and OG image update, so a pinned Discord post stays current
- Friend ID stored once and reused
- Claiming a just-created anonymous list into the account

**The nudge fires once, immediately after the first link is created:** "This link expires in 90 days — create a free account to keep it forever and edit it anytime." One dismissible prompt, then passive signup entry points only. The value proposition is permanence and editability, tied directly to the thing they just made — never a gate before creation.

## OG image specification

The OG image is the product's ad, utility, and brand in one frame. It must communicate "here are the cards this person wants" at a glance in a Discord channel, at mobile embed sizes, after platform compression.

**Canvas:** 1200×630 (standard OG ratio), rendered per-list at link creation.

**Layout:**

- **Vertical section label** — "WANT" rotated 90°, anchored to the left edge, sized to the height of the row it introduces. This is the structural brand element: the label *is* the layout.
- **Card row** — cards run left to right from the label at a consistent size, ordered as the user ordered them, so the user controls which chase cards appear in the unfurl.
- **Depth through overlap** — a row always spans the full canvas width. Few cards sit apart with air between them; more cards than fit overlap like a fanned hand, down to a floor of half a card, each casting a soft shadow on the one behind it so the stack reads as depth rather than a smear. Overlap is what lets a deep list actually look deep at embed size.
- **Deliberate bleed** — the final visible card is cropped by the right edge. The cut card is a designed signal that there's more behind the click, not an accident. Card size is solved so the row overflows the edge rather than stopping short of it.

**Conditional layouts** — the layout is chosen by whichever gives the largest cards, so the frame stays full at any list size:

- **Both wants and haves** — two rows, WANT above HAVE, with the sparser side getting the taller row (and so the bigger cards). Small lists collapse to a single row instead: WANT segment, then a second vertical "HAVE" label dividing it, followed by the haves — a handful of large cards fills the frame better than two half-empty rows.
- **One side only** — that side's label and cards take a single full-height row.
- **Zero cards entirely** — links can't be created without at least one card, so this state doesn't exist.

**Branding & counts:** small "wanthave.trade" wordmark, bottom-left, on the same line the vertical labels start from, legible but subordinate to the cards. Bottom-centre carries a **count badge** in community shorthand — "LF 8 · FT 23" — so a viewer can triage list size without clicking. The badge uses the slang deliberately: it signals the tool speaks the community's language. The vertical WANT/HAVE labels carry the brand structurally; the wordmark closes the loop for anyone screenshotting the embed.

**Constraints:**

- Must survive Discord's image compression and mobile embed scaling — high contrast background (dark), no fine detail outside the card art itself.
- Card art is the hero; no decorative elements competing with it.
- Rendered image updates whenever an account-owned list is edited (anonymous lists are immutable, so their image is rendered once).

## Success criteria

- Anonymous user: from landing to shared link in under 2 minutes
- Link unfurls with correct OG image in Discord (desktop + mobile)
- Slang search resolves the common community abbreviations for popular chase cards
- Zero invalid-rarity cards can ever appear on a list

## Research notes

**Card images.** Every major Pocket fan resource displays official card images — Limitless (the de facto card database), Serebii's Card Dex, Game8, and several others — and they've operated this way for years, some ad-supported. There are even community-maintained open datasets of Pocket card data and images. Legally this is tolerated use, not licensed use: TPCi's guidelines permit only editorial/non-commercial use and they don't license third parties. Practical position: strong precedent that card databases and tools using images are left alone, but it's a risk we accept knowingly, and staying non-commercial (no paywall on card images) keeps us in the same category as the tolerated sites.

**Competitive landscape.** Several trade tools already exist (pokemon-tcg.exchange, PokeHub, PocketTrade, PokeLiveTrade). They are all *matchmaking platforms* — build a profile, find partners on-site. None are built around the shareable link + Discord OG unfurl. Our wedge is serving the existing Discord trading behaviour rather than trying to replace it with a new marketplace. This validates keeping matching out of the MVP.

**Game mechanics currency.** Trade Tokens have been replaced by Shinedust as the trading cost mechanism, and the game now has a native wishlist (20 cards, 3 visible on profile). The native wishlist is limited and only visible in-game, so it doesn't threaten the core use case — but it confirms the rules and mechanics shift, reinforcing the maintained-card-database requirement.

## Decision log

| Decision | Outcome |
|---|---|
| Card entry method | Visual browser + slang-aware search, both from day one |
| Anonymous edits | Immutable; regenerate via pre-filled builder |
| Rarity rules | Enforced strictly; maintained card database |
| QR code | Dropped — friend ID copy is sufficient |
| Flywheel CTA | First-class requirement on every public page |
| Link retention | Anonymous: 90-day expiry with converting expired page. Account: forever |
| Trade costs (Shinedust) | Out of scope for MVP |
| Account nudge | Once, immediately after first link, framed as permanence |
| Display name | Optional, non-unique, account-level. Leads the meta title; asked for at the share moment |
| Multiple anon lists | Allowed implicitly; each link standalone |
| Name & domain | **wanthave** at wanthave.trade; wanthave.io as defensive redirect |
