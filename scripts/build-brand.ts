#!/usr/bin/env bun
/**
 * Generates the wanthave brand assets in public/ from the Forque display face:
 * the "WH" favicon/icon set (two-hue W amber / H ice, per DESIGN.md) and the
 * default marketing OG image (the home page + expired-list fallback).
 *
 * Text is converted to vector paths with opentype.js so nothing depends on a
 * system font. Run: `bun run scripts/build-brand.ts`.
 */
import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import pngToIco from "png-to-ico";
import sharp from "sharp";
import { getCardById } from "../src/server/services/cards";
import { cardLayer, SHADOW_PAD } from "../src/server/services/og";

const WANT = "#e5b35b";
const HAVE = "#7fcbd9";
const BONE = "#ece9e2";
const MUTED = "#8b8794";
const EDGE = "#2c2934";

// The icon set reads at tiny sizes (favicon tab, home-screen), so it drops the
// two-hue branding for maximum contrast: white letters on a black sleeve.
const ICON_INK = "#ffffff";
const ICON_SLEEVE = "#000000";

const parse = (p: string): opentype.Font =>
  opentype.parse(readFileSync(p).buffer as ArrayBuffer);
const forque = parse("public/Forque.ttf");
const mono = parse("src/server/assets/fonts/IBMPlexMono-SemiBold.ttf");

const has = (font: opentype.Font, ch: string): boolean =>
  font.charToGlyphIndex(ch) > 0;
// Fall back to an unaccented "e" if a face lacks é (Forque is a small display set).
const poke = (font: opentype.Font): string =>
  has(font, "é") ? "Pokémon" : "Pokemon";

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

// ── "WH" icon ──────────────────────────────────────────────────────────────
const whIcon = (size: number): string => {
  const fs = size * 0.6;
  const wW = advance(forque, "W", fs);
  const pW = forque.getPath("W", 0, 0, fs);
  const pH = forque.getPath("H", wW, 0, fs);
  const bbW = pW.getBoundingBox();
  const bbH = pH.getBoundingBox();
  const minX = Math.min(bbW.x1, bbH.x1);
  const maxX = Math.max(bbW.x2, bbH.x2);
  const minY = Math.min(bbW.y1, bbH.y1);
  const maxY = Math.max(bbW.y2, bbH.y2);
  const tx = (size - (maxX - minX)) / 2 - minX;
  const ty = (size - (maxY - minY)) / 2 - minY;
  const rx = size * 0.22;
  const stroke = size >= 64 ? `<rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${rx}" fill="none" stroke="${EDGE}" stroke-width="2"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${rx}" fill="${ICON_SLEEVE}"/>
    ${stroke}
    <g transform="translate(${tx} ${ty})">
      <path d="${pW.toPathData(2)}" fill="${ICON_INK}"/>
      <path d="${pH.toPathData(2)}" fill="${ICON_INK}"/>
    </g>
  </svg>`;
};

const iconPng = (size: number): Promise<Buffer> =>
  sharp(Buffer.from(whIcon(size))).png().toBuffer();

const buildIcons = async (): Promise<void> => {
  await Bun.write("public/favicon.svg", whIcon(64));
  await Bun.write("public/logo.svg", whIcon(48));
  await Bun.write("public/apple-touch-icon.png", await iconPng(180));
  await Bun.write("public/android-chrome-192x192.png", await iconPng(192));
  await Bun.write("public/android-chrome-512x512.png", await iconPng(512));
  await Bun.write("public/favicon-32x32.png", await iconPng(32));
  await Bun.write("public/favicon-16x16.png", await iconPng(16));
  const ico = await pngToIco([
    await iconPng(16),
    await iconPng(32),
    await iconPng(48),
  ]);
  await Bun.write("public/favicon.ico", ico);
  console.log("icons: favicon.svg, logo.svg, apple-touch, android-chrome, 16/32, .ico");
};

// ── Marketing OG (1200×630) ──────────────────────────────────────────────────
// The card row is drawn by the per-list OG renderer itself (og.ts `cardLayer`),
// not a lookalike: same geometry, same drop shadows, same right-edge crop. What
// someone sees on the marketing card is literally what their own list renders
// as, and the two can't drift apart.
// Drawn from the newest set, same as the home page hero — refresh both when a
// set drops (and re-run this script).
const WANT_HEROES = ["b4b-420", "b4b-411", "b4b-412"];
const HAVE_HEROES = ["b4b-427", "b4b-426"];

const vLabel = async (
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
  return { buffer, width: h, height: w };
};

const buildOg = async (): Promise<void> => {
  const W = 1200;
  const H = 630;
  const cardH = 330;
  const cardW = Math.round((cardH * 367) / 512);
  const cardTop = 300;
  const cardGap = 12;
  const labelGap = 16;
  const rowStartPad = 74;
  const edgeFadeW = 180;

  const composites: sharp.OverlayOptions[] = [];
  let x = rowStartPad;

  const segments = [
    { label: "WANT", color: WANT, ids: WANT_HEROES },
    { label: "HAVE", color: HAVE, ids: HAVE_HEROES },
  ];
  for (const segment of segments) {
    const label = await vLabel(segment.label, segment.color, 80);
    composites.push({
      input: label.buffer,
      left: Math.round(x),
      top: cardTop + Math.round((cardH - label.height) / 2),
    });
    x += label.width + labelGap;

    for (const id of segment.ids) {
      if (x >= W) break;
      const card = getCardById(id);
      if (!card) throw new Error(`Hero card ${id} is not in the catalogue`);

      const layer = await cardLayer({
        card,
        width: cardW,
        height: cardH,
        visibleWidth: Math.max(1, Math.min(cardW, W - Math.round(x))),
        color: segment.color,
      });
      // This artifact is checked in, so it can't self-heal the way the runtime
      // OG does — a set whose art hasn't reached the CDN yet would ship as a
      // blank tile on every unfurl of the marketing card. Fail instead.
      if (layer.placeholder) {
        throw new Error(
          `No art available for hero card ${id} — pick a card whose art is on the CDN, or rerun once it lands`,
        );
      }
      composites.push({
        input: layer.buffer,
        left: Math.round(x) - SHADOW_PAD,
        top: cardTop - SHADOW_PAD,
      });
      x += cardW + cardGap;
    }
    x += labelGap - cardGap;
  }

  const eyebrow = `${poke(mono).toUpperCase()} TCG POCKET`;
  const wordSize = 116;
  const wy = 196;
  const wWx = advance(forque, "want", wordSize);

  const url = "wanthave.trade";
  const base = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#18151c"/><stop offset="0.6" stop-color="#0c0b0e"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${textPath(mono, eyebrow, 22, 74, 96, MUTED)}
    ${textPath(mono, url, 22, W - 74 - advance(mono, url, 22), 96, BONE)}
    ${textPath(forque, "want", wordSize, 70, wy, WANT)}
    ${textPath(forque, "have", wordSize, 70 + wWx, wy, HAVE)}
    ${textPath(forque, "SHARE YOUR TRADE LIST", 40, 74, 250, BONE)}
  </svg>`;

  // Fade the bled-off card into black, drawn last so it sits on top of the
  // card composites.
  const overlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${W - edgeFadeW}" width="${edgeFadeW}" height="${H}" fill="url(#fade2)"/>
    <defs><linearGradient id="fade2" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0c0b0e" stop-opacity="0"/>
      <stop offset="1" stop-color="#0c0b0e" stop-opacity="1"/>
    </linearGradient></defs>
  </svg>`;

  const png = await sharp(Buffer.from(base))
    .composite([...composites, { input: Buffer.from(overlay), left: 0, top: 0 }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await Bun.write("public/og-image.png", png);
  console.log(`og-image.png: ${png.length} bytes`);
};

await buildIcons();
await buildOg();
console.log("Brand assets rebuilt.");
