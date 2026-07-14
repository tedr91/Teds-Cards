import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { CALENDAR_CARD_EDITOR_TYPE } from "./const";
import type { CalendarCardConfig, CalendarSource } from "./types";

// mdi:calendar — Calendars section header
const CALENDAR_ICON_PATH =
  "M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,12H12V17H17V12Z";
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

@customElement(CALENDAR_CARD_EDITOR_TYPE)
export class TedCalendarCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: CalendarCardConfig;

  public setConfig(config: CalendarCardConfig): void {
    this._config = config;
  }

  /** The configured calendar ids (config mode). */
  private _entities(): string[] {
    return (this._config?.entities ?? []).filter((id): id is string => typeof id === "string");
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
      </div>
    `;
  }

  private _renderEntities(): TemplateResult {
    const entities = this._entities();
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
              ${entities.map((id, idx) => this._renderRow(id, idx))}
            </div>
          </ha-sortable>
          ${entities.length === 0
            ? html`<div class="settings-note">No calendars yet — tap + to add one.</div>`
            : nothing}
        </div>
      </ha-expansion-panel>
    `;
  }

  private _renderRow(id: string, idx: number): TemplateResult {
    return html`
      <div class="row">
        <div class="drag-handle" @click=${this._stop} title="Drag to reorder">
          <ha-svg-icon .path=${GRIP_ICON_PATH}></ha-svg-icon>
        </div>
        <ha-entity-picker
          class="row-picker"
          .hass=${this.hass}
          .value=${id}
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
      case "entities":
        return "Calendars";
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
    const entities = this._entities();
    entities[idx] = ev.detail.value ?? "";
    this._commit({ ...this._config, entities } as CalendarCardConfig);
  }

  private _add = (ev: Event): void => {
    ev.stopPropagation();
    const entities = [...this._entities(), ""];
    this._commit({ ...this._config, entities } as CalendarCardConfig);
  };

  private _remove(idx: number, ev: Event): void {
    ev.stopPropagation();
    const entities = this._entities();
    entities.splice(idx, 1);
    this._commit({ ...this._config, entities } as CalendarCardConfig);
  }

  private _moved = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const entities = this._entities();
    entities.splice(newIndex, 0, entities.splice(oldIndex, 1)[0]);
    this._commit({ ...this._config, entities } as CalendarCardConfig);
  };

  private _commit(raw: CalendarCardConfig): void {
    const config = { ...raw } as CalendarCardConfig;
    if (config.calendar_source === "config") delete config.calendar_source;
    if (config.default_view === "month") delete config.default_view;
    if (config.fill === false) delete config.fill;
    if (config.calendar_source === "settings") delete config.entities;
    this._config = config;
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
  `;
}
