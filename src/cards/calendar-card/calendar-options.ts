/**
 * Shared per-calendar option form logic — a single source of truth for the
 * calendar item's editable options (name / read-only / badge source / icon /
 * person / color). Used by BOTH the Ted's Calendar card editor and the Ted's
 * Cards Settings card (Calendars tab), so the two stay in sync.
 */
import { html, nothing, type TemplateResult } from "lit";
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
  const match = matchPerson(hass?.states, item.name || calendarEntityName(hass, item.entity)) ?? "";
  const personExists = item.person || match;
  // Effective badge source: explicit wins, else Person when one is available, else Icon.
  const effectiveSource = item.icon_source ?? (personExists ? "person" : "icon");
  const autoPerson = effectiveSource === "person" ? item.person || match : "";
  return {
    name: item.name ?? "",
    virtual: item.virtual === true,
    virtual_name: item.virtual_name ?? "",
    readonly: item.readonly !== false,
    show_badge: item.show_badge !== false,
    show_birthday_badge: item.show_birthday_badge !== false,
    hide_times: item.hide_times === true,
    icon: item.icon ?? "",
    person: item.person ?? autoPerson,
    icon_source: effectiveSource,
    color: item.color ?? "",
  };
}

/** ha-form schema for a calendar item's per-calendar options. Defaults are shown as
 *  muted placeholders (the entity's friendly name / its own icon). */
export function calendarOptionsSchema(
  hass: HomeAssistant | undefined,
  item: CalendarItemConfig,
): unknown[] {
  // When this calendar is a virtual group, the "Name" field becomes "Virtual name".
  const nameField = item.virtual
    ? { name: "virtual_name", selector: { text: { placeholder: "Group" } } }
    : { name: "name", selector: { text: { placeholder: calendarEntityName(hass, item.entity) } } };
  return [
    { name: "virtual", selector: { boolean: {} } },
    {
      type: "grid",
      name: "",
      column_min_width: "140px",
      schema: [
        { name: "readonly", selector: { boolean: {} } },
        { name: "show_badge", selector: { boolean: {} } },
      ],
    },
    {
      type: "grid",
      name: "",
      column_min_width: "140px",
      schema: [
        { name: "hide_times", selector: { boolean: {} } },
        { name: "show_birthday_badge", selector: { boolean: {} } },
      ],
    },
    {
      type: "grid",
      name: "",
      column_min_width: "140px",
      schema: [
        nameField,
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
  if ("name" in v) next.name = (v.name as string) || undefined;
  next.virtual = v.virtual === true ? true : undefined;
  if ("virtual_name" in v) next.virtual_name = (v.virtual_name as string) || undefined;
  next.readonly = v.readonly === false ? false : undefined;
  next.show_badge = v.show_badge === false ? false : undefined;
  next.show_birthday_badge = v.show_birthday_badge === false ? false : undefined;
  next.hide_times = v.hide_times === true ? true : undefined;
  const match = matchPerson(hass?.states, next.name || calendarEntityName(hass, cur.entity));
  const explicitPerson = (v.person as string) || cur.person || "";
  // Auto default: Person when one is available, else Icon. Store the chosen source
  // ONLY when it overrides that default (so "Icon" IS persisted when a person matches).
  const autoDefault: CalendarIconSource = explicitPerson || match ? "person" : "icon";
  const chosen = (v.icon_source as CalendarIconSource) ?? cur.icon_source ?? autoDefault;
  next.icon_source = chosen === autoDefault ? undefined : chosen;
  if ("person" in v) {
    const p = (v.person as string) || undefined;
    // Don't persist a person that just equals the auto-match (keeps it dynamic + clean).
    next.person = p && p !== match ? p : undefined;
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
    case "virtual":
      return "Virtual (group calendars)";
    case "virtual_name":
      return "Virtual name";
    case "readonly":
      return "Read-only";
    case "show_badge":
      return "Show badge in header";
    case "show_birthday_badge":
      return "Show birthday badge";
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
    case "virtual":
      return "Group this calendar's events with other calendars under one name, colour, and icon in the header.";
    case "show_badge":
      return "Show this calendar's badge in the header (tap to toggle its events).";
    case "show_birthday_badge":
      return "Show a cake badge on birthday events — all events for calendars named \"birthday\", otherwise events whose title contains \"birthday\".";
    case "hide_times":
      return "Hide event start/end times on this calendar (show them as all-day).";
    case "icon_source":
      return "Badge shows the icon or the linked person's avatar.";
    default:
      return undefined;
  }
}

// --- Virtual group members -------------------------------------------------

/** Calendars that may be joined into `anchor`'s virtual group: from `available`,
 *  excluding the anchor itself, any OTHER virtual anchor, and calendars already grouped
 *  into a different group (prevents nesting / double-membership). */
export function virtualJoinCandidates(
  available: string[],
  anchor: string,
  items: CalendarItemConfig[],
): string[] {
  const anchors = new Set(items.filter((i) => i.virtual).map((i) => i.entity));
  const groupedElsewhere = new Set<string>();
  for (const it of items) {
    if (!it.virtual || it.entity === anchor) continue;
    for (const m of it.virtual_members ?? []) groupedElsewhere.add(m);
  }
  return available.filter(
    (id) => id !== anchor && !anchors.has(id) && !groupedElsewhere.has(id),
  );
}

/** The `virtual_name` (or a fallback) of the group that `entity` is a member of, or "".
 *  Used to tag grouped rows "In <group>". */
export function virtualGroupNameFor(
  hass: HomeAssistant | undefined,
  entity: string,
  items: CalendarItemConfig[],
): string {
  for (const it of items) {
    if (it.virtual && (it.virtual_members ?? []).includes(entity)) {
      return it.virtual_name || it.name || calendarEntityName(hass, it.entity);
    }
  }
  return "";
}

/** A self-contained, reorderable picker for a virtual group's member calendars. Uses
 *  inline styles so it works inside any host (card editor or Settings). */
export function renderVirtualMembers(
  hass: HomeAssistant | undefined,
  members: string[],
  candidateIds: string[],
  onChange: (next: string[]) => void,
): TemplateResult {
  const remaining = candidateIds.filter((id) => !members.includes(id));
  const chip =
    "display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;" +
    "border:1px solid var(--divider-color,rgba(120,120,120,0.22));" +
    "background:var(--secondary-background-color,rgba(0,0,0,0.04));";
  const move = (from: number, to: number): void => {
    const n = [...members];
    n.splice(to, 0, n.splice(from, 1)[0]);
    onChange(n);
  };
  return html`
    <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
      <ha-sortable
        handle-selector=".vc-grip"
        @item-moved=${(e: CustomEvent) => {
          const { oldIndex, newIndex } = e.detail as { oldIndex: number; newIndex: number };
          move(oldIndex, newIndex);
        }}
      >
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${members.map(
            (id, idx) => html`<div style=${chip}>
              <div class="vc-grip" style="display:flex;cursor:grab;color:var(--secondary-text-color);touch-action:none;" title="Drag to reorder">
                <ha-icon icon="mdi:drag"></ha-icon>
              </div>
              <ha-icon icon="mdi:calendar" style="flex:none;color:var(--secondary-text-color);--mdc-icon-size:20px;"></ha-icon>
              <span style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${calendarEntityName(hass, id)}
              </span>
              <ha-icon-button
                label="Remove"
                .path=${"M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"}
                @click=${() => {
                  const n = [...members];
                  n.splice(idx, 1);
                  onChange(n);
                }}
              ></ha-icon-button>
            </div>`,
          )}
        </div>
      </ha-sortable>
      ${members.length === 0
        ? html`<div style="color:var(--secondary-text-color);font-size:0.85rem;">
            No calendars joined yet — add one below.
          </div>`
        : nothing}
      ${remaining.length
        ? html`<ha-entity-picker
            .hass=${hass}
            .value=${""}
            .includeEntities=${remaining}
            allow-custom-entity
            label="Join a calendar"
            @value-changed=${(e: CustomEvent) => {
              const id = e.detail.value as string;
              if (id && !members.includes(id)) onChange([...members, id]);
            }}
          ></ha-entity-picker>`
        : nothing}
    </div>
  `;
}
