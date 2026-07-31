import { describe, expect, test } from "bun:test";
import { buildDemoList, DEMO_HAVES, DEMO_WANTS } from "./demo-list";

describe("buildDemoList", () => {
  // The hero renders whatever resolves — a typo'd or retired id would silently
  // shrink the preview instead of failing.
  test("every showcased card id resolves in the catalogue", () => {
    const list = buildDemoList();
    expect(list.wants.length).toBe(DEMO_WANTS.length);
    expect(list.haves.length).toBe(DEMO_HAVES.length);
  });

  test("cards keep their kind and order", () => {
    const list = buildDemoList();
    expect(list.wants.map((r) => r.card.id)).toEqual(DEMO_WANTS);
    expect(list.haves.map((r) => r.card.id)).toEqual(DEMO_HAVES);
    expect(list.wants.every((r) => r.kind === "want")).toBe(true);
    expect(list.haves.every((r) => r.kind === "have")).toBe(true);
  });
});
