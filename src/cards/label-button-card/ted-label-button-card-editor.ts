import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { transparencyBlurSchema } from "../../shared/appearance";
import { LABEL_BUTTON_CARD_EDITOR_TYPE, entityDefaultButtonAction } from "./const";
import type {
  BadgeConfig,
  CardElement,
  HighlightConfig,
  HighlightRule,
  LabelButtonCardConfig,
} from "./types";

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
// mdi:label — Badge section
const BADGE_ICON_PATH =
  "M21.41,11.58L12.41,2.58C12.04,2.21 11.53,2 11,2H4A2,2 0 0,0 2,4V11C2,11.53 2.21,12.04 2.59,12.41L11.59,21.41C11.96,21.78 12.47,22 13,22C13.53,22 14.04,21.79 14.41,21.41L21.41,14.41C21.79,14.04 22,13.53 22,13C22,12.47 21.79,11.96 21.41,11.58M5.5,7A1.5,1.5 0 0,1 4,5.5A1.5,1.5 0 0,1 5.5,4A1.5,1.5 0 0,1 7,5.5A1.5,1.5 0 0,1 5.5,7Z";
// mdi:palette-swatch — Dynamic highlighting section
const HIGHLIGHT_ICON_PATH =
  "M2.53,19.65L3.87,20.21V11.18L1.44,17.04C1.03,18.06 1.5,19.23 2.53,19.65M22.03,15.95L17.07,3.98C16.76,3.23 16.03,2.77 15.26,2.75C15,2.75 14.73,2.79 14.47,2.9L7.1,5.95C6.35,6.26 5.89,7 5.87,7.75C5.86,8 5.9,8.28 6,8.54L10.97,20.5C11.28,21.26 12,21.72 12.79,21.74C13.05,21.74 13.31,21.69 13.56,21.59L20.92,18.54C21.93,18.12 22.43,16.95 22.03,15.95M7.88,8.75A1,1 0 0,1 6.88,7.75A1,1 0 0,1 7.88,6.75C8.43,6.75 8.88,7.2 8.88,7.75C8.88,8.3 8.43,8.75 7.88,8.75M5.88,19.75A2,2 0 0,0 7.88,21.75H9.33L5.88,13.41V19.75Z";
// mdi:delete — remove rule
const DELETE_ICON_PATH = "M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z";
// Operator dropdown options for highlight rules.
const OPERATOR_OPTIONS = [
  { value: "is", label: "is" },
  { value: "is_not", label: "is not" },
  { value: ">", label: "greater than ( > )" },
  { value: ">=", label: "greater or equal ( \u2265 )" },
  { value: "<", label: "less than ( < )" },
  { value: "<=", label: "less or equal ( \u2264 )" },
];
// entity-based defaults (more-info / toggle) from our `entity` field.
const ACTION_CONTEXT = { entity_id: "entity" } as const;

@customElement(LABEL_BUTTON_CARD_EDITOR_TYPE)
export class TedLabelButtonCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: LabelButtonCardConfig;
  /** Element chips currently expanded in the reorder section (UI-only state;
   *  chips start collapsed). */
  @state() private _expanded = new Set<CardElement>();
  /** Highlight-rule chips currently expanded (by index; UI-only state). */
  @state() private _expandedRules = new Set<number>();

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
        ${this._renderBadge()}
        ${this._renderHighlight()}
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
      transparency: undefined,
      blur: undefined,
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
      { name: "background_on", selector: { ui_color: {} } },
      transparencyBlurSchema(this._config?.transparency),
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
      case "transparency":
        return "Transparency";
      case "blur":
        return "Background blur";
      case "background":
        return "Background color";
      case "background_on":
        return "Background color when on";
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
    this._commit({ ...this._config, ...ev.detail.value } as LabelButtonCardConfig);
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
    if (!config.background_on) delete config.background_on;
    if (Array.isArray(config.element_order) && this._isDefaultOrder(config.element_order)) {
      delete config.element_order;
    }
    fireEvent(this, "config-changed", { config });
  }

  // --- Elements (reorderable icon / name / state) ---------------------------

  private _elementOrder(): CardElement[] {
    const valid: CardElement[] = ["name", "icon", "state"];
    const order = this._config?.element_order;
    if (!Array.isArray(order)) return valid;
    const result = order.filter((el): el is CardElement => valid.includes(el as CardElement));
    for (const el of valid) if (!result.includes(el)) result.push(el);
    return result.slice(0, 3);
  }

  private _isDefaultOrder(order: CardElement[]): boolean {
    return order.length === 3 && order[0] === "name" && order[1] === "icon" && order[2] === "state";
  }

  private _elementMoved = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const order = this._elementOrder();
    order.splice(newIndex, 0, order.splice(oldIndex, 1)[0]);
    this._commit({ ...this._config, element_order: order } as LabelButtonCardConfig);
  };

  private _toggleExpand(el: CardElement): void {
    const next = new Set(this._expanded);
    if (next.has(el)) next.delete(el);
    else next.add(el);
    this._expanded = next;
  }

  private _toggleShow(showKey: keyof LabelButtonCardConfig, ev: Event): void {
    ev.stopPropagation();
    const checked = (ev.target as HTMLInputElement).checked;
    this._commit({ ...this._config, [showKey]: checked } as LabelButtonCardConfig);
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
                const expanded = this._expanded.has(el);
                return html`
                  <div class="element-chip ${expanded ? "" : "collapsed"}">
                    <div class="chip-head">
                      <div class="drag-handle" title="Drag to reorder">
                        <ha-svg-icon .path=${GRIP_ICON_PATH}></ha-svg-icon>
                      </div>
                      <button type="button" class="chip-titlebtn" @click=${() => this._toggleExpand(el)}>
                        <span class="chip-title">${m.label}</span>
                      </button>
                      <ha-switch .checked=${show} @change=${(ev: Event) => this._toggleShow(m.showKey, ev)}></ha-switch>
                      <button
                        type="button"
                        class="chip-collapsebtn"
                        aria-label="Expand or collapse"
                        @click=${() => this._toggleExpand(el)}
                      >
                        <ha-svg-icon class="chip-chevron" .path=${CHEVRON_ICON_PATH}></ha-svg-icon>
                      </button>
                    </div>
                    ${expanded
                      ? html`
                          <div class="chip-body">
                            <ha-form
                              .hass=${this.hass}
                              .data=${{ [m.sizeKey]: size, [m.colorKey]: this._config?.[m.colorKey] }}
                              .schema=${[
                                {
                                  type: "grid",
                                  name: "",
                                  column_min_width: "140px",
                                  schema: [
                                    {
                                      name: m.sizeKey,
                                      disabled: !show,
                                      selector: { number: { min: 10, max: 300, step: 5, mode: "box", unit_of_measurement: "%" } },
                                    },
                                    {
                                      name: m.colorKey,
                                      disabled: !show,
                                      selector:
                                        el === "icon"
                                          ? { ui_color: { default_color: "state", include_state: true, include_none: true } }
                                          : { ui_color: {} },
                                    },
                                  ],
                                },
                              ]}
                              .computeLabel=${this._computeLabel}
                              @value-changed=${this._onElementChanged}
                            ></ha-form>
                          </div>
                        `
                      : nothing}
                  </div>
                `;
              },
            )}
          </div>
        </ha-sortable>
      </ha-expansion-panel>
    `;
  }

  // --- Badge ----------------------------------------------------------------

  private _renderBadge(): TemplateResult {
    const badge = this._config?.badge ?? {};
    return html`
      <ha-expansion-panel outlined class="section-panel">
        <div slot="header" class="section-header">
          <ha-svg-icon .path=${BADGE_ICON_PATH}></ha-svg-icon>
          <span>Badge</span>
        </div>
        <div class="section-body">
          <ha-form
            .hass=${this.hass}
            .data=${badge}
            .schema=${[
              { name: "entity", selector: { entity: {} } },
              {
                type: "grid",
                name: "",
                column_min_width: "140px",
                schema: [
                  { name: "color", selector: { ui_color: {} } },
                  { name: "text_color", selector: { ui_color: {} } },
                ],
              },
              { name: "show_when_zero", selector: { boolean: {} } },
            ]}
            .computeLabel=${this._computeBadgeLabel}
            @value-changed=${this._onBadgeChanged}
          ></ha-form>
        </div>
      </ha-expansion-panel>
    `;
  }

  private _computeBadgeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "entity":
        return "Entity (badge count)";
      case "color":
        return "Badge color";
      case "text_color":
        return "Text color";
      case "show_when_zero":
        return "Show when value is zero";
      default:
        return schema.name;
    }
  };

  private _onBadgeChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const value = { ...ev.detail.value } as BadgeConfig;
    const badge: BadgeConfig = {};
    if (value.entity) badge.entity = value.entity;
    if (value.color) badge.color = value.color;
    if (value.text_color) badge.text_color = value.text_color;
    if (value.show_when_zero) badge.show_when_zero = true;
    const next = { ...this._config } as LabelButtonCardConfig;
    if (badge.entity) next.badge = badge;
    else delete next.badge;
    this._commit(next);
  };

  // --- Dynamic highlighting -------------------------------------------------

  private _renderHighlight(): TemplateResult {
    const highlight = this._config?.highlight ?? {};
    const rules = Array.isArray(highlight.rules) ? highlight.rules : [];
    return html`
      <ha-expansion-panel outlined class="section-panel">
        <div slot="header" class="section-header">
          <ha-svg-icon .path=${HIGHLIGHT_ICON_PATH}></ha-svg-icon>
          <span>Dynamic highlighting</span>
        </div>
        <div class="section-body">
          <ha-form
            .hass=${this.hass}
            .data=${{ entity: highlight.entity }}
            .schema=${[{ name: "entity", selector: { entity: {} } }]}
            .computeLabel=${this._computeHighlightLabel}
            @value-changed=${this._onHighlightEntityChanged}
          ></ha-form>
          <div class="rules-head">
            <span>Rules</span>
            <button type="button" class="add-rule" @click=${this._addRule}>+ Add rule</button>
          </div>
          <ha-sortable handle-selector=".drag-handle" @item-moved=${this._ruleMoved}>
            <div class="rules">${rules.map((rule, idx) => this._renderRule(rule, idx))}</div>
          </ha-sortable>
        </div>
      </ha-expansion-panel>
    `;
  }

  private _renderRule(rule: HighlightRule, idx: number): TemplateResult {
    const expanded = this._expandedRules.has(idx);
    const op = rule.operator ?? "is";
    const isStateOp = op === "is" || op === "is_not";
    const highlightEntity = this._config?.highlight?.entity;
    const valueSelector = isStateOp
      ? highlightEntity
        ? { state: { entity_id: highlightEntity } }
        : { text: {} }
      : { number: { mode: "box" } };
    return html`
      <div class="element-chip ${expanded ? "" : "collapsed"}">
        <div class="chip-head">
          <div class="drag-handle" title="Drag to reorder">
            <ha-svg-icon .path=${GRIP_ICON_PATH}></ha-svg-icon>
          </div>
          <button type="button" class="chip-titlebtn" @click=${() => this._toggleRule(idx)}>
            <span class="chip-title">${this._ruleSummary(rule)}</span>
          </button>
          <button
            type="button"
            class="rule-delete"
            aria-label="Delete rule"
            @click=${(ev: Event) => this._removeRule(idx, ev)}
          >
            <ha-svg-icon .path=${DELETE_ICON_PATH}></ha-svg-icon>
          </button>
          <button
            type="button"
            class="chip-collapsebtn"
            aria-label="Expand or collapse"
            @click=${() => this._toggleRule(idx)}
          >
            <ha-svg-icon class="chip-chevron" .path=${CHEVRON_ICON_PATH}></ha-svg-icon>
          </button>
        </div>
        ${expanded
          ? html`
              <div class="chip-body">
                <ha-form
                  .hass=${this.hass}
                  .data=${{
                    operator: op,
                    value: rule.value,
                    background_color: rule.background_color,
                    icon_color: rule.icon_color,
                    halt: rule.halt ?? false,
                  }}
                  .schema=${[
                    { name: "operator", selector: { select: { mode: "dropdown", options: OPERATOR_OPTIONS } } },
                    { name: "value", selector: valueSelector },
                    {
                      type: "grid",
                      name: "",
                      column_min_width: "140px",
                      schema: [
                        { name: "background_color", selector: { ui_color: {} } },
                        { name: "icon_color", selector: { ui_color: {} } },
                      ],
                    },
                    { name: "halt", selector: { boolean: {} } },
                  ]}
                  .computeLabel=${this._computeRuleLabel}
                  @value-changed=${(ev: CustomEvent) => this._onRuleChanged(idx, ev)}
                ></ha-form>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private _ruleSummary(rule: HighlightRule): string {
    const sym: Record<string, string> = {
      is: "is",
      is_not: "is not",
      ">": ">",
      ">=": "\u2265",
      "<": "<",
      "<=": "\u2264",
    };
    const op = sym[rule.operator ?? "is"] ?? "is";
    const val = rule.value ?? "\u2026";
    const color = rule.background_color || rule.icon_color;
    return color ? `${op} ${val} \u2192 ${color}` : `${op} ${val}`;
  }

  private _computeHighlightLabel = (schema: { name: string }): string =>
    schema.name === "entity" ? "Entity" : schema.name;

  private _computeRuleLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "operator":
        return "Operator";
      case "value":
        return "Value";
      case "background_color":
        return "Background color";
      case "icon_color":
        return "Icon / text color";
      case "halt":
        return "If triggered, stop processing more rules";
      default:
        return schema.name;
    }
  };

  private _toggleRule(idx: number): void {
    const next = new Set(this._expandedRules);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    this._expandedRules = next;
  }

  private _onHighlightEntityChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const entity = (ev.detail.value as { entity?: string }).entity;
    const highlight = { ...(this._config?.highlight ?? {}) };
    if (entity) highlight.entity = entity;
    else delete highlight.entity;
    this._commitHighlight(highlight);
  };

  private _addRule = (ev: Event): void => {
    ev.stopPropagation();
    const highlight = { ...(this._config?.highlight ?? {}) };
    const rules = Array.isArray(highlight.rules) ? [...highlight.rules] : [];
    rules.push({ operator: "is" });
    highlight.rules = rules;
    this._expandedRules = new Set([...this._expandedRules, rules.length - 1]);
    this._commitHighlight(highlight);
  };

  private _removeRule(idx: number, ev: Event): void {
    ev.stopPropagation();
    const highlight = { ...(this._config?.highlight ?? {}) };
    const rules = Array.isArray(highlight.rules) ? [...highlight.rules] : [];
    rules.splice(idx, 1);
    highlight.rules = rules;
    this._commitHighlight(highlight);
  }

  private _ruleMoved = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const highlight = { ...(this._config?.highlight ?? {}) };
    const rules = Array.isArray(highlight.rules) ? [...highlight.rules] : [];
    rules.splice(newIndex, 0, rules.splice(oldIndex, 1)[0]);
    highlight.rules = rules;
    this._commitHighlight(highlight);
  };

  private _onRuleChanged(idx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = { ...ev.detail.value } as HighlightRule;
    const rule: HighlightRule = {};
    if (value.operator) rule.operator = value.operator;
    if (value.value !== undefined && value.value !== "" && value.value !== null) rule.value = value.value;
    if (value.background_color) rule.background_color = value.background_color;
    if (value.icon_color) rule.icon_color = value.icon_color;
    if (value.halt) rule.halt = true;
    const highlight = { ...(this._config?.highlight ?? {}) };
    const rules = Array.isArray(highlight.rules) ? [...highlight.rules] : [];
    rules[idx] = rule;
    highlight.rules = rules;
    this._commitHighlight(highlight);
  }

  /** Commit a highlight config, dropping it entirely when empty. */
  private _commitHighlight(highlight: HighlightConfig): void {
    const next = { ...this._config } as LabelButtonCardConfig;
    if (highlight.entity || (highlight.rules && highlight.rules.length > 0)) {
      next.highlight = highlight;
    } else {
      delete next.highlight;
    }
    this._commit(next);
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
      gap: 4px;
      padding-right: 8px;
    }
    .element-chip:not(.collapsed) .chip-head {
      border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
    }
    .drag-handle {
      display: flex;
      align-items: center;
      padding: 10px 4px 10px 10px;
      color: var(--secondary-text-color);
      cursor: grab;
      touch-action: none;
    }
    .drag-handle > * {
      pointer-events: none;
    }
    .chip-titlebtn {
      display: flex;
      align-items: center;
      flex: 1 1 auto;
      padding: 10px 4px;
      background: none;
      border: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .chip-title {
      font-weight: 500;
    }
    .chip-head ha-switch {
      flex: none;
    }
    .chip-collapsebtn {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
      background: none;
      border: none;
      color: var(--secondary-text-color);
      cursor: pointer;
    }
    .chip-chevron {
      transition: transform 0.18s ease;
    }
    .element-chip.collapsed .chip-chevron {
      transform: rotate(-90deg);
    }
    .chip-body {
      padding: 12px;
    }
    .section-panel {
      --expansion-panel-content-padding: 0;
      border-radius: 6px;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
    }
    .section-header ha-svg-icon {
      color: var(--secondary-text-color);
    }
    .section-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 16px 16px;
    }
    .rules-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 4px;
    }
    .add-rule {
      background: none;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
      border-radius: 6px;
      color: inherit;
      font: inherit;
      padding: 4px 10px;
      cursor: pointer;
    }
    .rules {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .rule-delete {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
      background: none;
      border: none;
      color: var(--secondary-text-color);
      cursor: pointer;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-label-button-card-editor": TedLabelButtonCardEditor;
  }
}
