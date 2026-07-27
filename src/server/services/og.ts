// OG image renderer — the product's ad, utility, and brand in one 1200×630
// frame (see PRD "OG image specification"). Card art is composited with sharp;
// all text is converted to vector paths with opentype.js so the custom Forque
// display face renders without depending on system fonts.

import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import sharp, { type OverlayOptions } from "sharp";
import { getCardImageBytes } from "./card-images";
import type { ListCardRow, TradeList } from "./lists";
import { log } from "./logger";

const CANVAS_W = 1200;
const CANVAS_H = 630;
const BG = "#0c0b0e";
const WANT = "#e5b35b";
const HAVE = "#7fcbd9";
const MUTED = "#6f6a7a";
const PLACEHOLDER_BG = "#1b1a20";

// Card geometry. Cards run left to right from a vertical label and bleed off
// the right edge. A list with both wants and haves gets two rows (WANT above
// HAVE); a one-sided list gets a single full-height row of larger cards.
const CARD_ASPECT = 367 / 512; // Pocket card art ratio
const CARD_GAP = 14;
const ROW_START_PAD = 24; // left inset for the vertical label + card row
const LABEL_GAP = 12; // between a vertical label and the cards after it
const EDGE_FADE_W = 180; // width of the black fade over the rightmost clipped card

// Vertical bands. BOTTOM_RESERVE keeps cards clear of the count badge/wordmark.
const TOP_PAD = 26;
const ROW_GAP = 14;
const BOTTOM_RESERVE = 78;
const FOOTER_BASELINE = CANVAS_H - 34; // wordmark + count badge sit on this line
const ONE_ROW_H = 486;
const ONE_ROW_Y_SHIFT = 18; // lift the single-row band up from dead-center
const MAX_ROW_SHARE = 0.62; // cap on how much height the sparser row can take
const ONE_ROW_ADVANTAGE = 1.6; // how much bigger one row must be to beat stacking

// Overlap. Cards step by less than their width when a row holds more than fits,
// so a deep list reads as a stack instead of a truncated row.
const MIN_STEP_RATIO = 0.5; // hard floor: never hide more than half a card
const BLEED_KEEP = 0.65; // fraction of the last card left on-canvas
const SHADOW_PAD = 12; // transparent margin around each card for its shadow

const parseFont = (path: string): opentype.Font =>
  opentype.parse(readFileSync(path).buffer as ArrayBuffer);

const forque = parseFont("public/Forque.ttf");
const mono = parseFont("src/server/assets/fonts/IBMPlexMono-SemiBold.ttf");

// A single-colour text run as an SVG <path>, positioned by its baseline.
//
// Coordinates are snapped to 2dp before serialising to work around a bug in
// opentype.js's rounding: it does `Math.round(fraction + "e+2")`, so a fraction
// small enough to stringify in exponential notation (417.00000000000006 →
// 5.68e-14) yields "5.68e-14e+2" → NaN, and the renderer silently drops that
// whole subpath — one letter of the word just vanishes.
const textPath = (
  font: opentype.Font,
  text: string,
  size: number,
  x: number,
  baseline: number,
  color: string,
): string => {
  const path = font.getPath(text, x, baseline, size);
  for (const command of path.commands) {
    for (const [key, value] of Object.entries(command)) {
      if (typeof value === "number") {
        (command as unknown as Record<string, number>)[key] =
          Math.round(value * 100) / 100;
      }
    }
  }
  return `<path d="${path.toPathData(2)}" fill="${color}"/>`;
};

const advance = (font: opentype.Font, text: string, size: number): number =>
  font.getAdvanceWidth(text, size);

const LABEL_INK_PAD = 1; // breathing room around the trimmed glyph box

// Render a vertical (rotated 90°) label as its own raster layer — cleaner than
// doing the rotation maths inside the shared SVG. The raster is trimmed to the
// glyphs' ink box: font metrics leave a third of the em empty above and below,
// and at these sizes that is ~90px of dead space between the label and the
// cards.
const verticalLabel = async (
  text: string,
  color: string,
  size: number,
): Promise<{ buffer: Buffer; width: number; height: number }> => {
  const box = forque.getPath(text, 0, 0, size).getBoundingBox();
  const w = Math.ceil(box.x2 - box.x1) + LABEL_INK_PAD * 2;
  const h = Math.ceil(box.y2 - box.y1) + LABEL_INK_PAD * 2;
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${textPath(
    forque,
    text,
    size,
    LABEL_INK_PAD - box.x1,
    LABEL_INK_PAD - box.y1,
    color,
  )}</svg>`;
  const buffer = await sharp(Buffer.from(svg)).rotate(-90).png().toBuffer();
  // After a 90° rotation the raster's width/height swap.
  return { buffer, width: h, height: w };
};

// Labels are sized by their thickness (cap height), not their length: "WANT"
// and "HAVE" have different widths per em, so matching lengths would leave one
// visibly heavier than the other and push its row's cards further right. Equal
// thickness gives every label the same weight and the same gutter, so the
// labels share a left edge and the card columns line up across rows.
const UNIT = 100;
const sizeForThickness = (text: string, target: number): number => {
  const box = forque.getPath(text, 0, 0, UNIT).getBoundingBox();
  return (target * UNIT) / (box.y2 - box.y1);
};

interface CardLayerOptions {
  card: ListCardRow;
  width: number;
  height: number;
  /** Visible width once the right canvas edge crops the card. */
  visibleWidth: number;
  /** Accent used by the placeholder tile when card art is unavailable. */
  color: string;
}

// The card art itself, resized to the band and cropped where the right edge
// clips it. Falls back to a branded placeholder tile if the art can't be
// fetched.
const cardArt = async ({
  card,
  width,
  height,
  visibleWidth,
  color,
}: CardLayerOptions): Promise<Buffer> => {
  const visible = Math.max(1, Math.min(width, visibleWidth));
  const bytes = await getCardImageBytes(card.card.id);
  if (bytes) {
    try {
      const full = await sharp(bytes).resize(width, height).png().toBuffer();
      if (visible === width) return full;
      return sharp(full)
        .extract({ left: 0, top: 0, width: visible, height })
        .png()
        .toBuffer();
    } catch (error) {
      log.warn("og", `card render failed for ${card.card.id}: ${error}`);
    }
  }
  const svg = `<svg width="${visible}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${visible}" height="${height}" rx="12" fill="${PLACEHOLDER_BG}"/>
    <rect width="${visible}" height="6" fill="${color}"/>
    ${textPath(forque, card.card.name.slice(0, 14), 30, 16, height / 2, "#ece9e2")}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
};

// A card plus the soft shadow it casts on whatever sits behind it. Overlapping
// art would otherwise blur into one continuous smear; the shadow (and the
// hairline border on the art) is what makes the row read as discrete cards.
// The result is SHADOW_PAD larger on every side, so paste it at (x - SHADOW_PAD,
// top - SHADOW_PAD).
const cardLayer = async (options: CardLayerOptions): Promise<Buffer> => {
  const art = await cardArt(options);
  const meta = await sharp(art).metadata();
  const w = meta.width ?? options.width;
  const h = meta.height ?? options.height;
  const canvasW = w + SHADOW_PAD * 2;
  const canvasH = h + SHADOW_PAD * 2;

  const shadowSvg = `<svg width="${canvasW}" height="${canvasH}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="b" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="5"/>
    </filter></defs>
    <rect x="${SHADOW_PAD - 4}" y="${SHADOW_PAD + 3}" width="${w + 8}" height="${h}" rx="10"
      fill="#000000" fill-opacity="0.72" filter="url(#b)"/>
    <rect x="${SHADOW_PAD - 2}" y="${SHADOW_PAD - 2}" width="${w + 4}" height="${h + 4}" rx="8"
      fill="${BG}"/>
  </svg>`;

  return sharp(Buffer.from(shadowSvg))
    .composite([{ input: art, left: SHADOW_PAD, top: SHADOW_PAD }])
    .png()
    .toBuffer();
};

interface Segment {
  label: string;
  color: string;
  cards: ListCardRow[];
}

interface Row {
  segments: Segment[];
  top: number;
  height: number;
}

// Ratio of a vertical label's thickness to its length — both scale with point
// size, so this is what lets the layout solve below stay linear in card height.
const aspectRatioOf = (text: string): number => {
  const box = forque.getPath(text, 0, 0, UNIT).getBoundingBox();
  return (box.y2 - box.y1) / (box.x2 - box.x1);
};

// Every label is this fraction of its row's card height thick. Taken from the
// squattest of the two words so that one spans the card exactly and the other
// falls just short — go any thicker and the longer label would overhang.
const LABEL_THICKNESS = Math.min(aspectRatioOf("WANT"), aspectRatioOf("HAVE"));

// The card height at which these segments, laid side by side in one row, span
// the canvas with the last card bleeding off the right edge. Label thickness
// and card width are both multiples of card height, so the row width is linear
// in it and inverts directly.
const heightToFillOneRow = (segments: Segment[]): number => {
  let perHeight = -CARD_ASPECT * (1 - BLEED_KEEP);
  let fixed = ROW_START_PAD + LABEL_GAP * (segments.length - 1);
  for (const segment of segments) {
    perHeight += LABEL_THICKNESS + segment.cards.length * CARD_ASPECT;
    fixed += LABEL_GAP + (segment.cards.length - 1) * CARD_GAP;
  }
  return (CANVAS_W - fixed) / perHeight;
};

// Conditional layouts:
//   one side only → a single full-height row
//   both sides    → stacked rows, WANT above HAVE, unless a single row (WANT
//                   segment, then a HAVE label dividing it) buys cards
//                   ONE_ROW_ADVANTAGE times bigger
// Stacking is the default because the two labels reading down the left edge is
// the layout. Only a list small enough that one row makes the cards dramatically
// bigger — a want and a have, say — is worth breaking that structure for.
// (A list with no cards at all can't be created, so that case doesn't exist.)
const planRows = (list: TradeList): Row[] => {
  const want: Segment = { label: "WANT", color: WANT, cards: list.wants };
  const have: Segment = { label: "HAVE", color: HAVE, cards: list.haves };
  const oneRow = (segments: Segment[], cardH: number): Row => {
    const height = Math.round(cardH) + SHADOW_PAD * 2;
    return {
      segments,
      top: Math.round((CANVAS_H - height) / 2) - ONE_ROW_Y_SHIFT,
      height,
    };
  };

  if (list.wants.length === 0 || list.haves.length === 0) {
    const only = list.wants.length > 0 ? want : have;
    return [oneRow([only], ONE_ROW_H)];
  }

  const avail = CANVAS_H - TOP_PAD - ROW_GAP - BOTTOM_RESERVE;
  const twoRowCardH = avail / 2 - SHADOW_PAD * 2;
  const combined = heightToFillOneRow([want, have]);
  if (combined >= twoRowCardH * ONE_ROW_ADVANTAGE) {
    return [oneRow([want, have], Math.min(combined, ONE_ROW_H))];
  }

  // Two rows. Card size scales with row height and a row needs bigger cards to
  // look full the fewer cards it holds, so height goes to the sparser side —
  // clamped so neither row collapses.
  const share = Math.min(
    MAX_ROW_SHARE,
    Math.max(
      1 - MAX_ROW_SHARE,
      list.haves.length / (list.wants.length + list.haves.length),
    ),
  );
  const wantH = Math.round(avail * share);
  return [
    { segments: [want], top: TOP_PAD, height: wantH },
    {
      segments: [have],
      top: TOP_PAD + wantH + ROW_GAP,
      height: avail - wantH,
    },
  ];
};

// How far apart consecutive cards start. Cards never sit further apart than
// CARD_GAP — a row that can't fill its track leaves the slack as whitespace on
// the right rather than spreading out, which reads as scattered. Rows with more
// cards than fit overlap instead, down to a floor of half a card, leaving the
// last one partly off-canvas: the crop is the signal that there's more behind
// the click.
const cardStep = (count: number, cardW: number, track: number): number => {
  const tight = cardW + CARD_GAP;
  if (count < 2) return tight;
  const ideal = (track - cardW * BLEED_KEEP) / (count - 1);
  return Math.max(cardW * MIN_STEP_RATIO, Math.min(tight, ideal));
};

export const renderOgImage = async (list: TradeList): Promise<Uint8Array> => {
  const composites: OverlayOptions[] = [];

  // A composited overlay may not overflow the canvas, and each card layer
  // carries SHADOW_PAD of margin, so the usable right edge sits that much short
  // of it. Cards past that point are dropped — the badge still counts them.
  const rightLimit = CANVAS_W - SHADOW_PAD;

  const rows = planRows(list);
  const cardHeightOf = (row: Row): number => row.height - SHADOW_PAD * 2;

  // Rows can differ in height, so their leading labels differ in thickness. The
  // widest one sets the gutter for all of them: the labels share a left edge and
  // every row's cards start on the same line, whatever the row.
  const gutter = Math.max(
    ...rows.map(
      (row) => LABEL_THICKNESS * cardHeightOf(row) + LABEL_INK_PAD * 2,
    ),
  );

  for (const row of rows) {
    // Shadows eat into the band on both sides, so the art is that much shorter.
    const cardH = cardHeightOf(row);
    const cardW = Math.round(cardH * CARD_ASPECT);
    const cardTop = row.top + SHADOW_PAD;
    let x = ROW_START_PAD;

    for (let s = 0; s < row.segments.length; s++) {
      const segment = row.segments[s];
      const label = await verticalLabel(
        segment.label,
        segment.color,
        sizeForThickness(segment.label, LABEL_THICKNESS * cardH),
      );
      composites.push({
        input: label.buffer,
        left: Math.round(x),
        top: row.top + Math.round((row.height - label.height) / 2),
      });
      // Only the leading label sits in the shared gutter; a divider label mid-row
      // just takes the space it needs.
      x += (s === 0 ? gutter : label.width) + LABEL_GAP;
      if (x >= rightLimit) break;

      // A segment sharing its row with another gets only the space its own
      // cards need; the last segment spreads across whatever track is left.
      const last = s === row.segments.length - 1;
      const step = last
        ? cardStep(segment.cards.length, cardW, rightLimit - x)
        : cardW + CARD_GAP;

      const placements = segment.cards
        .map((card, i) => ({ card, left: Math.round(x + i * step) }))
        .filter((p) => rightLimit - p.left >= 8);

      const layers = await Promise.all(
        placements.map((p) =>
          cardLayer({
            card: p.card,
            width: cardW,
            height: cardH,
            visibleWidth: rightLimit - p.left,
            color: segment.color,
          }),
        ),
      );

      // Reversed: sharp draws later entries on top, and we want the leftmost
      // card in front so each shadow falls on the card behind it.
      for (let i = layers.length - 1; i >= 0; i--) {
        composites.push({
          input: layers[i],
          left: placements[i].left - SHADOW_PAD,
          top: cardTop - SHADOW_PAD,
        });
      }

      if (placements.length > 0) {
        x = placements[placements.length - 1].left + cardW + LABEL_GAP;
      }
    }
  }

  // Fade the rightmost (clipped) card into black instead of a hard cut edge.
  const edgeFadeSvg = `<svg width="${EDGE_FADE_W}" height="${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${BG}" stop-opacity="0"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="1"/>
    </linearGradient></defs>
    <rect width="${EDGE_FADE_W}" height="${CANVAS_H}" fill="url(#fade)"/>
  </svg>`;
  composites.push({
    input: Buffer.from(edgeFadeSvg),
    left: CANVAS_W - EDGE_FADE_W,
    top: 0,
  });

  // Base layer: background + wordmark (bottom-left, on the same line the
  // vertical labels start from) + count badge (bottom-centre, in a rounded
  // pill), both lifted clear of the canvas edge.
  const badgeSize = 30;
  const lf = `LF ${list.wants.length}`;
  const ft = `FT ${list.haves.length}`;
  const dot = " · ";
  const badgeWidth =
    advance(mono, lf, badgeSize) +
    advance(mono, dot, badgeSize) +
    advance(mono, ft, badgeSize);
  let bx = Math.round((CANVAS_W - badgeWidth) / 2);
  const pillLeft = bx;
  const badgeParts: string[] = [];
  badgeParts.push(textPath(mono, lf, badgeSize, bx, FOOTER_BASELINE, WANT));
  bx += advance(mono, lf, badgeSize);
  badgeParts.push(textPath(mono, dot, badgeSize, bx, FOOTER_BASELINE, MUTED));
  bx += advance(mono, dot, badgeSize);
  badgeParts.push(textPath(mono, ft, badgeSize, bx, FOOTER_BASELINE, HAVE));
  const pillPadX = 16;
  const pillPadTop = 28;
  const pillPadBottom = 6;
  const pill = `<rect x="${pillLeft - pillPadX}" y="${FOOTER_BASELINE - pillPadTop}" width="${
    badgeWidth + pillPadX * 2
  }" height="${pillPadTop + pillPadBottom}" rx="20" fill="#1a181e"/>`;

  const markSize = 34;
  // Nudged so the wordmark's ink starts exactly where the labels' does, rather
  // than where its left sidebearing happens to fall.
  let mx =
    ROW_START_PAD +
    LABEL_INK_PAD -
    forque.getPath("want", 0, 0, markSize).getBoundingBox().x1;
  const markParts: string[] = [];
  markParts.push(textPath(forque, "want", markSize, mx, FOOTER_BASELINE, WANT));
  mx += advance(forque, "want", markSize);
  markParts.push(textPath(forque, "have", markSize, mx, FOOTER_BASELINE, HAVE));
  mx += advance(forque, "have", markSize);
  markParts.push(
    textPath(forque, ".trade", markSize, mx, FOOTER_BASELINE, "#ffffff"),
  );

  const baseSvg = `<svg width="${CANVAS_W}" height="${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#141216"/><stop offset="1" stop-color="${BG}"/>
    </linearGradient></defs>
    <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#g)"/>
    ${pill}
    ${badgeParts.join("")}
    ${markParts.join("")}
  </svg>`;

  // Palette-quantized: two full rows of card art are ~1.5MB as a truecolour PNG
  // and ~0.3MB here, with no visible difference at embed sizes. That payload is
  // cached per list in Postgres and refetched by every unfurl.
  return sharp(Buffer.from(baseSvg))
    .composite(composites)
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
};
