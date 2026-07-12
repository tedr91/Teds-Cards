/** Shared ha-form helpers for editing status items (used by Room + Navbar editors). */
import type { HomeAssistant } from "custom-card-helpers";

import { DEFAULT_SPACER_SIZE, STATUS_ITEM_DEFAULT_DISPLAY } from "./const";
import { DEFAULT_DATE_FORMAT, DEFAULT_TIME_FORMAT } from "./datetime";
import type { StatusItem, StatusItemType } from "./types";

/** Form data for a status item, with the per-type default display filled in. */
export function statusItemData(item: StatusItem): Record<string, unknown> {
  if (item.type === "spacer") return { ...item };
  if (item.type === "datetime") {
    return {
      ...item,
      display: item.display ?? "both",
      date_format: item.date_format ?? DEFAULT_DATE_FORMAT,
      time_format: item.time_format ?? DEFAULT_TIME_FORMAT,
    };
  }
  if (item.type === "notifications" || item.type === "alarms" || item.type === "timers") {
    return {
      ...item,
      hide_when_empty: item.hide_when_empty ?? true,
      display_badge: item.display_badge ?? true,
    };
  }
  return { ...item, display: item.display ?? STATUS_ITEM_DEFAULT_DISPLAY[item.type] };
}

const DISPLAY_FIELD = {
  name: "display",
  selector: {
    select: {
      mode: "dropdown",
      options: [
        { value: "both", label: "Both" },
        { value: "icon", label: "Icon only" },
        { value: "state", label: "State only" },
      ],
    },
  },
};
const ICON_FIELD = { name: "icon", selector: { icon: {} } };
const NAME_FIELD = { name: "name", selector: { text: {} } };
const AREA_FIELD = { name: "area", selector: { area: {} } };
const HIDE_FIELD = { name: "hide_when_empty", selector: { boolean: {} } };
const DISPLAY_BADGE_FIELD = { name: "display_badge", selector: { boolean: {} } };

/**
 * Shared layout for the "badge" items (notifications / alarms / timers):
 * Area + Name, then Icon + Hide-when-empty (side by side), then Display badge.
 */
const BADGE_SCHEMA = [
  { name: "", type: "grid", column_min_width: "100px", schema: [AREA_FIELD, NAME_FIELD] },
  { name: "", type: "grid", column_min_width: "100px", schema: [ICON_FIELD, HIDE_FIELD] },
  DISPLAY_BADGE_FIELD,
];

/** Context so a status item's actions target its own `entity` for more-info / toggle. */
const ACTION_CONTEXT = { entity_id: "entity" } as const;

/** Tap / hold / double-tap action selectors, in a collapsible "Interactions" section.
 *  Mirrors the Button Card: a configured action overrides an item's built-in tap. */
const INTERACTIONS_SECTION = {
  name: "",
  type: "expandable",
  title: "Interactions",
  iconPath:
    "M15.07,11.25L14.17,12.17C13.45,12.89 13,13.5 13,15H11V14.5C11,13.39 11.45,12.39 12.17,11.67L13.41,10.41C13.78,10.05 14,9.55 14,9C14,7.89 13.1,7 12,7A2,2 0 0,0 10,9H8A4,4 0 0,1 12,5A4,4 0 0,1 16,9C16,9.88 15.64,10.67 15.07,11.25M13,19H11V17H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",
  schema: [
    { name: "tap_action", selector: { ui_action: { default_action: "none" } }, context: ACTION_CONTEXT },
    { name: "hold_action", selector: { ui_action: { default_action: "none" } }, context: ACTION_CONTEXT },
    {
      name: "double_tap_action",
      selector: { ui_action: { default_action: "none" } },
      context: ACTION_CONTEXT,
    },
  ],
};

/** ha-form schema for a status item of the given type. `item` (when supplied)
 *  lets fields react to the item's current values (e.g. disabling formats). All
 *  items except `spacer` also get the tap/hold/double-tap Interactions section. */
export function statusItemSchema(type: StatusItemType, item?: StatusItem): unknown[] {
  const base = baseStatusItemSchema(type, item);
  return type === "spacer" ? base : [...base, INTERACTIONS_SECTION];
}

function baseStatusItemSchema(type: StatusItemType, item?: StatusItem): unknown[] {
  switch (type) {
    case "temperature":
    case "occupancy":
      return [{ name: "entity", selector: { entity: {} } }, DISPLAY_FIELD, ICON_FIELD, NAME_FIELD];
    case "brightness":
      return [
        {
          name: "entity",
          required: true,
          selector: {
            entity: { filter: [{ domain: "light" }, { domain: "number" }, { domain: "input_number" }] },
          },
        },
        DISPLAY_FIELD,
        ICON_FIELD,
        NAME_FIELD,
      ];
    case "volume":
      return [
        { name: "entity", required: true, selector: { entity: { filter: { domain: "media_player" } } } },
        DISPLAY_FIELD,
        ICON_FIELD,
        NAME_FIELD,
      ];
    case "led":
      return [
        { name: "entity", required: true, selector: { entity: {} } },
        DISPLAY_FIELD,
        { name: "on_color", selector: { ui_color: {} } },
        { name: "off_color", selector: { ui_color: {} } },
        NAME_FIELD,
        { name: "colors", selector: { object: {} } },
      ];
    case "spacer":
      return [
        {
          name: "size",
          selector: { number: { min: 0, max: 600, step: 1, mode: "box", unit_of_measurement: "px" } },
        },
      ];
    case "datetime": {
      const mode = (item?.type === "datetime" ? item.display : undefined) ?? "both";
      return [
        {
          name: "display",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "both", label: "Both" },
                { value: "both-stacked", label: "Both (stacked)" },
                { value: "time", label: "Time only" },
                { value: "date", label: "Date only" },
              ],
            },
          },
        },
        {
          name: "",
          type: "grid",
          column_min_width: "100px",
          schema: [
            { name: "date_format", disabled: mode === "time", selector: { text: {} } },
            { name: "time_format", disabled: mode === "date", selector: { text: {} } },
          ],
        },
      ];
    }
    case "weather":
      return [
        { name: "entity", selector: { entity: { filter: { domain: "weather" } } } },
        DISPLAY_FIELD,
        ICON_FIELD,
        NAME_FIELD,
      ];
    case "notifications":
    case "alarms":
    case "timers":
      return BADGE_SCHEMA;
  }
}

/** Create a fresh status item of the given type. `resolveEntity` (Room Card) seeds area sensors. */
export function newStatusItem(
  type: StatusItemType,
  resolveEntity?: (kind: "temperature" | "occupancy") => string | undefined,
): StatusItem {
  switch (type) {
    case "temperature":
      return { type: "temperature", entity: resolveEntity?.("temperature") ?? "" };
    case "occupancy":
      return { type: "occupancy", entity: resolveEntity?.("occupancy") ?? "" };
    case "brightness":
      return { type: "brightness", entity: "" };
    case "volume":
      return { type: "volume", entity: "" };
    case "led":
      return { type: "led", entity: "" };
    case "spacer":
      return { type: "spacer", size: DEFAULT_SPACER_SIZE };
    case "datetime":
      return { type: "datetime" };
    case "weather":
      return { type: "weather" };
    case "notifications":
      return { type: "notifications" };
    case "alarms":
      return { type: "alarms" };
    case "timers":
      return { type: "timers" };
  }
}

/** Row subtitle: explicit name, else the entity's friendly name, else the raw entity id. */
export function statusItemSubtitle(item: StatusItem, hass?: HomeAssistant): string {
  const entityId = "entity" in item ? item.entity : undefined;
  const friendlyName = entityId
    ? (hass?.states[entityId]?.attributes?.friendly_name as string | undefined)
    : undefined;
  return item.name || friendlyName || entityId || "";
}

/** Editor label for a status-item ha-form field, or undefined if not one of ours. */
export function statusItemFieldLabel(name: string, type?: StatusItemType): string | undefined {
  switch (name) {
    case "entity":
      return "Entity";
    case "area":
      return "Area (optional — scopes to a room)";
    case "hide_when_empty":
      if (type === "alarms") return "Hide when there are no alarms";
      if (type === "timers") return "Hide when there are no timers";
      return "Hide when there are no notifications";
    case "display_badge":
      return "Display badge icon";
    case "display":
      return "Display";    case "icon":
      return "Icon";
    case "name":
      return "Name";
    case "on_color":
      return "On color";
    case "off_color":
      return "Off color";
    case "colors":
      return "State colors (advanced)";
    case "size":
      return "Width";
    case "time_format":
      return "Time format";
    case "date_format":
      return "Date format";
    default:
      return undefined;
  }
}
