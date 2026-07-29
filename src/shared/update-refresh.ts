/**
 * Auto-refresh on dashboard update.
 *
 * Ted's Dashboard System fires the `teds_dashboard_system_dashboard_updated` bus
 * event when it installs new dashboard content. If this device's
 * `auto_refresh_on_update` setting is on (the default), reload the browser ONCE so
 * the freshly-installed files take effect — the same effect as the navbar's Refresh
 * menu item (`browser_mod.refresh`), without the manual tap.
 *
 * Attach to a long-lived host (the navbar); gated behind the backend integration.
 */
import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { HomeAssistant } from "custom-card-helpers";

import { settingsStore } from "./settings";
import { browserModId } from "./device-id";

/** Must match const.py `EVENT_DASHBOARD_UPDATED`. */
const EVENT_DASHBOARD_UPDATED = "teds_dashboard_system_dashboard_updated";

type RefreshHost = ReactiveControllerHost & { hass?: HomeAssistant };

/** Reload THIS browser once — mirrors the navbar Refresh (browser_mod.refresh),
 *  falling back to a plain reload when Browser Mod isn't available. */
function refreshThisBrowser(hass: HomeAssistant): void {
  const bid = browserModId();
  if (bid) {
    void hass.callService("browser_mod", "refresh", { browser_id: [bid] });
  } else {
    window.location.reload();
  }
}

export class UpdateRefreshController implements ReactiveController {
  private _unsub?: () => void;
  private _detached = false;
  private _refreshed = false;

  constructor(
    private _host: RefreshHost,
    private _enabled?: () => boolean,
  ) {
    _host.addController(this);
  }

  hostConnected(): void {
    if (this._enabled && !this._enabled()) return;
    this._detached = false;
    void this._subscribe();
  }

  hostDisconnected(): void {
    this._detached = true;
    this._unsub?.();
    this._unsub = undefined;
  }

  private async _subscribe(): Promise<void> {
    const conn = this._host.hass?.connection as
      | { subscribeEvents?: (cb: () => void, event: string) => Promise<() => void> }
      | undefined;
    if (!conn?.subscribeEvents || this._unsub) return;
    const unsub = await conn.subscribeEvents(() => this._onUpdated(), EVENT_DASHBOARD_UPDATED);
    // If the host disconnected while the subscription was in flight, drop it.
    if (this._detached) unsub();
    else this._unsub = unsub;
  }

  private _onUpdated(): void {
    if (this._refreshed) return; // one refresh per page load
    const hass = this._host.hass;
    if (!hass) return;
    if (this._enabled && !this._enabled()) return;
    if (settingsStore.effective().auto_refresh_on_update === false) return;
    this._refreshed = true;
    // Small settle delay so the reload lands on the freshly-written dashboard files
    // (the backend recompose + lovelace reload just happened).
    window.setTimeout(() => refreshThisBrowser(hass), 1200);
  }
}
