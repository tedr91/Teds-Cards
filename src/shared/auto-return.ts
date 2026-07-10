/**
 * Auto-return-home: after a period of inactivity, navigate the device back to its
 * configured Home dashboard. Driven by the settings system's `auto_return_home_after`
 * (seconds; 0 = never), `home_dashboard`, and `dashboard_root`. Only arms once the
 * settings backend has loaded, so dashboards without the integration are unaffected.
 */
import type { ReactiveController, ReactiveControllerHost } from "lit";

import { settingsStore } from "./settings";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"] as const;

export class AutoReturnController implements ReactiveController {
  private _timer?: number;
  private _onActivity = (): void => this._reset();

  /** @param enabled Optional gate; when it returns false the controller stays dormant
   *  (e.g. a navbar that hasn't opted into the Ted's Cards Backend integration). */
  constructor(
    host: ReactiveControllerHost,
    private _enabled?: () => boolean,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, this._onActivity, { passive: true });
    }
    this._reset();
  }

  hostDisconnected(): void {
    for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, this._onActivity);
    this._clear();
  }

  private _clear(): void {
    if (this._timer !== undefined) {
      window.clearTimeout(this._timer);
      this._timer = undefined;
    }
  }

  private _reset(): void {
    this._clear();
    // Dormant unless the host has opted into the backend integration.
    if (this._enabled && !this._enabled()) return;
    // Only active when the settings system is present, and when a positive delay is set.
    if (!settingsStore.hasLoaded()) return;
    const secs = Number(settingsStore.effective().auto_return_home_after);
    if (!Number.isFinite(secs) || secs <= 0) return;
    this._timer = window.setTimeout(() => this._goHome(), secs * 1000);
  }

  /** The resolved home path, e.g. "/ted-dashboard/home-tablet". */
  private _homePath(): string {
    const eff = settingsStore.effective();
    const root = String(eff.dashboard_root ?? "ted-dashboard");
    let home = String(eff.home_dashboard ?? "[root]/home").replace("[root]", root);
    if (!home.startsWith("/")) home = `/${home}`;
    return home;
  }

  private _goHome(): void {
    const home = this._homePath();
    if (window.location.pathname !== home) {
      history.pushState(null, "", home);
      window.dispatchEvent(new Event("location-changed"));
    }
    this._reset();
  }
}
