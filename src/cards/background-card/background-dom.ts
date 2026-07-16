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

/** mdi:information-outline */
const INFO_ICON_PATH =
  "M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z";

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
`;

/** Anchor the overlay to the top-left of the dashboard CONTENT area (the
 *  `hui-view` rect) rather than the raw viewport corner, so it clears HA's
 *  header menu button on desktop and sits by the clock/content on kiosk.
 *  Falls back to a safe-area inset before the view has laid out. */
function positionAttribution(el: HTMLElement): void {
  const view = findHuiRoot()?.shadowRoot?.querySelector("hui-view") as HTMLElement | null;
  const rect = view?.getBoundingClientRect();
  if (rect && rect.width > 0 && rect.height > 0) {
    el.style.top = `${Math.round(Math.max(0, rect.top)) + 8}px`;
    el.style.left = `${Math.round(Math.max(0, rect.left)) + 8}px`;
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

/**
 * Show (or update) a small info-icon overlay in the top-left corner whose
 * hover/tap caption gives the photo's title + copyright. Pass `null` to remove
 * it (any non-Bing wallpaper). Injected into `hui-root`'s shadow like the
 * wallpaper style so it persists across view navigation.
 */
export function applyAttribution(meta: BackgroundAttribution | null): void {
  const huiRoot = findHuiRoot();
  if (!huiRoot?.shadowRoot) return;
  let el = huiRoot.shadowRoot.querySelector<HTMLElement>(`#${ATTRIBUTION_ID}`);
  if (!meta || (!meta.title && !meta.copyright)) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("div");
    el.id = ATTRIBUTION_ID;
    el.innerHTML =
      `<style>${ATTRIBUTION_CSS}</style>` +
      `<button class="tba-icon" type="button" aria-label="Photo information">` +
      `<svg viewBox="0 0 24 24"><path d="${INFO_ICON_PATH}"></path></svg></button>` +
      `<div class="tba-caption"><div class="tba-title"></div><div class="tba-copyright"></div></div>`;
    // Tap toggles the caption on touch devices (hover handles pointers).
    el.querySelector(".tba-icon")?.addEventListener("click", () => el?.classList.toggle("open"));
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
  const huiRoot = findHuiRoot();
  huiRoot?.shadowRoot?.querySelector(`#${ATTRIBUTION_ID}`)?.remove();
}
