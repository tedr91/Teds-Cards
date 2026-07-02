import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { transparencyBlurSchema } from "../../shared/appearance";
import { CAMERA_CARD_EDITOR_TYPE } from "./const";
import type { CameraCardConfig, CameraItemConfig, CameraLayout } from "./types";

// mdi:cctv — Cameras section
const CAMERAS_ICON_PATH =
  "M18.14,7.35L16.17,8.87C16.72,9.83 16.66,11.05 15.9,11.97L15.24,11.05L11.31,5.68L10.65,4.76C11.7,3.97 13.19,4.16 14,5.21C14.33,4.55 14.97,4.1 15.71,4H15.83C16.5,4 17.13,4.29 17.58,4.79L18.11,5.44M11.31,5.68L15.24,11.05L14.29,11.74C13.79,11.05 12.82,10.9 12.13,11.4C11.44,11.9 11.29,12.87 11.79,13.56C12.29,14.25 13.26,14.4 13.95,13.9L14.19,13.72V19H18V21H2V19H8V13.28C7.65,13.19 7.32,13 7.05,12.71L2.6,14L2,12.08L11.31,5.68Z";
// mdi:drag — reorder handle
const GRIP_ICON_PATH =
  "M7,19V17H9V19H7M11,19V17H13V19H11M15,19V17H17V19H15M7,15V13H9V15H7M11,15V13H13V15H11M15,15V13H17V15H15M7,11V9H9V11H7M11,11V9H13V11H11M15,11V9H17V11H15M7,7V5H9V7H7M11,7V5H13V7H11M15,7V5H17V7H15Z";
// mdi:delete
const DELETE_ICON_PATH = "M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z";
// mdi:plus
const PLUS_ICON_PATH = "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z";
// mdi:palette — Appearance section
const VISUAL_ICON_PATH =
  "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";
// mdi:gesture-tap — Interactions section
const INTERACTIONS_ICON_PATH =
  "M10,9A1,1 0 0,1 11,8A1,1 0 0,1 12,9V13.47L13.21,13.6L18.15,15.79C18.68,16.03 19,16.56 19,17.13V21.5C18.97,22.32 18.32,22.97 17.5,23H11C10.62,23 10.26,22.85 10,22.57L5.1,18.37L5.84,17.6C6.03,17.39 6.3,17.28 6.59,17.28H6.75L10,19V9M11,5A4,4 0 0,1 15,9C15,10.5 14.2,11.77 13,12.46V11.24C13.61,10.69 14,9.89 14,9A3,3 0 0,0 11,6A3,3 0 0,0 8,9C8,9.89 8.39,10.69 9,11.24V12.46C7.8,11.77 7,10.5 7,9A4,4 0 0,1 11,5Z";

/** Layout options for the layout dropdown. */
const LAYOUT_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "quad", label: "Quad (2×2)" },
  { value: "big-small", label: "Multi" },
];

/** Where the small-feed strip sits in the big-small layout. */
const POSITION_OPTIONS = [
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
];

/** Pick the layout that best fits a given number of cameras. */
function layoutForCount(n: number): CameraLayout {
  if (n <= 1) return "single";
  if (n <= 2) return "big-small";
  if (n <= 4) return "quad";
  return "big-small";
}

/** Auto small-feed strip width (% of card) for the Multi layout: even feeds. */
function autoSmallWidth(visibleCount: number): number {
  return Math.max(15, Math.min(60, Math.round(100 / visibleCount)));
}

/** Square size (px) used for width/height when embedded as a room-card button. */
const EMBEDDED_BUTTON_SIZE = 100;

@customElement(CAMERA_CARD_EDITOR_TYPE)
export class TedCameraCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  /** Set by the room card when this editor is embedded as a fixed-size button. */
  @property({ attribute: false }) public embedded = false;
  @state() private _config?: CameraCardConfig;
  /** Whether the collapsible Cameras section is open. */
  @state() private _groupOpen = true;
  /** Indices of camera panels that are expanded. */
  @state() private _expanded = new Set<number>();

  public setConfig(config: CameraCardConfig): void {
    this._config = config;
  }

  private _cameras(): CameraItemConfig[] {
    return this._config?.cameras ?? [];
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
          .computeHelper=${this._computeHelper}
          @value-changed=${this._valueChanged}
        ></ha-form>
        ${this._renderCameras()}
        <ha-form
          .hass=${this.hass}
          .data=${data}
          .schema=${this._interactionsSchema()}
          .computeLabel=${this._computeLabel}
          .computeHelper=${this._computeHelper}
          @value-changed=${this._valueChanged}
        ></ha-form>
      </div>
    `;
  }

  private _renderCameras(): TemplateResult {
    const cameras = this._cameras();
    const layout = this._config?.layout ?? "single";
    const topSchema = [
      {
        name: "layout",
        selector: { select: { mode: "dropdown", options: LAYOUT_OPTIONS } },
      },
      ...(layout === "big-small"
        ? [
            {
              type: "grid",
              name: "",
              column_min_width: "100px",
              schema: [
                {
                  name: "big_small_position",
                  selector: { select: { mode: "dropdown", options: POSITION_OPTIONS } },
                },
                {
                  name: "big_small_width",
                  selector: {
                    number: { min: 15, max: 60, step: 1, mode: "slider", unit_of_measurement: "%" },
                  },
                },
              ],
            },
          ]
        : []),
      {
        type: "grid",
        name: "",
        column_min_width: "100px",
        schema: [
          {
            name: "fit_mode",
            required: true,
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "cover", label: "Cover (default)" },
                  { value: "contain", label: "Contain" },
                  { value: "fill", label: "Fill" },
                ],
              },
            },
          },
          { name: "aspect_ratio", selector: { text: {} } },
        ],
      },
    ];
    const topData = {
      layout,
      big_small_position: this._config?.big_small_position ?? "right",
      big_small_width: this._config?.big_small_width ?? 25,
      fit_mode: this._config?.fit_mode ?? "cover",
      aspect_ratio: this._config?.aspect_ratio ?? "",
    };
    return html`
      <ha-expansion-panel
        outlined
        class="group-panel"
        .expanded=${this._groupOpen}
        @expanded-changed=${this._onGroupToggle}
      >
        <div slot="header" class="group-header">
          <ha-svg-icon .path=${CAMERAS_ICON_PATH}></ha-svg-icon>
          <span>Cameras</span>
        </div>
        <div class="group-body">
          <ha-form
            .hass=${this.hass}
            .data=${topData}
            .schema=${topSchema}
            .computeLabel=${this._computeLabel}
            .computeHelper=${this._computeHelper}
            @value-changed=${this._onLayoutChanged}
          ></ha-form>
          <div class="feeds-header">
            <span class="subgroup-label">Camera Feeds</span>
            <div class="group-actions" @click=${this._stop}>
              <button type="button" class="add-btn" @click=${this._autoPopulate}>
                Auto populate
              </button>
              <ha-icon-button
                label="Add camera"
                .path=${PLUS_ICON_PATH}
                @click=${this._addCamera}
              ></ha-icon-button>
            </div>
          </div>
          <ha-sortable handle-selector=".camera-drag-handle" @item-moved=${this._cameraMoved}>
            <div class="row-list">
              ${cameras.map((cam, idx) => this._renderCameraRow(cam, idx))}
            </div>
          </ha-sortable>
        </div>
      </ha-expansion-panel>
    `;
  }

  private _renderCameraRow(cam: CameraItemConfig, idx: number): TemplateResult {
    const expanded = this._expanded.has(idx);
    const enabled = cam.enabled !== false;
    const friendly = cam.entity
      ? this.hass?.states[cam.entity]?.attributes?.friendly_name
      : undefined;
    const title = cam.name || friendly || cam.entity || `Camera ${idx + 1}`;
    return html`
      <ha-expansion-panel
        outlined
        class="row"
        .expanded=${expanded}
        @expanded-changed=${(ev: CustomEvent) => this._onPanelToggle(idx, ev)}
      >
        <div slot="header" class="row-header">
          <div class="drag-handle camera-drag-handle" @click=${this._stop} title="Drag to reorder">
            <ha-svg-icon .path=${GRIP_ICON_PATH}></ha-svg-icon>
          </div>
          <ha-icon class="row-icon" icon="mdi:cctv"></ha-icon>
          <span class="row-title">${title}</span>
          <ha-switch
            .checked=${enabled}
            @click=${this._stop}
            @change=${(ev: Event) => this._toggleCamera(idx, ev)}
          ></ha-switch>
          <ha-icon-button
            class="warning"
            label="Delete camera"
            .path=${DELETE_ICON_PATH}
            @click=${(ev: Event) => this._removeCamera(idx, ev)}
          ></ha-icon-button>
        </div>
        <div class="row-body">
          <ha-form
            .hass=${this.hass}
            .data=${{
              entity: cam.entity ?? "",
              name: cam.name ?? "",
              camera_view: cam.camera_view ?? "auto",
            }}
            .schema=${[
              { name: "entity", required: true, selector: { entity: { domain: "camera" } } },
              { name: "name", selector: { text: {} } },
              {
                name: "camera_view",
                required: true,
                selector: {
                  select: {
                    mode: "dropdown",
                    options: [
                      { value: "auto", label: "Auto thumbnail (default)" },
                      { value: "live", label: "Live stream" },
                    ],
                  },
                },
              },
            ]}
            .computeLabel=${this._computeLabel}
            @value-changed=${(ev: CustomEvent) => this._onCameraChanged(idx, ev)}
          ></ha-form>
        </div>
      </ha-expansion-panel>
    `;
  }

  private _defaults(): Partial<CameraCardConfig> {
    return {
      theme: "ted-style",
      brushed: false,
      transparency: undefined,
      blur: undefined,
      fit_mode: "cover",
      show_name: false,
      layout: "single",
      big_small_position: "right",
      big_small_width: 25,
      width: this.embedded ? EMBEDDED_BUTTON_SIZE : 800,
      height: this.embedded ? EMBEDDED_BUTTON_SIZE : 450,
    };
  }

  private _appearanceSchema() {
    const inGrid = Boolean(this._config?.grid_options);
    return [
      {
        name: "",
        type: "expandable",
        title: "Appearance (general)",
        iconPath: VISUAL_ICON_PATH,
        flatten: true,
        schema: [
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
              { name: "show_name", selector: { boolean: {} } },
              { name: "brushed", selector: { boolean: {} } },
            ],
          },
          transparencyBlurSchema(this._config?.transparency),
          {
            type: "grid",
            name: "",
            column_min_width: "100px",
            schema: [
              {
                name: "width",
                disabled: this.embedded || inGrid,
                selector: { number: { min: 80, max: 2000, step: 10, mode: "box", unit_of_measurement: "px" } },
              },
              {
                name: "height",
                disabled: this.embedded || inGrid,
                selector: { number: { min: 60, max: 2000, step: 10, mode: "box", unit_of_measurement: "px" } },
              },
            ],
          },
        ],
      },
    ];
  }

  private _interactionsSchema() {
    return [
      {
        name: "",
        type: "expandable",
        title: "Interactions",
        iconPath: INTERACTIONS_ICON_PATH,
        flatten: true,
        schema: [
          {
            name: "tap_action",
            selector: { ui_action: { default_action: "more-info" } },
          },
          {
            name: "",
            type: "optional_actions",
            flatten: true,
            schema: [
              {
                name: "double_tap_action",
                selector: { ui_action: { default_action: "none" } },
              },
            ],
          },
        ],
      },
    ];
  }

  private _computeHelper = (schema: { name: string }): string | undefined => {
    if (schema.name === "width" || schema.name === "height") {
      return "Only used when the card isn't a direct item in a grid (Sections) view.";
    }
    if (schema.name === "aspect_ratio") {
      return "e.g. 16:9. Ignored in a grid (Sections) view with set rows.";
    }
    return undefined;
  };

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "layout":
        return "Layout";
      case "big_small_position":
        return "Small feeds position";
      case "big_small_width":
        return "Small feeds width";
      case "entity":
        return "Camera entity";
      case "name":
        return "Caption (optional)";
      case "show_name":
        return "Show caption";
      case "camera_view":
        return "Camera view";
      case "fit_mode":
        return "Fit mode";
      case "aspect_ratio":
        return "Aspect ratio (optional)";
      case "theme":
        return "Visual styling";
      case "background":
        return "Background color";
      case "brushed":
        return "Brushed effect";
      case "transparency":
        return "Transparency";
      case "blur":
        return "Background blur";
      case "width":
        return "Width (px)";
      case "height":
        return "Height (px)";
      case "tap_action":
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
    this._commit({ ...this._config, ...ev.detail.value } as CameraCardConfig);
  };

  // --- Cameras section handlers ---------------------------------------------

  private _stop = (ev: Event): void => {
    ev.stopPropagation();
  };

  private _onGroupToggle = (ev: CustomEvent): void => {
    this._groupOpen = ev.detail.expanded;
  };

  private _onPanelToggle(idx: number, ev: CustomEvent): void {
    const expanded = new Set(this._expanded);
    if (ev.detail.expanded) expanded.add(idx);
    else expanded.delete(idx);
    this._expanded = expanded;
  }

  private _onLayoutChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    this._commit({ ...this._config, ...ev.detail.value } as CameraCardConfig);
  };

  private _onCameraChanged(idx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value as { entity?: string; name?: string; camera_view?: string };
    const cameras = [...this._cameras()];
    const next: CameraItemConfig = { ...cameras[idx], entity: value.entity ?? "" };
    if (value.name) next.name = value.name;
    else delete next.name;
    if (value.camera_view === "live") next.camera_view = "live";
    else delete next.camera_view;
    cameras[idx] = next;
    this._commit(this._withAutoWidth({ ...this._config, cameras } as CameraCardConfig));
  }

  private _toggleCamera(idx: number, ev: Event): void {
    ev.stopPropagation();
    const checked = (ev.target as HTMLInputElement).checked;
    const cameras = [...this._cameras()];
    const next: CameraItemConfig = { ...cameras[idx] };
    if (checked) delete next.enabled;
    else next.enabled = false;
    cameras[idx] = next;
    this._commit(this._withAutoWidth({ ...this._config, cameras } as CameraCardConfig));
  }

  private _addCamera = (): void => {
    const cameras = [...this._cameras(), { entity: "" } as CameraItemConfig];
    this._expanded = new Set(this._expanded).add(cameras.length - 1);
    this._commit(this._withAutoWidth({ ...this._config, cameras } as CameraCardConfig));
  };

  private _removeCamera(idx: number, ev: Event): void {
    ev.stopPropagation();
    const cameras = [...this._cameras()];
    cameras.splice(idx, 1);
    this._expanded = new Set();
    this._commit(this._withAutoWidth({ ...this._config, cameras } as CameraCardConfig));
  }

  private _cameraMoved = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const cameras = [...this._cameras()];
    cameras.splice(newIndex, 0, cameras.splice(oldIndex, 1)[0]);
    this._expanded = new Set();
    this._commit({ ...this._config, cameras } as CameraCardConfig);
  };

  private _autoPopulate = (): void => {
    if (!this.hass) return;
    const entities = Object.keys(this.hass.states)
      .filter((id) => id.startsWith("camera."))
      .sort();
    if (entities.length === 0) return;
    const cameras: CameraItemConfig[] = entities.map((entity) => ({ entity }));
    this._expanded = new Set();
    this._commit(
      this._withAutoWidth({
        ...this._config,
        cameras,
        layout: layoutForCount(cameras.length),
      } as CameraCardConfig),
    );
  };

  /**
   * In the Multi (big-small) layout, keep the small-feed strip width in sync with
   * the number of visible cameras so every feed comes out the same size.
   */
  private _withAutoWidth(config: CameraCardConfig): CameraCardConfig {
    if ((config.layout ?? "single") !== "big-small") return config;
    const visible = (config.cameras ?? []).filter(
      (cam) => cam.enabled !== false && cam.entity,
    ).length;
    if (visible < 2) return config;
    return { ...config, big_small_width: autoSmallWidth(visible) };
  }

  /** Strip values equal to their default and fire config-changed. */
  private _commit(raw: CameraCardConfig): void {
    const config = { ...raw } as CameraCardConfig;
    const defaults = this._defaults();
    for (const key of Object.keys(defaults) as Array<keyof CameraCardConfig>) {
      if (config[key] === defaults[key]) {
        delete config[key];
      }
    }
    if (!config.aspect_ratio) delete config.aspect_ratio;
    if (!config.background) delete config.background;
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
    .group-actions {
      display: flex;
      align-items: center;
      gap: 4px;
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
    .subgroup-label {
      font-weight: 500;
      color: var(--secondary-text-color);
      margin-top: 4px;
    }
    .feeds-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 4px;
    }
    .feeds-header .subgroup-label {
      margin-top: 0;
    }
    .row-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .row {
      border-radius: 6px;
    }
    .row-header {
      display: flex;
      align-items: center;
      gap: 4px;
      width: 100%;
      min-width: 0;
    }
    .drag-handle {
      display: flex;
      align-items: center;
      padding: 4px;
      color: var(--secondary-text-color);
      cursor: grab;
      touch-action: none;
    }
    .drag-handle > * {
      pointer-events: none;
    }
    .row-icon {
      flex: none;
      color: var(--secondary-text-color);
      --mdc-icon-size: 20px;
    }
    .row-title {
      flex: 1 1 auto;
      min-width: 0;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .row-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 4px 12px 12px;
    }
    .warning {
      color: var(--error-color, #db4437);
    }
    .add-btn {
      background: none;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
      border-radius: 6px;
      color: inherit;
      font: inherit;
      padding: 6px 12px;
      cursor: pointer;
      white-space: nowrap;
    }
    .add-btn[disabled] {
      opacity: 0.5;
      cursor: default;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-camera-card-editor": TedCameraCardEditor;
  }
}
