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
