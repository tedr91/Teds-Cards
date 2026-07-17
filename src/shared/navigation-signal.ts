/**
 * Shared navigation-signal listener.
 *
 * Ted's Cards Backend fires a server-side navigation signal (via the
 * `teds_cards_backend/subscribe_navigate` WebSocket command) when a voice command
 * asks to "show cameras / climate / weather / music / …", or when a voice-driven
 * climate/music action nudges the screen to the matching view. Each signal carries
 * `{ dashboard, area, device_id }`; every dashboard device decides whether the
 * signal targets it (by area, or by its own HA device id) and navigates.
 *
 * This is a module singleton (one WebSocket subscription per page, like the
 * settings store), *activated* by the navbar (primary) and the background card
 * (fallback) whenever they opt into the backend integration. A dedicated command
 * is used instead of `subscribe_events` because kiosk (non-admin) users can't
 * subscribe to custom HA events.
 */
import type { HomeAssistant } from "custom-card-helpers";

import { resolveDeviceArea, resolveDeviceHaId } from "./device-area";
import { resolveDashboardPath } from "./settings";

/** A navigation signal as delivered by the backend. */
interface NavigateSignal {
  /** The dashboard-path setting key to resolve (e.g. `cameras_dashboard`). */
  dashboard?: string;
  /** Target area_id (navigate every dashboard in this area), or null. */
  area?: string | null;
  /** Target HA device id (navigate only that device), or null. */
  device_id?: string | null;
}

class NavigationSignal {
  private _hass?: HomeAssistant;
  private _sub?: Promise<() => void>;

  /** Activate the shared subscription (no-op unless the caller opts into the backend). */
  attach(hass: HomeAssistant | undefined, backendIntegration: boolean): void {
    if (!backendIntegration) return;
    if (hass) this._hass = hass;
    this._ensure();
  }

  /** Keep the latest `hass` (its connection) so the subscription can be established. */
  setHass(hass: HomeAssistant | undefined): void {
    if (!hass) return;
    this._hass = hass;
    this._ensure();
  }

  private _ensure(): void {
    const conn = this._hass?.connection;
    if (this._sub || !conn) return;
    this._sub = conn.subscribeMessage<NavigateSignal>(
      (sig) => this._onSignal(sig),
      { type: "teds_cards_backend/subscribe_navigate" },
    );
  }

  private _onSignal(sig: NavigateSignal): void {
    if (!sig?.dashboard) return;
    const hass = this._hass;
    const areaMatch = !!sig.area && sig.area === resolveDeviceArea(hass, undefined).area;
    const deviceMatch = !!sig.device_id && sig.device_id === resolveDeviceHaId(hass);
    if (!areaMatch && !deviceMatch) return;

    const path = resolveDashboardPath(sig.dashboard);
    if (!path) return;
    // Already there — don't push a duplicate history entry.
    if (window.location.pathname + window.location.search === path) return;
    window.history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
  }
}

/** Shared singleton — activated by the navbar and background cards. */
export const navigationSignal = new NavigationSignal();
