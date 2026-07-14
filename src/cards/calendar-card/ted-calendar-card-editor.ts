import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { CALENDAR_CARD_EDITOR_TYPE } from "./const";
import type {
  CalendarCardConfig,
  CalendarIconSource,
  CalendarItemConfig,
  CalendarSource,
} from "./types";

/** Parse a `#rrggbb` string into an `[r,g,b]` array for HA's color_rgb selector. */
function hexToRgb(hex?: string): [number, number, number] | undefined {
  if (typeof hex !== "string") return undefined;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Convert an `[r,g,b]` array back to a `#rrggbb` string. */
function rgbToHex(rgb: unknown): string | undefined {
  if (!Array.isArray(rgb) || rgb.length < 3) return undefined;
  const h = (v: number): string =>
    Math.max(0, Math.min(255, Math.round(Number(v)))).toString(16).padStart(2, "0");
  return `#${h(rgb[0])}${h(rgb[1])}${h(rgb[2])}`;
}

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
  { value: "person", label: "Person" },
  { value: "icon", label: "Icon" },
];

@customElement(CALENDAR_CARD_EDITOR_TYPE)
export class TedCalendarCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: CalendarCardConfig;

  public setConfig(config: CalendarCardConfig): void {
    this._config = config;
  }

  /** The calendars as item objects (bare id strings normalized to `{entity}`). */
  private _items(): CalendarItemConfig[] {
    return (this._config?.entities ?? []).map((e) =>
      typeof e === "string" ? { entity: e } : { ...e },
    );
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
        ${source === "settings"
          ? html`<div class="settings-note">
              Calendars are chosen per-device in <b>Settings → Calendars</b>. Build the Global
              available list there, then curate each device's subset.
            </div>`
          : this._renderEntities()}
        ${this._renderAppearance()}
      </div>
    `;
  }

  private _renderAppearance(): TemplateResult {
    const cfg = this._config ?? ({} as CalendarCardConfig);
    const showHeader = cfg.show_header !== false;
    const data: Record<string, unknown> = {
      name: cfg.name ?? "",
      show_name: cfg.show_name !== false,
      show_header: showHeader,
      theme: cfg.theme ?? "ha",
      allow_calendar_toggling: cfg.allow_calendar_toggling !== false,
      header_color: hexToRgb(cfg.header_color),
      background_color: hexToRgb(cfg.background_color),
      transparency: cfg.transparency ?? 0,
      blur: cfg.blur ?? 0,
      weather_sensor: cfg.weather_sensor ?? "",
      width: cfg.width,
      height: cfg.height,
    };
    const schema = [
      { name: "name", selector: { text: {} } },
      {
        type: "grid",
        name: "",
        column_min_width: "140px",
        schema: [
          { name: "show_name", selector: { boolean: {} } },
          { name: "show_header", selector: { boolean: {} } },
        ],
      },
      { name: "theme", selector: { select: { mode: "dropdown", options: THEME_OPTIONS } } },
      ...(showHeader ? [{ name: "allow_calendar_toggling", selector: { boolean: {} } }] : []),
      { name: "header_color", selector: { color_rgb: {} } },
      { name: "background_color", selector: { color_rgb: {} } },
      {
        type: "grid",
        name: "",
        column_min_width: "140px",
        schema: [
          { name: "transparency", selector: { number: { min: 0, max: 100, mode: "slider", unit_of_measurement: "%" } } },
          { name: "blur", selector: { number: { min: 0, max: 40, mode: "slider", unit_of_measurement: "px" } } },
        ],
      },
      { name: "weather_sensor", selector: { entity: { domain: "weather" } } },
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
    return html`
      <ha-expansion-panel outlined class="group-panel">
        <div slot="header" class="group-header">
          <ha-svg-icon .path=${PALETTE_ICON_PATH}></ha-svg-icon>
          <span>Appearance</span>
        </div>
        <div class="group-body">
          <ha-form
            .hass=${this.hass}
            .data=${data}
            .schema=${schema}
            .computeLabel=${this._computeLabel}
            .computeHelper=${this._computeHelper}
            @value-changed=${this._appearanceChanged}
          ></ha-form>
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
    const iconSource: CalendarIconSource = item.icon_source ?? "person";
    const optData: Record<string, unknown> = {
      name: item.name ?? "",
      readonly: item.readonly !== false,
      icon_source: iconSource,
      person: item.person ?? "",
      icon: item.icon ?? "",
      color: hexToRgb(item.color),
    };
    const optSchema = [
      { name: "name", selector: { text: {} } },
      {
        type: "grid",
        name: "",
        column_min_width: "140px",
        schema: [
          { name: "readonly", selector: { boolean: {} } },
          { name: "icon_source", selector: { select: { mode: "dropdown", options: ICON_SOURCE_OPTIONS } } },
        ],
      },
      iconSource === "icon"
        ? { name: "icon", selector: { icon: {} } }
        : { name: "person", selector: { entity: { domain: "person" } } },
      { name: "color", selector: { color_rgb: {} } },
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
          <ha-icon-button
            class="warning"
            label="Delete calendar"
            .path=${DELETE_ICON_PATH}
            @click=${(ev: Event) => this._remove(idx, ev)}
          ></ha-icon-button>
        </div>
        ${item.entity
          ? html`<ha-expansion-panel outlined class="opt-panel">
              <span slot="header" class="opt-header">Options</span>
              <div class="opt-body">
                <ha-form
                  .hass=${this.hass}
                  .data=${optData}
                  .schema=${optSchema}
                  .computeLabel=${this._computeLabel}
                  .computeHelper=${this._computeHelper}
                  @value-changed=${(ev: CustomEvent) => this._itemChanged(idx, ev)}
                ></ha-form>
              </div>
            </ha-expansion-panel>`
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
        return "Allow calendar toggling";
      case "header_color":
        return "Header color";
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
        return "Icon source";
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
    const items = this._items();
    items[idx] = { ...items[idx], entity: ev.detail.value ?? "" };
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
    const src = (v.icon_source as CalendarIconSource) ?? cur.icon_source ?? "person";
    next.icon_source = src !== "person" ? src : undefined;
    if ("person" in v) next.person = (v.person as string) || undefined;
    if ("icon" in v) next.icon = (v.icon as string) || undefined;
    next.color = rgbToHex(v.color);
    items[idx] = next;
    this._commitItems(items);
  }

  private _appearanceChanged = (ev: CustomEvent): void => {
    const v = ev.detail.value as Record<string, unknown>;
    const patch = {
      name: (v.name as string) || undefined,
      show_name: v.show_name === false ? false : undefined,
      show_header: v.show_header === false ? false : undefined,
      theme: v.theme && v.theme !== "ha" ? (v.theme as CalendarCardConfig["theme"]) : undefined,
      allow_calendar_toggling: v.allow_calendar_toggling === false ? false : undefined,
      header_color: rgbToHex(v.header_color),
      background_color: rgbToHex(v.background_color),
      transparency: typeof v.transparency === "number" && v.transparency > 0 ? v.transparency : undefined,
      blur: typeof v.blur === "number" && v.blur > 0 ? v.blur : undefined,
      weather_sensor: (v.weather_sensor as string) || undefined,
      width: typeof v.width === "number" ? v.width : undefined,
      height: typeof v.height === "number" ? v.height : undefined,
    };
    this._commit({ ...this._config, ...patch } as CalendarCardConfig);
  };

  private _add = (ev: Event): void => {
    ev.stopPropagation();
    this._commitItems([...this._items(), { entity: "" }]);
  };

  private _remove(idx: number, ev: Event): void {
    ev.stopPropagation();
    const items = this._items();
    items.splice(idx, 1);
    this._commitItems(items);
  }

  private _moved = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const items = this._items();
    items.splice(newIndex, 0, items.splice(oldIndex, 1)[0]);
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
  `;
}
