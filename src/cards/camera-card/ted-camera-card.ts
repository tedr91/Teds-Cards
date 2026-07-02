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

import { ensureHuiImage, type CameraView } from "../../shared/camera";
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

// mdi:check — marks the active view in the long-press popover.
const CHECK_ICON = "M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z";
// mdi:crown — "Make primary camera" option.
const CROWN_ICON =
  "M5,16L3,5L8.5,10L12,4L15.5,10L21,5L19,16H5M19,19A1,1 0 0,1 18,20H6A1,1 0 0,1 5,19V18H19V19Z";

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
  /** Whether the card is scrolled into view. */
  @state() private _onScreen = false;
  /** Whether the browser tab is visible. */
  @state() private _tabVisible = true;
  /** Session-only per-camera view overrides (entity -> view), set via long-press. */
  @state() private _viewOverride: Record<string, CameraView> = {};
  /** Session-only "make primary" override: this camera is moved to the front. */
  @state() private _primaryEntity?: string;
  /** The long-press popover, if open. */
  @state() private _popup?: { entity: string; x: number; y: number };

  private _clickTimer?: number;
  private _longPressTimer?: number;
  private _longPressFired = false;
  private _io?: IntersectionObserver;

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
    // Only stream while the card is actually on-screen and the tab is visible,
    // so feeds (especially live streams) don't burn bandwidth in the background.
    if ("IntersectionObserver" in window) {
      this._io ??= new IntersectionObserver(
        (entries) => {
          this._onScreen = entries.some((e) => e.isIntersecting);
        },
        { rootMargin: "50px" },
      );
      this._io.observe(this);
    } else {
      this._onScreen = true;
    }
    this._tabVisible = document.visibilityState !== "hidden";
    document.addEventListener("visibilitychange", this._onVisibilityChange);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._clearTimers();
    this._io?.disconnect();
    this._popup = undefined;
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
  }

  private _onVisibilityChange = (): void => {
    this._tabVisible = document.visibilityState !== "hidden";
  };

  /** Feeds should only stream when the card is on-screen and the tab is visible. */
  private _streamsActive(): boolean {
    return this._imageReady && this._onScreen && this._tabVisible;
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
      ${this._renderPopover()}
    `;
  }

  /** The cameras that should appear in the layout, in order. */
  private _enabledCameras(): CameraItemConfig[] {
    const cameras = (this._config?.cameras ?? []).filter(
      (cam) => cam.enabled !== false && cam.entity,
    );
    // Session-only "make primary" moves the chosen camera to the front.
    if (this._primaryEntity) {
      const i = cameras.findIndex((cam) => cam.entity === this._primaryEntity);
      if (i > 0) cameras.unshift(cameras.splice(i, 1)[0]);
    }
    return cameras;
  }

  /** The view for a camera: session override, else its config, else auto. */
  private _effectiveView(cam: CameraItemConfig): CameraView {
    return this._viewOverride[cam.entity] ?? cam.camera_view ?? "auto";
  }

  /** Build the tile grid for the configured layout. */
  private _renderLayout(isGrid: boolean): TemplateResult {
    const cameras = this._enabledCameras();
    const layout: CameraLayout = this._config?.layout ?? "single";

    if (layout === "big-small") {
      const position = this._config?.big_small_position === "bottom" ? "bottom" : "right";
      const [big, ...smalls] = cameras;
      const pct = Math.min(60, Math.max(15, this._config?.big_small_width ?? 25));
      const smallsBasis = position === "bottom" ? { height: `${pct}%` } : { width: `${pct}%` };
      return html`
        <div class=${classMap({ "big-small": true, [position]: true })}>
          <div class="big">${this._renderTile(big ?? null, isGrid)}</div>
          ${smalls.length
            ? html`<div class="smalls" style=${styleMap({ flex: `0 0 ${pct}%`, ...smallsBasis })}>
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
    // Long-press always opens the view popover, so every real tile is interactive.
    const clickable = true;
    const showName = this._config?.show_name === true;
    const nameSize = typeof this._config?.name_size === "number" ? this._config.name_size : 14;
    const caption = cam.name ?? stateObj?.attributes?.friendly_name ?? cam.entity;
    // hui-image ignores the ratio when laid out by a grid; let the cell decide.
    const aspectRatio = isGrid ? undefined : this._config?.aspect_ratio;

    return html`
      <div
        class=${classMap({ tile: true, clickable })}
        @click=${() => this._onClick(cam.entity)}
        @pointerdown=${(ev: PointerEvent) => this._onPointerDown(cam, ev)}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerUp}
        @pointerleave=${this._onPointerUp}
        @contextmenu=${this._onContextMenu}
        role="button"
        tabindex="0"
      >
        ${this._streamsActive()
          ? html`<hui-image
              .hass=${this.hass}
              .cameraImage=${cam.entity}
              .cameraView=${this._effectiveView(cam)}
              .fitMode=${this._config?.fit_mode ?? "cover"}
              .aspectRatio=${aspectRatio}
            ></hui-image>`
          : html`<div class="placeholder" aria-hidden="true"></div>`}
        ${showName
          ? html`<div class="box">
              <div class="title" style=${styleMap({ fontSize: `${nameSize}px` })}>${caption}</div>
            </div>`
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

  private _onPointerDown = (cam: CameraItemConfig, ev: PointerEvent): void => {
    this._longPressFired = false;
    const x = ev.clientX;
    const y = ev.clientY;
    if (this._longPressTimer !== undefined) window.clearTimeout(this._longPressTimer);
    this._longPressTimer = window.setTimeout(() => {
      this._longPressTimer = undefined;
      this._longPressFired = true;
      this._openPopup(cam.entity, x, y);
    }, LONG_PRESS_MS);
  };

  private _onPointerUp = (): void => {
    if (this._longPressTimer !== undefined) {
      window.clearTimeout(this._longPressTimer);
      this._longPressTimer = undefined;
    }
  };

  /** Suppress the browser context menu so a touch long-press shows our popover. */
  private _onContextMenu = (ev: Event): void => {
    ev.preventDefault();
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

  private _dispatch(action: "tap" | "double_tap", entity: string): void {
    if (!this.hass || !this._config) return;
    if (action === "tap" && !this._tapIsActive()) return;
    if (action === "double_tap" && !hasAction(this._config.double_tap_action)) return;
    // Actions are card-wide, but the default more-info opens the tapped tile's
    // camera, so run the action against a config scoped to that entity.
    handleAction(this, this.hass, { ...this._config, entity }, action);
  }

  // --- Long-press popover ----------------------------------------------------

  private _openPopup(entity: string, clientX: number, clientY: number): void {
    // Clamp within the viewport (the popover is position: fixed).
    const POP_W = 210;
    const POP_H = 170;
    const left = Math.max(8, Math.min(clientX, window.innerWidth - POP_W - 8));
    const top = Math.max(8, Math.min(clientY, window.innerHeight - POP_H - 8));
    this._popup = { entity, x: left, y: top };
  }

  private _closePopup = (): void => {
    this._popup = undefined;
  };

  private _setView(entity: string, view: CameraView): void {
    this._viewOverride = { ...this._viewOverride, [entity]: view };
    this._closePopup();
  }

  private _makePrimary(entity: string): void {
    this._primaryEntity = entity;
    this._closePopup();
  }

  private _renderPopover(): TemplateResult | typeof nothing {
    const popup = this._popup;
    if (!popup) return nothing;
    const cam = this._config?.cameras.find((c) => c.entity === popup.entity);
    if (!cam) return nothing;
    const view = this._effectiveView(cam);
    const isPrimary = this._enabledCameras()[0]?.entity === popup.entity;
    const name = cam.name ?? this.hass?.states[popup.entity]?.attributes?.friendly_name ?? popup.entity;

    return html`
      <div class="cam-backdrop" @click=${this._closePopup} @contextmenu=${this._onContextMenu}></div>
      <div
        class="cam-popover"
        style=${styleMap({ left: `${popup.x}px`, top: `${popup.y}px` })}
        @click=${(ev: Event) => ev.stopPropagation()}
      >
        <div class="cam-pop-title">${name}</div>
        <button
          type="button"
          class=${classMap({ "cam-pop-item": true, active: view === "auto" })}
          @click=${() => this._setView(popup.entity, "auto")}
        >
          <ha-svg-icon class="check" .path=${CHECK_ICON}></ha-svg-icon>
          <span>Auto thumbnail</span>
        </button>
        <button
          type="button"
          class=${classMap({ "cam-pop-item": true, active: view === "live" })}
          @click=${() => this._setView(popup.entity, "live")}
        >
          <ha-svg-icon class="check" .path=${CHECK_ICON}></ha-svg-icon>
          <span>Live stream</span>
        </button>
        ${!isPrimary
          ? html`<button
              type="button"
              class="cam-pop-item"
              @click=${() => this._makePrimary(popup.entity)}
            >
              <ha-svg-icon .path=${CROWN_ICON}></ha-svg-icon>
              <span>Make primary camera</span>
            </button>`
          : nothing}
      </div>
    `;
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
        flex: 1 1 0;
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
      .cam-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1000;
      }
      .cam-popover {
        position: fixed;
        z-index: 1001;
        min-width: 190px;
        max-width: 260px;
        box-sizing: border-box;
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        border-radius: 12px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #212121);
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
        backdrop-filter: var(--ha-card-backdrop-filter, none);
        -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
      }
      .cam-pop-title {
        font-weight: 600;
        padding: 6px 10px 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cam-pop-item {
        display: flex;
        align-items: center;
        gap: 10px;
        background: none;
        border: none;
        color: inherit;
        font: inherit;
        text-align: left;
        padding: 8px 10px;
        border-radius: 8px;
        cursor: pointer;
      }
      .cam-pop-item:hover {
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.08));
      }
      .cam-pop-item ha-svg-icon {
        --mdc-icon-size: 20px;
        flex: none;
        color: var(--secondary-text-color);
      }
      .cam-pop-item.active {
        color: var(--primary-color);
      }
      .cam-pop-item.active ha-svg-icon.check {
        color: var(--primary-color);
      }
      .cam-pop-item ha-svg-icon.check {
        visibility: hidden;
      }
      .cam-pop-item.active ha-svg-icon.check {
        visibility: visible;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-camera-card": TedCameraCard;
  }
}
