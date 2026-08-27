import { getCardById } from "./cards";
import type { ListCardRow, TradeList } from "./lists";
import { renderOgImage } from "./og";

// The stand-in list behind the home page's unfurl preview. Modelled on a real
// Discord trade post: chasing one rainbow ★2, with a row of rainbow (★2) and
// shiny (✵) cards up for trade — showing off the rarities slang search
// resolves. Drawn from the newest set so the page shows what people are
// actually hunting right now — refresh these when a set drops.
export const DEMO_WANTS = ["b4a-087"]; // ★2 Team Rocket’s Boss (rainbow)
export const DEMO_HAVES = [
  "b4a-105", // ✵2 Mega Charizard Y ex (shiny)
  "b4a-088", // ★2 Team Rocket’s Moltres ex (rainbow)
  "b4a-108", // ✵2 Mega Mawile ex (shiny)
  "b4a-090", // ★2 Team Rocket’s Zapdos ex (rainbow)
  "b4a-107", // ✵2 Mimikyu ex (shiny)
  "b4a-089", // ★2 Team Rocket’s Articuno ex (rainbow)
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
