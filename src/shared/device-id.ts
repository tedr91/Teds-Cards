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
