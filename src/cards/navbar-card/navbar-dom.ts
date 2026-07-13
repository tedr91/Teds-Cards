// All access to undocumented Home Assistant shadow-DOM internals lives here, so a
// future HA change only needs fixing in one place. Mirrors the technique used by
// lovelace-navbar-card (forced view padding via the hui-root shadow root).

const PADDING_STYLE_ID = "ted-navbar-forced-padding";

/** Locate HA's `hui-root` element (the host of the dashboard views), or null. */
function findHuiRoot(): HTMLElement | null {
  return (
    (document
      .querySelector("home-assistant")
      ?.shadowRoot?.querySelector("home-assistant-main")
      ?.shadowRoot?.querySelector("ha-panel-lovelace")
      ?.shadowRoot?.querySelector("hui-root") as HTMLElement | null) ?? null
  );
}

/**
 * Reserve space at the top or bottom of the dashboard view so content isn't hidden
 * under the pinned navbar. Injects (or updates) a single style element into the
 * `hui-root` shadow root. Pass `enabled: false` (or px <= 0) to remove it.
 */
export function forceNavbarPadding(opts: {
  alignment: "top" | "bottom" | "left" | "right";
  px: number;
  enabled: boolean;
}): void {
  const huiRoot = findHuiRoot();
  if (!huiRoot?.shadowRoot) return;
  let styleEl = huiRoot.shadowRoot.querySelector<HTMLStyleElement>(`#${PADDING_STYLE_ID}`);
  if (!opts.enabled || opts.px <= 0) {
    styleEl?.remove();
    return;
  }
  // Horizontal bars reserve a top/bottom strip via a ::before/::after spacer; vertical
  // bars reserve a left/right gutter by padding the view directly.
  let css: string;
  if (opts.alignment === "left" || opts.alignment === "right") {
    css = `:not(.edit-mode) > hui-view {
    box-sizing: border-box;
    padding-${opts.alignment}: ${opts.px}px;
  }`;
  } else {
    const pseudo = opts.alignment === "top" ? "before" : "after";
    css = `:not(.edit-mode) > hui-view::${pseudo} {
    content: "";
    display: block;
    width: 100%;
    height: ${opts.px}px;
    background-color: transparent;
  }`;
  }
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = PADDING_STYLE_ID;
    huiRoot.shadowRoot.appendChild(styleEl);
  }
  styleEl.textContent = css;
}

/** Remove the forced view padding (used on disconnect). */
export function removeNavbarPadding(): void {
  const huiRoot = findHuiRoot();
  const styleEl = huiRoot?.shadowRoot?.querySelector<HTMLStyleElement>(`#${PADDING_STYLE_ID}`);
  styleEl?.remove();
}

/** CSS var (on the document root) telling body-level fixed layers — e.g. the MessageBox
 *  toast stack — how much space a bottom-aligned navbar reserves, so they clear it. */
const BOTTOM_RESERVE_VAR = "--ted-navbar-bottom-reserve";

/** Publish the space a bottom navbar occupies (px). Pass 0 / non-bottom to clear it. */
export function setNavbarBottomReserve(px: number): void {
  const root = document.documentElement;
  if (px > 0) root.style.setProperty(BOTTOM_RESERVE_VAR, `${px}px`);
  else root.style.removeProperty(BOTTOM_RESERVE_VAR);
}

/** The dashboard content area's viewport rect (`hui-root`), used to inset the navbar so
 *  it clears the HA sidebar. Null when hui-root isn't found. */
export function navbarContentRect(): DOMRect | null {
  return findHuiRoot()?.getBoundingClientRect() ?? null;
}

/** Height of HA's app header (`.header` inside hui-root), so a vertical bar can start
 *  below it. The content view itself spans under the header (padding-top), so its rect
 *  top is 0 — measure the header element directly. 0 when not found. */
export function navbarHeaderHeight(): number {
  const header = findHuiRoot()?.shadowRoot?.querySelector<HTMLElement>(".header");
  return header ? Math.round(header.getBoundingClientRect().height) : 0;
}

/** True when the card is currently inside a dashboard/card editor or a preview. */
export function detectEditOrPreview(host: HTMLElement): boolean {
  const inEditDashboard = host.parentElement?.closest("hui-card-edit-mode") != null;
  const inPreview = host.parentElement?.closest(".card > .preview") != null;
  const root = document.querySelector("body > home-assistant");
  const inEditCard = !!root?.shadowRoot
    ?.querySelector("hui-dialog-edit-card")
    ?.shadowRoot?.querySelector("ha-dialog");
  return inEditDashboard || inPreview || inEditCard;
}
