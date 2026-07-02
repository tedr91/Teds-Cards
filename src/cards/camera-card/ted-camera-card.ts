import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardEditor,
  handleAction,
  hasAction,
} from "custom-card-helpers";

import { ensureHuiImage } from "../../shared/camera";
import { registerCustomCard } from "../../shared/register-card";
import { appearanceStyle, cssColor } from "../../shared/appearance";
import { brushedOverlay, tedStyleTheme } from "../../shared/theme";
import {
  CAMERA_CARD_DESCRIPTION,
  CAMERA_CARD_EDITOR_TYPE,
  CAMERA_CARD_NAME,
  CAMERA_CARD_TYPE,
} from "./const";
import type { CameraCardConfig, CameraItemConfig, CameraLayout } from "./types";

const DOUBLE_CLICK_MS = 250;
const LONG_PRESS_MS = 500;

/** Subset of Home Assistant's LovelaceGridOptions for the Sections grid layout. */
interface GridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  max_columns?: number;
  min_rows?: number;
  max_rows?: number;
}

registerCustomCard({
  type: CAMERA_CARD_TYPE,
  name: CAMERA_CARD_NAME,
  description: CAMERA_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/HA-Teds-Cards#camera-card",
  getEntitySuggestion: (_hass, entityId) =>
    entityId.startsWith("camera.")
      ? { config: { type: `custom:${CAMERA_CARD_TYPE}`, entity: entityId } }
      : null,
});

@customElement(CAMERA_CARD_TYPE)
export class TedCameraCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-camera-card-editor");
    return document.createElement(CAMERA_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(hass: HomeAssistant): Omit<CameraCardConfig, "type"> {
    const cameras = Object.keys(hass.states).filter((id) => id.startsWith("camera."));
    return { cameras: cameras[0] ? [{ entity: cameras[0] }] : [] };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: CameraCardConfig;
  @state() private _imageReady = false;

  private _clickTimer?: number;
  private _longPressTimer?: number;
  private _longPressFired = false;

  public setConfig(config: CameraCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    if (!Array.isArray(config.cameras) || config.cameras.length === 0) {
      throw new Error("You must specify at least one camera");
    }
    for (const cam of config.cameras) {
      const domain = cam.entity?.split(".")[0];
      if (cam.entity && domain !== "camera") {
        throw new Error(`ted-camera-card only supports camera entities (got '${domain}')`);
      }
    }
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): GridOptions {
    return {
      columns: 12,
      rows: 4,
      min_columns: 3,
      min_rows: 1,
    };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    if (!this._imageReady) {
      void ensureHuiImage().then((ok) => {
        if (ok) this._imageReady = true;
      });
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._clearTimers();
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;

    const themeMode = this._config.theme === "ha" ? "ha" : "ted-style";
    const themeClasses = {
      "ted-card": true,
      "ted-card--theme-ted-style": themeMode === "ted-style",
      "ted-card--theme-ha": themeMode === "ha",
    };

    // In a grid (Sections) view, honor the grid cell sizing. Everywhere else
    // (stacks, masonry, panel), render at the configured fixed size.
    const isGrid = this.layout === "grid";
    const cardWidth = typeof this._config.width === "number" ? this._config.width : 800;
    const cardHeight = typeof this._config.height === "number" ? this._config.height : 450;
    const cardStyle: Record<string, string> = appearanceStyle({
      background: cssColor(this._config.background),
      transparency: this._config.transparency,
      blur: this._config.blur,
    });
    if (!isGrid) {
      cardStyle.width = `${cardWidth}px`;
      cardStyle.height = `${cardHeight}px`;
      cardStyle.margin = "0 auto";
    }

    return html`
      <ha-card class=${classMap(themeClasses)} style=${styleMap(cardStyle)}>
        ${this._config.brushed ? brushedOverlay : nothing}
        ${this._renderLayout(isGrid)}
      </ha-card>
    `;
  }

  /** The cameras that should appear in the layout, in order. */
  private _enabledCameras(): CameraItemConfig[] {
    return (this._config?.cameras ?? []).filter((cam) => cam.enabled !== false && cam.entity);
  }

  /** Build the tile grid for the configured layout. */
  private _renderLayout(isGrid: boolean): TemplateResult {
    const cameras = this._enabledCameras();
    const layout: CameraLayout = this._config?.layout ?? "single";

    if (layout === "big-small") {
      const position = this._config?.big_small_position === "bottom" ? "bottom" : "right";
      const [big, ...smalls] = cameras;
      return html`
        <div class=${classMap({ "big-small": true, [position]: true })}>
          <div class="big">${this._renderTile(big ?? null, isGrid)}</div>
          ${smalls.length
            ? html`<div class="smalls">
                ${smalls.map((cam) => this._renderTile(cam, isGrid))}
              </div>`
            : nothing}
        </div>
      `;
    }

    const slots = layout === "quad" ? 4 : layout === "dual" ? 2 : 1;
    const tiles: Array<CameraItemConfig | null> = [];
    for (let i = 0; i < slots; i++) tiles.push(cameras[i] ?? null);
    return html`
      <div class=${classMap({ grid: true, [layout]: true })}>
        ${tiles.map((cam) => this._renderTile(cam, isGrid))}
      </div>
    `;
  }

  /** Render a single camera tile, or an empty placeholder when `cam` is null. */
  private _renderTile(cam: CameraItemConfig | null, isGrid: boolean): TemplateResult {
    if (!cam) {
      return html`<div class="tile"><div class="placeholder" aria-hidden="true"></div></div>`;
    }
    const stateObj = this.hass?.states[cam.entity];
    const clickable =
      this._tapIsActive() ||
      hasAction(this._config?.hold_action) ||
      hasAction(this._config?.double_tap_action);
    const showName = this._config?.show_name === true;
    const caption = cam.name ?? stateObj?.attributes?.friendly_name ?? cam.entity;
    // hui-image ignores the ratio when laid out by a grid; let the cell decide.
    const aspectRatio = isGrid ? undefined : this._config?.aspect_ratio;

    return html`
      <div
        class=${classMap({ tile: true, clickable })}
        @click=${() => this._onClick(cam.entity)}
        @pointerdown=${() => this._onPointerDown(cam.entity)}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerUp}
        @pointerleave=${this._onPointerUp}
        role=${clickable ? "button" : nothing}
        tabindex=${clickable ? "0" : nothing}
      >
        ${this._imageReady
          ? html`<hui-image
              .hass=${this.hass}
              .cameraImage=${cam.entity}
              .cameraView=${this._config?.camera_view ?? "auto"}
              .fitMode=${this._config?.fit_mode ?? "cover"}
              .aspectRatio=${aspectRatio}
            ></hui-image>`
          : html`<div class="placeholder" aria-hidden="true"></div>`}
        ${showName
          ? html`<div class="box"><div class="title">${caption}</div></div>`
          : nothing}
      </div>
    `;
  }

  /** Whether a tap should do something: an explicit action, or the more-info default. */
  private _tapIsActive(): boolean {
    const tap = this._config?.tap_action;
    if (tap) return hasAction(tap);
    return this._enabledCameras().length > 0;
  }

  private _onPointerDown = (entity: string): void => {
    this._longPressFired = false;
    if (!hasAction(this._config?.hold_action)) return;
    if (this._longPressTimer !== undefined) window.clearTimeout(this._longPressTimer);
    this._longPressTimer = window.setTimeout(() => {
      this._longPressTimer = undefined;
      this._longPressFired = true;
      this._dispatch("hold", entity);
    }, LONG_PRESS_MS);
  };

  private _onPointerUp = (): void => {
    if (this._longPressTimer !== undefined) {
      window.clearTimeout(this._longPressTimer);
      this._longPressTimer = undefined;
    }
  };

  private _onClick = (entity: string): void => {
    // A long-press already fired — swallow the trailing click.
    if (this._longPressFired) {
      this._longPressFired = false;
      return;
    }
    // Only debounce for a double-tap when one is actually configured.
    if (hasAction(this._config?.double_tap_action)) {
      if (this._clickTimer !== undefined) {
        window.clearTimeout(this._clickTimer);
        this._clickTimer = undefined;
        this._dispatch("double_tap", entity);
        return;
      }
      this._clickTimer = window.setTimeout(() => {
        this._clickTimer = undefined;
        this._dispatch("tap", entity);
      }, DOUBLE_CLICK_MS);
      return;
    }
    this._dispatch("tap", entity);
  };

  private _dispatch(action: "tap" | "hold" | "double_tap", entity: string): void {
    if (!this.hass || !this._config) return;
    if (action === "tap" && !this._tapIsActive()) return;
    if (action === "hold" && !hasAction(this._config.hold_action)) return;
    if (action === "double_tap" && !hasAction(this._config.double_tap_action)) return;
    // Actions are card-wide, but the default more-info opens the tapped tile's
    // camera, so run the action against a config scoped to that entity.
    handleAction(this, this.hass, { ...this._config, entity }, action);
  }

  private _clearTimers(): void {
    if (this._clickTimer !== undefined) {
      window.clearTimeout(this._clickTimer);
      this._clickTimer = undefined;
    }
    if (this._longPressTimer !== undefined) {
      window.clearTimeout(this._longPressTimer);
      this._longPressTimer = undefined;
    }
  }

  static styles = [
    tedStyleTheme,
    css`
      :host {
        display: block;
        height: 100%;
      }
      ha-card {
        position: relative;
        overflow: hidden;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        padding: 0;
      }
      /* Layout containers all fill the card. */
      .grid,
      .big-small {
        width: 100%;
        height: 100%;
        gap: 2px;
      }
      .grid {
        display: grid;
      }
      .grid.single {
        grid-template-columns: 1fr;
        grid-template-rows: 1fr;
      }
      .grid.dual {
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr;
      }
      .grid.quad {
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr;
      }
      .big-small {
        display: flex;
      }
      .big-small.right {
        flex-direction: row;
      }
      .big-small.bottom {
        flex-direction: column;
      }
      .big-small .big {
        flex: 2 1 0;
        min-width: 0;
        min-height: 0;
      }
      .big-small .smalls {
        flex: 1 1 0;
        display: flex;
        gap: 2px;
        min-width: 0;
        min-height: 0;
      }
      .big-small.right .smalls {
        flex-direction: column;
      }
      .big-small.bottom .smalls {
        flex-direction: row;
      }
      .big-small .smalls > .tile {
        flex: 1 1 0;
        min-width: 0;
        min-height: 0;
      }
      .tile {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      .tile.clickable {
        cursor: pointer;
      }
      hui-image {
        display: block;
        width: 100%;
        height: 100%;
      }
      .placeholder {
        width: 100%;
        height: 100%;
        background: var(--ted-style-surface-2, rgba(0, 0, 0, 0.2));
      }
      .box {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 6px 10px;
        background-color: rgba(0, 0, 0, 0.4);
      }
      .title {
        color: #fff;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-camera-card": TedCameraCard;
  }
}
