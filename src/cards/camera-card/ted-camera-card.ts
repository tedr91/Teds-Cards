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
import { brushedOverlay, tedStyleTheme } from "../../shared/theme";
import {
  CAMERA_CARD_DESCRIPTION,
  CAMERA_CARD_EDITOR_TYPE,
  CAMERA_CARD_NAME,
  CAMERA_CARD_TYPE,
} from "./const";
import type { CameraCardConfig } from "./types";

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
    return { entity: cameras[0] ?? "" };
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
    if (!config.entity) {
      throw new Error("You must specify an entity");
    }
    const domain = config.entity.split(".")[0];
    if (domain !== "camera") {
      throw new Error(`ted-camera-card only supports camera entities (got '${domain}')`);
    }
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): GridOptions {
    return {
      columns: 6,
      rows: 3,
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
    const cardWidth = typeof this._config.width === "number" ? this._config.width : 240;
    const cardHeight = typeof this._config.height === "number" ? this._config.height : 135;
    const cardStyle: Record<string, string> = {};
    if (!isGrid) {
      cardStyle.width = `${cardWidth}px`;
      cardStyle.height = `${cardHeight}px`;
      cardStyle.margin = "0 auto";
    }

    const stateObj = this.hass.states[this._config.entity];
    const clickable =
      this._tapIsActive() ||
      hasAction(this._config.hold_action) ||
      hasAction(this._config.double_tap_action);
    const showName = this._config.show_name === true;
    const caption = this._config.name ?? stateObj?.attributes?.friendly_name ?? this._config.entity;
    // hui-image ignores the ratio when laid out by a grid; let the cell decide.
    const aspectRatio = isGrid ? undefined : this._config.aspect_ratio;

    return html`
      <ha-card class=${classMap(themeClasses)} style=${styleMap(cardStyle)}>
        ${this._config.brushed ? brushedOverlay : nothing}
        <div
          class=${classMap({ camera: true, clickable })}
          @click=${this._onClick}
          @pointerdown=${this._onPointerDown}
          @pointerup=${this._onPointerUp}
          @pointercancel=${this._onPointerUp}
          @pointerleave=${this._onPointerUp}
          role=${clickable ? "button" : nothing}
          tabindex=${clickable ? "0" : nothing}
        >
          ${this._imageReady
            ? html`<hui-image
                .hass=${this.hass}
                .cameraImage=${this._config.entity}
                .cameraView=${this._config.camera_view ?? "auto"}
                .fitMode=${this._config.fit_mode ?? "cover"}
                .aspectRatio=${aspectRatio}
              ></hui-image>`
            : html`<div class="placeholder" aria-hidden="true"></div>`}
          ${showName
            ? html`<div class="box"><div class="title">${caption}</div></div>`
            : nothing}
        </div>
      </ha-card>
    `;
  }

  /** Whether a tap should do something: an explicit action, or the more-info default. */
  private _tapIsActive(): boolean {
    const tap = this._config?.tap_action;
    if (tap) return hasAction(tap);
    return Boolean(this._config?.entity);
  }

  private _onPointerDown = (): void => {
    this._longPressFired = false;
    if (!hasAction(this._config?.hold_action)) return;
    if (this._longPressTimer !== undefined) window.clearTimeout(this._longPressTimer);
    this._longPressTimer = window.setTimeout(() => {
      this._longPressTimer = undefined;
      this._longPressFired = true;
      this._dispatch("hold");
    }, LONG_PRESS_MS);
  };

  private _onPointerUp = (): void => {
    if (this._longPressTimer !== undefined) {
      window.clearTimeout(this._longPressTimer);
      this._longPressTimer = undefined;
    }
  };

  private _onClick = (): void => {
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
        this._dispatch("double_tap");
        return;
      }
      this._clickTimer = window.setTimeout(() => {
        this._clickTimer = undefined;
        this._dispatch("tap");
      }, DOUBLE_CLICK_MS);
      return;
    }
    this._dispatch("tap");
  };

  private _dispatch(action: "tap" | "hold" | "double_tap"): void {
    if (!this.hass || !this._config) return;
    if (action === "tap" && !this._tapIsActive()) return;
    if (action === "hold" && !hasAction(this._config.hold_action)) return;
    if (action === "double_tap" && !hasAction(this._config.double_tap_action)) return;
    handleAction(this, this.hass, this._config, action);
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
      .camera {
        position: relative;
        width: 100%;
        height: 100%;
      }
      .camera.clickable {
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
