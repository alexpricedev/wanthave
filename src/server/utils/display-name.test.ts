import { describe, expect, test } from "bun:test";
import { normalizeDisplayName, validateDisplayName } from "./display-name";

describe("normalizeDisplayName", () => {
  test("returns null for nothing to store", () => {
    expect(normalizeDisplayName(null)).toBeNull();
    expect(normalizeDisplayName(undefined)).toBeNull();
    expect(normalizeDisplayName("")).toBeNull();
    expect(normalizeDisplayName("   ")).toBeNull();
  });

  test("trims and collapses whitespace", () => {
    expect(normalizeDisplayName("  Alex  ")).toBe("Alex");
    expect(normalizeDisplayName("Ash\tKetchum")).toBe("Ash Ketchum");
    expect(normalizeDisplayName("Ash   Ketchum")).toBe("Ash Ketchum");
  });

  test("keeps the punctuation and accents people put in handles", () => {
    expect(normalizeDisplayName("señor_pika")).toBe("señor_pika");
    expect(normalizeDisplayName("Ash-K. 🔥")).toBe("Ash-K. 🔥");
  });

  test("strips characters that could reshape a title", () => {
    // A newline would break out of the line; the bidi override would reverse
    // the text around the name in the title bar and the unfurl.
    expect(normalizeDisplayName("Alex\nwanthave")).toBe("Alex wanthave");
    expect(normalizeDisplayName("Alex\u202egnihtemos")).toBe("Alexgnihtemos");
    expect(normalizeDisplayName("\u200b\u200b")).toBeNull();
  });
});

describe("validateDisplayName", () => {
  test("treats a blank field as removing the name", () => {
    expect(validateDisplayName("")).toEqual({ ok: true, name: null });
    expect(validateDisplayName("   ")).toEqual({ ok: true, name: null });
    expect(validateDisplayName(null)).toEqual({ ok: true, name: null });
  });

  test("accepts a normal name, normalized", () => {
    expect(validateDisplayName("  Alex ")).toEqual({ ok: true, name: "Alex" });
  });

  test("rejects a name too short to identify anyone", () => {
    const result = validateDisplayName("A");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("2 characters");
  });

  test("rejects a name longer than the column and the title can carry", () => {
    const result = validateDisplayName("A".repeat(25));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("24 characters");
  });

  test("counts the length after cleaning, not before", () => {
    expect(validateDisplayName(`   ${"A".repeat(24)}   `)).toEqual({
      ok: true,
      name: "A".repeat(24),
    });
  });
});
