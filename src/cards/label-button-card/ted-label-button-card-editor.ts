import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { LABEL_BUTTON_CARD_EDITOR_TYPE, entityDefaultButtonAction } from "./const";
import type { LabelButtonCardConfig } from "./types";

// mdi:palette — Visual section
const VISUAL_ICON_PATH =
  "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";
// mdi:gesture-tap — Interactions section
const INTERACTIONS_ICON_PATH =
  "M10,9A1,1 0 0,1 11,8A1,1 0 0,1 12,9V13.47L13.21,13.6L18.15,15.79C18.68,16.03 19,16.56 19,17.13V21.5C18.97,22.32 18.32,22.97 17.5,23H11C10.62,23 10.26,22.85 10,22.57L5.1,18.37L5.84,17.6C6.03,17.39 6.3,17.28 6.59,17.28H6.75L10,19V9M11,5A4,4 0 0,1 15,9C15,10.5 14.2,11.77 13,12.46V11.24C13.61,10.69 14,9.89 14,9A3,3 0 0,0 11,6A3,3 0 0,0 8,9C8,9.89 8.39,10.69 9,11.24V12.46C7.8,11.77 7,10.5 7,9A4,4 0 0,1 11,5Z";

// Mirrors Home Assistant's ACTION_RELATED_CONTEXT so the action editor can resolve
// entity-based defaults (more-info / toggle) from our `entity` field.
const ACTION_CONTEXT = { entity_id: "entity" } as const;

@customElement(LABEL_BUTTON_CARD_EDITOR_TYPE)
export class TedLabelButtonCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: LabelButtonCardConfig;

  public setConfig(config: LabelButtonCardConfig): void {
    this._config = config;
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

  private _defaults(): Partial<LabelButtonCardConfig> {
    return {
      theme: "ted-style",
      brushed: false,
      neumorphic: true,
      show_icon: true,
      icon_scale: 100,
      show_name: true,
      name_scale: 100,
      show_state: false,
      state_scale: 100,
    };
  }

  private _schema() {
    const visual: Array<Record<string, unknown>> = [
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
          { name: "icon_color", selector: { ui_color: {} } },
          { name: "background", selector: { ui_color: {} } },
        ],
      },
      {
        type: "grid",
        name: "",
        column_min_width: "100px",
        schema: [
          { name: "brushed", selector: { boolean: {} } },
          { name: "neumorphic", selector: { boolean: {} } },
        ],
      },
      {
        type: "grid",
        name: "",
        column_min_width: "100px",
        schema: [
          { name: "show_name", selector: { boolean: {} } },
          { name: "name_scale", disabled: this._config?.show_name === false, selector: { number: { min: 10, max: 300, step: 5, mode: "box", unit_of_measurement: "%" } } },
        ],
      },
      {
        type: "grid",
        name: "",
        column_min_width: "100px",
        schema: [
          { name: "show_icon", selector: { boolean: {} } },
          { name: "icon_scale", disabled: this._config?.show_icon === false, selector: { number: { min: 10, max: 300, step: 5, mode: "box", unit_of_measurement: "%" } } },
        ],
      },
      {
        type: "grid",
        name: "",
        column_min_width: "100px",
        schema: [
          { name: "show_state", selector: { boolean: {} } },
          { name: "state_scale", disabled: this._config?.show_state !== true, selector: { number: { min: 10, max: 300, step: 5, mode: "box", unit_of_measurement: "%" } } },
        ],
      },
    ];

    const interactions: Array<Record<string, unknown>> = [
      {
        name: "tap_action",
        selector: { ui_action: { default_action: this._defaultTapAction() } },
        context: ACTION_CONTEXT,
      },
      {
        name: "hold_action",
        selector: { ui_action: { default_action: this._defaultHoldAction() } },
        context: ACTION_CONTEXT,
      },
      {
        name: "",
        type: "optional_actions",
        flatten: true,
        schema: [
          {
            name: "double_tap_action",
            selector: { ui_action: { default_action: "none" } },
            context: ACTION_CONTEXT,
          },
        ],
      },
    ];

    return [
      { name: "entity", selector: { entity: {} } },
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      {
        name: "",
        type: "expandable",
        title: "Appearance (general)",
        iconPath: VISUAL_ICON_PATH,
        flatten: true,
        schema: visual,
      },
      {
        name: "",
        type: "expandable",
        title: "Interactions",
        iconPath: INTERACTIONS_ICON_PATH,
        flatten: true,
        schema: interactions,
      },
    ];
  }

  /** Default tap action shown in the editor, based on the configured entity's domain. */
  private _defaultTapAction(): string {
    return entityDefaultButtonAction(this._config?.entity);
  }

  /** Default hold action shown in the editor: more-info when an entity is set, otherwise nothing. */
  private _defaultHoldAction(): string {
    return this._config?.entity ? "more-info" : "none";
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "entity":
        return "Entity (optional)";
      case "name":
        return "Name (optional)";
      case "icon":
        return "Icon (optional)";
      case "theme":
        return "Visual styling";
      case "icon_color":
        return "Icon color";
      case "background":
        return "Background color";
      case "brushed":
        return "Brushed effect";
      case "neumorphic":
        return "Neumorphic effect";
      case "show_icon":
        return "Show icon";
      case "icon_scale":
        return "Icon size";
      case "show_name":
        return "Show name";
      case "name_scale":
        return "Name size";
      case "show_state":
        return "Show entity state";
      case "state_scale":
        return "State size";
      case "tap_action":
      case "hold_action":
      case "double_tap_action": {
        const label =
          this.hass?.localize(`ui.panel.lovelace.editor.card.generic.${schema.name}`) || "";
        const optional =
          this.hass?.localize("ui.panel.lovelace.editor.card.config.optional") || "optional";
        return label ? `${label} (${optional})` : schema.name;
      }
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    const config = { ...ev.detail.value } as LabelButtonCardConfig;
    const defaults = this._defaults();
    for (const key of Object.keys(defaults) as Array<keyof LabelButtonCardConfig>) {
      if (config[key] === defaults[key]) {
        delete config[key];
      }
    }
    if (!config.entity) delete config.entity;
    if (!config.name) delete config.name;
    if (!config.icon) delete config.icon;
    if (!config.icon_color) delete config.icon_color;
    if (!config.background) delete config.background;
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
    "ted-label-button-card-editor": TedLabelButtonCardEditor;
  }
}
