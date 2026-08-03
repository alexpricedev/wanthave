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

describe("Builder submit button label", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  // Mount straight onto the details step in the given mode, then click submit
  // against a fetch that never settles so the in-flight label stays on screen.
  const mountAndSubmit = async (
    config: BuilderConfig,
  ): Promise<HTMLButtonElement | null> => {
    globalThis.fetch = Object.assign(() => new Promise<Response>(() => {}), {
      preconnect: originalFetch.preconnect,
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    render(
      h(Builder, {
        ...config,
        initial: {
          wants: [{ card: CARD, quantity: 1 }],
          haves: [],
          friendId: "",
        },
      }),
      host,
    );

    const submit = () =>
      host.querySelector<HTMLButtonElement>("button.builder-submit");
    submit()?.click();
    await Promise.resolve();
    submit()?.click();
    await Promise.resolve();

    return submit();
  };

  test("says Creating… while a new list is in flight", async () => {
    const button = await mountAndSubmit(baseConfig);

    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toBe("Creating…");
  });

  test("says Saving… while an edit is in flight", async () => {
    const button = await mountAndSubmit({
      ...baseConfig,
      mode: "edit",
      slug: "abc123",
    });

    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toBe("Saving…");
  });
});

describe("Builder expired-token recovery", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  const EXPIRED_BODY = {
    error: "Your session timed out. Nothing was lost — press again.",
    code: "csrf-expired",
    csrfToken: "second-chance-token",
  };

  // Mount on the details step with one card queued, recording the CSRF token
  // sent with each submit. The first attempt gets the expired-token 403; every
  // later one hangs, so the in-flight state is stable to assert against.
  const mountWithExpiredFirstAttempt = async () => {
    const tokensSent: (string | undefined)[] = [];
    let attempt = 0;

    globalThis.fetch = Object.assign(
      (_url: string, init: RequestInit): Promise<Response> => {
        const headers = init.headers as Record<string, string>;
        tokensSent.push(headers["X-CSRF-Token"]);
        attempt++;
        if (attempt === 1) {
          return Promise.resolve(
            new Response(JSON.stringify(EXPIRED_BODY), { status: 403 }),
          );
        }
        return new Promise<Response>(() => {});
      },
      { preconnect: originalFetch.preconnect },
    ) as typeof globalThis.fetch;

    const host = document.createElement("div");
    document.body.appendChild(host);
    render(
      h(Builder, {
        ...baseConfig,
        initial: {
          wants: [{ card: CARD, quantity: 1 }],
          haves: [],
          friendId: "",
        },
      }),
      host,
    );

    const submit = () =>
      host.querySelector<HTMLButtonElement>("button.builder-submit");

    submit()?.click(); // step 1 → details
    await flush();
    submit()?.click(); // first save attempt
    await flush();

    return { host, submit, tokensSent };
  };

  test("warns instead of erroring, and keeps the cards on screen", async () => {
    const { host, submit } = await mountWithExpiredFirstAttempt();

    const alert = host.querySelector(".builder-error");
    expect(alert?.textContent).toBe(EXPIRED_BODY.error);
    expect(alert?.classList.contains("builder-error--warning")).toBe(true);

    // Nothing was lost and the button is live again for a second try.
    expect(submit()?.disabled).toBe(false);

    host.querySelector<HTMLButtonElement>("button.builder-back")?.click();
    await flush();
    expect(host.querySelectorAll(".trade-list li").length).toBe(1);
  });

  test("the second attempt uses the token the server handed back", async () => {
    const { submit, tokensSent } = await mountWithExpiredFirstAttempt();

    submit()?.click();
    await flush();

    expect(tokensSent).toEqual(["test-csrf-token", "second-chance-token"]);
  });

  test("an ordinary failure still reads as an error", async () => {
    globalThis.fetch = Object.assign(
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Invalid CSRF token" }), {
            status: 403,
          }),
        ),
      { preconnect: originalFetch.preconnect },
    ) as typeof globalThis.fetch;

    const host = document.createElement("div");
    document.body.appendChild(host);
    render(
      h(Builder, {
        ...baseConfig,
        initial: {
          wants: [{ card: CARD, quantity: 1 }],
          haves: [],
          friendId: "",
        },
      }),
      host,
    );

    const submit = () =>
      host.querySelector<HTMLButtonElement>("button.builder-submit");
    submit()?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    submit()?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const alert = host.querySelector(".builder-error");
    expect(alert?.textContent).toBe("Invalid CSRF token");
    expect(alert?.classList.contains("builder-error--warning")).toBe(false);
  });
});
