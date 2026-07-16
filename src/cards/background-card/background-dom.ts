// Applies the Background Wallpaper to the dashboard view by injecting a single
// <style> into HA's `hui-root` shadow root (the same technique the navbar uses
// for forced view padding). All access to HA's shadow-DOM internals lives here.

const BACKGROUND_STYLE_ID = "ted-background-wallpaper";

/** A resolved set of CSS background declarations to paint onto the view. */
export interface BackgroundLayer {
  image: string;
  size: string;
  position: string;
  repeat: string;
  attachment: string;
  color: string;
}

/** Locate HA's `hui-root` element (the host of the dashboard views), or null. */
export function findHuiRoot(): HTMLElement | null {
  return (
    (document
      .querySelector("home-assistant")
      ?.shadowRoot?.querySelector("home-assistant-main")
      ?.shadowRoot?.querySelector("ha-panel-lovelace")
      ?.shadowRoot?.querySelector("hui-root") as HTMLElement | null) ?? null
  );
}

/**
 * Paint (or update) the view background. Pass `null` to remove our style and
 * defer to the active HA theme (used by the "HA Theme" mode / on disconnect).
 */
export function applyBackground(layer: BackgroundLayer | null): void {
  const huiRoot = findHuiRoot();
  if (!huiRoot?.shadowRoot) return;
  let styleEl = huiRoot.shadowRoot.querySelector<HTMLStyleElement>(`#${BACKGROUND_STYLE_ID}`);
  if (!layer) {
    styleEl?.remove();
    return;
  }
  const css = `:not(.edit-mode) > hui-view {
    background-image: ${layer.image} !important;
    background-size: ${layer.size} !important;
    background-position: ${layer.position} !important;
    background-repeat: ${layer.repeat} !important;
    background-attachment: ${layer.attachment} !important;
    background-color: ${layer.color} !important;
  }`;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = BACKGROUND_STYLE_ID;
    huiRoot.shadowRoot.appendChild(styleEl);
  }
  if (styleEl.textContent !== css) styleEl.textContent = css;
}

/** Remove the injected background style (used on disconnect). */
export function removeBackground(): void {
  const huiRoot = findHuiRoot();
  huiRoot?.shadowRoot?.querySelector<HTMLStyleElement>(`#${BACKGROUND_STYLE_ID}`)?.remove();
}

// ── Photo attribution overlay (Bing "Photo of the Day") ───────────────────────

const ATTRIBUTION_ID = "ted-background-attribution";

/** Title/copyright shown by the attribution overlay. */
export interface BackgroundAttribution {
  title: string;
  copyright: string;
}

/** Actions offered in the attribution flyout (Bing "Photo of the Day"). */
export interface AttributionActions {
  /** Copy the current image into the favorites folder. */
  favorite(): void;
  /** Delete the current image from the cache and advance to a new one. */
  remove(): void;
  /** Advance to the next image immediately. */
  next(): void;
}

/** mdi:information-outline */
const INFO_ICON_PATH =
  "M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z";

/** mdi:star-outline / mdi:delete-outline / mdi:skip-next */
const STAR_ICON_PATH =
  "M12,15.39L8.24,17.66L9.23,13.38L5.91,10.5L10.29,10.13L12,6.09L13.71,10.13L18.09,10.5L14.77,13.38L15.76,17.66M22,9.24L14.81,8.63L12,2L9.19,8.63L2,9.24L7.45,13.97L5.82,21L12,17.27L18.18,21L16.54,13.97L22,9.24Z";
const DELETE_ICON_PATH =
  "M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z";
const NEXT_ICON_PATH = "M16,18H18V6H16M6,18L14.5,12L6,6V18Z";

const ATTRIBUTION_CSS = `
#${ATTRIBUTION_ID} {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 8px);
  left: calc(env(safe-area-inset-left, 0px) + 8px);
  z-index: 6;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  pointer-events: none;
  font-family: var(--ha-font-family-body, inherit);
}
#${ATTRIBUTION_ID} .tba-icon {
  pointer-events: auto;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  opacity: 0.5;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s ease;
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}
#${ATTRIBUTION_ID} .tba-icon svg { width: 18px; height: 18px; fill: currentColor; }
#${ATTRIBUTION_ID}:hover .tba-icon,
#${ATTRIBUTION_ID}:focus-within .tba-icon,
#${ATTRIBUTION_ID}.open .tba-icon { opacity: 1; }
#${ATTRIBUTION_ID} .tba-caption {
  pointer-events: none;
  max-width: min(60vw, 360px);
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  font-size: 12px;
  line-height: 1.35;
}
#${ATTRIBUTION_ID}:hover .tba-caption,
#${ATTRIBUTION_ID}:focus-within .tba-caption,
#${ATTRIBUTION_ID}.open .tba-caption { opacity: 1; transform: translateX(0); }
#${ATTRIBUTION_ID} .tba-title { font-weight: 600; }
#${ATTRIBUTION_ID} .tba-copyright { opacity: 0.85; }
#${ATTRIBUTION_ID} .tba-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  pointer-events: none;
}
#${ATTRIBUTION_ID}:hover .tba-actions,
#${ATTRIBUTION_ID}:focus-within .tba-actions,
#${ATTRIBUTION_ID}.open .tba-actions { pointer-events: auto; }
#${ATTRIBUTION_ID} .tba-act {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s ease;
}
#${ATTRIBUTION_ID} .tba-act:hover { background: rgba(255, 255, 255, 0.26); }
#${ATTRIBUTION_ID} .tba-act svg { width: 14px; height: 14px; fill: currentColor; }
#${ATTRIBUTION_ID} .tba-act.done { background: rgba(120, 200, 120, 0.4); }
`;

/** Anchor the overlay to the top-left of the dashboard CONTENT area (the
 *  `hui-view` rect) rather than the raw viewport corner, so it clears HA's
 *  header menu button on desktop and sits by the clock/content on kiosk.
 *  Falls back to a safe-area inset before the view has laid out. */
function positionAttribution(el: HTMLElement): void {
  const view = findHuiRoot()?.shadowRoot?.querySelector("hui-view") as HTMLElement | null;
  const rect = view?.getBoundingClientRect();
  if (view && rect && rect.width > 0 && rect.height > 0) {
    // Anchor to the CONTENT box, not the border box: a vertical (left/right) navbar
    // reserves its gutter via `padding-left/right` on hui-view, so add that padding
    // to shift the icon clear of a left bar (and header pad, if any).
    const cs = getComputedStyle(view);
    const padLeft = parseFloat(cs.paddingLeft) || 0;
    const padTop = parseFloat(cs.paddingTop) || 0;
    el.style.top = `${Math.round(Math.max(0, rect.top) + padTop) + 8}px`;
    el.style.left = `${Math.round(Math.max(0, rect.left) + padLeft) + 8}px`;
  } else {
    el.style.top = "calc(env(safe-area-inset-top, 0px) + 8px)";
    el.style.left = "calc(env(safe-area-inset-left, 0px) + 8px)";
  }
}

let attrResizeBound = false;
/** Reposition the overlay when the viewport/content resizes (registered once). */
function bindAttrResize(): void {
  if (attrResizeBound) return;
  attrResizeBound = true;
  window.addEventListener("resize", () => {
    const el = findHuiRoot()?.shadowRoot?.querySelector<HTMLElement>(`#${ATTRIBUTION_ID}`);
    if (el) positionAttribution(el);
  });
}

// ── caption flyout open/close (tap toggles; outside tap or 15s auto-dismiss) ──
const ATTRIBUTION_TIMEOUT_MS = 15000;
let attrCloseTimer: number | undefined;
let attrOutsideHandler: ((e: Event) => void) | undefined;

/** Tear down the auto-close timer + the outside-interaction listener. */
function teardownAttrDismiss(): void {
  if (attrCloseTimer !== undefined) {
    clearTimeout(attrCloseTimer);
    attrCloseTimer = undefined;
  }
  if (attrOutsideHandler) {
    document.removeEventListener("pointerdown", attrOutsideHandler, true);
    attrOutsideHandler = undefined;
  }
}

function closeAttr(el: HTMLElement): void {
  el.classList.remove("open");
  teardownAttrDismiss();
}

function openAttr(el: HTMLElement): void {
  el.classList.add("open");
  teardownAttrDismiss();
  // Auto-dismiss after 15s.
  attrCloseTimer = window.setTimeout(() => closeAttr(el), ATTRIBUTION_TIMEOUT_MS);
  // Any interaction outside the overlay closes it. Registered on pointerdown
  // AFTER the opening tap's pointerdown, so it never self-closes immediately.
  attrOutsideHandler = (e: Event) => {
    if (!e.composedPath().includes(el)) closeAttr(el);
  };
  document.addEventListener("pointerdown", attrOutsideHandler, true);
}

function toggleAttr(el: HTMLElement): void {
  if (el.classList.contains("open")) closeAttr(el);
  else openAttr(el);
}

/** Restart the auto-dismiss timer while the flyout is open (used after an action
 *  so the user keeps interacting without it closing under them). */
function resetAttrTimer(el: HTMLElement): void {
  if (!el.classList.contains("open")) return;
  if (attrCloseTimer !== undefined) clearTimeout(attrCloseTimer);
  attrCloseTimer = window.setTimeout(() => closeAttr(el), ATTRIBUTION_TIMEOUT_MS);
}

/** The latest actions for the (singleton) overlay's buttons — updated on each
 *  applyAttribution call, so the buttons always act on the current image. */
let attrActions: AttributionActions | undefined;

/** Optimistic feedback for the Favorite button (label + tint for ~1.5s). */
function markFavorited(btn: HTMLElement): void {
  const label = btn.querySelector<HTMLElement>(".tba-act-label");
  const prev = label?.textContent ?? "Favorite";
  btn.classList.add("done");
  if (label) label.textContent = "Favorited";
  window.setTimeout(() => {
    btn.classList.remove("done");
    if (label && label.textContent === "Favorited") label.textContent = prev;
  }, 1500);
}

/**
 * Show (or update) a small info-icon overlay in the top-left corner whose
 * hover/tap caption gives the photo's title + copyright (and, when `actions` are
 * provided, Favorite / Remove / Next buttons). Pass `null` to remove it (any
 * non-Bing wallpaper). Injected into `hui-root`'s shadow like the wallpaper
 * style so it persists across view navigation.
 */
export function applyAttribution(
  meta: BackgroundAttribution | null,
  actions?: AttributionActions,
): void {
  const huiRoot = findHuiRoot();
  if (!huiRoot?.shadowRoot) return;
  let el = huiRoot.shadowRoot.querySelector<HTMLElement>(`#${ATTRIBUTION_ID}`);
  if (!meta || (!meta.title && !meta.copyright)) {
    if (el) {
      teardownAttrDismiss();
      el.remove();
    }
    attrActions = undefined;
    return;
  }
  attrActions = actions;
  if (!el) {
    el = document.createElement("div");
    el.id = ATTRIBUTION_ID;
    el.innerHTML =
      `<style>${ATTRIBUTION_CSS}</style>` +
      `<button class="tba-icon" type="button" aria-label="Photo information">` +
      `<svg viewBox="0 0 24 24"><path d="${INFO_ICON_PATH}"></path></svg></button>` +
      `<div class="tba-caption">` +
      `<div class="tba-title"></div><div class="tba-copyright"></div>` +
      `<div class="tba-actions">` +
      `<button class="tba-act" type="button" data-act="favorite">` +
      `<svg viewBox="0 0 24 24"><path d="${STAR_ICON_PATH}"></path></svg>` +
      `<span class="tba-act-label">Favorite</span></button>` +
      `<button class="tba-act" type="button" data-act="remove">` +
      `<svg viewBox="0 0 24 24"><path d="${DELETE_ICON_PATH}"></path></svg>` +
      `<span class="tba-act-label">Remove</span></button>` +
      `<button class="tba-act" type="button" data-act="next">` +
      `<svg viewBox="0 0 24 24"><path d="${NEXT_ICON_PATH}"></path></svg>` +
      `<span class="tba-act-label">Next</span></button>` +
      `</div></div>`;
    // Tap toggles the caption (outside tap / 15s auto-dismiss handled in openAttr).
    const captionEl = el;
    el.querySelector(".tba-icon")?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleAttr(captionEl);
    });
    el.querySelectorAll<HTMLElement>(".tba-act").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === "favorite") {
          attrActions?.favorite();
          markFavorited(btn);
        } else if (act === "remove") {
          attrActions?.remove();
        } else if (act === "next") {
          attrActions?.next();
        }
        resetAttrTimer(captionEl);
      });
    });
    huiRoot.shadowRoot.appendChild(el);
    bindAttrResize();
  }
  const titleEl = el.querySelector<HTMLElement>(".tba-title");
  const copyEl = el.querySelector<HTMLElement>(".tba-copyright");
  if (titleEl) {
    if (titleEl.textContent !== meta.title) titleEl.textContent = meta.title;
    titleEl.style.display = meta.title ? "" : "none";
  }
  if (copyEl) {
    if (copyEl.textContent !== meta.copyright) copyEl.textContent = meta.copyright;
    copyEl.style.display = meta.copyright ? "" : "none";
  }
  positionAttribution(el);
}

/** Remove the attribution overlay (used on disconnect / mode change). */
export function removeAttribution(): void {
  teardownAttrDismiss();
  const huiRoot = findHuiRoot();
  huiRoot?.shadowRoot?.querySelector(`#${ATTRIBUTION_ID}`)?.remove();
}
