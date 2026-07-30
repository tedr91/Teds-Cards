import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { transparencyBlurSchema } from "../../shared/appearance";
import {
  DEFAULT_NAVBAR_AUTOHIDE_DELAY,
  DEFAULT_NAVBAR_MAX_WIDTH,
  DEFAULT_NAVBAR_MIN_WIDTH,
  DEFAULT_NAVBAR_SIZE,
  NAVBAR_CARD_EDITOR_TYPE,
} from "./const";
import "./navbar-sections-editor";
import type { NavSection, NavbarCardConfig } from "./types";

// mdi:palette — Appearance section
const APPEARANCE_ICON_PATH =
  "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";
// mdi:view-grid — Sections section
const SECTIONS_ICON_PATH = "M3,11H11V3H3M3,21H11V13H3M13,21H21V13H13M13,3V11H21V3";

@customElement(NAVBAR_CARD_EDITOR_TYPE)
export class TedNavbarCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: NavbarCardConfig;

  public setConfig(config: NavbarCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const data = { ...this._defaults(), ...this._config };
    return html`
      <div class="editor">
        <ha-form
          .hass=${this.hass}
          .data=${data}
          .schema=${this._appearanceSchema()}
          .computeLabel=${this._computeLabel}
          @value-changed=${this._appearanceChanged}
        ></ha-form>
        ${this._renderSectionsPanel()}
      </div>
    `;
  }

  private _defaults(): Partial<NavbarCardConfig> {
    return {
      theme: "ha",
      alignment: "bottom",
      bar_type: "snap",
      size: DEFAULT_NAVBAR_SIZE,
      min_width: DEFAULT_NAVBAR_MIN_WIDTH,
      max_width: DEFAULT_NAVBAR_MAX_WIDTH,
      transparency: undefined,
      blur: undefined,
      auto_hide: false,
      auto_hide_delay: DEFAULT_NAVBAR_AUTOHIDE_DELAY,
    };
  }

  /** Left/right bars are vertical, so alignment reads up/down instead of left/right. */
  private _vertical(): boolean {
    const a = this._config?.alignment;
    return a === "left" || a === "right";
  }

  private _appearanceSchema() {
    const isFloat = this._config?.bar_type === "float";
    return [
      {
        name: "",
        type: "expandable",
        title: "Appearance (general)",
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
          { name: "background", selector: { ui_color: {} } },
          {
            type: "grid",
            name: "",
            column_min_width: "120px",
            schema: [
              {
                name: "alignment",
                selector: {
                  select: {
                    mode: "dropdown",
                    options: [
                      { value: "bottom", label: "Bottom" },
                      { value: "top", label: "Top" },
                      { value: "left", label: "Left" },
                      { value: "right", label: "Right" },
                    ],
                  },
                },
              },
              // Float applies to any alignment: a horizontal bar centers/hugs its
              // width, a vertical (left/right) bar centers/hugs its height.
              {
                name: "bar_type",
                selector: {
                  select: {
                    mode: "dropdown",
                    options: [
                      { value: "snap", label: "Snap (edge-to-edge)" },
                      { value: "float", label: "Float (centered)" },
                    ],
                  },
                },
              },
            ],
          },
          ...(isFloat
            ? [
                {
                  type: "grid",
                  name: "",
                  column_min_width: "120px",
                  schema: [
                    {
                      name: "min_width",
                      selector: { number: { min: 0, max: 2000, step: 1, mode: "box", unit_of_measurement: "px" } },
                    },
                    {
                      name: "max_width",
                      selector: { number: { min: 0, max: 2000, step: 1, mode: "box", unit_of_measurement: "px" } },
                    },
                  ],
                },
              ]
            : []),
          {
            name: "size",
            selector: { number: { min: 40, max: 120, step: 2, mode: "slider", unit_of_measurement: "px" } },
          },
          transparencyBlurSchema(this._config?.transparency),
          {
            type: "grid",
            name: "",
            column_min_width: "120px",
            schema: [
              { name: "auto_hide", selector: { boolean: {} } },
              {
                name: "auto_hide_delay",
                disabled: this._config?.auto_hide !== true,
                selector: { number: { min: 1, max: 60, step: 1, mode: "box", unit_of_measurement: "s" } },
              },
            ],
          },
        ],
      },
    ];
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "theme":
        return "Visual styling";
      case "background":
        return "Background color";
      case "alignment":
        return "Navbar alignment";
      case "bar_type":
        return "Navbar type";
      case "size":
        return "Size (bar thickness)";
      case "min_width":
        return this._vertical() ? "Minimum length" : "Minimum width";
      case "max_width":
        return this._vertical() ? "Maximum length" : "Maximum width";
      case "transparency":
        return "Transparency";
      case "blur":
        return "Background blur";
      case "auto_hide":
        return "Auto-hide";
      case "auto_hide_delay":
        return "Auto-hide delay";
      default:
        return schema.name;
    }
  };

  private _appearanceChanged = (ev: CustomEvent): void => {
    this._commit({ ...this._config, ...ev.detail.value } as NavbarCardConfig);
  };

  private _clean(config: NavbarCardConfig): NavbarCardConfig {
    const next = { ...config };
    const defaults = this._defaults();
    for (const key of Object.keys(defaults) as Array<keyof NavbarCardConfig>) {
      if (next[key] === defaults[key]) delete next[key];
    }
    if (!next.background) delete next.background;
    return next;
  }

  private _commit(next: NavbarCardConfig): void {
    const cleaned = this._clean(next);
    this._config = cleaned;
    fireEvent(this, "config-changed", { config: cleaned });
  }

  private _renderSectionsPanel(): TemplateResult {
    return html`
      <ha-expansion-panel outlined class="group-panel">
        <div slot="header" class="group-header">
          <ha-svg-icon .path=${SECTIONS_ICON_PATH}></ha-svg-icon>
          <span>Sections</span>
        </div>
        <div class="group-body">
          <ted-navbar-sections-editor
            .hass=${this.hass}
            .sections=${this._config?.sections ?? []}
            .vertical=${this._vertical()}
            @sections-changed=${this._onSectionsChanged}
          ></ted-navbar-sections-editor>
        </div>
      </ha-expansion-panel>
    `;
  }

  private _onSectionsChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const sections = (ev.detail as { sections: NavSection[] }).sections;
    this._commit({ ...this._config, sections } as NavbarCardConfig);
  };

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
      font-weight: 500;
    }
    .group-header ha-svg-icon {
      color: var(--secondary-text-color);
    }
    .group-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 16px 16px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-navbar-card-editor": TedNavbarCardEditor;
  }
}
