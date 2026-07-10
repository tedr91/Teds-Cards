import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { CLIMATE_CARD_EDITOR_TYPE } from "./const";
import type { ClimateCardConfig, ClimateItemConfig, ClimateLayout } from "./types";

// mdi:thermostat — Thermostats section
const THERMOSTAT_ICON_PATH =
  "M16.95,16.95C18.58,15.32 19.5,13.11 19.5,10.8C19.5,8.5 18.58,6.28 16.95,4.66C15.33,3.03 13.11,2.11 10.81,2.11C8.5,2.11 6.28,3.03 4.66,4.66L6.07,6.07C7.32,4.81 9.03,4.11 10.81,4.11C12.58,4.11 14.29,4.81 15.54,6.07C16.8,7.32 17.5,9.03 17.5,10.8C17.5,12.58 16.8,14.29 15.54,15.54L16.95,16.95M12,8A2,2 0 0,0 10,10C10,10.74 10.4,11.38 11,11.72V22H13V11.72C13.6,11.38 14,10.74 14,10A2,2 0 0,0 12,8Z";
// mdi:drag — reorder handle
const GRIP_ICON_PATH =
  "M7,19V17H9V19H7M11,19V17H13V19H11M15,19V17H17V19H15M7,15V13H9V15H7M11,15V13H13V15H11M15,15V13H17V15H15M7,11V9H9V11H7M11,11V9H13V11H11M15,11V9H17V11H15M7,7V5H9V7H7M11,7V5H13V7H11M15,7V5H17V7H15Z";
// mdi:delete
const DELETE_ICON_PATH = "M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z";
// mdi:plus
const PLUS_ICON_PATH = "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z";

const SOURCE_OPTIONS = [
  { value: "config", label: "This card (choose below)" },
  { value: "settings", label: "This device's Settings list" },
];

const LAYOUT_OPTIONS = [
  { value: "auto", label: "Auto grid" },
  { value: "tabbed", label: "Tabbed" },
  { value: "vertical", label: "Vertical stack" },
  { value: "horizontal", label: "Horizontal stack" },
];

@customElement(CLIMATE_CARD_EDITOR_TYPE)
export class TedClimateCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: ClimateCardConfig;

  public setConfig(config: ClimateCardConfig): void {
    this._config = config;
  }

  private _entities(): ClimateItemConfig[] {
    return (this._config?.entities ?? []).map((e) =>
      typeof e === "string" ? { entity: e } : { ...e },
    );
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const source = this._config.climate_source ?? "config";
    const layout: ClimateLayout = this._config.layout ?? "auto";
    const topData = {
      climate_source: source,
      layout,
      show_current_as_primary: this._config.show_current_as_primary !== false,
      fill: this._config.fill ?? false,
    };
    const topSchema = [
      { name: "climate_source", selector: { select: { mode: "dropdown", options: SOURCE_OPTIONS } } },
      { name: "layout", selector: { select: { mode: "dropdown", options: LAYOUT_OPTIONS } } },
      {
        type: "grid",
        name: "",
        column_min_width: "100px",
        schema: [
          { name: "show_current_as_primary", selector: { boolean: {} } },
          { name: "fill", selector: { boolean: {} } },
        ],
      },
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
              Thermostats are chosen per-device in <b>Settings → Temperatures</b>. Global lists the
              available thermostats; each device curates its own subset.
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
          <ha-svg-icon .path=${THERMOSTAT_ICON_PATH}></ha-svg-icon>
          <span>Thermostats</span>
          <div class="group-actions" @click=${this._stop}>
            <ha-icon-button
              label="Add thermostat"
              .path=${PLUS_ICON_PATH}
              @click=${this._add}
            ></ha-icon-button>
          </div>
        </div>
        <div class="group-body">
          <ha-sortable handle-selector=".drag-handle" @item-moved=${this._moved}>
            <div class="row-list">
              ${entities.map((item, idx) => this._renderRow(item, idx))}
            </div>
          </ha-sortable>
          ${entities.length === 0
            ? html`<div class="settings-note">No thermostats yet — tap + to add one.</div>`
            : nothing}
        </div>
      </ha-expansion-panel>
    `;
  }

  private _renderRow(item: ClimateItemConfig, idx: number): TemplateResult {
    return html`
      <div class="row">
        <div class="drag-handle" @click=${this._stop} title="Drag to reorder">
          <ha-svg-icon .path=${GRIP_ICON_PATH}></ha-svg-icon>
        </div>
        <ha-entity-picker
          class="row-picker"
          .hass=${this.hass}
          .value=${item.entity ?? ""}
          .includeDomains=${["climate"]}
          allow-custom-entity
          @value-changed=${(ev: CustomEvent) => this._entityChanged(idx, ev)}
        ></ha-entity-picker>
        <ha-icon-button
          class="warning"
          label="Delete thermostat"
          .path=${DELETE_ICON_PATH}
          @click=${(ev: Event) => this._remove(idx, ev)}
        ></ha-icon-button>
      </div>
    `;
  }

  private _computeHelper = (schema: { name: string }): string | undefined => {
    if (schema.name === "climate_source") {
      return "\"This device's Settings list\" shows the per-device Temperatures list from Ted's Cards Settings.";
    }
    if (schema.name === "fill") {
      return "Fill the parent container (e.g. a dashboard view area) instead of sizing to content.";
    }
    if (schema.name === "show_current_as_primary") {
      return "Show the current temperature as the big number on each thermostat.";
    }
    return undefined;
  };

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "climate_source":
        return "Thermostat source";
      case "layout":
        return "Layout";
      case "show_current_as_primary":
        return "Current temp as primary";
      case "fill":
        return "Fill available space";
      default:
        return schema.name;
    }
  };

  private _stop = (ev: Event): void => {
    ev.stopPropagation();
  };

  private _valueChanged = (ev: CustomEvent): void => {
    this._commit({ ...this._config, ...ev.detail.value } as ClimateCardConfig);
  };

  private _entityChanged(idx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const entities = this._entities();
    entities[idx] = { entity: ev.detail.value ?? "" };
    this._commit({ ...this._config, entities } as ClimateCardConfig);
  }

  private _add = (ev: Event): void => {
    ev.stopPropagation();
    const entities = [...this._entities(), { entity: "" }];
    this._commit({ ...this._config, entities } as ClimateCardConfig);
  };

  private _remove(idx: number, ev: Event): void {
    ev.stopPropagation();
    const entities = this._entities();
    entities.splice(idx, 1);
    this._commit({ ...this._config, entities } as ClimateCardConfig);
  }

  private _moved = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const entities = this._entities();
    entities.splice(newIndex, 0, entities.splice(oldIndex, 1)[0]);
    this._commit({ ...this._config, entities } as ClimateCardConfig);
  };

  private _commit(raw: ClimateCardConfig): void {
    const config = { ...raw } as ClimateCardConfig;
    if (config.climate_source === "config") delete config.climate_source;
    if (config.layout === "auto") delete config.layout;
    if (config.show_current_as_primary !== false) delete config.show_current_as_primary;
    if (config.fill === false) delete config.fill;
    if (config.climate_source === "settings") delete config.entities;
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
      color: var(--secondary-text-color);
      line-height: 1.4;
    }
  `;
}
