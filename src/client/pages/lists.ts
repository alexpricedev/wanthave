import {
  confirmAction,
  destroyConfirmModal,
} from "@client/components/confirm-modal";

// Deleting a list is irreversible and breaks any link already shared, so the
// POST is gated behind a confirm dialog. Without JS the form posts straight
// through, exactly as before.

const submitForm = (form: HTMLFormElement) => {
  form.dataset.confirmed = "true";
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
  } else {
    form.submit();
  }
};

const onSubmit = (e: Event) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.dataset.confirm === undefined) return;
  if (form.dataset.confirmed === "true") return;

  e.preventDefault();
  void confirmAction({
    title: form.dataset.confirmTitle ?? "Are you sure?",
    message: form.dataset.confirm,
    confirmLabel: form.dataset.confirmLabel ?? "Confirm",
    danger: true,
  }).then((confirmed) => {
    if (confirmed) submitForm(form);
  });
};

export function init() {
  document.addEventListener("submit", onSubmit);
}

export function cleanup() {
  document.removeEventListener("submit", onSubmit);
  destroyConfirmModal();
}
