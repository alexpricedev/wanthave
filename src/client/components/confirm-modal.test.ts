import { afterEach, describe, expect, test } from "bun:test";
import { confirmAction, destroyConfirmModal } from "./confirm-modal";

const overlay = () =>
  document.querySelector(".confirm-modal-overlay") as HTMLDivElement | null;
const cancelBtn = () =>
  document.querySelector(".confirm-modal-cancel") as HTMLButtonElement;
const confirmBtn = () =>
  document.querySelector(".confirm-modal-confirm") as HTMLButtonElement;

const press = (key: string) =>
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );

afterEach(() => {
  destroyConfirmModal();
  document.body.innerHTML = "";
});

describe("confirmAction", () => {
  test("renders the supplied copy and opens the overlay", async () => {
    const result = confirmAction({
      title: "Delete this list?",
      message: "This is permanent.",
      confirmLabel: "Delete list",
      danger: true,
    });

    expect(overlay()?.classList.contains("is-open")).toBe(true);
    expect(document.querySelector(".confirm-modal-title")?.textContent).toBe(
      "Delete this list?",
    );
    expect(document.querySelector(".confirm-modal-message")?.textContent).toBe(
      "This is permanent.",
    );
    expect(confirmBtn().textContent).toBe("Delete list");
    expect(confirmBtn().classList.contains("is-danger")).toBe(true);
    expect(cancelBtn().textContent).toBe("Cancel");

    cancelBtn().click();
    await result;
  });

  test("resolves true when the confirm button is clicked", async () => {
    const result = confirmAction({ title: "Sure?" });
    confirmBtn().click();

    expect(await result).toBe(true);
    expect(overlay()?.classList.contains("is-open")).toBe(false);
  });

  test("resolves false when cancelled", async () => {
    const result = confirmAction({ title: "Sure?" });
    cancelBtn().click();

    expect(await result).toBe(false);
  });

  test("resolves false on Escape", async () => {
    const result = confirmAction({ title: "Sure?" });
    press("Escape");

    expect(await result).toBe(false);
  });

  test("resolves false when the backdrop is clicked", async () => {
    const result = confirmAction({ title: "Sure?" });
    overlay()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(await result).toBe(false);
  });

  test("keeps the panel open when the panel itself is clicked", async () => {
    const result = confirmAction({ title: "Sure?" });
    document
      .querySelector(".confirm-modal")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(overlay()?.classList.contains("is-open")).toBe(true);
    confirmBtn().click();
    expect(await result).toBe(true);
  });

  test("focuses cancel first and traps Tab between the two buttons", async () => {
    const result = confirmAction({ title: "Sure?" });
    expect(document.activeElement).toBe(cancelBtn());

    press("Tab");
    expect(document.activeElement).toBe(confirmBtn());

    press("Tab");
    expect(document.activeElement).toBe(cancelBtn());

    cancelBtn().click();
    await result;
  });

  test("hides the message paragraph when no message is given", async () => {
    const result = confirmAction({ title: "Sure?" });

    expect(
      (document.querySelector(".confirm-modal-message") as HTMLElement).hidden,
    ).toBe(true);

    cancelBtn().click();
    await result;
  });

  test("restores focus to the trigger on close", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();

    const result = confirmAction({ title: "Sure?" });
    confirmBtn().click();
    await result;

    expect(document.activeElement).toBe(trigger);
  });

  test("a second prompt cancels the one still open", async () => {
    const first = confirmAction({ title: "First?" });
    const second = confirmAction({ title: "Second?" });

    expect(await first).toBe(false);
    expect(document.querySelector(".confirm-modal-title")?.textContent).toBe(
      "Second?",
    );

    confirmBtn().click();
    expect(await second).toBe(true);
  });

  test("reuses a single overlay across prompts", async () => {
    const first = confirmAction({ title: "Sure?" });
    cancelBtn().click();
    await first;

    const second = confirmAction({ title: "Sure again?" });
    expect(document.querySelectorAll(".confirm-modal-overlay")).toHaveLength(1);

    cancelBtn().click();
    await second;
  });
});

describe("destroyConfirmModal", () => {
  test("removes the overlay and cancels a pending prompt", async () => {
    const result = confirmAction({ title: "Sure?" });
    destroyConfirmModal();

    expect(await result).toBe(false);
    expect(overlay()).toBeNull();
  });

  test("is safe to call when nothing was ever opened", () => {
    expect(() => destroyConfirmModal()).not.toThrow();
  });
});
