/** Shared ha-form helpers for editing status items (used by Room + Navbar editors). */
import type { HomeAssistant } from "custom-card-helpers";

import { DEFAULT_SPACER_SIZE, STATUS_ITEM_DEFAULT_DISPLAY } from "./const";
import type { StatusItem, StatusItemType } from "./types";

/** Form data for a status item, with the per-type default display filled in. */
export function statusItemData(item: StatusItem): Record<string, unknown> {
  if (item.type === "spacer") return { ...item };
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

/** ha-form schema for a status item of the given type. */
export function statusItemSchema(type: StatusItemType): unknown[] {
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
    case "time":
      return [
        DISPLAY_FIELD,
        {
          name: "time_format",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "auto", label: "Auto (locale)" },
                { value: "12h", label: "12-hour" },
                { value: "24h", label: "24-hour" },
                { value: "custom", label: "Custom" },
              ],
            },
          },
        },
        { name: "time_format_custom", selector: { text: {} } },
        ICON_FIELD,
        NAME_FIELD,
      ];
    case "date":
      return [
        DISPLAY_FIELD,
        {
          name: "date_format",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "standard", label: "Standard (locale)" },
                { value: "custom", label: "Custom" },
              ],
            },
          },
        },
        { name: "date_format_custom", selector: { text: {} } },
        ICON_FIELD,
        NAME_FIELD,
      ];
    case "weather":
      return [
        { name: "entity", selector: { entity: { filter: { domain: "weather" } } } },
        DISPLAY_FIELD,
        ICON_FIELD,
        NAME_FIELD,
      ];
    case "notifications":
      return [
        { name: "area", selector: { area: {} } },
        { name: "hide_when_empty", selector: { boolean: {} } },
        ICON_FIELD,
        NAME_FIELD,
      ];
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
    case "time":
      return { type: "time" };
    case "date":
      return { type: "date" };
    case "weather":
      return { type: "weather" };
    case "notifications":
      return { type: "notifications" };
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
export function statusItemFieldLabel(name: string): string | undefined {
  switch (name) {
    case "entity":
      return "Entity";
    case "area":
      return "Area (optional — scopes to a room)";
    case "hide_when_empty":
      return "Hide when there are no notifications";
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
    case "time_format_custom":
      return "Custom time format";
    case "date_format":
      return "Date format";
    case "date_format_custom":
      return "Custom date format";
    default:
      return undefined;
  }
}
