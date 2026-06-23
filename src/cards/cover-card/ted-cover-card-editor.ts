import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { COVER_CARD_EDITOR_TYPE } from "./const";
import type { CoverCardConfig, CoverAction } from "./types";

const VISUAL_ICON_PATH =
  "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";
// mdi:flash — Switch Behavior section
const SWITCH_ICON_PATH = "M7,2V13H10V22L17,10H13L17,2H7Z";
// mdi:arrow-up-bold — UP behavior
const UP_ICON_PATH = "M13,20H11V8L5.5,13.5L4.08,12.08L12,4.16L19.92,12.08L18.5,13.5L13,8V20Z";
// mdi:arrow-down-bold — DOWN behavior
const DOWN_ICON_PATH = "M11,4H13V16L18.5,10.5L19.92,11.92L12,19.84L4.08,11.92L5.5,10.5L11,16V4Z";
// mdi:circle-medium — Icon behavior (the centered icon button)
const ICON_BEHAVIOR_ICON_PATH = "M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7Z";
// mdi:memory — Memory section
const MEMORY_ICON_PATH =
  "M17,17H7V7H17M21,11V9H19V7C19,5.89 18.1,5 17,5H15V3H13V5H11V3H9V5H7C5.89,5 5,5.89 5,7V9H3V11H5V13H3V15H5V17A2,2 0 0,0 7,19H9V21H11V19H13V21H15V19H17A2,2 0 0,0 19,17V15H21V13H19V11M13,13H11V11H13M15,9H9V15H15V9Z";

const ACTION_LABELS: Record<CoverAction, string> = {
  open_step: "Open more",
  close_step: "Close more",
  open: "Fully open",
  close: "Fully closed",
  toggle: "Toggle",
  stop: "Stop",
  tilt_open: "Tilt open",
  tilt_close: "Tilt closed",
  more_info: "More info",
  none: "Nothing",
};

const FEATURE_SET_POSITION = 4;
const FEATURE_OPEN_TILT = 16;
const FEATURE_CLOSE_TILT = 32;
const FEATURE_SET_TILT_POSITION = 128;

/** Square size (px) used for width/height when embedded as a room-card button. */
const EMBEDDED_BUTTON_SIZE = 100;

@customElement(COVER_CARD_EDITOR_TYPE)
export class TedCoverCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  /** Set by the room card when this editor is embedded as a fixed-size button. */
  @property({ attribute: false }) public embedded = false;
  @state() private _config?: CoverCardConfig;

  public setConfig(config: CoverCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;

    // Apply defaults so the dropdowns show the current selection.
    const data = { ...this._defaults(), ...this._config };

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${this._schema()}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _features(): number {
    const entityId = this._config?.entity;
    const stateObj = entityId ? this.hass?.states[entityId] : undefined;
    return Number(stateObj?.attributes?.supported_features ?? 0);
  }

  /** True when the cover supports set_cover_position. */
  private _entitySupportsPosition(): boolean {
    return (this._features() & FEATURE_SET_POSITION) !== 0;
  }

  /** True when the cover exposes any tilt feature. */
  private _entitySupportsTilt(): boolean {
    return (this._features() & (FEATURE_OPEN_TILT | FEATURE_CLOSE_TILT | FEATURE_SET_TILT_POSITION)) !== 0;
  }

  private _hasPrimary(): boolean {
    return this._entitySupportsPosition() || (this._features() & FEATURE_SET_TILT_POSITION) !== 0;
  }

  /** Default values shown in the editor (some depend on position support). */
  private _defaults(): Partial<CoverCardConfig> {
    const primary = this._hasPrimary();
    const horizontal = this._config?.orientation === "horizontal";
    return {
      theme: "ted-style",
      orientation: "vertical",
      indicator_color: "theme",
      indicator_width: 4,
      show_indicator: true,
      hint_width: 8,
      icon_color: "theme",
      brushed: false,
      rocker: true,
      rocker_effect: true,
      show_hint: true,
      up_tap: primary ? "open_step" : "open",
      up_double_tap: "open",
      up_hold: "more_info",
      down_tap: primary ? "close_step" : "close",
      down_double_tap: "close",
      down_hold: "more_info",
      icon_tap: "toggle",
      icon_double_tap: "more_info",
      icon_hold: "more_info",
      show_name: true,
      name_scale: 100,
      show_icon: true,
      icon_scale: 150,
      show_state: true,
      state_scale: 100,
      width: this.embedded ? EMBEDDED_BUTTON_SIZE : horizontal ? 240 : 100,
      height: this.embedded ? EMBEDDED_BUTTON_SIZE : horizontal ? 80 : 120,
      memory_mode: "off",
      memory_value: 100,
    };
  }

  private _actionSelect(values: CoverAction[]) {
    return {
      select: {
        mode: "dropdown",
        options: values.map((value) => ({ value, label: ACTION_LABELS[value] })),
      },
    };
  }

  /** Build an action option list, appending tilt actions (when supported) and an optional "Nothing". */
  private _opts(base: CoverAction[], tilt: CoverAction[], none = false): CoverAction[] {
    const list = [...base];
    if (this._entitySupportsTilt()) list.push(...tilt);
    if (none) list.push("none");
    return list;
  }

  private _schema() {
    const inGrid = Boolean(this._config?.grid_options);
    const rockerOff = this._config?.rocker === false;
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
        name: "orientation",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "vertical", label: "Vertical (default)" },
              { value: "horizontal", label: "Horizontal" },
            ],
          },
        },
      },
      {
        type: "grid",
        name: "",
        column_min_width: "100px",
        schema: [
          { name: "show_indicator", selector: { boolean: {} } },
          {
            name: "indicator_width",
            disabled: this._config?.show_indicator === false,
            selector: { number: { min: 0, max: 40, step: 1, mode: "box", unit_of_measurement: "px" } },
          },
        ],
      },
      {
        name: "indicator_color",
        disabled: this._config?.show_indicator === false,
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "theme", label: "Theme color (default)" },
              { value: "other", label: "Custom color" },
            ],
          },
        },
      },
    ];
    if (this._config?.indicator_color === "other") {
      visual.push({ name: "indicator_color_custom", selector: { color_rgb: {} } });
    }
    visual.push({
      type: "grid",
      name: "",
      column_min_width: "100px",
      schema: [
        { name: "show_hint", selector: { boolean: {} } },
        {
          name: "hint_width",
          disabled: this._config?.show_hint === false,
          selector: { number: { min: 0, max: 40, step: 1, mode: "box", unit_of_measurement: "px" } },
        },
      ],
    });
    visual.push({
      name: "icon_color",
      selector: {
        select: {
          mode: "dropdown",
          options: [
            { value: "theme", label: "Theme color (default)" },
            { value: "other", label: "Custom color" },
          ],
        },
      },
    });
    if (this._config?.icon_color === "other") {
      visual.push({ name: "icon_color_custom", selector: { color_rgb: {} } });
    }
    visual.push({ name: "background_open", selector: { ui_color: {} } });
    visual.push({
      type: "grid",
      name: "",
      column_min_width: "100px",
      schema: [
        { name: "rocker", selector: { boolean: {} } },
        { name: "rocker_effect", disabled: rockerOff, selector: { boolean: {} } },
      ],
    });
    visual.push({ name: "brushed", selector: { boolean: {} } });
    visual.push({
      type: "grid",
      name: "",
      column_min_width: "100px",
      schema: [
        { name: "show_name", selector: { boolean: {} } },
        { name: "name_scale", disabled: this._config?.show_name === false, selector: { number: { min: 10, max: 300, step: 5, mode: "box", unit_of_measurement: "%" } } },
      ],
    });
    visual.push({
      type: "grid",
      name: "",
      column_min_width: "100px",
      schema: [
        { name: "show_icon", selector: { boolean: {} } },
        { name: "icon_scale", disabled: this._config?.show_icon === false, selector: { number: { min: 10, max: 300, step: 5, mode: "box", unit_of_measurement: "%" } } },
      ],
    });
    visual.push({
      type: "grid",
      name: "",
      column_min_width: "100px",
      schema: [
        { name: "show_state", selector: { boolean: {} } },
        { name: "state_scale", disabled: this._config?.show_state === false, selector: { number: { min: 10, max: 300, step: 5, mode: "box", unit_of_measurement: "%" } } },
      ],
    });
    visual.push({
      type: "grid",
      name: "",
      column_min_width: "100px",
      schema: [
        { name: "width", disabled: this.embedded || inGrid, selector: { number: { min: 80, max: 600, step: 10, mode: "box", unit_of_measurement: "px" } } },
        { name: "height", disabled: this.embedded || inGrid, selector: { number: { min: 60, max: 600, step: 10, mode: "box", unit_of_measurement: "px" } } },
      ],
    });

    const switchBehavior = {
      name: "",
      type: "expandable",
      title: "Switch Behavior",
      iconPath: SWITCH_ICON_PATH,
      flatten: true,
      schema: [
        {
          name: "",
          type: "expandable",
          title: "UP behavior",
          iconPath: UP_ICON_PATH,
          flatten: true,
          schema: [
            { name: "up_tap", required: true, disabled: rockerOff, selector: this._actionSelect(this._opts(["open_step", "open", "toggle", "stop", "more_info"], ["tilt_open"])) },
            { name: "up_double_tap", required: true, disabled: rockerOff, selector: this._actionSelect(this._opts(["open", "toggle", "stop", "more_info"], ["tilt_open"], true)) },
            { name: "up_hold", required: true, disabled: rockerOff, selector: this._actionSelect(this._opts(["more_info", "open", "stop"], ["tilt_open"], true)) },
          ],
        },
        {
          name: "",
          type: "expandable",
          title: "DOWN behavior",
          iconPath: DOWN_ICON_PATH,
          flatten: true,
          schema: [
            { name: "down_tap", required: true, disabled: rockerOff, selector: this._actionSelect(this._opts(["close_step", "close", "toggle", "stop", "more_info"], ["tilt_close"])) },
            { name: "down_double_tap", required: true, disabled: rockerOff, selector: this._actionSelect(this._opts(["close", "toggle", "stop", "more_info"], ["tilt_close"], true)) },
            { name: "down_hold", required: true, disabled: rockerOff, selector: this._actionSelect(this._opts(["more_info", "close", "stop"], ["tilt_close"], true)) },
          ],
        },
        {
          name: "",
          type: "expandable",
          title: "Icon behavior",
          iconPath: ICON_BEHAVIOR_ICON_PATH,
          flatten: true,
          schema: [
            { name: "icon_tap", required: true, selector: this._actionSelect(this._opts(["toggle", "open", "close", "stop", "more_info"], ["tilt_open", "tilt_close"])) },
            { name: "icon_double_tap", required: true, selector: this._actionSelect(this._opts(["more_info", "toggle", "open", "close", "stop"], ["tilt_open", "tilt_close"], true)) },
            { name: "icon_hold", required: true, selector: this._actionSelect(this._opts(["more_info", "toggle", "stop"], [], true)) },
          ],
        },
      ],
    };

    const sections: Array<Record<string, unknown>> = [
      {
        name: "entity",
        required: true,
        selector: { entity: { domain: "cover" } },
      },
      { name: "name", selector: { text: {} } },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "icon", selector: { icon: {} } },
          { name: "icon_open", selector: { icon: {} } },
        ],
      },
      {
        name: "",
        type: "expandable",
        title: "Appearance (general)",
        iconPath: VISUAL_ICON_PATH,
        flatten: true,
        schema: visual,
      },
      switchBehavior,
    ];

    // Position "memory" only applies to covers that support set_cover_position.
    if (this._entitySupportsPosition()) {
      const memory: Array<Record<string, unknown>> = [
        {
          name: "memory_mode",
          required: true,
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "off", label: "100% (default)" },
                { value: "static", label: "Static value" },
                { value: "helper", label: "Memory helper" },
              ],
            },
          },
        },
      ];
      if (this._config?.memory_mode === "static") {
        memory.push({
          name: "memory_value",
          required: true,
          selector: { number: { min: 1, max: 100, mode: "slider", unit_of_measurement: "%" } },
        });
      }
      if (this._config?.memory_mode === "helper") {
        memory.push({
          name: "memory_entity",
          required: true,
          selector: { entity: { domain: ["input_number", "number"] } },
        });
      }
      sections.push({
        name: "",
        type: "expandable",
        title: "Memory",
        iconPath: MEMORY_ICON_PATH,
        flatten: true,
        schema: memory,
      });
    }

    return sections;
  }

  private _computeHelper = (schema: { name: string }): string | undefined => {
    if (schema.name === "width" || schema.name === "height") {
      return "Only used when the card isn't a direct item in a grid (Sections) view.";
    }
    return undefined;
  };

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "entity":
        return "Entity";
      case "name":
        return "Name (optional)";
      case "icon":
        return "Icon (optional)";
      case "icon_open":
        return "Open state icon (optional)";
      case "theme":
        return "Visual styling";
      case "orientation":
        return "Orientation";
      case "indicator_color":
        return "Indicator bar color";
      case "indicator_color_custom":
        return "Custom indicator color";
      case "indicator_width":
        return "Indicator bar width (px)";
      case "show_indicator":
        return "Show indicator bar";
      case "icon_color":
        return "Icon color";
      case "icon_color_custom":
        return "Custom icon color";
      case "background_open":
        return "Background color when open";
      case "brushed":
        return "Brushed effect";
      case "rocker":
        return "Rocker";
      case "rocker_effect":
        return "Rocker effect";
      case "show_name":
        return "Show name";
      case "name_scale":
        return "Name size";
      case "show_icon":
        return "Show icon";
      case "icon_scale":
        return "Icon size";
      case "show_state":
        return "Show entity state";
      case "state_scale":
        return "State size";
      case "show_hint":
        return "Show hint bar";
      case "hint_width":
        return "Hint bar width (px)";
      case "width":
        return "Width (px)";
      case "height":
        return "Height (px)";
      case "up_tap":
      case "down_tap":
      case "icon_tap":
        return "Single tap";
      case "up_double_tap":
      case "down_double_tap":
      case "icon_double_tap":
        return "Double tap";
      case "up_hold":
      case "down_hold":
      case "icon_hold":
        return "Long press";
      case "memory_mode":
        return "Open to";
      case "memory_value":
        return "Position";
      case "memory_entity":
        return "Memory helper (input_number / number)";
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    const config = { ...ev.detail.value } as CoverCardConfig;
    const defaults = this._defaults();
    // Strip values equal to their default so the saved YAML stays minimal.
    for (const key of Object.keys(defaults) as Array<keyof CoverCardConfig>) {
      if (config[key] === defaults[key]) {
        delete config[key];
      }
    }
    if (config.indicator_color !== "other") {
      delete config.indicator_color_custom;
    }
    if (config.icon_color !== "other") {
      delete config.icon_color_custom;
    }
    if (config.memory_mode !== "static") {
      delete config.memory_value;
    }
    if (config.memory_mode !== "helper") {
      delete config.memory_entity;
    }
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
    "ted-cover-card-editor": TedCoverCardEditor;
  }
}
