import { afterEach, describe, expect, mock, test } from "bun:test";
import { Dialog } from "@alexpricedev/billet-dialog";
import { cleanup, init } from "./lists";

// The dialog's own behaviour is covered by @alexpricedev/billet-dialog. This
// only checks that the lists page turns the wiring on and off.

const setupForm = () => {
  const host = document.createElement("div");
  host.innerHTML = `
    <form method="post" action="/lists/abc/delete" data-confirm="This is permanent.">
      <button type="submit">Delete</button>
    </form>`;
  // Append rather than assign body.innerHTML — init() has already mounted the
  // dialog overlay on <body>, and assigning would wipe it out.
  document.body.append(host);
  const form = host.querySelector("form") as HTMLFormElement;
  Object.defineProperty(form, "requestSubmit", { value: mock(() => {}) });
  return form;
};

const submit = (form: HTMLFormElement) =>
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

afterEach(() => {
  cleanup();
  Dialog.destroy();
  document.body.innerHTML = "";
});

describe("lists page delete confirmation", () => {
  test("init gates a confirm-tagged delete form", () => {
    init();
    const form = setupForm();

    expect(submit(form)).toBe(false);
    expect(
      document.querySelector("[data-bd-root]")?.classList.contains("is-open"),
    ).toBe(true);
  });

  test("cleanup detaches the handler and tears the dialog down", () => {
    init();
    const form = setupForm();
    cleanup();

    expect(submit(form)).toBe(true);
    expect(document.querySelector("[data-bd-root]")).toBeNull();
  });
});
