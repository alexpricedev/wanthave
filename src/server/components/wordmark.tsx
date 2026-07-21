// The WantHave wordmark — the core of the identity system (see DESIGN.md).
// Forque is the single display voice; hue is the only seam between the halves:
// foil-amber = WANT, holo-ice = HAVE. Rendered as a single lowercase lockup
// with no space between the two words.
export function Wordmark() {
  return (
    <span className="wordmark">
      <span className="want">want</span>
      <span className="have">have</span>
    </span>
  );
}
