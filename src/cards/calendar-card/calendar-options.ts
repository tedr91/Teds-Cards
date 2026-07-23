/**
 * Shared per-calendar option form logic — a single source of truth for the
 * calendar item's editable options (name / read-only / badge source / icon /
 * person / color). Used by BOTH the Ted's Calendar card editor and the Ted's
 * Cards Settings card (Calendars tab), so the two stay in sync.
 */
import { html, type TemplateResult } from "lit";
import type { HomeAssistant } from "custom-card-helpers";

import { matchPerson } from "./const";
import type { CalendarIconSource, CalendarItemConfig, HiddenEventField, HiddenEventRule } from "./types";

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
/** The standalone "Virtual" toggle schema (rendered above the linked-calendars UI). */
export function calendarVirtualToggleSchema(): unknown[] {
  return [{ name: "virtual", selector: { boolean: {} } }];
}

/** ha-form schema for a calendar item's per-calendar options (excluding the Virtual
 *  toggle, which is rendered separately so the linked-calendars UI can sit below it).
 *  Defaults are shown as muted placeholders (the entity's friendly name / its own icon). */
export function calendarOptionsSchema(
  hass: HomeAssistant | undefined,
  item: CalendarItemConfig,
): unknown[] {
  // When this calendar is a virtual group, the "Name" field becomes "Virtual name".
  const nameField = item.virtual
    ? { name: "virtual_name", selector: { text: { placeholder: "Group" } } }
    : { name: "name", selector: { text: { placeholder: calendarEntityName(hass, item.entity) } } };
  return [
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
  if ("virtual" in v) next.virtual = v.virtual === true ? true : undefined;
  if ("virtual_name" in v) next.virtual_name = (v.virtual_name as string) || undefined;
  if ("readonly" in v) next.readonly = v.readonly === false ? false : undefined;
  if ("show_badge" in v) next.show_badge = v.show_badge === false ? false : undefined;
  if ("show_birthday_badge" in v)
    next.show_birthday_badge = v.show_birthday_badge === false ? false : undefined;
  if ("hide_times" in v) next.hide_times = v.hide_times === true ? true : undefined;
  if ("icon_source" in v || "person" in v) {
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
  }
  if ("icon" in v) next.icon = (v.icon as string) || undefined;
  if ("color" in v) next.color = (v.color as string) || undefined;
  return next;
}

/** Label for a per-calendar option field. */
export function calendarOptionLabel(name: string): string {
  switch (name) {
    case "name":
      return "Name";
    case "virtual":
      return "Virtual (linked calendars)";
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
      return "Group this calendar's events with other calendars under one name, color, and icon in the header.";
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

/** Reorder a calendar list so each virtual anchor's linked members immediately
 *  follow it (in the anchor's `virtual_members` order). Keeps every other row in
 *  its existing relative position. Used so linked children sit under their parent
 *  and travel with it when the parent is dragged. */
export function reorderVirtualGroups(items: CalendarItemConfig[]): CalendarItemConfig[] {
  const memberOf = new Map<string, CalendarItemConfig>();
  for (const it of items) {
    if (it.virtual && it.entity) {
      for (const m of it.virtual_members ?? []) if (!memberOf.has(m)) memberOf.set(m, it);
    }
  }
  if (memberOf.size === 0) return items;
  const byEntity = new Map<string, CalendarItemConfig>();
  for (const it of items) if (it.entity && !byEntity.has(it.entity)) byEntity.set(it.entity, it);
  const result: CalendarItemConfig[] = [];
  const done = new Set<CalendarItemConfig>();
  for (const it of items) {
    if (done.has(it)) continue;
    if (it.entity && memberOf.has(it.entity)) continue; // emitted right after its anchor
    result.push(it);
    done.add(it);
    if (it.virtual && it.entity) {
      for (const m of it.virtual_members ?? []) {
        const mi = byEntity.get(m);
        if (mi && !done.has(mi)) {
          result.push(mi);
          done.add(mi);
        }
      }
    }
  }
  for (const it of items) if (!done.has(it)) result.push(it), done.add(it);
  return result;
}

/** Same as {@link reorderVirtualGroups} but for a plain ordered id list paired with
 *  a lookup of calendar items (for the Settings global list). */
export function reorderVirtualGroupIds(ids: string[], items: CalendarItemConfig[]): string[] {
  const byEntity = new Map<string, CalendarItemConfig>();
  for (const it of items) if (it.entity) byEntity.set(it.entity, it);
  const memberOf = new Map<string, string>();
  for (const it of items) {
    if (it.virtual && it.entity) {
      for (const m of it.virtual_members ?? []) if (!memberOf.has(m)) memberOf.set(m, it.entity);
    }
  }
  if (memberOf.size === 0) return ids;
  const result: string[] = [];
  const done = new Set<string>();
  for (const id of ids) {
    if (done.has(id) || memberOf.has(id)) continue;
    result.push(id);
    done.add(id);
    const it = byEntity.get(id);
    if (it?.virtual) {
      for (const m of it.virtual_members ?? []) {
        if (ids.includes(m) && !done.has(m)) {
          result.push(m);
          done.add(m);
        }
      }
    }
  }
  for (const id of ids) if (!done.has(id)) result.push(id), done.add(id);
  return result;
}

/** A self-contained "Linked Calendars" block: a heading, a reorderable list of member
 *  chips, and a "+ Link a calendar" button (which opens the host's link chooser). Uses
 *  inline styles so it works inside any host (card editor or Settings). */
export function renderVirtualMembers(
  hass: HomeAssistant | undefined,
  members: string[],
  onChange: (next: string[]) => void,
  onLink: () => void,
): TemplateResult {
  const chip =
    "display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;" +
    "border:1px solid var(--divider-color,rgba(120,120,120,0.22));" +
    "background:var(--secondary-background-color,rgba(0,0,0,0.04));";
  const btn =
    "display:inline-flex;align-items:center;gap:6px;align-self:flex-start;font:inherit;" +
    "font-size:0.85rem;padding:6px 10px;border-radius:8px;cursor:pointer;color:inherit;" +
    "border:1px solid var(--divider-color,rgba(120,120,120,0.22));" +
    "background:var(--secondary-background-color,rgba(0,0,0,0.04));";
  const move = (from: number, to: number): void => {
    const n = [...members];
    n.splice(to, 0, n.splice(from, 1)[0]);
    onChange(n);
  };
  return html`
    <div style="margin:6px 0 2px;">
      <div style="font-size:0.78rem;font-weight:600;color:var(--secondary-text-color);margin-bottom:4px;">
        Linked Calendars
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
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
        <button style=${btn} @click=${onLink}>
          <ha-icon icon="mdi:plus" style="--mdc-icon-size:18px;"></ha-icon><span>Link a calendar</span>
        </button>
      </div>
    </div>
  `;
}

/** A searchable "Link a calendar" chooser modal, rendered as a sibling by the host.
 *  `candidates` are the calendars that may still be linked into the group. */
export function renderVirtualLinkModal(
  hass: HomeAssistant | undefined,
  candidates: string[],
  query: string,
  setQuery: (q: string) => void,
  pick: (id: string) => void,
  close: () => void,
): TemplateResult {
  const q = query.trim().toLowerCase();
  const filtered = candidates.filter(
    (id) => !q || calendarEntityName(hass, id).toLowerCase().includes(q) || id.toLowerCase().includes(q),
  );
  const sheet =
    "width:min(420px,100%);max-height:min(70vh,560px);display:flex;flex-direction:column;box-sizing:border-box;" +
    "background:var(--card-background-color,#fff);color:var(--primary-text-color,#111);" +
    "border:1px solid var(--divider-color,rgba(120,120,120,0.22));border-radius:12px;" +
    "box-shadow:0 12px 40px rgba(0,0,0,0.4);";
  const input =
    "width:100%;box-sizing:border-box;font:inherit;color:var(--primary-text-color,#111);" +
    "background:var(--secondary-background-color,rgba(0,0,0,0.04));" +
    "border:1px solid var(--divider-color,rgba(120,120,120,0.22));border-radius:6px;padding:10px 12px;outline:none;";
  const item =
    "display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;text-align:left;font:inherit;" +
    "padding:8px 10px;border-radius:8px;border:1px solid transparent;background:none;color:inherit;cursor:pointer;";
  return html`
    <div
      style="position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,0.45);"
      @click=${close}
    >
      <div style=${sheet} @click=${(e: Event) => e.stopPropagation()}>
        <div style="font-size:1.05rem;font-weight:600;padding:16px 16px 4px;">Link a calendar</div>
        <div style="padding:8px 16px;">
          <input
            style=${input}
            type="text"
            placeholder="Search calendars…"
            .value=${query}
            @input=${(e: Event) => setQuery((e.target as HTMLInputElement).value)}
          />
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;overflow:auto;padding:4px 12px;">
          ${filtered.length
            ? filtered.map(
                (id) => html`<button
                  style=${item}
                  @click=${() => pick(id)}
                  @mouseover=${(e: Event) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      "var(--secondary-background-color,rgba(0,0,0,0.04))")}
                  @mouseout=${(e: Event) =>
                    ((e.currentTarget as HTMLElement).style.background = "none")}
                >
                  <ha-icon icon="mdi:calendar" style="flex:none;color:var(--secondary-text-color);"></ha-icon>
                  <span style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${calendarEntityName(hass, id)}
                  </span>
                </button>`,
              )
            : html`<div style="padding:16px;text-align:center;color:var(--secondary-text-color);font-size:0.85rem;">
                ${q ? "No calendars match." : "No more calendars to link."}
              </div>`}
        </div>
        <div style="display:flex;justify-content:flex-end;padding:10px 16px 14px;">
          <button
            style="font:inherit;font-size:0.85rem;padding:6px 12px;border-radius:8px;cursor:pointer;border:1px solid var(--divider-color,rgba(120,120,120,0.22));background:var(--secondary-background-color,rgba(0,0,0,0.04));color:inherit;"
            @click=${close}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  `;
}

// --- Hidden events ---------------------------------------------------------

/** The event field a hide rule can match against (shown in the type dropdown). */
export const HIDDEN_EVENT_TYPE_OPTIONS: { value: HiddenEventField; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "description", label: "Description" },
  { value: "location", label: "Location" },
];

const HIDDEN_EVENT_LABELS: Record<HiddenEventField, string> = {
  title: "Title",
  description: "Description",
  location: "Location",
};

/** A collapsible "Hidden Events" section: a header with a "+" (add) and chevron, and a
 *  collapsible entry per rule (type dropdown + match string + delete). Rules OR-combine.
 *  Self-contained + inline-styled (uses native `<details>` so the host needs no expand
 *  state), so it works inside the card editor or Settings. */
export function renderHiddenEvents(
  rules: HiddenEventRule[],
  onChange: (next: HiddenEventRule[]) => void,
): TemplateResult {
  const chip =
    "border:1px solid var(--divider-color,rgba(120,120,120,0.22));border-radius:8px;" +
    "background:var(--secondary-background-color,rgba(0,0,0,0.04));overflow:hidden;";
  const summary =
    "display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;list-style:none;user-select:none;";
  const field =
    "font:inherit;color:var(--primary-text-color,#111);background:var(--card-background-color,#fff);" +
    "border:1px solid var(--divider-color,rgba(120,120,120,0.22));border-radius:6px;padding:8px;outline:none;";
  const setRule = (idx: number, patch: Partial<HiddenEventRule>): void =>
    onChange(rules.map((r, j) => (j === idx ? { ...r, ...patch } : r)));
  const move = (from: number, to: number): void => {
    const n = [...rules];
    n.splice(to, 0, n.splice(from, 1)[0]);
    onChange(n);
  };
  const summaryLabel = (r: HiddenEventRule): string => {
    const v = (r.value ?? "").trim();
    return v ? `${HIDDEN_EVENT_LABELS[r.type] ?? "Title"} contains “${v}”` : "New hidden-events rule";
  };
  return html`
    <style>
      .ted-hidden-events summary::-webkit-details-marker {
        display: none;
      }
      .ted-hidden-events .chev {
        transition: transform 0.15s ease;
        color: var(--secondary-text-color);
      }
      .ted-hidden-events details[open] > summary .chev {
        transform: rotate(180deg);
      }
    </style>
    <div class="ted-hidden-events" style="margin:8px 0 2px;">
      <details style=${chip}>
        <summary style=${summary}>
          <ha-icon
            icon="mdi:hide-outline"
            style="flex:none;color:var(--primary-text-color);--mdc-icon-size:20px;"
          ></ha-icon>
          <span style="flex:1 1 auto;font-size:0.95rem;font-weight:700;color:var(--primary-text-color);">
            Hidden Events
          </span>
          <ha-icon-button
            label="Add hidden-events rule"
            .path=${"M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"}
            @click=${(e: Event) => {
              e.preventDefault();
              e.stopPropagation();
              onChange([...rules, { type: "title", value: "" }]);
            }}
          ></ha-icon-button>
          <ha-icon class="chev" icon="mdi:chevron-down" style="--mdc-icon-size:22px;"></ha-icon>
        </summary>
        <div style="display:flex;flex-direction:column;gap:6px;padding:0 10px 10px;">
          ${rules.length
            ? html`<ha-sortable
                handle-selector=".he-grip"
                @item-moved=${(e: CustomEvent) => {
                  const { oldIndex, newIndex } = e.detail as { oldIndex: number; newIndex: number };
                  move(oldIndex, newIndex);
                }}
              >
                <div style="display:flex;flex-direction:column;gap:6px;">
                  ${rules.map(
                    (r, idx) => html`<details style=${chip}>
                      <summary style=${summary}>
                        <div
                          class="he-grip"
                          style="display:flex;cursor:grab;color:var(--secondary-text-color);touch-action:none;"
                          title="Drag to reorder"
                          @click=${(e: Event) => e.stopPropagation()}
                        >
                          <ha-icon icon="mdi:drag"></ha-icon>
                        </div>
                        <span style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.85rem;">
                          ${summaryLabel(r)}
                        </span>
                        <ha-icon class="chev" icon="mdi:chevron-down" style="--mdc-icon-size:22px;"></ha-icon>
                        <ha-icon-button
                          label="Delete rule"
                          .path=${"M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z"}
                          @click=${(e: Event) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onChange(rules.filter((_, j) => j !== idx));
                          }}
                        ></ha-icon-button>
                      </summary>
                      <div style="display:flex;flex-direction:column;gap:8px;padding:0 10px 10px;">
                        <label style="display:flex;flex-direction:column;gap:4px;font-size:0.78rem;color:var(--secondary-text-color);">
                          Type
                          <select
                            style=${field}
                            .value=${r.type ?? "title"}
                            @change=${(e: Event) =>
                              setRule(idx, { type: (e.target as HTMLSelectElement).value as HiddenEventField })}
                          >
                            ${HIDDEN_EVENT_TYPE_OPTIONS.map(
                              (o) => html`<option value=${o.value} ?selected=${(r.type ?? "title") === o.value}>
                                ${o.label}
                              </option>`,
                            )}
                          </select>
                        </label>
                        <label style="display:flex;flex-direction:column;gap:4px;font-size:0.78rem;color:var(--secondary-text-color);">
                          Contains
                          <input
                            style=${field}
                            type="text"
                            placeholder="Text to match"
                            .value=${r.value ?? ""}
                            @input=${(e: Event) => setRule(idx, { value: (e.target as HTMLInputElement).value })}
                          />
                        </label>
                      </div>
                    </details>`,
                  )}
                </div>
              </ha-sortable>`
            : html`<div style="font-size:0.8rem;color:var(--secondary-text-color);padding:2px 2px 4px;">
                No hidden-events rules. Use “+” to add one.
              </div>`}
        </div>
      </details>
    </div>
  `;
}

