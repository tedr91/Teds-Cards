import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { CALENDAR_CARD_EDITOR_TYPE, matchPerson } from "./const";
import { transparencyBlurSchema } from "../../shared/appearance";
import type {
  CalendarCardConfig,
  CalendarIconSource,
  CalendarItemConfig,
  CalendarSource,
} from "./types";

// mdi:calendar — Calendars section header
const CALENDAR_ICON_PATH =
  "M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,12H12V17H17V12Z";
// mdi:palette — Appearance section header
const PALETTE_ICON_PATH =
  "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";
// mdi:drag — reorder handle
const GRIP_ICON_PATH =
  "M7,19V17H9V19H7M11,19V17H13V19H11M15,19V17H17V19H15M7,15V13H9V15H7M11,15V13H13V15H11M15,15V13H17V15H15M7,11V9H9V11H7M11,11V9H13V11H11M15,11V9H17V11H15M7,7V5H9V7H7M11,7V5H13V7H11M15,7V5H17V7H15Z";
// mdi:delete
const DELETE_ICON_PATH = "M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z";
// mdi:plus
const PLUS_ICON_PATH = "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z";
// mdi:chevron-down / mdi:chevron-up — the in-row Options disclosure
const CHEVRON_DOWN_PATH = "M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z";
const CHEVRON_UP_PATH = "M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z";

const SOURCE_OPTIONS = [
  { value: "config", label: "This card (choose below)" },
  { value: "settings", label: "This device's Settings calendars" },
];

const VIEW_OPTIONS = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "schedule", label: "Schedule" },
  { value: "agenda", label: "Agenda" },
];

const THEME_OPTIONS = [
  { value: "ha", label: "Home Assistant Theme" },
  { value: "ted-style", label: "Ted's Theme" },
];

const ICON_SOURCE_OPTIONS = [
  { value: "icon", label: "Icon" },
  { value: "person", label: "Person" },
];

@customElement(CALENDAR_CARD_EDITOR_TYPE)
export class TedCalendarCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: CalendarCardConfig;
  /** Which calendar rows have their Options disclosure open (by index). */
  @state() private _openRows = new Set<number>();

  private _toggleRow(idx: number): void {
    const next = new Set(this._openRows);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    this._openRows = next;
  }

  public setConfig(config: CalendarCardConfig): void {
    this._config = config;
  }

  /** The calendars as item objects (bare id strings normalized to `{entity}`). */
  private _items(): CalendarItemConfig[] {
    return (this._config?.entities ?? []).map((e) =>
      typeof e === "string" ? { entity: e } : { ...e },
    );
  }

  /** Friendly name of an entity (the default a field falls back to), else the id. */
  private _entityName(id?: string): string {
    if (!id) return "";
    const fn = this.hass?.states[id]?.attributes?.friendly_name;
    return typeof fn === "string" && fn ? fn : id;
  }

  /** Commit an items array, collapsing option-less items back to bare id strings. */
  private _commitItems(items: CalendarItemConfig[]): void {
    const entities = items.map((it) => {
      const hasOpts = Object.entries(it).some(
        ([k, v]) => k !== "entity" && v !== undefined && v !== "",
      );
      return hasOpts ? it : it.entity;
    });
    this._commit({ ...this._config, entities } as CalendarCardConfig);
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const source: CalendarSource = this._config.calendar_source ?? "config";
    const topData = {
      calendar_source: source,
      default_view: this._config.default_view ?? "month",
      fill: this._config.fill ?? false,
    };
    const topSchema = [
      { name: "calendar_source", selector: { select: { mode: "dropdown", options: SOURCE_OPTIONS } } },
      { name: "default_view", selector: { select: { mode: "dropdown", options: VIEW_OPTIONS } } },
      { name: "fill", selector: { boolean: {} } },
    ];

    return html`
      <div class="editor">
        <ha-form
          .hass=${this.hass}
          .data=${topData}
          .schema=${topSchema}
          .computeLabel=${this._computeLabel}
          .computeHelper=${this._computeHelper}
          @value-changed=${this._valueChanged}
        ></ha-form>
        ${this._renderAppearance()}
        ${source === "settings"
          ? html`<div class="settings-note">
              Calendars are chosen per-device in <b>Settings → Calendars</b>. Build the Global
              available list there, then curate each device's subset.
            </div>`
          : this._renderEntities()}
      </div>
    `;
  }

  private _renderAppearance(): TemplateResult {
    const cfg = this._config ?? ({} as CalendarCardConfig);
    const showHeader = cfg.show_header !== false;

    const themeData = { theme: cfg.theme ?? "ha" };
    const themeSchema = [
      { name: "theme", selector: { select: { mode: "dropdown", options: THEME_OPTIONS } } },
    ];

    const headerData = {
      show_header: showHeader,
      header_color: cfg.header_color ?? "",
      header_transparency: cfg.header_transparency,
      show_name: cfg.show_name !== false,
      name: cfg.name ?? "",
      allow_calendar_toggling: cfg.allow_calendar_toggling !== false,
    };
    const headerSchema = [
      {
        type: "grid",
        name: "",
        column_min_width: "140px",
        schema: [
          { name: "show_header", selector: { boolean: {} } },
          { name: "header_color", selector: { ui_color: {} } },
        ],
      },
      { name: "header_transparency", selector: { number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } } },
      {
        type: "grid",
        name: "",
        column_min_width: "140px",
        schema: [
          { name: "show_name", selector: { boolean: {} } },
          { name: "name", selector: { text: { placeholder: "Family Calendar" } } },
        ],
      },
      { name: "allow_calendar_toggling", selector: { boolean: {} } },
    ];

    const weatherData = { weather_sensor: cfg.weather_sensor ?? "" };
    const weatherSchema = [{ name: "weather_sensor", selector: { entity: { domain: "weather" } } }];

    const advData = {
      background_color: cfg.background_color ?? "",
      transparency: cfg.transparency,
      blur: cfg.blur,
      width: cfg.width,
      height: cfg.height,
    };
    const advSchema = [
      { name: "background_color", selector: { ui_color: {} } },
      transparencyBlurSchema(cfg.transparency),
      {
        type: "grid",
        name: "",
        column_min_width: "140px",
        schema: [
          { name: "width", selector: { number: { min: 0, mode: "box", unit_of_measurement: "px" } } },
          { name: "height", selector: { number: { min: 0, mode: "box", unit_of_measurement: "px" } } },
        ],
      },
    ];

    const form = (data: unknown, schema: unknown): TemplateResult => html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${schema}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._appearanceChanged}
      ></ha-form>
    `;

    return html`
      <ha-expansion-panel outlined class="group-panel">
        <div slot="header" class="group-header">
          <ha-svg-icon .path=${PALETTE_ICON_PATH}></ha-svg-icon>
          <span>Appearance</span>
        </div>
        <div class="group-body">
          ${form(themeData, themeSchema)}
          <ha-expansion-panel outlined class="sub-panel">
            <span slot="header" class="sub-head">Header</span>
            <div class="sub-body">${form(headerData, headerSchema)}</div>
          </ha-expansion-panel>
          ${form(weatherData, weatherSchema)}
          <ha-expansion-panel outlined class="sub-panel">
            <span slot="header" class="sub-head">Advanced Visuals</span>
            <div class="sub-body">${form(advData, advSchema)}</div>
          </ha-expansion-panel>
        </div>
      </ha-expansion-panel>
    `;
  }

  private _renderEntities(): TemplateResult {
    const items = this._items();
    return html`
      <ha-expansion-panel outlined class="group-panel" .expanded=${true}>
        <div slot="header" class="group-header">
          <ha-svg-icon .path=${CALENDAR_ICON_PATH}></ha-svg-icon>
          <span>Calendars</span>
          <div class="group-actions" @click=${this._stop}>
            <ha-icon-button
              label="Add calendar"
              .path=${PLUS_ICON_PATH}
              @click=${this._add}
            ></ha-icon-button>
          </div>
        </div>
        <div class="group-body">
          <ha-sortable handle-selector=".drag-handle" @item-moved=${this._moved}>
            <div class="row-list">
              ${items.map((item, idx) => this._renderRow(item, idx))}
            </div>
          </ha-sortable>
          ${items.length === 0
            ? html`<div class="settings-note">No calendars yet — tap + to add one.</div>`
            : nothing}
        </div>
      </ha-expansion-panel>
    `;
  }

  private _renderRow(item: CalendarItemConfig, idx: number): TemplateResult {
    // Show the effective person in the field — the explicit one, or the auto-matched
    // one (unless the badge source is explicitly Icon).
    const autoPerson =
      item.icon_source === "icon" ? "" : (matchPerson(this.hass?.states, item.name || this._entityName(item.entity)) ?? "");
    const optData: Record<string, unknown> = {
      name: item.name ?? "",
      readonly: item.readonly !== false,
      icon: item.icon ?? "",
      person: item.person ?? autoPerson,
      icon_source: item.icon_source ?? "icon",
      color: item.color ?? "",
    };
    const optSchema = [
      { name: "readonly", selector: { boolean: {} } },
      {
        type: "grid",
        name: "",
        column_min_width: "140px",
        schema: [
          { name: "name", selector: { text: { placeholder: this._entityName(item.entity) } } },
          { name: "icon_source", selector: { select: { mode: "dropdown", options: ICON_SOURCE_OPTIONS } } },
        ],
      },
      {
        name: "icon",
        selector: {
          icon: { placeholder: this.hass?.states[item.entity]?.attributes?.icon || "mdi:calendar" },
        },
      },
      { name: "person", selector: { entity: { domain: "person" } } },
      { name: "color", selector: { ui_color: {} } },
    ];
    return html`
      <div class="cal">
        <div class="row">
          <div class="drag-handle" @click=${this._stop} title="Drag to reorder">
            <ha-svg-icon .path=${GRIP_ICON_PATH}></ha-svg-icon>
          </div>
          <ha-entity-picker
            class="row-picker"
            .hass=${this.hass}
            .value=${item.entity}
            .includeDomains=${["calendar"]}
            allow-custom-entity
            @value-changed=${(ev: CustomEvent) => this._entityChanged(idx, ev)}
          ></ha-entity-picker>
          ${item.entity
            ? html`<ha-icon-button
                class="opt-toggle"
                label="Options"
                title="Options"
                .path=${this._openRows.has(idx) ? CHEVRON_UP_PATH : CHEVRON_DOWN_PATH}
                @click=${() => this._toggleRow(idx)}
              ></ha-icon-button>`
            : nothing}
          <ha-icon-button
            class="warning"
            label="Delete calendar"
            .path=${DELETE_ICON_PATH}
            @click=${(ev: Event) => this._remove(idx, ev)}
          ></ha-icon-button>
        </div>
        ${item.entity && this._openRows.has(idx)
          ? html`<div class="opt-body">
              <ha-form
                .hass=${this.hass}
                .data=${optData}
                .schema=${optSchema}
                .computeLabel=${this._computeLabel}
                .computeHelper=${this._computeHelper}
                @value-changed=${(ev: CustomEvent) => this._itemChanged(idx, ev)}
              ></ha-form>
            </div>`
          : nothing}
      </div>
    `;
  }

  private _computeHelper = (schema: { name: string }): string | undefined => {
    if (schema.name === "calendar_source") {
      return "\"This card\" picks the calendars below. \"Settings calendars\" uses the per-device Calendars list.";
    }
    if (schema.name === "default_view") {
      return "The Daylight Calendar view the card opens on.";
    }
    if (schema.name === "fill") {
      return "Fill the parent container (e.g. a dashboard view area) instead of sizing to content.";
    }
    if (schema.name === "width" || schema.name === "height") {
      return "Only used when the card isn't a direct item in a grid (Sections) view.";
    }
    if (schema.name === "readonly") {
      return "Prevent editing events on this calendar.";
    }
    if (schema.name === "transparency") {
      return "How see-through the card background is (0 = solid).";
    }
    if (schema.name === "allow_calendar_toggling") {
      return "Show the calendar badge row you can tap to toggle each calendar's visibility.";
    }
    if (schema.name === "header_transparency") {
      return "How see-through the header is (0 = solid). Empty follows the theme (Ted's Theme = translucent). A background blur frosts it too.";
    }
    if (schema.name === "icon_source") {
      return "Badge shows the icon or the linked person's avatar.";
    }
    return undefined;
  };

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "calendar_source":
        return "Calendar source";
      case "default_view":
        return "Default view";
      case "fill":
        return "Fill available space";
      case "name":
        return "Name";
      case "show_name":
        return "Show name";
      case "show_header":
        return "Show header";
      case "theme":
        return "Theme styling";
      case "allow_calendar_toggling":
        return "Show calendar badges";
      case "header_color":
        return "Header color";
      case "header_transparency":
        return "Header transparency";
      case "background_color":
        return "Background color";
      case "transparency":
        return "Transparency";
      case "blur":
        return "Background blur";
      case "weather_sensor":
        return "Weather sensor";
      case "width":
        return "Width";
      case "height":
        return "Height";
      case "readonly":
        return "Read-only";
      case "icon_source":
        return "Badge source";
      case "person":
        return "Person";
      case "icon":
        return "Icon";
      case "color":
        return "Color";
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    this._commit({ ...this._config, ...ev.detail.value } as CalendarCardConfig);
  };

  private _stop = (ev: Event): void => {
    ev.stopPropagation();
  };

  private _entityChanged(idx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const entity = (ev.detail.value as string) ?? "";
    const items = this._items();
    const cur = items[idx] ?? { entity: "" };
    const next: CalendarItemConfig = { ...cur, entity };
    // On (initial) selection, default the Badge source to Person when a person
    // matches the calendar's name — person takes priority when first added.
    if (entity && next.icon_source === undefined) {
      const calName = next.name || this._entityName(entity);
      if (matchPerson(this.hass?.states, calName)) next.icon_source = "person";
    }
    items[idx] = next;
    this._commitItems(items);
  }

  private _itemChanged(idx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const v = ev.detail.value as Record<string, unknown>;
    const items = this._items();
    const cur = items[idx] ?? { entity: "" };
    const next: CalendarItemConfig = { ...cur };
    next.name = (v.name as string) || undefined;
    next.readonly = v.readonly === false ? false : undefined;
    const src = (v.icon_source as CalendarIconSource) ?? cur.icon_source ?? "icon";
    next.icon_source = src !== "icon" ? src : undefined;
    if ("person" in v) {
      const p = (v.person as string) || undefined;
      // Don't persist a person that just equals the auto-match (keeps it dynamic + config clean).
      const auto = matchPerson(this.hass?.states, next.name || this._entityName(cur.entity));
      next.person = p && p !== auto ? p : undefined;
    }
    if ("icon" in v) next.icon = (v.icon as string) || undefined;
    next.color = (v.color as string) || undefined;
    items[idx] = next;
    this._commitItems(items);
  }

  private _appearanceChanged = (ev: CustomEvent): void => {
    const v = ev.detail.value as Record<string, unknown>;
    const patch: Record<string, unknown> = { ...this._config };
    if ("name" in v) patch.name = (v.name as string) || undefined;
    if ("show_name" in v) patch.show_name = v.show_name === false ? false : undefined;
    if ("show_header" in v) patch.show_header = v.show_header === false ? false : undefined;
    if ("theme" in v) patch.theme = v.theme && v.theme !== "ha" ? v.theme : undefined;
    if ("allow_calendar_toggling" in v)
      patch.allow_calendar_toggling = v.allow_calendar_toggling === false ? false : undefined;
    if ("header_color" in v) patch.header_color = (v.header_color as string) || undefined;
    if ("header_transparency" in v)
      patch.header_transparency =
        typeof v.header_transparency === "number" && v.header_transparency > 0
          ? v.header_transparency
          : undefined;
    if ("background_color" in v) patch.background_color = (v.background_color as string) || undefined;
    if ("transparency" in v)
      patch.transparency = typeof v.transparency === "number" && v.transparency > 0 ? v.transparency : undefined;
    if ("blur" in v) patch.blur = typeof v.blur === "number" && v.blur > 0 ? v.blur : undefined;
    if ("weather_sensor" in v) patch.weather_sensor = (v.weather_sensor as string) || undefined;
    if ("width" in v) patch.width = typeof v.width === "number" ? v.width : undefined;
    if ("height" in v) patch.height = typeof v.height === "number" ? v.height : undefined;
    this._commit(patch as CalendarCardConfig);
  };

  private _add = (ev: Event): void => {
    ev.stopPropagation();
    this._commitItems([...this._items(), { entity: "" }]);
  };

  private _remove(idx: number, ev: Event): void {
    ev.stopPropagation();
    const items = this._items();
    items.splice(idx, 1);
    this._openRows = new Set();
    this._commitItems(items);
  }

  private _moved = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const items = this._items();
    items.splice(newIndex, 0, items.splice(oldIndex, 1)[0]);
    this._openRows = new Set();
    this._commitItems(items);
  };

  private _commit(raw: CalendarCardConfig): void {
    const config = { ...raw } as Record<string, unknown>;
    for (const k of Object.keys(config)) {
      if (config[k] === undefined) delete config[k];
    }
    if (config.calendar_source === "config") delete config.calendar_source;
    if (config.default_view === "month") delete config.default_view;
    if (config.fill === false) delete config.fill;
    if (config.calendar_source === "settings") delete config.entities;
    this._config = config as CalendarCardConfig;
    fireEvent(this, "config-changed", { config });
  }

  static styles = css`
    :host {
      display: block;
    }
    .editor {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .group-panel {
      --expansion-panel-content-padding: 0;
      border-radius: 6px;
    }
    .group-header {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      font-weight: 500;
    }
    .group-header > span {
      flex: 1 1 auto;
    }
    .group-header ha-svg-icon {
      color: var(--secondary-text-color);
    }
    .group-actions ha-icon-button {
      --mdc-icon-button-size: 36px;
      --mdc-icon-size: 22px;
      color: var(--primary-text-color);
    }
    .group-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 16px 16px;
    }
    .row-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .row-picker {
      flex: 1 1 auto;
    }
    .drag-handle {
      cursor: grab;
      color: var(--secondary-text-color);
      display: flex;
      align-items: center;
    }
    .warning {
      color: var(--error-color);
    }
    .settings-note {
      font-size: 0.9rem;
      line-height: 1.4;
      color: var(--secondary-text-color);
    }
    .cal {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .opt-panel {
      --expansion-panel-content-padding: 0;
      margin-left: 28px;
    }
    .opt-header {
      font-size: 0.85rem;
      color: var(--secondary-text-color);
    }
    .opt-body {
      padding: 8px 12px 12px;
    }
    .opt-toggle {
      color: var(--secondary-text-color);
      flex: none;
    }
    .sub-panel {
      --expansion-panel-content-padding: 0;
      margin-top: 6px;
    }
    .sub-head {
      font-weight: 500;
      font-size: 0.9rem;
    }
    .sub-body {
      padding: 8px 12px 12px;
    }
  `;
}
