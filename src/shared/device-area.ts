/**
 * Resolve "the current device's area" for area-scoped cards (alarms/timers), using a
 * fallback chain and a manual localStorage override. No single HA signal gives a shared
 * dashboard its per-device area, so we try several in priority order:
 *
 *   1. the card's explicit `area` config (a real area_id) — highest priority override;
 *   2. the View Assist satellite's area (its VA sensor's `area_id` attribute, or the
 *      sensor / its `mic_device`'s area in the entity/device registry);
 *   3. the browser_mod browser's registered device area (assign the browser an Area in HA);
 *   4. a per-device value the user saved once into localStorage (`ted_device_area`);
 *   5. otherwise nothing — the card shows a banner prompting for an area (stored in #4).
 */
import type { HomeAssistant } from "custom-card-helpers";

import { viewAssistSensor } from "./view-assist";

/** localStorage key holding a manually-chosen area for this device. */
export const LOCAL_AREA_KEY = "ted_device_area";

/** Frontend registry shapes (not declared on the custom-card-helpers HomeAssistant type). */
interface RegistryHass {
  states?: HomeAssistant["states"];
  areas?: Record<string, { area_id?: string; name?: string } | undefined>;
  entities?: Record<string, { area_id?: string | null; device_id?: string | null } | undefined>;
  devices?: Record<
    string,
    { area_id?: string | null; identifiers?: [string, string][] } | undefined
  >;
}

export type AreaSource = "config" | "view_assist" | "browser_mod" | "local" | "none";

export interface ResolvedArea {
  /** The resolved area_id, or undefined when nothing resolved (prompt the user). */
  area?: string;
  /** Which step of the chain produced the value. */
  source: AreaSource;
}

/** The area of the current View Assist satellite, via its sensor / mic_device. */
function viewAssistArea(hass: RegistryHass): string | undefined {
  const sensor = viewAssistSensor();
  if (!sensor) return undefined;
  const st = hass.states?.[sensor];
  const attr = st?.attributes?.area_id;
  if (typeof attr === "string" && attr) return attr;
  const fromEntity = entityArea(hass, sensor);
  if (fromEntity) return fromEntity;
  const mic = st?.attributes?.mic_device;
  if (typeof mic === "string" && mic) return entityArea(hass, mic);
  return undefined;
}

/** An entity's area: its own area override, else its device's area. */
function entityArea(hass: RegistryHass, entityId: string): string | undefined {
  const ent = hass.entities?.[entityId];
  if (!ent) return undefined;
  if (ent.area_id) return ent.area_id;
  if (ent.device_id) return hass.devices?.[ent.device_id]?.area_id ?? undefined;
  return undefined;
}

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

/** The area of the HA device registered for this browser_mod browser. */
function browserModArea(hass: RegistryHass): string | undefined {
  const bid = browserModId();
  if (!bid || !hass.devices) return undefined;
  for (const device of Object.values(hass.devices)) {
    const ids = device?.identifiers;
    if (ids?.some((id) => id[0] === "browser_mod" && id[1] === bid) && device?.area_id) {
      return device.area_id;
    }
  }
  return undefined;
}

/** The manual per-device area saved into localStorage, if any. */
function localArea(): string | undefined {
  try {
    return localStorage.getItem(LOCAL_AREA_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Persist (or clear) the manual per-device area. */
export function setLocalDeviceArea(areaId: string | undefined): void {
  try {
    if (areaId) localStorage.setItem(LOCAL_AREA_KEY, areaId);
    else localStorage.removeItem(LOCAL_AREA_KEY);
  } catch {
    // Ignore storage failures (private mode / quota).
  }
}

/** Resolve the effective area for a card, running the fallback chain. */
export function resolveDeviceArea(hass: HomeAssistant | undefined, configArea?: string): ResolvedArea {
  if (configArea) return { area: configArea, source: "config" };
  const h = hass as RegistryHass | undefined;
  if (!h) return { area: undefined, source: "none" };
  const va = viewAssistArea(h);
  if (va) return { area: va, source: "view_assist" };
  const bm = browserModArea(h);
  if (bm) return { area: bm, source: "browser_mod" };
  const ls = localArea();
  if (ls) return { area: ls, source: "local" };
  return { area: undefined, source: "none" };
}

/** All areas as {id, name}, sorted by name — for the "set device area" banner picker. */
export function listAreas(hass: HomeAssistant | undefined): { id: string; name: string }[] {
  const areas = (hass as RegistryHass | undefined)?.areas;
  if (!areas) return [];
  return Object.values(areas)
    .filter((a): a is { area_id: string; name?: string } => !!a?.area_id)
    .map((a) => ({ id: a.area_id, name: a.name || a.area_id }))
    .sort((x, y) => x.name.localeCompare(y.name));
}

/** Friendly name for an area_id, via the frontend area registry. */
export function areaName(hass: HomeAssistant | undefined, id?: string): string | undefined {
  if (!id) return undefined;
  return (hass as RegistryHass | undefined)?.areas?.[id]?.name;
}
