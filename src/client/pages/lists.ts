import { Dialog } from "@alexpricedev/billet-dialog";

// Deleting a list is irreversible and breaks any link already shared, so the
// POST is gated behind a confirm dialog. Without JS the form posts straight
// through, exactly as before.

let unwire: (() => void) | null = null;

export function init() {
  unwire = Dialog.wireForms();
}

export function cleanup() {
  unwire?.();
  unwire = null;
  Dialog.destroy();
}
