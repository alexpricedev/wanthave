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

// Card geometry. Cards sit in a single full-bleed row; the row starts just past
// the vertical label and runs off the right edge.
const CARD_ASPECT = 367 / 512; // Pocket card art ratio
const CARD_H = 486;
const CARD_W = Math.round(CARD_H * CARD_ASPECT);
const ROW_Y_SHIFT = 18; // lift the label + card row up from dead-center
const CARD_TOP = Math.round((CANVAS_H - CARD_H) / 2) - ROW_Y_SHIFT;
const CARD_GAP = 14;
const EDGE_PAD = 40;
const ROW_START_PAD = 12; // left inset for the vertical label + card row
const LABEL_GAP = 12; // between a vertical label and the cards after it
const EDGE_FADE_W = 180; // width of the black fade over the rightmost clipped card

const parseFont = (path: string): opentype.Font =>
  opentype.parse(readFileSync(path).buffer as ArrayBuffer);

const forque = parseFont("public/Forque.ttf");
const mono = parseFont("src/server/assets/fonts/IBMPlexMono-SemiBold.ttf");

// A single-colour text run as an SVG <path>, positioned by its baseline.
const textPath = (
  font: opentype.Font,
  text: string,
  size: number,
  x: number,
  baseline: number,
  color: string,
): string =>
  `<path d="${font.getPath(text, x, baseline, size).toPathData(2)}" fill="${color}"/>`;

const advance = (font: opentype.Font, text: string, size: number): number =>
  font.getAdvanceWidth(text, size);

// Render a vertical (rotated 90°) label as its own raster layer — cleaner than
// doing the rotation maths inside the shared SVG.
const verticalLabel = async (
  text: string,
  color: string,
  size: number,
): Promise<{ buffer: Buffer; width: number; height: number }> => {
  const w = Math.ceil(advance(forque, text, size)) + 8;
  const h = Math.ceil(size * 1.32);
  const baseline = Math.round(size * 1.0);
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${textPath(
    forque,
    text,
    size,
    4,
    baseline,
    color,
  )}</svg>`;
  const buffer = await sharp(Buffer.from(svg)).rotate(-90).png().toBuffer();
  // After a 90° rotation the raster's width/height swap.
  return { buffer, width: h, height: w };
};

// A card image resized to the row height, cropped to `visibleWidth` when it
// bleeds off the right edge. Falls back to a branded placeholder tile if the
// card art can't be fetched.
const cardLayer = async (
  card: ListCardRow,
  visibleWidth: number,
): Promise<Buffer> => {
  const width = Math.max(1, Math.min(CARD_W, visibleWidth));
  const bytes = await getCardImageBytes(card.card.id);
  if (bytes) {
    try {
      const full = await sharp(bytes).resize(CARD_W, CARD_H).png().toBuffer();
      if (width === CARD_W) return full;
      return sharp(full)
        .extract({ left: 0, top: 0, width, height: CARD_H })
        .png()
        .toBuffer();
    } catch (error) {
      log.warn("og", `card render failed for ${card.card.id}: ${error}`);
    }
  }
  const name = card.card.name.length > 16 ? card.card.name : card.card.name;
  const svg = `<svg width="${width}" height="${CARD_H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${CARD_H}" rx="12" fill="${PLACEHOLDER_BG}"/>
    <rect width="${width}" height="6" fill="${WANT}"/>
    ${textPath(forque, name.slice(0, 14), 30, 16, CARD_H / 2, "#ece9e2")}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
};

interface Segment {
  label: string;
  color: string;
  cards: ListCardRow[];
}

// Decide the segment order per the spec's conditional layouts:
//   0 wants        → HAVE label + haves
//   1 want + haves → WANT + the one want, then a HAVE divider + haves
//   otherwise      → WANT + wants
const planSegments = (list: TradeList): Segment[] => {
  if (list.wants.length === 0) {
    return [{ label: "HAVE", color: HAVE, cards: list.haves }];
  }
  const segments: Segment[] = [
    { label: "WANT", color: WANT, cards: list.wants },
  ];
  if (list.wants.length === 1 && list.haves.length > 0) {
    segments.push({ label: "HAVE", color: HAVE, cards: list.haves });
  }
  return segments;
};

export const renderOgImage = async (list: TradeList): Promise<Uint8Array> => {
  const composites: OverlayOptions[] = [];
  const segments = planSegments(list);
  let x = ROW_START_PAD;

  for (let s = 0; s < segments.length; s++) {
    const segment = segments[s];
    const label = await verticalLabel(segment.label, segment.color, 132);
    composites.push({
      input: label.buffer,
      left: Math.round(x),
      top: Math.round((CANVAS_H - label.height) / 2) - ROW_Y_SHIFT,
    });
    x += label.width + LABEL_GAP;

    // The first segment of a two-segment layout shows exactly its cards (the
    // single want); otherwise cards run until they bleed off the right edge.
    const bounded = segments.length > 1 && s === 0;
    for (const card of segment.cards) {
      if (x >= CANVAS_W) break;
      const layer = await cardLayer(card, CANVAS_W - Math.round(x));
      composites.push({ input: layer, left: Math.round(x), top: CARD_TOP });
      x += CARD_W + CARD_GAP;
      if (bounded) break;
    }
    x += LABEL_GAP - CARD_GAP;
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

  // Base layer: background + count badge (bottom-left, in a rounded pill) +
  // wordmark (bottom-right).
  const badgeY = CANVAS_H - 12;
  const badgeSize = 30;
  const lf = `LF ${list.wants.length}`;
  const ft = `FT ${list.haves.length}`;
  let bx = EDGE_PAD;
  const badgeParts: string[] = [];
  badgeParts.push(textPath(mono, lf, badgeSize, bx, badgeY, WANT));
  bx += advance(mono, lf, badgeSize);
  badgeParts.push(textPath(mono, " · ", badgeSize, bx, badgeY, MUTED));
  bx += advance(mono, " · ", badgeSize);
  badgeParts.push(textPath(mono, ft, badgeSize, bx, badgeY, HAVE));
  const badgeWidth = bx + advance(mono, ft, badgeSize) - EDGE_PAD;
  const pillPadX = 16;
  const pillPadTop = 28;
  const pillPadBottom = 6;
  const pill = `<rect x="${EDGE_PAD - pillPadX}" y="${badgeY - pillPadTop}" width="${
    badgeWidth + pillPadX * 2
  }" height="${pillPadTop + pillPadBottom}" rx="20" fill="#1a181e"/>`;

  const markSize = 34;
  const markY = CANVAS_H - 14;
  const wWidth = advance(forque, "want", markSize);
  const hWidth = advance(forque, "have", markSize);
  const tWidth = advance(forque, ".trade", markSize);
  const markTotal = wWidth + hWidth + tWidth;
  let mx = CANVAS_W - EDGE_PAD - markTotal;
  const markParts: string[] = [];
  markParts.push(textPath(forque, "want", markSize, mx, markY, WANT));
  mx += wWidth;
  markParts.push(textPath(forque, "have", markSize, mx, markY, HAVE));
  mx += hWidth;
  markParts.push(textPath(forque, ".trade", markSize, mx, markY, "#ffffff"));

  const baseSvg = `<svg width="${CANVAS_W}" height="${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#141216"/><stop offset="1" stop-color="${BG}"/>
    </linearGradient></defs>
    <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#g)"/>
    ${pill}
    ${badgeParts.join("")}
    ${markParts.join("")}
  </svg>`;

  return sharp(Buffer.from(baseSvg))
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
};
