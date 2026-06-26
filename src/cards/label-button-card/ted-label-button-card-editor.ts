import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
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
// mdi:drag — reorder handle
const GRIP_ICON_PATH =
  "M7,19V17H9V19H7M11,19V17H13V19H11M15,19V17H17V19H15M7,15V13H9V15H7M11,15V13H13V15H11M15,15V13H17V15H15M7,11V9H9V11H7M11,11V9H13V11H11M15,11V9H17V11H15M7,7V5H9V7H7M11,7V5H13V7H11M15,7V5H17V7H15Z";
// mdi:chevron-down — collapse toggle
const CHEVRON_ICON_PATH = "M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z";
// entity-based defaults (more-info / toggle) from our `entity` field.
const ACTION_CONTEXT = { entity_id: "entity" } as const;

@customElement(LABEL_BUTTON_CARD_EDITOR_TYPE)
export class TedLabelButtonCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: LabelButtonCardConfig;
  /** Element chips currently collapsed in the reorder section (UI-only state). */
  @state() private _collapsed = new Set<CardElement>();

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
      case "name_color":
      case "state_color":
        return "Custom color";
      case "icon_color":
        return "Color";
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
    if (config.icon_color === "state") delete config.icon_color;
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

  private _elementMoved = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const order = this._elementOrder();
    order.splice(newIndex, 0, order.splice(oldIndex, 1)[0]);
    this._commit({ ...this._config, element_order: order } as LabelButtonCardConfig);
  };

  private _toggleCollapse(el: CardElement): void {
    const next = new Set(this._collapsed);
    if (next.has(el)) next.delete(el);
    else next.add(el);
    this._collapsed = next;
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
          <span>Icon / Name / State</span>
        </div>
        <ha-sortable handle-selector=".drag-handle" @item-moved=${this._elementMoved}>
          <div class="elements">
            ${repeat(
              order,
              (el) => el,
              (el) => {
                const m = meta[el];
                const show = this._config?.[m.showKey] ?? m.defShow;
                const size = typeof this._config?.[m.sizeKey] === "number" ? this._config[m.sizeKey] : 100;
                const collapsed = this._collapsed.has(el);
                return html`
                  <div class="element-chip ${collapsed ? "collapsed" : ""}">
                    <div class="chip-head">
                      <div class="drag-handle" title="Drag to reorder">
                        <ha-svg-icon .path=${GRIP_ICON_PATH}></ha-svg-icon>
                      </div>
                      <button type="button" class="chip-headmain" @click=${() => this._toggleCollapse(el)}>
                        <span class="chip-title">${m.label}</span>
                        <ha-svg-icon class="chip-chevron" .path=${CHEVRON_ICON_PATH}></ha-svg-icon>
                      </button>
                    </div>
                    ${collapsed
                      ? nothing
                      : html`
                          <div class="chip-body">
                            <ha-form
                              .hass=${this.hass}
                              .data=${{ [m.showKey]: show, [m.sizeKey]: size, [m.colorKey]: this._config?.[m.colorKey] }}
                              .schema=${[
                                {
                                  type: "grid",
                                  name: "",
                                  column_min_width: "120px",
                                  schema: [
                                    { name: m.showKey, selector: { boolean: {} } },
                                    {
                                      name: m.sizeKey,
                                      disabled: !show,
                                      selector: { number: { min: 10, max: 300, step: 5, mode: "box", unit_of_measurement: "%" } },
                                    },
                                  ],
                                },
                                {
                                  name: m.colorKey,
                                  disabled: !show,
                                  selector:
                                    el === "icon"
                                      ? { ui_color: { default_color: "state", include_state: true, include_none: true } }
                                      : { ui_color: {} },
                                },
                              ]}
                              .computeLabel=${this._computeLabel}
                              @value-changed=${this._onElementChanged}
                            ></ha-form>
                          </div>
                        `}
                  </div>
                `;
              },
            )}
          </div>
        </ha-sortable>
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
    .element-chip {
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
      border-radius: 8px;
      overflow: hidden;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.03));
    }
    .chip-head {
      display: flex;
      align-items: center;
    }
    .element-chip:not(.collapsed) .chip-head {
      border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
    }
    .drag-handle {
      display: flex;
      align-items: center;
      padding: 8px 4px 8px 10px;
      color: var(--secondary-text-color);
      cursor: grab;
      touch-action: none;
    }
    .drag-handle > * {
      pointer-events: none;
    }
    .chip-headmain {
      display: flex;
      align-items: center;
      flex: 1 1 auto;
      gap: 8px;
      padding: 10px 12px 10px 4px;
      background: none;
      border: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .chip-title {
      flex: 1 1 auto;
      font-weight: 500;
    }
    .chip-chevron {
      color: var(--secondary-text-color);
      transition: transform 0.18s ease;
    }
    .element-chip.collapsed .chip-chevron {
      transform: rotate(-90deg);
    }
    .chip-body {
      padding: 12px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-label-button-card-editor": TedLabelButtonCardEditor;
  }
}
