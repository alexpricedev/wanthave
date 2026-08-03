// Accessible confirm dialog for destructive actions. Callers wire it onto forms
// that still submit normally when JS is unavailable, so it stays pure
// progressive enhancement.

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ModalEls {
  overlay: HTMLDivElement;
  title: HTMLHeadingElement;
  message: HTMLParagraphElement;
  confirmBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
}

let els: ModalEls | null = null;
let pending: ((confirmed: boolean) => void) | null = null;
let lastFocused: HTMLElement | null = null;

const settle = (confirmed: boolean) => {
  const resolve = pending;
  pending = null;
  els?.overlay.classList.remove("is-open");
  lastFocused?.focus();
  lastFocused = null;
  resolve?.(confirmed);
};

const onKeydown = (e: KeyboardEvent) => {
  if (!pending || !els) return;
  if (e.key === "Escape") {
    e.preventDefault();
    settle(false);
    return;
  }
  // Two focusable controls, so the trap is just a toggle between them.
  if (e.key === "Tab") {
    e.preventDefault();
    const next =
      document.activeElement === els.cancelBtn ? els.confirmBtn : els.cancelBtn;
    next.focus();
  }
};

const build = (): ModalEls => {
  const overlay = document.createElement("div");
  overlay.className = "confirm-modal-overlay";

  const panel = document.createElement("div");
  panel.className = "confirm-modal";
  panel.setAttribute("role", "alertdialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "confirm-modal-title");
  panel.setAttribute("aria-describedby", "confirm-modal-message");

  const title = document.createElement("h2");
  title.className = "confirm-modal-title";
  title.id = "confirm-modal-title";

  const message = document.createElement("p");
  message.className = "confirm-modal-message";
  message.id = "confirm-modal-message";

  const actions = document.createElement("div");
  actions.className = "confirm-modal-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn-ghost confirm-modal-cancel";

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "confirm-modal-confirm";

  actions.append(cancelBtn, confirmBtn);
  panel.append(title, message, actions);
  overlay.append(panel);
  document.body.append(overlay);

  cancelBtn.addEventListener("click", () => settle(false));
  confirmBtn.addEventListener("click", () => settle(true));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) settle(false);
  });
  document.addEventListener("keydown", onKeydown);

  els = { overlay, title, message, confirmBtn, cancelBtn };
  return els;
};

export const confirmAction = (opts: ConfirmOptions): Promise<boolean> => {
  const modal = els ?? build();
  // A second prompt supersedes anything still open.
  if (pending) settle(false);

  return new Promise<boolean>((resolve) => {
    pending = resolve;
    modal.title.textContent = opts.title;
    modal.message.textContent = opts.message ?? "";
    modal.message.hidden = !opts.message;
    modal.confirmBtn.textContent = opts.confirmLabel ?? "Confirm";
    modal.cancelBtn.textContent = opts.cancelLabel ?? "Cancel";
    modal.confirmBtn.classList.toggle("is-danger", opts.danger === true);

    lastFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    modal.overlay.classList.add("is-open");
    // Focus the safe choice — a stray Enter must never destroy anything.
    modal.cancelBtn.focus();
  });
};

export const destroyConfirmModal = () => {
  if (pending) settle(false);
  document.removeEventListener("keydown", onKeydown);
  els?.overlay.remove();
  els = null;
  lastFocused = null;
};
