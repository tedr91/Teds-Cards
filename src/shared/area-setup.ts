/**
 * Prompts a wall panel to assign itself (and its Companion-app device) to a room
 * when it has none — because Ted's voice features (thermostat, music, announce,
 * status answers) are area-scoped by the calling device's area.
 *
 * The frontend can't see its own `mobile_app` device id, so the fix dialog lists
 * every un-scoped `mobile_app`/`browser_mod` device and lets the user pick a room
 * for each. The assignment is performed by the privileged
 * `teds_dashboard_system/set_device_area` backend command, so a non-admin (kiosk)
 * account can fix it — gated server-side to devices that currently have no area
 * and to the `allow_device_area_self_assign` setting.
 */
import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { HomeAssistant } from "custom-card-helpers";

import { settingsStore } from "./settings";
import { resolveDeviceArea, resolveDeviceHaId, listAreas } from "./device-area";
import { showMessageBox, dismissMessageBox } from "./messagebox-popup";

interface DeviceEntry {
  id: string;
  name?: string | null;
  name_by_user?: string | null;
  area_id?: string | null;
  identifiers?: [string, string][];
}

interface RegistryHass {
  devices?: Record<string, DeviceEntry | undefined>;
  user?: { is_admin?: boolean };
  callWS?: <T>(msg: Record<string, unknown>) => Promise<T>;
}

/** Un-scoped Companion-app / Browser Mod devices (candidates for a room). */
function unassignedDevices(hass: HomeAssistant | undefined): DeviceEntry[] {
  const devices = (hass as RegistryHass | undefined)?.devices;
  if (!devices) return [];
  return Object.values(devices).filter((d): d is DeviceEntry => {
    if (!d || d.area_id) return false;
    return (d.identifiers ?? []).some(([dom]) => dom === "mobile_app" || dom === "browser_mod");
  });
}

/** True when THIS panel's own device has no resolvable area (needs a room).
 *
 * Based only on this device (its Browser Mod device area / config / local override),
 * NOT a global scan — so one unassigned device elsewhere never nags other panels. */
export function needsAreaSetup(hass: HomeAssistant | undefined): boolean {
  if (!hass) return false;
  return resolveDeviceArea(hass).source === "none";
}

function deviceLabel(d: DeviceEntry): string {
  const base = d.name_by_user || d.name || d.id;
  const kind = (d.identifiers ?? []).some(([dom]) => dom === "mobile_app")
    ? "app"
    : (d.identifiers ?? []).some(([dom]) => dom === "browser_mod")
      ? "dashboard"
      : "";
  return kind ? `${base} — ${kind}` : base;
}

/** Self-contained "assign a room" dialog (plain DOM overlay, kiosk-safe). */
export function showAreaSetup(hass: HomeAssistant): Promise<void> {
  return new Promise((resolve) => {
    const h = hass as unknown as RegistryHass;
    const thisId = resolveDeviceHaId(hass);
    const devices = unassignedDevices(hass).sort((a, b) =>
      a.id === thisId ? -1 : b.id === thisId ? 1 : 0,
    );
    const areas = listAreas(hass);
    const admin = !!h.user?.is_admin;
    const selfAllowed = settingsStore.effective().allow_device_area_self_assign !== false;

    const layer = document.createElement("div");
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");
    layer.style.cssText =
      "position:fixed;inset:0;z-index:100000;display:flex;align-items:center;" +
      "justify-content:center;padding:16px;background:rgba(0,0,0,.45);";

    const sheet = document.createElement("div");
    sheet.style.cssText =
      "width:min(440px,100%);box-sizing:border-box;max-height:86vh;overflow:auto;" +
      "background:var(--ha-card-background,var(--card-background-color,#fff));" +
      "backdrop-filter:var(--ha-dialog-surface-backdrop-filter,var(--ha-card-backdrop-filter));" +
      "-webkit-backdrop-filter:var(--ha-dialog-surface-backdrop-filter,var(--ha-card-backdrop-filter));" +
      "color:var(--primary-text-color,#111);border:1px solid var(--divider-color,rgba(120,120,120,.22));" +
      "border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.4);";

    const title = document.createElement("div");
    title.textContent = "Assign devices to a room";
    title.style.cssText = "font-size:1.15rem;font-weight:600;padding:20px 20px 4px;";
    sheet.append(title);

    const intro = document.createElement("div");
    intro.style.cssText = "padding:6px 20px 4px;color:var(--secondary-text-color,#555);font-size:.95rem;";
    sheet.append(intro);

    const close = () => {
      window.removeEventListener("keydown", onKey, true);
      layer.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    layer.addEventListener("click", (e) => {
      if (e.target === layer) close();
    });
    window.addEventListener("keydown", onKey, true);

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;padding:14px 20px 18px;";
    const btnBase =
      "font:inherit;font-weight:600;cursor:pointer;border-radius:8px;padding:9px 16px;border:none;";

    // No candidates or no permission → instructions only.
    if (!devices.length) {
      intro.textContent = "Every device already has a room. You're all set.";
    } else if (!admin && !selfAllowed) {
      intro.textContent =
        "This device isn't assigned to a room, so voice commands aren't room-aware. " +
        "Ask a Home Assistant admin to set its Area in Settings → Devices, or enable " +
        "“Allow un-scoped devices to set their own Area” in Ted's settings.";
    } else {
      intro.textContent =
        "Pick a room for each device below so voice commands land in the right place. " +
        "The app device is what your voice uses; the dashboard device is what this screen shows.";
      const selects: Record<string, HTMLSelectElement> = {};
      const list = document.createElement("div");
      list.style.cssText = "padding:8px 20px 4px;display:flex;flex-direction:column;gap:10px;";
      for (const d of devices) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:10px;justify-content:space-between;";
        const label = document.createElement("div");
        label.textContent = deviceLabel(d) + (d.id === thisId ? " · this screen" : "");
        label.style.cssText = "flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        const sel = document.createElement("select");
        sel.style.cssText =
          "flex:0 0 auto;max-width:52%;font:inherit;padding:6px 8px;border-radius:8px;" +
          "border:1px solid var(--divider-color,rgba(120,120,120,.4));" +
          "background:var(--ha-card-background,#fff);color:var(--primary-text-color,#111);";
        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "— choose a room —";
        sel.append(blank);
        for (const a of areas) {
          const opt = document.createElement("option");
          opt.value = a.id;
          opt.textContent = a.name;
          sel.append(opt);
        }
        selects[d.id] = sel;
        row.append(label, sel);
        list.append(row);
      }
      sheet.append(list);

      const errorEl = document.createElement("div");
      errorEl.style.cssText = "padding:4px 20px 0;color:var(--error-color,#db4437);font-size:.9rem;";
      sheet.append(errorEl);

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel";
      cancelBtn.style.cssText = btnBase + "background:transparent;color:var(--primary-text-color,#111);";
      cancelBtn.addEventListener("click", () => close());
      const saveBtn = document.createElement("button");
      saveBtn.textContent = "Save";
      saveBtn.style.cssText = btnBase + "color:#fff;background:var(--primary-color,#2196f3);";
      saveBtn.addEventListener("click", async () => {
        saveBtn.disabled = true;
        errorEl.textContent = "";
        let anyError = false;
        for (const d of devices) {
          const areaId = selects[d.id]?.value;
          if (!areaId) continue;
          try {
            await h.callWS?.({
              type: "teds_dashboard_system/set_device_area",
              device_id: d.id,
              area_id: areaId,
            });
          } catch {
            anyError = true;
          }
        }
        if (anyError) {
          errorEl.textContent = "Couldn't set one or more areas — an admin may need to do it.";
          saveBtn.disabled = false;
        } else {
          close();
        }
      });
      actions.append(cancelBtn, saveBtn);
      sheet.append(actions);
      layer.append(sheet);
      document.body.append(layer);
      return;
    }

    const okBtn = document.createElement("button");
    okBtn.textContent = "Close";
    okBtn.style.cssText = btnBase + "color:#fff;background:var(--primary-color,#2196f3);";
    okBtn.addEventListener("click", () => close());
    actions.append(okBtn);
    sheet.append(actions);
    layer.append(sheet);
    document.body.append(layer);
  });
}

const NUDGE_KEY = "ted-area-setup";
const DISMISS_KEY = "ted-area-setup-dismissed";
/** Show at most once per page load (survives navbar re-attach on navigation). */
let nudgedThisLoad = false;

type NudgeHost = ReactiveControllerHost & { hass?: HomeAssistant };

function maybeNudge(hass: HomeAssistant | undefined): void {
  if (nudgedThisLoad || !hass || !settingsStore.hasLoaded()) return;
  try {
    if (sessionStorage.getItem(DISMISS_KEY)) return;
  } catch {
    /* sessionStorage may be unavailable */
  }
  if (!needsAreaSetup(hass)) return;
  nudgedThisLoad = true;
  showMessageBox({
    key: NUDGE_KEY,
    severity: "info",
    icon: "mdi:map-marker-question",
    title: "Assign this screen to a room",
    message:
      "Voice commands aren't room-aware until this device has an area. Set it now so the " +
      "thermostat, music, announcements, and spoken answers land in the right room.",
    duration: 0,
    hideDismiss: true,
    actions: [
      {
        label: "Set the room",
        primary: true,
        handler: () => {
          dismissMessageBox(NUDGE_KEY);
          void showAreaSetup(hass);
        },
      },
      {
        label: "Later",
        handler: () => {
          try {
            sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* ignore */
          }
          dismissMessageBox(NUDGE_KEY);
        },
      },
    ],
  });
}

/**
 * Nudges an un-scoped device (once per page load) to pick a room. Attach to a
 * long-lived host (the navbar); gated behind the Ted's Dashboard System integration.
 */
export class AreaSetupController implements ReactiveController {
  private _unsub?: () => void;

  constructor(
    private _host: NudgeHost,
    private _enabled?: () => boolean,
  ) {
    _host.addController(this);
  }

  hostConnected(): void {
    if (this._enabled && !this._enabled()) return;
    maybeNudge(this._host.hass);
    this._unsub = settingsStore.subscribe(() => {
      if (this._enabled && !this._enabled()) return;
      maybeNudge(this._host.hass);
    });
  }

  hostUpdated(): void {
    if (this._enabled && !this._enabled()) return;
    maybeNudge(this._host.hass);
  }

  hostDisconnected(): void {
    this._unsub?.();
    this._unsub = undefined;
  }
}
