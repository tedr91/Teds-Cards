/**
 * Shared client for the Ted's Cards settings system. A single module-level store
 * subscribes once to the backend's `teds_cards_backend/subscribe_settings` command,
 * registers this device (so server-side playback can target its area), and exposes
 * the merged "effective" settings (defaults ⊕ global ⊕ this device's overrides).
 *
 * Cards attach a lightweight `SettingsController` that pushes `hass` in and requests
 * a re-render whenever settings change.
 */
import type { ReactiveController, ReactiveControllerHost } from "lit";

import { resolveDeviceId, resolveDeviceMediaPlayer } from "./device-id";
import { resolveDeviceArea } from "./device-area";
import { SETTINGS_DEFAULTS, type SettingsMap, type SettingsValue } from "./settings-schema";

const DOMAIN = "teds_cards_backend";

interface HassLike {
  connection?: {
    subscribeMessage: <T>(cb: (ev: T) => void, msg: { type: string }) => Promise<() => void>;
    sendMessagePromise?: (msg: Record<string, unknown>) => Promise<unknown>;
  };
  callService?: (domain: string, service: string, data?: Record<string, unknown>) => void;
}

interface SettingsSnapshot {
  defaults?: SettingsMap;
  global?: SettingsMap;
  devices?: Record<string, SettingsMap>;
  registry?: Record<string, { area?: string; name?: string; last_seen?: string }>;
}

export type SettingsScope = "global" | "device";

class SettingsStore {
  readonly deviceId = resolveDeviceId();
  private _snapshot: SettingsSnapshot = { defaults: SETTINGS_DEFAULTS, global: {}, devices: {}, registry: {} };
  private _hass?: HassLike;
  private _sub?: Promise<() => void>;
  private _listeners = new Set<() => void>();
  private _registeredArea?: string | null;
  private _registeredMp?: string | null;
  private _loaded = false;

  /** True once a settings snapshot has been received from the backend. */
  hasLoaded(): boolean {
    return this._loaded;
  }

  /** Feed the latest hass; (re)subscribes and re-registers this device as needed. */
  setHass(hass: HassLike | undefined): void {
    this._hass = hass;
    this._ensureSub();
    this._maybeRegister(hass);
  }

  subscribe(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  /** defaults ⊕ global ⊕ this device's overrides. */
  effective(): SettingsMap {
    const s = this._snapshot;
    return {
      ...SETTINGS_DEFAULTS,
      ...(s.defaults ?? {}),
      ...(s.global ?? {}),
      ...(s.devices?.[this.deviceId] ?? {}),
    };
  }

  /** A single effective value. */
  get(key: string): SettingsValue {
    return this.effective()[key] ?? null;
  }

  globalSettings(): SettingsMap {
    return { ...(this._snapshot.global ?? {}) };
  }

  deviceSettings(): SettingsMap {
    return { ...(this._snapshot.devices?.[this.deviceId] ?? {}) };
  }

  registry(): Record<string, { area?: string; name?: string; last_seen?: string }> {
    return { ...(this._snapshot.registry ?? {}) };
  }

  /** Write a setting at a scope. Pass `value: null` (via clearValue) to inherit. */
  setValue(scope: SettingsScope, key: string, value: SettingsValue): void {
    const data: Record<string, unknown> = { key, value, scope };
    if (scope === "device") data.device_id = this.deviceId;
    this._hass?.callService?.(DOMAIN, "set_setting", data);
  }

  clearValue(scope: SettingsScope, key: string): void {
    const data: Record<string, unknown> = { key, scope };
    if (scope === "device") data.device_id = this.deviceId;
    this._hass?.callService?.(DOMAIN, "clear_setting", data);
  }

  private _emit(): void {
    for (const cb of this._listeners) cb();
  }

  private _ensureSub(): void {
    const conn = this._hass?.connection;
    if (this._sub || !conn) return;
    this._sub = conn.subscribeMessage<SettingsSnapshot>(
      (payload) => {
        if (payload && typeof payload === "object") {
          this._snapshot = { ...this._snapshot, ...payload };
          this._loaded = true;
          this._emit();
        }
      },
      { type: `${DOMAIN}/subscribe_settings` },
    );
    this._sub.catch(() => {
      this._sub = undefined;
    });
  }

  /** Register (or refresh) this device's id + resolved area + own media player. */
  private _maybeRegister(hass: HassLike | undefined): void {
    const conn = hass?.connection;
    if (!conn?.sendMessagePromise) return;
    const area = resolveDeviceArea(hass as never, undefined).area ?? null;
    const mediaPlayer = resolveDeviceMediaPlayer(hass) ?? null;
    if (area === this._registeredArea && mediaPlayer === this._registeredMp) return;
    this._registeredArea = area;
    this._registeredMp = mediaPlayer;
    conn
      .sendMessagePromise({
        type: `${DOMAIN}/register_device`,
        device_id: this.deviceId,
        area,
        media_player: mediaPlayer,
      })
      .catch(() => {
        // Allow a later retry if registration failed (e.g. transient).
        this._registeredArea = undefined;
        this._registeredMp = undefined;
      });
  }
}

/** The shared, module-level settings store. */
export const settingsStore = new SettingsStore();

/** This device's effective snooze config for a given alert kind. */
export function effectiveSnooze(kind: "timer" | "alarm"): { enabled: boolean; minutes: number } {
  const eff = settingsStore.effective();
  const enabled = eff[`${kind}_snooze_enabled`] !== false;
  const raw = Number(eff[`${kind}_snooze_minutes`]);
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : kind === "alarm" ? 9 : 1;
  return { enabled, minutes };
}

/**
 * Attach to a Lit card to keep settings live: pushes `hass` into the shared store
 * and requests a host re-render whenever settings change.
 */
export class SettingsController implements ReactiveController {
  private _unsub?: () => void;

  constructor(
    private host: ReactiveControllerHost,
    private getHass: () => unknown,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    this._unsub = settingsStore.subscribe(() => this.host.requestUpdate());
    settingsStore.setHass(this.getHass() as HassLike | undefined);
  }

  hostUpdated(): void {
    settingsStore.setHass(this.getHass() as HassLike | undefined);
  }

  hostDisconnected(): void {
    this._unsub?.();
    this._unsub = undefined;
  }
}
