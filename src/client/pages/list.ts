// Public list page: one-tap copy (share link + friend ID) and nudge dismissal.
// Pure progressive enhancement — the page is fully functional without JS.

const flashCopied = (btn: HTMLElement, original: string) => {
  btn.classList.add("copied");
  const label = btn.querySelector(".friend-id-action") ?? btn;
  const prev = label.textContent;
  label.textContent = "Copied!";
  if (btn.querySelector(".friend-id-action") === null)
    btn.textContent = "Copied!";
  window.setTimeout(() => {
    btn.classList.remove("copied");
    if (btn.querySelector(".friend-id-action")) {
      label.textContent = prev;
    } else {
      btn.textContent = original;
    }
  }, 1600);
};

// Legacy execCommand fallback for browsers where the async Clipboard API is
// unavailable or blocked (older mobile Safari, insecure contexts, denied
// permission) — mobile is the dominant context, so the copy must be resilient.
const legacyCopy = (text: string): boolean => {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
};

const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopy(text);
  }
};

let modalEls: {
  overlay: HTMLDivElement;
  img: HTMLImageElement;
  rarityBadge: HTMLSpanElement;
  name: HTMLHeadingElement;
  meta: HTMLParagraphElement;
  closeBtn: HTMLButtonElement;
} | null = null;
let lastFocused: HTMLElement | null = null;

const buildModal = () => {
  const overlay = document.createElement("div");
  overlay.className = "card-modal-overlay";

  const panel = document.createElement("div");
  panel.className = "card-modal";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "card-modal-title");

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "card-modal-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";

  const img = document.createElement("img");
  img.className = "card-modal-img";
  img.alt = "";
  img.width = 367;
  img.height = 512;

  const rarityBadge = document.createElement("span");
  rarityBadge.className = "card-modal-rarity-badge";

  const name = document.createElement("h2");
  name.className = "card-modal-name";
  name.id = "card-modal-title";

  const meta = document.createElement("p");
  meta.className = "card-modal-meta";

  panel.append(closeBtn, img, rarityBadge, name, meta);
  overlay.append(panel);
  document.body.append(overlay);

  const close = () => closeModal();
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  modalEls = { overlay, img, rarityBadge, name, meta, closeBtn };
  return modalEls;
};

const openModal = (tile: HTMLElement) => {
  const modal = modalEls ?? buildModal();
  const cardName = tile.getAttribute("data-card-name") ?? "";
  const cardSet = tile.getAttribute("data-card-set") ?? "";
  const cardSetCode = tile.getAttribute("data-card-set-code") ?? "";
  const cardRarity = tile.getAttribute("data-card-rarity") ?? "";
  const cardRarityName = tile.getAttribute("data-card-rarity-name") ?? "";
  const cardImg = tile.getAttribute("data-card-img") ?? "";
  const cardKind = tile.getAttribute("data-card-kind") ?? "";

  modal.img.src = cardImg;
  modal.img.alt = cardName;
  modal.rarityBadge.textContent = cardRarityName;
  modal.rarityBadge.classList.toggle("is-have", cardKind === "have");
  modal.name.textContent = cardName;
  modal.meta.textContent = `${cardRarity} · ${cardSet} (${cardSetCode})`;

  lastFocused = tile;
  modal.overlay.classList.add("is-open");
  modal.closeBtn.focus();
};

const closeModal = () => {
  if (!modalEls) return;
  modalEls.overlay.classList.remove("is-open");
  lastFocused?.focus();
  lastFocused = null;
};

const onDocumentKeydown = (e: KeyboardEvent) => {
  if (e.key === "Escape" && modalEls?.overlay.classList.contains("is-open")) {
    closeModal();
  }
};

const onDocumentClick = (e: MouseEvent) => {
  const tile = (e.target as HTMLElement).closest(
    "[data-card-tile]",
  ) as HTMLElement | null;
  if (tile) openModal(tile);
};

export function init() {
  for (const el of Array.from(document.querySelectorAll("[data-copy]"))) {
    const btn = el as HTMLElement;
    const original = btn.textContent ?? "Copy";
    btn.addEventListener("click", async () => {
      const text =
        btn.getAttribute("data-copy-text") ??
        btn.getAttribute("data-friend-id") ??
        "";
      if (!text) return;
      const ok = await copyText(text);
      if (ok) flashCopied(btn, original);
    });
  }

  const nudge = document.querySelector("[data-nudge]");
  const dismiss = document.querySelector("[data-nudge-dismiss]");
  dismiss?.addEventListener("click", () => nudge?.remove());

  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);
}

export function cleanup() {
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onDocumentKeydown);
  modalEls?.overlay.remove();
  modalEls = null;
  lastFocused = null;
}
