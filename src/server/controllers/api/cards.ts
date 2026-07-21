import type { BunRequest } from "bun";
import { type Card, getCardsBySet, searchCards } from "../../services/cards";

// The card shape the builder needs. Image bytes come from the /img/card proxy,
// so the client only needs the id to build an <img src>.
interface CardDto {
  id: string;
  name: string;
  set: string;
  number: number;
  rarity: Card["rarity"];
  ex: boolean;
}

const toDto = (c: Card): CardDto => ({
  id: c.id,
  name: c.name,
  set: c.set,
  number: c.number,
  rarity: c.rarity,
  ex: c.ex,
});

export const cardsApi = {
  // GET /api/cards?set=A1&q=char — unified card lookup. `set` is an optional
  // filter ("all" / omitted searches every set); `q` is an optional slang-aware
  // query. A bare set browses it; a query alone searches all sets; a set + query
  // searches within that set. Neither returns an empty list (the builder shows
  // a prompt to search or pick a set).
  index(req: BunRequest): Response {
    const url = new URL(req.url);
    const setParam = url.searchParams.get("set") ?? "";
    const setFilter = setParam && setParam !== "all" ? setParam : "";
    const q = (url.searchParams.get("q") ?? "").trim();

    if (q) {
      // Within one set, return every match; across all sets, keep the ranked
      // top results so the grid stays manageable.
      const limit = setFilter ? 1000 : 40;
      return Response.json({
        cards: searchCards(q, limit, setFilter).map(toDto),
      });
    }
    if (setFilter) {
      return Response.json({ cards: getCardsBySet(setFilter).map(toDto) });
    }
    // No set, no query: empty — the builder prompts the user to search or pick.
    return Response.json({ cards: [] });
  },

  // GET /api/cards/search?q=RR+chsr+EX — direct slang-aware search (kept for
  // non-builder callers; the builder uses the unified /api/cards endpoint).
  search(req: BunRequest): Response {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length === 0) {
      return Response.json({ cards: [] });
    }
    return Response.json({ cards: searchCards(q, 40).map(toDto) });
  },
};
