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
}
