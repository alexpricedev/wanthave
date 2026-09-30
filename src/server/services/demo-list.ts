import { getCardById } from "./cards";
import type { ListCardRow, TradeList } from "./lists";
import { renderOgImage } from "./og";

// The stand-in list behind the home page's unfurl preview. Modelled on a real
// Discord trade post: chasing one rainbow ★2, with a row of rainbow (★2) and
// shiny (✵) cards up for trade — showing off the rarities slang search
// resolves. Drawn from the newest set so the page shows what people are
// actually hunting right now — refresh these when a set drops.
export const DEMO_WANTS = ["b4b-420"]; // ★2 Mega Rayquaza ex (rainbow)
export const DEMO_HAVES = [
  "b4b-427", // ✵2 Mega Diancie ex (shiny)
  "b4b-411", // ★2 Mega Charizard X ex (rainbow)
  "b4b-426", // ✵2 Dedenne ex (shiny)
  "b4b-416", // ★2 Mega Gardevoir ex (rainbow)
  "b4b-419", // ★2 Mega Gengar ex (rainbow)
  "b4b-412", // ★2 Mega Charizard Y ex (rainbow)
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
