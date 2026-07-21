import { describe, expect, test } from "bun:test";
import { formatFriendId, normalizeFriendId } from "./friend-id";

describe("normalizeFriendId", () => {
  test("accepts 16 bare digits", () => {
    expect(normalizeFriendId("1234567890123456")).toBe("1234567890123456");
  });

  test("strips spaces and dashes", () => {
    expect(normalizeFriendId("1234 5678 9012 3456")).toBe("1234567890123456");
    expect(normalizeFriendId("1234-5678-9012-3456")).toBe("1234567890123456");
  });

  test("rejects wrong length", () => {
    expect(normalizeFriendId("123")).toBeNull();
    expect(normalizeFriendId("12345678901234567")).toBeNull();
  });

  test("rejects empty and nullish", () => {
    expect(normalizeFriendId("")).toBeNull();
    expect(normalizeFriendId(null)).toBeNull();
    expect(normalizeFriendId(undefined)).toBeNull();
  });
});

describe("formatFriendId", () => {
  test("groups into fours", () => {
    expect(formatFriendId("1234567890123456")).toBe("1234 5678 9012 3456");
  });

  test("passes through unexpected input unchanged", () => {
    expect(formatFriendId("abc")).toBe("abc");
  });
});
