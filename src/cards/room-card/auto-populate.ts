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

/** Non-light domains collected into "Controls" (lights are added separately, in a smart order). */
const CONTROL_NON_LIGHT_DOMAINS = ["cover", "fan", "valve", "group"];
/** switch device_classes that read as a "Plug" (their own ordering bucket). */
const PLUG_DEVICE_CLASSES = ["outlet", "plug"];
/** Domains that can act as a "Zone": a group whose state lists member entity_ids. */
const ZONE_DOMAINS = ["light", "switch", "fan", "cover", "valve", "group"];
/** Button ordering priority within a section (lower index = shown first). */
const CATEGORY_ORDER = ["scene", "zone", "light", "cover", "plug", "other"] as const;
type ButtonCategory = (typeof CATEGORY_ORDER)[number];
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

/** True when `id` is a "Zone": a control-domain group whose state lists member entity_ids. */
function isZone(hass: HassReg, id: string): boolean {
  const domain = id.slice(0, id.indexOf("."));
  if (!ZONE_DOMAINS.includes(domain)) return false;
  return Array.isArray(hass.states[id]?.attributes?.entity_id);
}

/** Ordering category for a Controls/Others button (scene → zone → light → cover → plug → other). */
function categoryOf(hass: HassReg, id: string): ButtonCategory {
  const domain = id.slice(0, id.indexOf("."));
  if (domain === "scene") return "scene";
  if (isZone(hass, id)) return "zone";
  if (domain === "light") return "light";
  if (domain === "cover") return "cover";
  if (domain === "switch") {
    const dc = hass.states[id]?.attributes?.device_class;
    if (typeof dc === "string" && PLUG_DEVICE_CLASSES.includes(dc)) return "plug";
  }
  return "other";
}

/** Stable sort of ids by category priority (preserves each bucket's incoming order). */
function byCategory(hass: HassReg, ids: string[]): string[] {
  const rank = (id: string) => CATEGORY_ORDER.indexOf(categoryOf(hass, id));
  return [...ids].sort((a, b) => rank(a) - rank(b));
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
    return { type: `custom:${LIGHT_CARD_TYPE}`, entity: entityId, brushed: true, ted_button_height: "1.5x" };
  }
  if (entityId.startsWith("cover.")) {
    return { type: `custom:${COVER_CARD_TYPE}`, entity: entityId, brushed: true, ted_button_height: "1.5x" };
  }
  // Generic buttons read cleaner as name + state (no icon) with a smaller name.
  return {
    type: `custom:${BUTTON_CARD_TYPE}`,
    entity: entityId,
    brushed: true,
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
    brushed: true,
    show_icon: true,
    icon_scale: 75,
    show_state: false,
    show_name: true,
    name_scale: 60,
  };
}

/** Word-splitter for names (whitespace + common separators : _ - / and dashes). */
const NAME_SPLIT = /[\s:_/\-\u2013\u2014]+/;

/** Normalize a name word for area-matching: lowercase, unify apostrophes, and drop a
 *  trailing possessive so "Teddy's" matches "Teddy" (and vice versa). */
function baseToken(part: string): string {
  return part
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/'s$|'$/, "");
}

/** Drop the room's area name from an entity name wherever it appears ("Kitchen Ceiling
 *  Lights", "Ceiling Lights - Kitchen", "Ceiling Kitchen Lights" all → "Ceiling Lights").
 *  Possessive room names also strip their owner ("Teddy's Bedroom"/"Teddy's Room" →
 *  "Teddy's Ceiling Lights" becomes "Ceiling Lights"). Falls back to the original name
 *  if stripping would leave nothing. */
function stripAreaName(name: string, areaName: string | undefined): string {
  if (!name || !areaName) return name;
  const areaTokens = new Set(areaName.split(NAME_SPLIT).map(baseToken).filter(Boolean));
  if (!areaTokens.size) return name;
  const kept = name.split(NAME_SPLIT).filter((p) => p && !areaTokens.has(baseToken(p)));
  return kept.join(" ").trim() || name;
}

/**
 * Build the auto-populated status items + sections for `areaId`.
 * `deviceMediaPlayer` (this device's player) drives the Volume status item when present.
 * `groupScenes` puts scenes in their own "Scenes" section instead of inside "Controls".
 */
export function autoPopulateRoom(
  hass: HomeAssistant,
  areaId: string,
  deviceMediaPlayer?: string,
  groupScenes = false,
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

  // Every non-excluded area entity, and the set of entity_ids that belong to a Zone (group).
  // Zone members are pulled out of Controls and listed under "Others" instead.
  const allIds = new Set(Object.values(byDomain).flat());
  const zoneMembers = new Set<string>();
  for (const id of allIds) {
    if (!isZone(h, id)) continue;
    const members = h.states[id]?.attributes?.entity_id;
    if (Array.isArray(members)) for (const m of members) if (allIds.has(m)) zoneMembers.add(m);
  }

  // A button whose name has the room's area name stripped out ("Kitchen Ceiling" → "Ceiling").
  const namedButton = (id: string): RoomButtonConfig => {
    const base = id.startsWith("scene.") ? sceneButtonFor(id) : buttonFor(id);
    const name = stripAreaName(String(h.states[id]?.attributes?.friendly_name ?? ""), areaName);
    return name ? { ...base, name } : base;
  };

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

  // Controls: scenes (unless grouped), zones, lights, covers, then fans/valves. Switches
  // live in "Others"; zone (group) members are excluded here and listed under "Others" too.
  const controlIds = byCategory(h, [
    ...(groupScenes ? [] : byDomain.scene ?? []),
    ...roomLights,
    ...CONTROL_NON_LIGHT_DOMAINS.flatMap((d) => byDomain[d] ?? []),
  ].filter((id) => !zoneMembers.has(id) && !isBrowserModEntity(h, id)));
  const controls = controlIds.map(namedButton);
  if (controls.length) sections.push({ title: "Controls", icon: "mdi:tune", buttons: controls });

  if (groupScenes) {
    const scenes = (byDomain.scene ?? []).map(namedButton);
    if (scenes.length) sections.push({ title: "Scenes", icon: "mdi:palette", buttons: scenes });
  }

  // A single climate is controlled from the header temperature item, so no section for it.
  if (climates.length >= 2) {
    sections.push({ title: "Thermostats", icon: "mdi:thermostat", buttons: climates.map(namedButton) });
  }

  const media = roomMedia.map(namedButton);
  if (media.length) {
    sections.push({ title: "Media", icon: "mdi:speaker-multiple", buttons: media });
  }

  // Others: switches (incl. plugs + switch groups), misc controllable domains, Zone member
  // entities, and any Browser Mod screen light / media player — ordered by section priority.
  const otherIds = byCategory(h, [
    ...new Set([
      ...(byDomain.switch ?? []),
      ...OTHER_DOMAINS.flatMap((d) => byDomain[d] ?? []),
      ...zoneMembers,
      ...bmLights,
      ...bmMedia,
    ]),
  ]);
  const others = otherIds.map(namedButton);
  if (others.length) {
    sections.push({ title: "Others", icon: "mdi:dots-horizontal-circle-outline", buttons: others });
  }

  // More than one section reads best as tabs; a lone section drops its redundant heading.
  const section_layout: "stacked" | "tabbed" = sections.length > 1 ? "tabbed" : "stacked";
  if (sections.length === 1) sections[0].show_title = false;

  return { status_items: status, sections, section_layout };
}
