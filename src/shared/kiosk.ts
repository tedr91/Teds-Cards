/**
 * Kiosk mode: when this device's `use_kiosk_mode` setting is on (the default),
 * enable Home Assistant's built-in kiosk mode (introduced in 2026.1) so the
 * sidebar and header edit/menu buttons are hidden for a clean wall-panel look.
 *
 * HA's native kiosk mode is a runtime-only frontend flag toggled by the
 * `hass-kiosk-mode` window event that its `sidebar-mixin` listens for. Because
 * Ted's bundle is already loaded on every page, we drive that event directly —
 * no third-party kiosk plugin required. The flag isn't persisted, so we (re)apply
 * it whenever settings load/change and on every full page load (this module reruns).
 *
 * NOTE: native kiosk mode does NOT hide the lovelace HEADER (the top bar + view
 * tabs) — it only hides the sidebar and a few header action buttons. So we also
 * collapse the header ourselves by injecting a `display:none` into the `hui-root`
 * shadow (and reclaiming the view-container's header padding).
 */
import type { ReactiveController, ReactiveControllerHost } from "lit";

import { settingsStore } from "./settings";

/** Id of our injected header-hiding <style> in the hui-root shadow. */
const KIOSK_HEADER_STYLE_ID = "ted-kiosk-hide-header";

/** HA's `hui-root` shadow root (host of the dashboard header + views), or null. */
function huiRootShadow(): ShadowRoot | null {
  const el = document
    .querySelector("home-assistant")
    ?.shadowRoot?.querySelector("home-assistant-main")
    ?.shadowRoot?.querySelector("ha-panel-lovelace")
    ?.shadowRoot?.querySelector("hui-root") as HTMLElement | null;
  return el?.shadowRoot ?? null;
}

/** Hide (or restore) HA's lovelace header + its reserved padding for kiosk. */
function injectHeaderHide(hide: boolean): void {
  const root = huiRootShadow();
  if (!root) {
    // hui-root may not be mounted yet on first paint — retry once next frame.
    if (hide) requestAnimationFrame(() => injectHeaderHide(true));
    return;
  }
  const existing = root.getElementById(KIOSK_HEADER_STYLE_ID);
  if (!hide) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const style = document.createElement("style");
  style.id = KIOSK_HEADER_STYLE_ID;
  style.textContent =
    ".header{display:none!important}" +
    "hui-view-container{padding-top:var(--safe-area-inset-top,0px)!important}";
  root.appendChild(style);
}

/** Fire HA's built-in kiosk toggle (idempotent — it just sets a frontend flag). */
function setKiosk(enable: boolean): void {
  window.dispatchEvent(new CustomEvent("hass-kiosk-mode", { detail: { enable } }));
  // The dashboard layouts size full-height content with
  // `var(--kiosk-header-height, var(--header-height, 56px))`. Native kiosk leaves
  // the header in place, so publish 0 here AND collapse the real header below.
  const root = document.documentElement.style;
  if (enable) root.setProperty("--kiosk-header-height", "0px");
  else root.removeProperty("--kiosk-header-height");
  injectHeaderHide(enable);
}

/** The kiosk state we last applied this page load (undefined = not yet applied). */
let applied: boolean | undefined;

/** Apply the effective (device) `use_kiosk_mode` value, if it changed. */
function apply(): void {
  if (!settingsStore.hasLoaded()) return;
  const enable = settingsStore.effective().use_kiosk_mode !== false;
  if (enable === applied) return;
  applied = enable;
  setKiosk(enable);
}

/**
 * Drives HA's built-in kiosk mode from this device's `use_kiosk_mode` setting.
 * Attach to a long-lived host (the navbar); gated behind the Ted's Dashboard
 * System integration so standalone dashboards are unaffected.
 */
export class KioskController implements ReactiveController {
  private _unsub?: () => void;

  /** @param enabled Optional gate; when it returns false the controller is dormant. */
  constructor(
    host: ReactiveControllerHost,
    private _enabled?: () => boolean,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    if (this._enabled && !this._enabled()) return;
    apply();
    this._unsub = settingsStore.subscribe(() => {
      if (this._enabled && !this._enabled()) return;
      apply();
    });
  }

  hostDisconnected(): void {
    this._unsub?.();
    this._unsub = undefined;
  }
}

/**
 * Turn HA kiosk mode OFF now — e.g. when leaving Ted's Dashboard — so the sidebar and
 * header return on other dashboards (native kiosk is a runtime flag that otherwise
 * persists across in-app navigation). Resets internal state so returning to Ted's
 * Dashboard re-applies this device's `use_kiosk_mode` setting.
 */
export function disableKiosk(): void {
  applied = false;
  setKiosk(false);
}
