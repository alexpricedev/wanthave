import { describe, expect, test } from "bun:test";
import { ByteCappedCache } from "./card-images";

const bytes = (size: number): Uint8Array => new Uint8Array(size);

describe("ByteCappedCache", () => {
  test("holds everything that fits under the budget", () => {
    const cache = new ByteCappedCache(100);
    cache.set("a", bytes(40));
    cache.set("b", bytes(40));

    expect(cache.size).toBe(2);
    expect(cache.bytes).toBe(80);
    expect(cache.get("a")).toBeDefined();
  });

  test("evicts the oldest entry when a write breaches the budget", () => {
    const cache = new ByteCappedCache(100);
    cache.set("a", bytes(40));
    cache.set("b", bytes(40));
    cache.set("c", bytes(40));

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeDefined();
    expect(cache.get("c")).toBeDefined();
    expect(cache.bytes).toBe(80);
  });

  test("evicts as many entries as it takes to fit", () => {
    const cache = new ByteCappedCache(100);
    cache.set("a", bytes(40));
    cache.set("b", bytes(40));
    cache.set("big", bytes(90));

    expect(cache.size).toBe(1);
    expect(cache.bytes).toBe(90);
    expect(cache.get("big")).toBeDefined();
  });

  test("reading an entry spares it from the next eviction", () => {
    const cache = new ByteCappedCache(100);
    cache.set("a", bytes(40));
    cache.set("b", bytes(40));
    // "a" is now the most recently used, so "b" is the one at the front.
    cache.get("a");
    cache.set("c", bytes(40));

    expect(cache.get("a")).toBeDefined();
    expect(cache.get("b")).toBeUndefined();
  });

  test("keeps an oversized entry rather than emptying itself", () => {
    const cache = new ByteCappedCache(100);
    cache.set("huge", bytes(500));

    expect(cache.size).toBe(1);
    expect(cache.get("huge")).toBeDefined();
  });

  test("overwriting a key replaces its byte count rather than adding to it", () => {
    const cache = new ByteCappedCache(100);
    cache.set("a", bytes(40));
    cache.set("a", bytes(60));

    expect(cache.size).toBe(1);
    expect(cache.bytes).toBe(60);
  });

  test("clear empties both the entries and the byte total", () => {
    const cache = new ByteCappedCache(100);
    cache.set("a", bytes(40));
    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.bytes).toBe(0);
  });
});
