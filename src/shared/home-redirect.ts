/**
 * Home-redirect: on a fresh page load that lands on the dashboard's default
 * "welcome" view (page 0), send the device to its configured `home_dashboard`
 * instead. This fixes the reboot/reload case where Home Assistant always opens
 * the default dashboard at page 0, even though the device has already chosen a
 * home layout in Ted's Settings.
 *
 * Fires at most once per full page load (a module-level guard). In-app view
 * navigation does not reload this module, so the user can still revisit the
 * welcome view afterwards without being bounced away. Only ever redirects when
 * a real, non-welcome home has been chosen and the settings backend has loaded —
 * so dashboards without the integration are unaffected.
 */
import type { ReactiveController, ReactiveControllerHost } from "lit";

import { resolveDashboardPath, settingsStore } from "./settings";

/** Only redirect once per full page load; in-app navigation never re-triggers it. */
let didInitialRedirect = false;

/** Drop any query string / hash so paths can be compared by their view alone. */
function pathOnly(url: string): string {
  return url.split(/[?#]/, 1)[0].replace(/\/+$/, "");
}

/** True when `pathname` is the dashboard's default landing (page 0 / welcome). */
function isLandingPath(pathname: string, root: string): boolean {
  const p = pathOnly(pathname);
  return p === `/${root}` || p === `/${root}/welcome` || p === `/${root}/0`;
}

export class HomeRedirectController implements ReactiveController {
  private _unsub?: () => void;

  /** @param enabled Optional gate; when it returns false the controller does nothing
   *  (e.g. a navbar that hasn't opted into the Ted's Cards Backend integration). */
  constructor(
    host: ReactiveControllerHost,
    private _enabled?: () => boolean,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    if (didInitialRedirect) return;
    // Try immediately; if settings haven't loaded yet, retry each time they change
    // until we've made (and can stop listening for) the initial decision.
    if (this._attempt()) return;
    this._unsub = settingsStore.subscribe(() => {
      if (this._attempt()) {
        this._unsub?.();
        this._unsub = undefined;
      }
    });
  }

  hostDisconnected(): void {
    this._unsub?.();
    this._unsub = undefined;
  }

  /** Make the one-shot redirect decision. Returns true once a decision has been
   *  reached (redirected or not applicable) so the caller can stop listening. */
  private _attempt(): boolean {
    if (didInitialRedirect) return true;
    // Dormant unless the host has opted into the backend integration; leave the module
    // guard untouched so another (opted-in) host could still act.
    if (this._enabled && !this._enabled()) return true;
    // Without the settings backend we can't know the device's configured home, so
    // leave the user on the welcome view (which itself guides the setup).
    if (!settingsStore.hasLoaded()) return false;

    didInitialRedirect = true;

    const root = String(settingsStore.effective().dashboard_root ?? "ted-dashboard");
    const home = resolveDashboardPath("home_dashboard");
    const current = window.location.pathname;

    // Redirect only when: a home is configured, it isn't still the default welcome
    // view, and we're currently sitting on the default landing page.
    if (
      home &&
      !isLandingPath(home, root) &&
      isLandingPath(current, root) &&
      pathOnly(home) !== pathOnly(current)
    ) {
      window.history.replaceState(null, "", home);
      window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
    }
    return true;
  }
}
