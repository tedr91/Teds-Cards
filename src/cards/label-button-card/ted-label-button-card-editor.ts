import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { LABEL_BUTTON_CARD_EDITOR_TYPE, entityDefaultButtonAction } from "./const";
import type { CardElement, LabelButtonCardConfig } from "./types";

// mdi:palette — Visual section
const VISUAL_ICON_PATH =
  "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";
// mdi:gesture-tap — Interactions section
const INTERACTIONS_ICON_PATH =
  "M10,9A1,1 0 0,1 11,8A1,1 0 0,1 12,9V13.47L13.21,13.6L18.15,15.79C18.68,16.03 19,16.56 19,17.13V21.5C18.97,22.32 18.32,22.97 17.5,23H11C10.62,23 10.26,22.85 10,22.57L5.1,18.37L5.84,17.6C6.03,17.39 6.3,17.28 6.59,17.28H6.75L10,19V9M11,5A4,4 0 0,1 15,9C15,10.5 14.2,11.77 13,12.46V11.24C13.61,10.69 14,9.89 14,9A3,3 0 0,0 11,6A3,3 0 0,0 8,9C8,9.89 8.39,10.69 9,11.24V12.46C7.8,11.77 7,10.5 7,9A4,4 0 0,1 11,5Z";
// mdi:format-list-bulleted — Elements (reorder) section
const ELEMENTS_ICON_PATH =
  "M7,5H21V7H7V5M7,13V11H21V13H7M4,4.5A1.5,1.5 0 0,1 5.5,6A1.5,1.5 0 0,1 4,7.5A1.5,1.5 0 0,1 2.5,6A1.5,1.5 0 0,1 4,4.5M4,10.5A1.5,1.5 0 0,1 5.5,12A1.5,1.5 0 0,1 4,13.5A1.5,1.5 0 0,1 2.5,12A1.5,1.5 0 0,1 4,10.5M7,19V17H21V19H7M4,16.5A1.5,1.5 0 0,1 5.5,18A1.5,1.5 0 0,1 4,19.5A1.5,1.5 0 0,1 2.5,18A1.5,1.5 0 0,1 4,16.5Z";

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
    const schema = this._schema();

    return html`
      <div class="editor">
        <ha-form
          .hass=${this.hass}
          .data=${data}
          .schema=${schema.top}
          .computeLabel=${this._computeLabel}
          @value-changed=${this._valueChanged}
        ></ha-form>
        ${this._renderElements()}
        <ha-form
          .hass=${this.hass}
          .data=${data}
          .schema=${schema.bottom}
          .computeLabel=${this._computeLabel}
          @value-changed=${this._valueChanged}
        ></ha-form>
      </div>
    `;
  }

  private _defaults(): Partial<LabelButtonCardConfig> {
    return {
      theme: "ted-style",
      brushed: false,
      shadow: true,
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
      { name: "background", selector: { ui_color: {} } },
      {
        type: "grid",
        name: "",
        column_min_width: "100px",
        schema: [
          { name: "brushed", selector: { boolean: {} } },
          { name: "neumorphic", selector: { boolean: {} } },
        ],
      },
      { name: "shadow", selector: { boolean: {} } },
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

    return {
      top: [
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
      ],
      bottom: [
        {
          name: "",
          type: "expandable",
          title: "Interactions",
          iconPath: INTERACTIONS_ICON_PATH,
          flatten: true,
          schema: interactions,
        },
      ],
    };
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
      case "name_color":
      case "state_color":
        return "Custom color";
      case "background":
        return "Background color";
      case "brushed":
        return "Brushed effect";
      case "neumorphic":
        return "Neumorphic effect";
      case "shadow":
        return "Subtle shadow for improved contrast";
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
    this._commit({ ...ev.detail.value } as LabelButtonCardConfig);
  };

  /** Strip defaults / empty values, drop a redundant element order, and fire. */
  private _commit(config: LabelButtonCardConfig): void {
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
    if (!config.name_color) delete config.name_color;
    if (!config.state_color) delete config.state_color;
    if (!config.background) delete config.background;
    if (Array.isArray(config.element_order) && this._isDefaultOrder(config.element_order)) {
      delete config.element_order;
    }
    fireEvent(this, "config-changed", { config });
  }

  // --- Elements (reorderable icon / name / state) ---------------------------

  private _elementOrder(): CardElement[] {
    const valid: CardElement[] = ["icon", "name", "state"];
    const order = this._config?.element_order;
    if (!Array.isArray(order)) return valid;
    const result = order.filter((el): el is CardElement => valid.includes(el as CardElement));
    for (const el of valid) if (!result.includes(el)) result.push(el);
    return result.slice(0, 3);
  }

  private _isDefaultOrder(order: CardElement[]): boolean {
    return order.length === 3 && order[0] === "icon" && order[1] === "name" && order[2] === "state";
  }

  private _moveElement(idx: number, dir: -1 | 1): void {
    const order = this._elementOrder();
    const target = idx + dir;
    if (target < 0 || target >= order.length) return;
    [order[idx], order[target]] = [order[target], order[idx]];
    this._commit({ ...this._config, element_order: order } as LabelButtonCardConfig);
  }

  private _onElementChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const next = { ...this._config, ...ev.detail.value } as LabelButtonCardConfig;
    for (const key of ["name_color", "icon_color", "state_color"] as const) {
      if (!next[key]) delete next[key];
    }
    this._commit(next);
  };

  private _renderElements(): TemplateResult {
    const order = this._elementOrder();
    const meta: Record<
      CardElement,
      { label: string; showKey: keyof LabelButtonCardConfig; sizeKey: keyof LabelButtonCardConfig; colorKey: keyof LabelButtonCardConfig; defShow: boolean }
    > = {
      icon: { label: "Icon", showKey: "show_icon", sizeKey: "icon_scale", colorKey: "icon_color", defShow: true },
      name: { label: "Name", showKey: "show_name", sizeKey: "name_scale", colorKey: "name_color", defShow: true },
      state: { label: "State", showKey: "show_state", sizeKey: "state_scale", colorKey: "state_color", defShow: false },
    };
    return html`
      <ha-expansion-panel outlined class="elements-panel">
        <div slot="header" class="elements-header">
          <ha-svg-icon .path=${ELEMENTS_ICON_PATH}></ha-svg-icon>
          <span>Icon / Name / State (drag-free reorder)</span>
        </div>
        <div class="elements">
          ${order.map((el, idx) => {
            const m = meta[el];
            const show = this._config?.[m.showKey] ?? m.defShow;
            const size = typeof this._config?.[m.sizeKey] === "number" ? this._config[m.sizeKey] : 100;
            return html`
              <div class="element-row">
                <span class="element-label">${m.label}</span>
                <ha-form
                  class="element-form"
                  .hass=${this.hass}
                  .data=${{ [m.showKey]: show, [m.sizeKey]: size, [m.colorKey]: this._config?.[m.colorKey] }}
                  .schema=${[
                    {
                      type: "grid",
                      name: "",
                      column_min_width: "90px",
                      schema: [
                        { name: m.showKey, selector: { boolean: {} } },
                        {
                          name: m.sizeKey,
                          disabled: !show,
                          selector: { number: { min: 10, max: 300, step: 5, mode: "box", unit_of_measurement: "%" } },
                        },
                      ],
                    },
                    { name: m.colorKey, disabled: !show, selector: { ui_color: {} } },
                  ]}
                  .computeLabel=${this._computeLabel}
                  @value-changed=${this._onElementChanged}
                ></ha-form>
                <div class="element-actions">
                  <ha-icon-button label="Move up" ?disabled=${idx === 0} @click=${() => this._moveElement(idx, -1)}>
                    <ha-icon icon="mdi:arrow-up"></ha-icon>
                  </ha-icon-button>
                  <ha-icon-button label="Move down" ?disabled=${idx === order.length - 1} @click=${() => this._moveElement(idx, 1)}>
                    <ha-icon icon="mdi:arrow-down"></ha-icon>
                  </ha-icon-button>
                </div>
              </div>
            `;
          })}
        </div>
      </ha-expansion-panel>
    `;
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
    .elements-panel {
      --expansion-panel-content-padding: 0;
      border-radius: 6px;
    }
    .elements-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
    }
    .elements-header ha-svg-icon {
      color: var(--secondary-text-color);
    }
    .elements {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 16px 16px;
    }
    .element-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .element-label {
      flex: none;
      width: 46px;
      font-weight: 500;
    }
    .element-form {
      flex: 1 1 auto;
      min-width: 0;
    }
    .element-actions {
      display: flex;
      flex: none;
    }
    .element-actions ha-icon-button {
      --mdc-icon-button-size: 36px;
      --mdc-icon-size: 20px;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-label-button-card-editor": TedLabelButtonCardEditor;
  }
}
