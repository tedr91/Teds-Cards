/**
 * Resolve a stable identifier for "this device", used to key its per-device settings
 * overrides in the backend. Priority chain (first hit wins):
 *
 *   1. browser_mod browser id (`window.browser_mod.browserID`, else the stored id);
 *   2. a UUID generated once and saved in `localStorage` (`ted_device_id`).
 *
 * All reads are guarded so a blocked `localStorage` never throws.
 */

/** localStorage key holding the generated fallback device id. */
export const LOCAL_DEVICE_ID_KEY = "ted_device_id";

/** The current browser_mod browser id, if browser_mod is installed. */
export function browserModId(): string | undefined {
  try {
    const w = window as unknown as { browser_mod?: { browserID?: string; browser_id?: string } };
    return (
      w.browser_mod?.browserID ??
      w.browser_mod?.browser_id ??
      localStorage.getItem("browser_mod-browser-id") ??
      undefined
    );
  } catch {
    return undefined;
  }
}

/** A per-browser UUID, generated + persisted on first use. */
function generatedId(): string {
  try {
    const existing = localStorage.getItem(LOCAL_DEVICE_ID_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `ted-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(LOCAL_DEVICE_ID_KEY, id);
    return id;
  } catch {
    // Storage blocked: fall back to an ephemeral id (settings just won't persist per-device).
    return `ted-ephemeral-${Math.random().toString(36).slice(2)}`;
  }
}

/** The stable id for this device (browser_mod → generated UUID). */
export function resolveDeviceId(): string {
  const bm = browserModId();
  if (bm) return `bm:${bm}`;
  return `id:${generatedId()}`;
}

/** Minimal registry shapes (present on `hass` at runtime, not in the typed HA). */
interface RegistryHass {
  entities?: Record<string, { device_id?: string | null } | undefined>;
  devices?: Record<
    string,
    { identifiers?: [string, string][]; name?: string | null; name_by_user?: string | null } | undefined
  >;
}

/**
 * Resolve the media player entity that belongs to *this* client, used as the final
 * fallback for the `system_sound_player` / `music_player` settings when neither a
 * per-device nor global value is set. Tries a media_player entity on this browser_mod
 * browser's device. Returns undefined when none is found.
 */
export function resolveDeviceMediaPlayer(hass: unknown): string | undefined {
  const h = hass as RegistryHass | undefined;
  if (!h) return undefined;

  // browser_mod: a media_player entity on this browser's registered device.
  const bid = browserModId();
  if (bid && h.devices && h.entities) {
    let deviceId: string | undefined;
    for (const [id, dev] of Object.entries(h.devices)) {
      if (dev?.identifiers?.some((i) => i[0] === "browser_mod" && i[1] === bid)) {
        deviceId = id;
        break;
      }
    }
    if (deviceId) {
      for (const [entityId, ent] of Object.entries(h.entities)) {
        if (ent?.device_id === deviceId && entityId.startsWith("media_player.")) return entityId;
      }
    }
  }
  return undefined;
}

/**
 * The user-facing name of the browser_mod device for *this* client (its
 * `name_by_user`, else `name`), or undefined when there's no registered device.
 */
export function resolveDeviceName(hass: unknown): string | undefined {
  const h = hass as RegistryHass | undefined;
  const bid = browserModId();
  if (!bid || !h?.devices) return undefined;
  for (const dev of Object.values(h.devices)) {
    if (dev?.identifiers?.some((i) => i[0] === "browser_mod" && i[1] === bid)) {
      const name = dev.name_by_user || dev.name;
      return typeof name === "string" && name ? name : undefined;
    }
  }
  return undefined;
}

/** The HA device-registry id of the browser_mod device for *this* client, or
 *  undefined when this browser hasn't been registered with Browser Mod. */
export function browserModDeviceId(hass: unknown): string | undefined {
  const h = hass as RegistryHass | undefined;
  const bid = browserModId();
  if (!bid || !h?.devices) return undefined;
  for (const [id, dev] of Object.entries(h.devices)) {
    if (dev?.identifiers?.some((i) => i[0] === "browser_mod" && i[1] === bid)) return id;
  }
  return undefined;
}

/** True once this browser is registered with Browser Mod (has a device entry) or
 *  otherwise has a resolvable device name — i.e. it's "set up" enough for TDS to
 *  give it a name + area. */
export function isDeviceRegistered(hass: unknown): boolean {
  return !!browserModDeviceId(hass) || !!resolveDeviceName(hass);
}

/** Register THIS browser with Browser Mod directly (creates its device so it can
 *  be named + given an area), via Browser Mod's `browser_mod/register` websocket
 *  command. Returns false when it can't be attempted (no browser id / connection),
 *  so callers can fall back to opening the Browser Mod panel. */
export function registerBrowserMod(hass: unknown): boolean {
  const bid = browserModId();
  const conn = (hass as { connection?: { sendMessage?: (m: unknown) => void } } | undefined)?.connection;
  if (!bid || typeof conn?.sendMessage !== "function") return false;
  try {
    conn.sendMessage({ type: "browser_mod/register", browserID: bid });
    // Also sync this Browser ID to the current login session so it survives cleared
    // local storage (mirrors Browser Mod's "Sync Browser ID to login session").
    conn.sendMessage({ type: "browser_mod/store_session", browserID: bid });
    return true;
  } catch {
    return false;
  }
}
