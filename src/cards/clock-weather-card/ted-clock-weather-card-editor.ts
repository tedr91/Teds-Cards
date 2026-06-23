import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { CLOCK_WEATHER_CARD_EDITOR_TYPE } from "./const";
import type { ClockWeatherCardConfig } from "./types";

// mdi:palette — Visuals (General) section
const VISUAL_ICON_PATH =
  "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";
// mdi:clock-outline — Clock Settings section
const CLOCK_ICON_PATH =
  "M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12.5,7H11V13L15.75,15.85L16.5,14.62L12.5,12.25V7Z";
// mdi:calendar — Date Settings section
const DATE_ICON_PATH =
  "M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,12H12V17H17V12Z";
// mdi:weather-partly-cloudy — Weather Settings section
const WEATHER_ICON_PATH =
  "M12.74,5.47C15.1,6.5 16.35,9.03 15.92,11.46C17.19,12.56 18,14.19 18,16V16.17C18.31,16.06 18.65,16 19,16A3,3 0 0,1 22,19A3,3 0 0,1 19,22H6A4,4 0 0,1 2,18A4,4 0 0,1 6,14H6.27C5,12.45 4.6,10.24 5.5,8.26C6.72,5.5 9.97,4.24 12.74,5.47M11.93,7.3C10.16,6.5 8.09,7.31 7.31,9.07C6.85,10.09 6.93,11.22 7.41,12.13C8.5,10.83 10.16,10 12,10C12.7,10 13.38,10.12 14,10.34C13.94,9.06 13.18,7.86 11.93,7.3M13.55,3.64C13,3.4 12.45,3.23 11.88,3.12L14.37,1.82L15.27,4.71C14.76,4.25 14.19,3.89 13.55,3.64M6.09,4.44C5.6,4.79 5.17,5.19 4.8,5.63L4.91,2.82L7.87,3.5C7.25,3.71 6.65,4.03 6.09,4.44M18,9.71C17.91,9.12 17.78,8.55 17.59,8L19.97,9.5L17.92,11.74C18.05,11.08 18.08,10.4 18,9.71M3.04,11.3C3.11,11.9 3.24,12.47 3.43,13L1.06,11.5L3.1,9.26C2.97,9.92 2.94,10.61 3.04,11.3Z";
// mdi:cursor-move — Layout section
const LAYOUT_ICON_PATH =
  "M13,6V11H18V7.75L22.25,12L18,16.25V13H13V18H16.25L12,22.25L7.75,18H11V13H6V16.25L1.75,12L6,7.75V11H11V6H7.75L12,1.75L16.25,6H13Z";

@customElement(CLOCK_WEATHER_CARD_EDITOR_TYPE)
export class TedClockWeatherCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: ClockWeatherCardConfig;

  public setConfig(config: ClockWeatherCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;

    const data = { ...this._defaults(), ...this._config };

    return html`
      <ha-expansion-panel outlined .leftChevron=${true}>
        <ha-svg-icon slot="leading-icon" .path=${VISUAL_ICON_PATH}></ha-svg-icon>
        <span slot="header">Appearance (general)</span>
        <div class="appearance-content">
          <ha-form
            .hass=${this.hass}
            .data=${data}
            .schema=${this._appearanceFields()}
            .computeLabel=${this._computeLabel}
            @value-changed=${this._valueChanged}
          ></ha-form>
          ${this._renderLayout(data)}
        </div>
      </ha-expansion-panel>
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${this._settingsSchema()}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _defaults(): Partial<ClockWeatherCardConfig> {
    const weatherEntity = this.hass
      ? Object.keys(this.hass.states).find((id) => id.startsWith("weather."))
      : undefined;
    return {
      theme: "ted-style",
      force_transparent: true,
      brushed: false,
      show_clock: true,
      clock_size: "large",
      clock_size_custom: 100,
      clock_offset: 0,
      time_format: "auto",
      time_format_custom: "H:MM",
      show_date: true,
      date_size: "standard",
      date_size_custom: 100,
      date_format: "standard",
      date_format_custom: "dddd, MMMM D",
      date_below_clock: false,
      date_offset: 100,
      show_weather: true,
      weather_size: "standard",
      weather_size_custom: 100,
      show_weather_icon: false,
      show_current_temp: true,
      weather_above_clock: false,
      weather_offset: 100,
      icon_style: "fancy",
      weather_entity: weatherEntity,
    };
  }

  private _scaleSelector() {
    return { number: { min: 10, max: 400, step: 5, mode: "box", unit_of_measurement: "%" } };
  }

  private _appearanceFields() {
    const cfg = this._config ?? ({} as ClockWeatherCardConfig);

    return [
      {
        name: "theme",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "ted-style", label: "Ted's Style (default)" },
              { value: "ha", label: "Home Assistant theme" },
            ],
          },
        },
      },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "force_transparent", selector: { boolean: {} } },
          {
            name: "background",
            disabled: cfg.force_transparent !== false,
            selector: { ui_color: {} },
          },
        ],
      },
      { name: "brushed", selector: { boolean: {} } },
    ];
  }

  private _settingsSchema() {
    const cfg = this._config ?? ({} as ClockWeatherCardConfig);

    // Clock Settings (show + position live under the Layout section)
    const clock: Array<Record<string, unknown>> = [
      {
        name: "clock_size",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large (default)" },
              { value: "custom", label: "Custom" },
            ],
          },
        },
      },
    ];
    if (cfg.clock_size === "custom") {
      clock.push({ name: "clock_size_custom", selector: this._scaleSelector() });
    }
    clock.push({
      name: "time_format",
      selector: {
        select: {
          mode: "dropdown",
          options: [
            { value: "auto", label: "Auto (default)" },
            { value: "12h", label: "12-hour" },
            { value: "24h", label: "24-hour" },
            { value: "custom", label: "Custom" },
          ],
        },
      },
    });
    if (cfg.time_format === "custom") {
      clock.push({ name: "time_format_custom", selector: { text: {} } });
    }

    // Date Settings (show + position live under the Layout section)
    const date: Array<Record<string, unknown>> = [
      {
        name: "date_size",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "standard", label: "Standard (default)" },
              { value: "custom", label: "Custom" },
            ],
          },
        },
      },
    ];
    if (cfg.date_size === "custom") {
      date.push({ name: "date_size_custom", selector: this._scaleSelector() });
    }
    date.push({
      name: "date_format",
      selector: {
        select: {
          mode: "dropdown",
          options: [
            { value: "standard", label: "Standard (default)" },
            { value: "custom", label: "Custom" },
          ],
        },
      },
    });
    if (cfg.date_format === "custom") {
      date.push({ name: "date_format_custom", selector: { text: {} } });
    }

    // Weather Settings (show + position live under the Layout section)
    const weather: Array<Record<string, unknown>> = [
      { name: "weather_entity", selector: { entity: { domain: "weather" } } },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "show_weather_icon", selector: { boolean: {} } },
          { name: "show_current_temp", selector: { boolean: {} } },
        ],
      },
      {
        name: "icon_style",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "basic", label: "Basic" },
              { value: "cool", label: "Cool" },
              { value: "fancy", label: "Fancy (default)" },
            ],
          },
        },
      },
      {
        name: "weather_size",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "standard", label: "Standard (default)" },
              { value: "custom", label: "Custom" },
            ],
          },
        },
      },
    ];
    if (cfg.weather_size === "custom") {
      weather.push({ name: "weather_size_custom", selector: this._scaleSelector() });
    }

    return [
      {
        name: "",
        type: "expandable",
        title: "Clock Settings",
        iconPath: CLOCK_ICON_PATH,
        flatten: true,
        schema: clock,
      },
      {
        name: "",
        type: "expandable",
        title: "Date Settings",
        iconPath: DATE_ICON_PATH,
        flatten: true,
        schema: date,
      },
      {
        name: "",
        type: "expandable",
        title: "Weather Settings",
        iconPath: WEATHER_ICON_PATH,
        flatten: true,
        schema: weather,
      },
    ];
  }

  // The Layout section is rendered by hand (rather than via ha-form) so the
  // position controls can be RoomCard-style sliders with Left/Center/Right
  // labels under the track instead of plain dropdowns.
  private _renderLayout(data: ClockWeatherCardConfig): TemplateResult {
    const off = (key: keyof ClockWeatherCardConfig, fallback: number): number =>
      Number(data[key] ?? fallback);

    return html`
      <ha-expansion-panel outlined .leftChevron=${true}>
        <ha-svg-icon slot="leading-icon" .path=${LAYOUT_ICON_PATH}></ha-svg-icon>
        <span slot="header">Layout</span>
        <div class="layout-content">
          ${this._toggleRow("show_clock", "Show clock", Boolean(data.show_clock))}
          ${this._offsetRow("clock_offset", "Clock position", off("clock_offset", 0))}
          ${this._toggleRow("show_date", "Show date", Boolean(data.show_date))}
          ${this._offsetRow("date_offset", "Date position", off("date_offset", 100))}
          ${this._toggleRow(
            "date_below_clock",
            "Position date below clock",
            Boolean(data.date_below_clock),
          )}
          ${this._toggleRow("show_weather", "Show weather", Boolean(data.show_weather))}
          ${this._offsetRow("weather_offset", "Weather position", off("weather_offset", 100))}
          ${this._toggleRow(
            "weather_above_clock",
            "Position weather above clock",
            Boolean(data.weather_above_clock),
          )}
        </div>
      </ha-expansion-panel>
    `;
  }

  private _toggleRow(
    key: keyof ClockWeatherCardConfig,
    label: string,
    checked: boolean,
  ): TemplateResult {
    return html`
      <div class="toggle-row">
        <span>${label}</span>
        <ha-switch
          .checked=${checked}
          @change=${(ev: Event) =>
            this._commit({
              ...this._config,
              [key]: (ev.target as HTMLInputElement).checked,
            } as ClockWeatherCardConfig)}
        ></ha-switch>
      </div>
    `;
  }

  private _offsetRow(
    key: keyof ClockWeatherCardConfig,
    label: string,
    value: number,
  ): TemplateResult {
    return html`
      <div class="offset-field">
        <div class="offset-header">
          <span class="offset-label">${label}</span>
          <span class="offset-value">${value - 50}</span>
        </div>
        <input
          class="offset-slider"
          type="range"
          min="0"
          max="100"
          step="1"
          .value=${String(value)}
          @input=${(ev: Event) => {
            const snapped = this._snap(Number((ev.target as HTMLInputElement).value));
            this._commit({ ...this._config, [key]: snapped } as ClockWeatherCardConfig);
          }}
        />
        <div class="offset-ticks">
          <span>Left</span>
          <span>Center</span>
          <span>Right</span>
        </div>
      </div>
    `;
  }

  /** Snap a raw 0–100 slider value to the nearest of 0 / 50 / 100 when close. */
  private _snap(value: number): number {
    for (const stop of [0, 50, 100]) {
      if (Math.abs(value - stop) <= 10) return stop;
    }
    return value;
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "theme":
        return "Visual styling";
      case "force_transparent":
        return "Force transparent background";
      case "background":
        return "Background color override";
      case "brushed":
        return "Brushed effect";
      case "clock_size":
        return "Clock size";
      case "clock_size_custom":
        return "Clock size";
      case "time_format":
        return "Time format";
      case "time_format_custom":
        return "Time format (e.g. H:MM)";
      case "date_size":
        return "Date size";
      case "date_size_custom":
        return "Date size";
      case "date_format":
        return "Date format";
      case "date_format_custom":
        return "Date format (e.g. dddd, MMMM D)";
      case "weather_entity":
        return "Weather entity";
      case "icon_style":
        return "Icon style";
      case "show_weather_icon":
        return "Show weather icon";
      case "show_current_temp":
        return "Show current temp";
      case "weather_size":
        return "Weather size";
      case "weather_size_custom":
        return "Weather size";
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    this._commit({ ...ev.detail.value } as ClockWeatherCardConfig);
  };

  private _commit(raw: ClockWeatherCardConfig): void {
    const config = { ...raw };
    const defaults = this._defaults();
    // Strip values equal to their default so the saved YAML stays minimal.
    for (const key of Object.keys(defaults) as Array<keyof ClockWeatherCardConfig>) {
      if (config[key] === defaults[key]) {
        delete config[key];
      }
    }
    // Drop conditional fields that no longer apply.
    if (config.clock_size !== "custom") delete config.clock_size_custom;
    if (config.time_format !== "custom") delete config.time_format_custom;
    if (config.date_size !== "custom") delete config.date_size_custom;
    if (config.date_format !== "custom") delete config.date_format_custom;
    if (config.weather_size !== "custom") delete config.weather_size_custom;
    // The background override only applies when the card isn't forced transparent.
    if (config.force_transparent !== false) delete config.background;
    if (!config.background) delete config.background;
    if (!config.weather_entity) delete config.weather_entity;
    fireEvent(this, "config-changed", { config });
  }

  static styles = css`
    :host {
      display: block;
    }

    ha-expansion-panel {
      display: block;
      margin-top: 8px;
      --expansion-panel-content-padding: 0;
    }

    ha-expansion-panel ha-svg-icon {
      color: var(--secondary-text-color);
    }

    .appearance-content {
      padding: 0 16px 8px;
    }

    /* The Layout sub-section is nested inside Appearance. */
    .appearance-content ha-expansion-panel {
      margin-top: 4px;
    }

    .layout-content {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 8px 16px 16px;
    }

    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .offset-field {
      display: flex;
      flex-direction: column;
    }

    .offset-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      gap: 12px;
    }

    .offset-label {
      color: var(--primary-text-color);
    }

    .offset-value {
      font-variant-numeric: tabular-nums;
      color: var(--secondary-text-color);
    }

    .offset-slider {
      width: 100%;
      height: 4px;
      margin: 0;
      cursor: pointer;
      accent-color: var(--primary-color);
    }

    .offset-ticks {
      display: flex;
      justify-content: space-between;
      margin-top: 4px;
      font-size: 11px;
      color: var(--secondary-text-color);
      pointer-events: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-clock-weather-card-editor": TedClockWeatherCardEditor;
  }
}
