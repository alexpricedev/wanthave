import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { destroyConfirmModal } from "@client/components/confirm-modal";
import { cleanup, init } from "./lists";

const cancelBtn = () =>
  document.querySelector(".confirm-modal-cancel") as HTMLButtonElement;
const confirmBtn = () =>
  document.querySelector(".confirm-modal-confirm") as HTMLButtonElement;

// requestSubmit would drive a real navigation in happy-dom, so the resubmit is
// observed through a stub instead.
const setupForm = (attrs = "") => {
  document.body.innerHTML = `
    <form method="post" action="/lists/abc/delete" ${attrs}>
      <button type="submit">Delete</button>
    </form>`;
  const form = document.querySelector("form") as HTMLFormElement;
  const requestSubmit = mock(() => {});
  Object.defineProperty(form, "requestSubmit", { value: requestSubmit });
  return { form, requestSubmit };
};

const submit = (form: HTMLFormElement) =>
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

const CONFIRM_ATTRS =
  'data-confirm="This is permanent." data-confirm-title="Delete this list?" data-confirm-label="Delete list"';

beforeEach(() => {
  init();
});

afterEach(() => {
  cleanup();
  destroyConfirmModal();
  document.body.innerHTML = "";
});

describe("lists page delete confirmation", () => {
  test("intercepts a confirm-gated submit and shows the dialog", () => {
    const { form, requestSubmit } = setupForm(CONFIRM_ATTRS);

    const notCancelled = submit(form);

    expect(notCancelled).toBe(false);
    expect(requestSubmit).not.toHaveBeenCalled();
    expect(
      document
        .querySelector(".confirm-modal-overlay")
        ?.classList.contains("is-open"),
    ).toBe(true);
    expect(document.querySelector(".confirm-modal-title")?.textContent).toBe(
      "Delete this list?",
    );
    expect(document.querySelector(".confirm-modal-message")?.textContent).toBe(
      "This is permanent.",
    );
    expect(confirmBtn().textContent).toBe("Delete list");
  });

  test("submits the form once confirmed", async () => {
    const { form, requestSubmit } = setupForm(CONFIRM_ATTRS);
    submit(form);

    confirmBtn().click();
    await Promise.resolve();

    expect(requestSubmit).toHaveBeenCalledTimes(1);
    expect(form.dataset.confirmed).toBe("true");
  });

  test("does not submit when cancelled", async () => {
    const { form, requestSubmit } = setupForm(CONFIRM_ATTRS);
    submit(form);

    cancelBtn().click();
    await Promise.resolve();

    expect(requestSubmit).not.toHaveBeenCalled();
    expect(form.dataset.confirmed).toBeUndefined();
  });

  test("lets the confirmed resubmit through untouched", async () => {
    const { form } = setupForm(CONFIRM_ATTRS);
    form.dataset.confirmed = "true";

    expect(submit(form)).toBe(true);
    expect(document.querySelector(".confirm-modal-overlay")).toBeNull();
  });

  test("ignores forms without a data-confirm message", () => {
    const { form } = setupForm();

    expect(submit(form)).toBe(true);
    expect(document.querySelector(".confirm-modal-overlay")).toBeNull();
  });

  test("falls back to default copy when only data-confirm is set", () => {
    const { form } = setupForm('data-confirm="Gone for good."');
    submit(form);

    expect(document.querySelector(".confirm-modal-title")?.textContent).toBe(
      "Are you sure?",
    );
    expect(confirmBtn().textContent).toBe("Confirm");
  });

  test("cleanup detaches the handler", () => {
    const { form, requestSubmit } = setupForm(CONFIRM_ATTRS);
    cleanup();

    expect(submit(form)).toBe(true);
    expect(requestSubmit).not.toHaveBeenCalled();
    expect(document.querySelector(".confirm-modal-overlay")).toBeNull();

    init(); // afterEach cleanup expects a live handler
  });
});
