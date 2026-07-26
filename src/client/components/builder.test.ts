import { afterEach, describe, expect, test } from "bun:test";
import { h, render } from "preact";
import { Builder, type BuilderConfig, type CardDto } from "./builder";

const CARD: CardDto = {
  id: "a1-036",
  name: "Charizard",
  set: "A1",
  number: 36,
  rarity: "d3",
  ex: false,
};

const baseConfig: BuilderConfig = {
  sets: [{ code: "A1", name: "Genetic Apex", count: 279 }],
  csrfToken: "test-csrf-token",
  mode: "create",
};

// Mount with a card already in the list so the details step — which holds the
// friend ID field — is one click away.
const mountAtDetails = async (
  initial: BuilderConfig["initial"],
): Promise<HTMLElement> => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  render(h(Builder, { ...baseConfig, initial }), host);

  host.querySelector<HTMLButtonElement>("button.builder-submit")?.click();
  await Promise.resolve();

  return host;
};

const friendInput = (host: HTMLElement): HTMLInputElement | null =>
  host.querySelector<HTMLInputElement>("#friend-id-input");

describe("Builder friend ID prefill", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  test("prefills the friend ID handed down from the server", async () => {
    const host = await mountAtDetails({
      wants: [{ card: CARD, quantity: 1 }],
      haves: [],
      friendId: "1234567890123456",
    });

    expect(friendInput(host)?.value).toBe("1234 5678 9012 3456");
  });

  test("leaves the field empty when the server sends nothing", async () => {
    const host = await mountAtDetails({
      wants: [{ card: CARD, quantity: 1 }],
      haves: [],
      friendId: "",
    });

    expect(friendInput(host)?.value).toBe("");
  });

  test("falls back to the session-remembered ID", async () => {
    sessionStorage.setItem("wanthave:friend", "1111222233334444");

    const host = await mountAtDetails({
      wants: [{ card: CARD, quantity: 1 }],
      haves: [],
      friendId: "",
    });

    expect(friendInput(host)?.value).toBe("1111 2222 3333 4444");
  });
});
