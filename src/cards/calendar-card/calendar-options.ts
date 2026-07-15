/**
 * Shared per-calendar option form logic — a single source of truth for the
 * calendar item's editable options (name / read-only / badge source / icon /
 * person / color). Used by BOTH the Ted's Calendar card editor and the Ted's
 * Cards Settings card (Calendars tab), so the two stay in sync.
 */
import type { HomeAssistant } from "custom-card-helpers";

import { matchPerson } from "./const";
import type { CalendarIconSource, CalendarItemConfig } from "./types";

/** Badge source options — icon glyph vs. the linked person's avatar. */
export const CALENDAR_ICON_SOURCE_OPTIONS = [
  { value: "icon", label: "Icon" },
  { value: "person", label: "Person" },
];

/** Friendly name of an entity (the default a field falls back to), else the id. */
export function calendarEntityName(hass: HomeAssistant | undefined, id?: string): string {
  if (!id) return "";
  const fn = hass?.states[id]?.attributes?.friendly_name;
  return typeof fn === "string" && fn ? fn : id;
}

/** ha-form data for a calendar item's per-calendar options. The person field shows
 *  the explicit person or the auto-matched one (unless the badge source is Icon). */
export function calendarOptionsData(
  hass: HomeAssistant | undefined,
  item: CalendarItemConfig,
): Record<string, unknown> {
  const autoPerson =
    item.icon_source === "icon"
      ? ""
      : (matchPerson(hass?.states, item.name || calendarEntityName(hass, item.entity)) ?? "");
  return {
    name: item.name ?? "",
    readonly: item.readonly !== false,
    hide_times: item.hide_times === true,
    icon: item.icon ?? "",
    person: item.person ?? autoPerson,
    icon_source: item.icon_source ?? "icon",
    color: item.color ?? "",
  };
}

/** ha-form schema for a calendar item's per-calendar options. Defaults are shown as
 *  muted placeholders (the entity's friendly name / its own icon). */
export function calendarOptionsSchema(
  hass: HomeAssistant | undefined,
  item: CalendarItemConfig,
): unknown[] {
  return [
    { name: "readonly", selector: { boolean: {} } },
    { name: "hide_times", selector: { boolean: {} } },
    {
      type: "grid",
      name: "",
      column_min_width: "140px",
      schema: [
        { name: "name", selector: { text: { placeholder: calendarEntityName(hass, item.entity) } } },
        {
          name: "icon_source",
          selector: { select: { mode: "dropdown", options: CALENDAR_ICON_SOURCE_OPTIONS } },
        },
      ],
    },
    {
      name: "icon",
      selector: {
        icon: { placeholder: hass?.states[item.entity]?.attributes?.icon || "mdi:calendar" },
      },
    },
    { name: "person", selector: { entity: { domain: "person" } } },
    { name: "color", selector: { ui_color: {} } },
  ];
}

/** Apply an ha-form value change to a calendar item, returning the updated item with
 *  defaults collapsed to `undefined` (so option-less items stay clean). */
export function applyCalendarOptionChange(
  hass: HomeAssistant | undefined,
  cur: CalendarItemConfig,
  v: Record<string, unknown>,
): CalendarItemConfig {
  const next: CalendarItemConfig = { ...cur };
  next.name = (v.name as string) || undefined;
  next.readonly = v.readonly === false ? false : undefined;
  next.hide_times = v.hide_times === true ? true : undefined;
  const src = (v.icon_source as CalendarIconSource) ?? cur.icon_source ?? "icon";
  next.icon_source = src !== "icon" ? src : undefined;
  if ("person" in v) {
    const p = (v.person as string) || undefined;
    // Don't persist a person that just equals the auto-match (keeps it dynamic + clean).
    const auto = matchPerson(hass?.states, next.name || calendarEntityName(hass, cur.entity));
    next.person = p && p !== auto ? p : undefined;
  }
  if ("icon" in v) next.icon = (v.icon as string) || undefined;
  next.color = (v.color as string) || undefined;
  return next;
}

/** Label for a per-calendar option field. */
export function calendarOptionLabel(name: string): string {
  switch (name) {
    case "name":
      return "Name";
    case "readonly":
      return "Read-only";
    case "hide_times":
      return "Hide times";
    case "icon_source":
      return "Badge source";
    case "person":
      return "Person";
    case "icon":
      return "Icon";
    case "color":
      return "Color";
    default:
      return name;
  }
}

/** Helper text for a per-calendar option field. */
export function calendarOptionHelper(name: string): string | undefined {
  switch (name) {
    case "readonly":
      return "Prevent editing events on this calendar.";
    case "hide_times":
      return "Hide event start/end times on this calendar (show them as all-day).";
    case "icon_source":
      return "Badge shows the icon or the linked person's avatar.";
    default:
      return undefined;
  }
}
