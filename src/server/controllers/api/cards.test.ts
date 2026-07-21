import { describe, expect, test } from "bun:test";
import { createBunRequest } from "../../test-utils/bun-request";
import { cardsApi } from "./cards";

describe("cardsApi.index", () => {
  test("browses a whole set when only ?set is given", async () => {
    const req = createBunRequest("http://localhost:3000/api/cards?set=A1");
    const res = cardsApi.index(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: { set: string }[] };
    expect(body.cards.length).toBeGreaterThan(0);
    expect(body.cards.every((c) => c.set === "A1")).toBe(true);
  });

  test("searches within a set when ?set and ?q are given", async () => {
    const req = createBunRequest(
      "http://localhost:3000/api/cards?set=A1&q=charizard",
    );
    const body = (await cardsApi.index(req).json()) as {
      cards: { set: string; name: string }[];
    };
    expect(body.cards.length).toBeGreaterThan(0);
    expect(body.cards.every((c) => c.set === "A1")).toBe(true);
    expect(
      body.cards.every((c) => c.name.toLowerCase().includes("chariz")),
    ).toBe(true);
  });

  test("searches all sets when only ?q is given (set=all)", async () => {
    const req = createBunRequest(
      "http://localhost:3000/api/cards?set=all&q=charizard",
    );
    const body = (await cardsApi.index(req).json()) as {
      cards: { set: string }[];
    };
    expect(body.cards.length).toBeGreaterThan(0);
    expect(new Set(body.cards.map((c) => c.set)).size).toBeGreaterThan(1);
  });

  test("no set and no query returns an empty list (200)", async () => {
    const req = createBunRequest("http://localhost:3000/api/cards");
    const res = cardsApi.index(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: unknown[] };
    expect(body.cards).toEqual([]);
  });
});

describe("cardsApi.search", () => {
  test("resolves slang to matching cards", async () => {
    const req = createBunRequest(
      "http://localhost:3000/api/cards/search?q=RR%20chsr%20EX",
    );
    const res = cardsApi.search(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cards: { name: string; ex: boolean }[];
    };
    expect(body.cards.length).toBeGreaterThan(0);
    expect(body.cards.every((c) => c.ex)).toBe(true);
  });

  test("empty query yields no cards", async () => {
    const req = createBunRequest("http://localhost:3000/api/cards/search?q=");
    const body = (await cardsApi.search(req).json()) as { cards: unknown[] };
    expect(body.cards).toEqual([]);
  });
});
