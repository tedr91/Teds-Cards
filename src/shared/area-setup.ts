/**
 * Lets a wall panel name itself and choose a room. Nudge mode lists un-scoped
 * `mobile_app`/`browser_mod` devices; manage mode also includes assigned devices.
 *
 * The privileged `set_device_name` and `set_device_area` backend commands are
 * independently gated for non-admin users. Names may be corrected on panel/app
 * devices, while rooms may only be set on devices that currently have no area.
 * Both commands honor the `allow_device_area_self_assign` setting.
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

type AreaSetupMode = "nudge" | "manage";

/** Companion-app / Browser Mod devices available in the requested dialog mode. */
function candidateDevices(
  hass: HomeAssistant | undefined,
  mode: AreaSetupMode,
): DeviceEntry[] {
  const devices = (hass as RegistryHass | undefined)?.devices;
  if (!devices) return [];
  return Object.values(devices).filter((d): d is DeviceEntry => {
    if (!d || (mode === "nudge" && d.area_id)) return false;
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

/** Self-contained device name and room dialog (plain DOM overlay, kiosk-safe). */
export function showAreaSetup(
  hass: HomeAssistant,
  { mode = "nudge" }: { mode?: AreaSetupMode } = {},
): Promise<void> {
  return new Promise((resolve) => {
    const h = hass as unknown as RegistryHass;
    const thisId = resolveDeviceHaId(hass);
    const admin = !!h.user?.is_admin;
    // Admins can assign any un-scoped device; a non-admin (kiosk) user only ever
    // sees THIS device — the one they're actually looking at.
    const devices = candidateDevices(hass, mode)
      .filter((d) => admin || d.id === thisId)
      .sort((a, b) => (a.id === thisId ? -1 : b.id === thisId ? 1 : 0));
    const areas = listAreas(hass);
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
    title.textContent = "Device name & room";
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
      intro.textContent = mode === "nudge"
        ? "Every device already has a room. You're all set."
        : "This device isn't available to manage.";
    } else if (!admin && !selfAllowed) {
      intro.textContent =
        "A Home Assistant admin must enable “Allow un-scoped devices to set their own " +
        "Name / Area” in Ted's settings before this device can update its name or room.";
    } else {
      intro.textContent =
        "Update each device's display name and room. A room helps voice commands land in " +
        "the right place; the name does not change its Browser ID or entity IDs.";
      const selects: Record<string, HTMLSelectElement> = {};
      const nameInputs: Record<string, HTMLInputElement> = {};
      const originalAreas: Record<string, string> = {};
      const originalNames: Record<string, string> = {};
      const list = document.createElement("div");
      list.style.cssText = "padding:8px 20px 4px;display:flex;flex-direction:column;gap:10px;";
      for (const d of devices) {
        const isThis = d.id === thisId;
        const row = document.createElement("div");
        row.style.cssText =
          "display:flex;align-items:center;gap:10px;justify-content:space-between;flex-wrap:wrap;" +
          "border-radius:8px;padding:6px 8px;margin:0 -8px;" +
          (isThis
            ? "outline:1.5px solid var(--primary-color,#2196f3);" +
              "background:rgba(127,127,127,.10);"
            : "");
        const label = document.createElement("div");
        label.style.cssText =
          "flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:8px;overflow:hidden;";
        const name = document.createElement("span");
        name.textContent = deviceLabel(d);
        name.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        label.append(name);
        if (isThis) {
          const badge = document.createElement("span");
          badge.textContent = "This device";
          badge.style.cssText =
            "flex:0 0 auto;font-size:.72rem;font-weight:700;letter-spacing:.02em;" +
            "padding:2px 8px;border-radius:999px;color:#fff;" +
            "background:var(--primary-color,#2196f3);";
          label.append(badge);
        }
        const controls = document.createElement("div");
        controls.style.cssText =
          "flex:1 1 190px;min-width:0;display:flex;flex-direction:column;gap:6px;";
        const nameInput = document.createElement("input");
        const initialName = d.name_by_user || d.name || "";
        nameInput.type = "text";
        nameInput.value = initialName;
        nameInput.maxLength = 255;
        nameInput.setAttribute("aria-label", `Device name for ${deviceLabel(d)}`);
        nameInput.style.cssText =
          "width:100%;box-sizing:border-box;font:inherit;padding:6px 8px;border-radius:8px;" +
          "border:1px solid var(--divider-color,rgba(120,120,120,.4));" +
          "background:var(--ha-card-background,#fff);color:var(--primary-text-color,#111);";
        nameInputs[d.id] = nameInput;
        originalNames[d.id] = initialName;
        const sel = document.createElement("select");
        sel.style.cssText =
          "width:100%;box-sizing:border-box;font:inherit;padding:6px 8px;border-radius:8px;" +
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
        const initialArea = d.area_id || "";
        sel.value = initialArea;
        originalAreas[d.id] = initialArea;
        if (!admin && !!d.area_id) {
          sel.disabled = true;
          sel.title = "Only an admin can change the room once it's set";
          const hint = document.createElement("div");
          hint.textContent = "Only an admin can change the room once it's set.";
          hint.style.cssText = "color:var(--secondary-text-color,#555);font-size:.78rem;";
          controls.append(nameInput, sel, hint);
        } else {
          controls.append(nameInput, sel);
        }
        selects[d.id] = sel;
        row.append(label, controls);
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
        const failures: string[] = [];
        for (const d of devices) {
          const displayName = deviceLabel(d);
          const name = nameInputs[d.id]?.value ?? "";
          if (name !== originalNames[d.id]) {
            try {
              await h.callWS?.({
                type: "teds_dashboard_system/set_device_name",
                device_id: d.id,
                name,
              });
              originalNames[d.id] = name;
            } catch {
              failures.push(`Couldn't update the name for ${displayName}.`);
            }
          }
          const areaId = selects[d.id]?.value ?? "";
          if (!selects[d.id]?.disabled && areaId !== originalAreas[d.id]) {
            try {
              await h.callWS?.({
                type: "teds_dashboard_system/set_device_area",
                device_id: d.id,
                area_id: areaId || null,
              });
              originalAreas[d.id] = areaId;
            } catch {
              failures.push(`Couldn't update the room for ${displayName}.`);
            }
          }
        }
        if (failures.length) {
          errorEl.textContent = failures.join(" ");
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
