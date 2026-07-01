import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { transparencyBlurSchema } from "../../shared/appearance";
import { ALARM_CARD_EDITOR_TYPE } from "./const";
import type { AlarmCardConfig } from "./types";

// mdi:palette — Appearance section
const APPEARANCE_ICON_PATH =
  "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";

@customElement(ALARM_CARD_EDITOR_TYPE)
export class TedAlarmCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: AlarmCardConfig;

  public setConfig(config: AlarmCardConfig): void {
    this._config = config;
  }

  private _defaults(): Partial<AlarmCardConfig> {
    return { theme: "ha", brushed: false, shadow: true, show_add: true, transparency: undefined, blur: undefined };
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const data = { ...this._defaults(), ...this._config };
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${this._schema()}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _schema() {
    return [
      { name: "title", selector: { text: {} } },
      { name: "entity", selector: { entity: { domain: "sensor" } } },
      { name: "show_add", selector: { boolean: {} } },
      {
        name: "",
        type: "expandable",
        title: "Appearance",
        iconPath: APPEARANCE_ICON_PATH,
        flatten: true,
        schema: [
          {
            name: "theme",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "ted-style", label: "Ted's Style" },
                  { value: "ha", label: "Home Assistant theme (default)" },
                ],
              },
            },
          },
          transparencyBlurSchema(this._config?.transparency),
          {
            type: "grid",
            name: "",
            column_min_width: "100px",
            schema: [
              { name: "brushed", selector: { boolean: {} } },
              { name: "shadow", selector: { boolean: {} } },
            ],
          },
        ],
      },
    ];
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "title":
        return "Title";
      case "entity":
        return "Alarms sensor (optional)";
      case "show_add":
        return "Show add button";
      case "theme":
        return "Visual styling";
      case "transparency":
        return "Transparency";
      case "blur":
        return "Background blur";
      case "brushed":
        return "Brushed effect";
      case "shadow":
        return "Subtle shadow for improved contrast";
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    const config = { ...this._config, ...ev.detail.value } as AlarmCardConfig;
    const defaults = this._defaults();
    for (const key of Object.keys(defaults) as Array<keyof AlarmCardConfig>) {
      if (config[key] === defaults[key]) delete config[key];
    }
    if (!config.title) delete config.title;
    if (!config.entity) delete config.entity;
    fireEvent(this, "config-changed", { config });
  };

  static styles = css`
    :host {
      display: block;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-alarm-card-editor": TedAlarmCardEditor;
  }
}
