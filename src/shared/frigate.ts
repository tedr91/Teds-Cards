// Frigate-aware helpers for the camera card: discover a Frigate camera's sibling
// control switches (detect/recordings/snapshots) and health sensors (review status,
// object counts) from the entity registry, all keyed off the camera's HA device.

import type { HomeAssistant } from "custom-card-helpers";

const FRIGATE = "frigate";

interface RegEntry {
  device_id?: string | null;
  platform?: string;
}
type Registry = Record<string, RegEntry>;

function registry(hass: HomeAssistant): Registry {
  return (hass as unknown as { entities?: Registry }).entities ?? {};
}

/** True when a camera entity is provided by the Frigate integration. */
export function isFrigateCamera(hass: HomeAssistant, entity: string): boolean {
  return registry(hass)[entity]?.platform === FRIGATE;
}

/** The base URL of the Frigate web UI, exposed by the backend on the requirements sensor. */
export function frigateUrl(hass: HomeAssistant): string | undefined {
  const u = hass.states["sensor.teds_requirements"]?.attributes?.frigate_url;
  return typeof u === "string" && u ? u : undefined;
}

export interface FrigateSwitch {
  key: string;
  label: string;
  entity: string;
  on: boolean;
}
export interface FrigateCount {
  label: string;
  count: number;
}
export interface FrigateCameraInfo {
  switches: FrigateSwitch[];
  reviewStatus?: string; // NONE | DETECTION | ALERT
  counts: FrigateCount[];
}

// Frigate switch entity-id suffixes we surface as controls, in display order.
const CONTROLS: { key: string; suffix: string; label: string }[] = [
  { key: "detect", suffix: "_detect", label: "Detect" },
  { key: "recordings", suffix: "_recordings", label: "Recordings" },
  { key: "snapshots", suffix: "_snapshots", label: "Snapshots" },
];

/** Discover the Frigate control switches + health sensors on a camera's device. */
export function frigateCameraInfo(hass: HomeAssistant, entity: string): FrigateCameraInfo {
  const reg = registry(hass);
  const info: FrigateCameraInfo = { switches: [], counts: [] };
  const deviceId = reg[entity]?.device_id;
  if (!deviceId || reg[entity]?.platform !== FRIGATE) return info;
  const camName = String(hass.states[entity]?.attributes?.friendly_name ?? "");
  for (const [eid, e] of Object.entries(reg)) {
    if (e.device_id !== deviceId || e.platform !== FRIGATE) continue;
    if (eid.startsWith("switch.")) {
      const ctl = CONTROLS.find((c) => eid.endsWith(c.suffix));
      const st = ctl ? hass.states[eid] : undefined;
      if (ctl && st) info.switches.push({ ...ctl, entity: eid, on: st.state === "on" });
    } else if (eid.startsWith("sensor.")) {
      const st = hass.states[eid];
      if (!st) continue;
      if (eid.endsWith("_review_status")) {
        info.reviewStatus = st.state;
      } else if (eid.endsWith("_count")) {
        const n = Number(st.state);
        if (Number.isFinite(n) && n > 0) {
          let label = String(st.attributes?.friendly_name ?? eid).replace(/\s*count$/i, "").trim();
          if (camName && label.toLowerCase().startsWith(camName.toLowerCase())) {
            label = label.slice(camName.length).trim();
          }
          info.counts.push({ label: label || "object", count: n });
        }
      }
    }
  }
  info.switches.sort(
    (a, b) => CONTROLS.findIndex((c) => c.key === a.key) - CONTROLS.findIndex((c) => c.key === b.key),
  );
  return info;
}
