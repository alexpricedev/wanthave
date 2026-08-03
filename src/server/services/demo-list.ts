import { getCardById } from "./cards";
import type { ListCardRow, TradeList } from "./lists";
import { renderOgImage } from "./og";

// The stand-in list behind the home page's unfurl preview. Modelled on a real
// Discord trade post: chasing one rainbow ★2, with a row of rainbow (★2) and
// shiny (✵) cards up for trade — showing off the rarities slang search
// resolves. Drawn from the newest set so the page shows what people are
// actually hunting right now — refresh these when a set drops.
export const DEMO_WANTS = ["b4-188"]; // ★2 Mega Rayquaza ex (rainbow)
export const DEMO_HAVES = [
  "b4-227", // ✵2 Mega Gardevoir ex (shiny)
  "b4-187", // ★2 Mega Metagross ex (rainbow)
  "b4-231", // ✵2 Mega Kangaskhan ex (shiny)
  "b4-185", // ★2 Mega Gallade ex (rainbow)
  "b4-226", // ✵2 Mega Swampert ex (shiny)
  "b4-182", // ★2 Mega Sharpedo ex (rainbow)
];

// Version the URL by what it draws, so swapping the showcased cards busts every
// browser and CDN copy on deploy instead of leaving a day-stale hero behind.
export const DEMO_OG_PATH = `/og/demo.png?v=${Bun.hash(
  [...DEMO_WANTS, ...DEMO_HAVES].join(","),
).toString(36)}`;

const rows = (ids: string[], kind: "want" | "have"): ListCardRow[] =>
  ids.flatMap((id, position) => {
    const card = getCardById(id);
    return card ? [{ card, kind, quantity: 1, position }] : [];
  });

// Shaped like a real list so it goes through the same renderer the share links
// use — the hero shows the actual artefact, not a lookalike.
export const buildDemoList = (): TradeList => ({
  id: "demo",
  slug: "demo",
  userId: null,
  title: null,
  ownerName: null,
  friendId: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  expiresAt: null,
  wants: rows(DEMO_WANTS, "want"),
  haves: rows(DEMO_HAVES, "have"),
});

// Content only changes on deploy, so one render serves the whole process.
// A render that fell back to placeholder tiles isn't kept — same rule as the
// per-list cache, so a transient art outage doesn't freeze the hero.
let cached: Uint8Array | null = null;
let inFlight: Promise<Uint8Array> | null = null;

export const getDemoOgImage = async (): Promise<Uint8Array> => {
  if (cached) return cached;
  if (!inFlight) {
    inFlight = (async () => {
      const render = await renderOgImage(buildDemoList());
      if (render.complete) cached = render.png;
      return render.png;
    })().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
};
