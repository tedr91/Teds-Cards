/**
 * Best-effort "auto-populate" for the Room Card: given an HA area, build a set of
 * status items + button sections from the entities assigned to that area. Used by
 * the editor's "Auto-populate" button (writes the result into the config) and by
 * dashboard-integrated cards at runtime (computed live from the device's area).
 */
import type { HomeAssistant } from "custom-card-helpers";

import { BUTTON_CARD_TYPE } from "../button-card/const";
import { COVER_CARD_TYPE } from "../cover-card/const";
import { LIGHT_CARD_TYPE } from "../light-card/const";
import type { RoomButtonConfig, RoomButtonSection, RoomStatusItem } from "./types";

/** The registry fields we read to place + filter an area's entities. */
interface RegEntity {
  area_id?: string | null;
  device_id?: string | null;
  hidden_by?: string | null;
  disabled_by?: string | null;
  entity_category?: string | null;
}

type HassReg = HomeAssistant & {
  areas?: Record<string, { name?: string }>;
  entities?: Record<string, RegEntity>;
  devices?: Record<string, { area_id?: string | null; identifiers?: [string, string][] }>;
};

export interface AutoPopulateResult {
  status_items: RoomStatusItem[];
  sections: RoomButtonSection[];
  section_layout: "stacked" | "tabbed";
}

/** Non-light domains grouped into "Controls" (lights are prepended, in a smart order). */
const CONTROL_NON_LIGHT_DOMAINS = ["switch", "cover", "fan", "valve"];
/** Light-name → priority buckets for ordering within Controls (lower index = shown first). */
const LIGHT_ORDER_RULES: RegExp[] = [
  /ceiling|main|overhead|primary/, // 0: the room's main light
  /pendant/, // 1
  /lamp|table|desk|work/, // 2
  /cabinet|accent|strip|led|under|bias|sconce|night|closet/, // 3
];
/** Domains grouped into the "Others" section, in render order. */
const OTHER_DOMAINS = [
  "lock",
  "vacuum",
  "humidifier",
  "water_heater",
  "input_boolean",
  "script",
  "remote",
  "siren",
  "lawn_mower",
  "select",
];

/** Light names that suggest the room's MAIN light. */
const MAIN_LIGHT_PREFER = /ceiling|main|overhead|primary/;
/** Light names that suggest a secondary / accent light (never "lamp"). */
const MAIN_LIGHT_PENALIZE = /accent|strip|led|bias|under|night|closet|cabinet|sconce/;

/** The area an entity belongs to (its own area, else its device's area). */
function entityArea(hass: HassReg, entityId: string): string | undefined {
  const reg = hass.entities?.[entityId];
  if (!reg) return undefined;
  return reg.area_id ?? (reg.device_id ? hass.devices?.[reg.device_id]?.area_id ?? undefined : undefined);
}

/** True when the entity should be excluded (hidden, disabled, or config/diagnostic). */
function isExcluded(reg: RegEntity | undefined): boolean {
  if (!reg) return true;
  if (reg.hidden_by || reg.disabled_by) return true;
  return reg.entity_category === "config" || reg.entity_category === "diagnostic";
}

/** True when the entity belongs to a Browser Mod device (e.g. the tablet's own "screen" light). */
function isBrowserModEntity(hass: HassReg, entityId: string): boolean {
  const deviceId = hass.entities?.[entityId]?.device_id;
  if (!deviceId) return false;
  const ids = hass.devices?.[deviceId]?.identifiers;
  return Array.isArray(ids) && ids.some((i) => Array.isArray(i) && i[0] === "browser_mod");
}

/** Order lights by name-keyword priority: ceiling/main → pendant → lamp/desk → accent → other. */
function orderLights(hass: HassReg, lights: string[]): string[] {
  const rank = (id: string): number => {
    const hay = `${id} ${String(hass.states[id]?.attributes?.friendly_name ?? "")}`.toLowerCase();
    const i = LIGHT_ORDER_RULES.findIndex((re) => re.test(hay));
    return i === -1 ? LIGHT_ORDER_RULES.length : i;
  };
  // Stable sort keeps the existing by-name order within each priority bucket.
  return [...lights].sort((a, b) => rank(a) - rank(b));
}

/** All non-excluded entity ids assigned to `areaId`, grouped by domain (sorted by name). */
function entitiesByDomain(hass: HassReg, areaId: string): Record<string, string[]> {
  const byDomain: Record<string, string[]> = {};
  for (const entityId of Object.keys(hass.states)) {
    const reg = hass.entities?.[entityId];
    if (isExcluded(reg) || entityArea(hass, entityId) !== areaId) continue;
    const domain = entityId.slice(0, entityId.indexOf("."));
    (byDomain[domain] ??= []).push(entityId);
  }
  const name = (id: string) => String(hass.states[id]?.attributes?.friendly_name ?? id).toLowerCase();
  for (const ids of Object.values(byDomain)) ids.sort((a, b) => name(a).localeCompare(name(b)));
  return byDomain;
}

/** First entity in `ids` whose device_class is one of `classes`. */
function firstByDeviceClass(hass: HassReg, ids: string[], classes: string[]): string | undefined {
  return ids.find((id) => {
    const dc = hass.states[id]?.attributes?.device_class;
    return typeof dc === "string" && classes.includes(dc);
  });
}

/** Best-effort pick of the room's "main" light (ceiling/main over accent; groups favored). */
function pickMainLight(hass: HassReg, lights: string[], areaName?: string): string | undefined {
  if (lights.length <= 1) return lights[0];
  const areaToken = areaName?.toLowerCase();
  let best: string | undefined;
  let bestScore = -Infinity;
  for (const id of lights) {
    const st = hass.states[id];
    const hay = `${id} ${String(st?.attributes?.friendly_name ?? "")}`.toLowerCase();
    let score = 0;
    if (MAIN_LIGHT_PREFER.test(hay)) score += 10;
    if (MAIN_LIGHT_PENALIZE.test(hay)) score -= 8;
    if (areaToken && hay.includes(areaToken)) score += 3;
    // A light group (its state carries a member `entity_id` list) is likely the room's "all lights".
    if (Array.isArray(st?.attributes?.entity_id)) score += 4;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best ?? lights[0];
}

/** Card `type` for an entity's domain (light/cover get their own card; everything else = button). */
function buttonFor(entityId: string): RoomButtonConfig {
  // Light/cover tiles are 1.5x-height with default name/icon/state styling.
  if (entityId.startsWith("light.")) {
    return { type: `custom:${LIGHT_CARD_TYPE}`, entity: entityId, ted_button_height: "1.5x" };
  }
  if (entityId.startsWith("cover.")) {
    return { type: `custom:${COVER_CARD_TYPE}`, entity: entityId, ted_button_height: "1.5x" };
  }
  // Generic buttons read cleaner as name + state (no icon) with a smaller name.
  return {
    type: `custom:${BUTTON_CARD_TYPE}`,
    entity: entityId,
    show_name: true,
    name_scale: 60,
    show_icon: false,
    show_state: true,
  };
}

/** Scene buttons: icon + name (no state), so they read as tappable actions. */
function sceneButtonFor(entityId: string): RoomButtonConfig {
  return {
    type: `custom:${BUTTON_CARD_TYPE}`,
    entity: entityId,
    show_icon: true,
    icon_scale: 75,
    show_state: false,
    show_name: true,
    name_scale: 60,
  };
}

/** Word-splitter for names (whitespace + common separators : _ - / and dashes). */
const NAME_SPLIT = /[\s:_/\-\u2013\u2014]+/;

/** Drop the room's area name from an entity name wherever it appears ("Kitchen Ceiling
 *  Lights", "Ceiling Lights - Kitchen", "Ceiling Kitchen Lights" all → "Ceiling Lights").
 *  Falls back to the original name if stripping would leave nothing. */
function stripAreaName(name: string, areaName: string | undefined): string {
  if (!name || !areaName) return name;
  const areaTokens = new Set(areaName.toLowerCase().split(NAME_SPLIT).filter(Boolean));
  if (!areaTokens.size) return name;
  const kept = name.split(NAME_SPLIT).filter((p) => p && !areaTokens.has(p.toLowerCase()));
  return kept.join(" ").trim() || name;
}

/**
 * Build the auto-populated status items + sections for `areaId`.
 * `deviceMediaPlayer` (this device's player) drives the Volume status item when present.
 */
export function autoPopulateRoom(
  hass: HomeAssistant,
  areaId: string,
  deviceMediaPlayer?: string,
): AutoPopulateResult {
  const h = hass as HassReg;
  const byDomain = entitiesByDomain(h, areaId);
  const areaName = h.areas?.[areaId]?.name;

  // Browser Mod device entities (e.g. the tablet's own "screen" light / media player) go to
  // "Others", not the room's Controls/Media. Room lights are ordered by keyword priority.
  const roomLights = orderLights(h, (byDomain.light ?? []).filter((id) => !isBrowserModEntity(h, id)));
  const bmLights = (byDomain.light ?? []).filter((id) => isBrowserModEntity(h, id));
  const roomMedia = (byDomain.media_player ?? []).filter((id) => !isBrowserModEntity(h, id));
  const bmMedia = (byDomain.media_player ?? []).filter((id) => isBrowserModEntity(h, id));
  const climates = byDomain.climate ?? [];
  const binarySensors = byDomain.binary_sensor ?? [];
  const sensors = byDomain.sensor ?? [];

  // --- Status items ---------------------------------------------------------
  const status: RoomStatusItem[] = [];

  const tempSensor = firstByDeviceClass(h, sensors, ["temperature"]);
  if (climates.length === 1) {
    // A single thermostat: show + adjust it right from the header.
    status.push({ type: "temperature", entity: climates[0], tap_action: { action: "more-info" } });
  } else if (climates.length >= 2) {
    status.push(
      tempSensor
        ? { type: "temperature", entity: tempSensor }
        : { type: "temperature", entity: climates[0], tap_action: { action: "more-info" } },
    );
  } else if (tempSensor) {
    status.push({ type: "temperature", entity: tempSensor });
  }

  const occupancy = firstByDeviceClass(h, binarySensors, ["occupancy", "motion", "presence"]);
  if (occupancy) status.push({ type: "occupancy", entity: occupancy });

  const mainLight = pickMainLight(h, roomLights, areaName);
  if (mainLight) status.push({ type: "brightness", entity: mainLight });

  if (deviceMediaPlayer) status.push({ type: "volume", entity: deviceMediaPlayer });

  // --- Sections -------------------------------------------------------------
  const sections: RoomButtonSection[] = [];

  // Controls: ordered room lights first, then switches/covers/fans/valves (grouped by type).
  // Each item's name is the entity's name with the room's area name stripped out.
  const controls = [
    ...roomLights,
    ...CONTROL_NON_LIGHT_DOMAINS.flatMap((d) => byDomain[d] ?? []),
  ].map((id) => {
    const name = stripAreaName(String(h.states[id]?.attributes?.friendly_name ?? ""), areaName);
    return name ? { ...buttonFor(id), name } : buttonFor(id);
  });
  if (controls.length) sections.push({ title: "Controls", icon: "mdi:tune", buttons: controls });

  const scenes = (byDomain.scene ?? []).map((id) => {
    const name = stripAreaName(String(h.states[id]?.attributes?.friendly_name ?? ""), areaName);
    return name ? { ...sceneButtonFor(id), name } : sceneButtonFor(id);
  });
  if (scenes.length) sections.push({ title: "Scenes", icon: "mdi:palette", buttons: scenes });

  // A single climate is controlled from the header temperature item, so no section for it.
  if (climates.length >= 2) {
    sections.push({ title: "Thermostats", icon: "mdi:thermostat", buttons: climates.map(buttonFor) });
  }

  const media = roomMedia.map(buttonFor);
  if (media.length) {
    sections.push({ title: "Media", icon: "mdi:speaker-multiple", buttons: media });
  }

  // Others: misc controllable domains + any Browser Mod screen light / media player.
  const others = [
    ...OTHER_DOMAINS.flatMap((d) => byDomain[d] ?? []),
    ...bmLights,
    ...bmMedia,
  ].map(buttonFor);
  if (others.length) {
    sections.push({ title: "Others", icon: "mdi:dots-horizontal-circle-outline", buttons: others });
  }

  // More than one section reads best as tabs; a lone section drops its redundant heading.
  const section_layout: "stacked" | "tabbed" = sections.length > 1 ? "tabbed" : "stacked";
  if (sections.length === 1) sections[0].show_title = false;

  return { status_items: status, sections, section_layout };
}
