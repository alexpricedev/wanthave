import { describe, expect, test } from "bun:test";
import {
  createFormStamp,
  isTooFast,
  MIN_FILL_MS,
  readFormStampAge,
} from "./form-timing";

describe("createFormStamp", () => {
  test("emits a signed timestamp", () => {
    const stamp = createFormStamp(1_700_000_000_000);
    const [issuedAt, signature] = stamp.split(".");
    expect(issuedAt).toBe("1700000000000");
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("readFormStampAge", () => {
  test("returns the elapsed time for a stamp we signed", () => {
    const now = 1_700_000_000_000;
    const age = readFormStampAge(createFormStamp(now), now + 5_000);
    expect(age).toBe(5_000);
  });

  test("rejects a back-dated timestamp", () => {
    const stamp = createFormStamp(1_700_000_000_000);
    const [, signature] = stamp.split(".");
    // Bot rewinds the clock to fake a slow fill but reuses the old signature.
    expect(readFormStampAge(`1699999000000.${signature}`)).toBeNull();
  });

  test.each([
    ["empty", ""],
    ["unsigned", "1700000000000"],
    ["non-numeric", `abc.${createFormStamp(1).split(".")[1]}`],
    ["short signature", "1700000000000.deadbeef"],
  ])("rejects a %s stamp", (_label, stamp) => {
    expect(readFormStampAge(stamp)).toBeNull();
  });
});

describe("isTooFast", () => {
  test("flags a submission that lands immediately", () => {
    expect(isTooFast(createFormStamp())).toBe(true);
  });

  test("flags a missing stamp", () => {
    expect(isTooFast("")).toBe(true);
  });

  test("allows a submission after the minimum fill time", () => {
    const stamp = createFormStamp(Date.now() - (MIN_FILL_MS + 1_000));
    expect(isTooFast(stamp)).toBe(false);
  });
});
