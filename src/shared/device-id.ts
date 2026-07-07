/**
 * Resolve a stable identifier for "this device", used to key its per-device settings
 * overrides in the backend. Priority chain (first hit wins):
 *
 *   1. browser_mod browser id (`window.browser_mod.browserID`, else the stored id);
 *   2. the View Assist satellite's sensor entity id (stable per satellite);
 *   3. a UUID generated once and saved in `localStorage` (`ted_device_id`).
 *
 * All reads are guarded so a blocked `localStorage` never throws.
 */
import { viewAssistSensor } from "./view-assist";

/** localStorage key holding the generated fallback device id. */
export const LOCAL_DEVICE_ID_KEY = "ted_device_id";

/** The current browser_mod browser id, if browser_mod is installed. */
function browserModId(): string | undefined {
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

/** The stable id for this device (browser_mod → View Assist → generated UUID). */
export function resolveDeviceId(): string {
  const bm = browserModId();
  if (bm) return `bm:${bm}`;
  const va = viewAssistSensor();
  if (va) return `va:${va}`;
  return `id:${generatedId()}`;
}

/** Minimal registry shapes (present on `hass` at runtime, not in the typed HA). */
interface RegistryHass {
  states?: Record<string, { attributes?: Record<string, unknown> } | undefined>;
  entities?: Record<string, { device_id?: string | null } | undefined>;
  devices?: Record<string, { identifiers?: [string, string][] } | undefined>;
}

/**
 * Resolve the media player entity that belongs to *this* client, used as the final
 * fallback for the settings `media_player` when neither a per-device nor global value
 * is set. Tries the View Assist satellite's media player, then a media_player entity
 * on this browser_mod browser's device. Returns undefined when none is found.
 */
export function resolveDeviceMediaPlayer(hass: unknown): string | undefined {
  const h = hass as RegistryHass | undefined;
  if (!h) return undefined;

  // View Assist: the satellite's configured media player (attribute on its sensor).
  const va = viewAssistSensor();
  if (va && h.states) {
    const attrs = h.states[va]?.attributes ?? {};
    const mp = attrs.mediaplayer_device ?? attrs.media_player ?? attrs.media_player_device;
    if (typeof mp === "string" && mp.startsWith("media_player.")) return mp;
  }

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
