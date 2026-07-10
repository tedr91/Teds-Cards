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
import { SettingsController, settingsStore } from "../../shared/settings";
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
// mdi:cctv — empty-state illustration.
const CCTV_ICON =
  "M18.14,7.35L16.17,8.87C16.72,9.83 16.66,11.05 15.9,11.97L15.24,11.05L11.31,5.68L10.65,4.76C11.7,3.97 13.19,4.16 14,5.21C14.33,4.55 14.97,4.1 15.71,4H15.83C16.5,4 17.13,4.29 17.58,4.79L18.11,5.44M11.31,5.68L15.24,11.05L14.29,11.74C13.79,11.05 12.82,10.9 12.13,11.4C11.44,11.9 11.29,12.87 11.79,13.56C12.29,14.25 13.26,14.4 13.95,13.9L14.19,13.72V19H18V21H2V19H8V13.28C7.65,13.19 7.32,13 7.05,12.71L2.6,14L2,12.08L11.31,5.68Z";
// mdi:cog — empty-state "Settings" button.
const COG_ICON =
  "M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z";

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
  documentationURL: "https://github.com/tedr91/Teds-Cards#camera-card",
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

  public constructor() {
    super();
    // Keep this device's settings live so `cameras_source: settings` stays in sync.
    new SettingsController(this, () => this.hass);
  }

  public setConfig(config: CameraCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    const fromSettings = config.cameras_source === "settings";
    if (!fromSettings && (!Array.isArray(config.cameras) || config.cameras.length === 0)) {
      throw new Error("You must specify at least one camera");
    }
    for (const cam of config.cameras ?? []) {
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
    // (stacks, masonry, panel), render at the configured fixed size — unless `fill`
    // is set, in which case the card fills its parent (e.g. a grid-layout area).
    const isGrid = this.layout === "grid";
    const fill = this._config.fill === true;
    const cardWidth = typeof this._config.width === "number" ? this._config.width : 800;
    const cardHeight = typeof this._config.height === "number" ? this._config.height : 450;
    const cardStyle: Record<string, string> = appearanceStyle({
      background: cssColor(this._config.background),
      transparency: this._config.transparency,
      blur: this._config.blur,
    });
    if (!isGrid && !fill) {
      cardStyle.width = `${cardWidth}px`;
      cardStyle.height = `${cardHeight}px`;
      cardStyle.margin = "0 auto";
    }

    const empty =
      this._config.cameras_source === "settings" && this._sourceCameras().length === 0;

    return html`
      <ha-card class=${classMap(themeClasses)} style=${styleMap(cardStyle)}>
        ${this._config.brushed ? brushedOverlay : nothing}
        ${empty ? this._renderEmpty() : this._renderLayout(isGrid)}
      </ha-card>
      ${this._renderPopover()}
    `;
  }

  /** The raw camera list — from config, or resolved from this device's settings. */
  private _sourceCameras(): CameraItemConfig[] {
    if (this._config?.cameras_source === "settings") return this._settingsCameras();
    return this._config?.cameras ?? [];
  }

  /** Resolve this device's cameras from settings: the device's curated subset (else
   *  the global available list), always limited to the global allow-list. */
  private _settingsCameras(): CameraItemConfig[] {
    const asIds = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    const global = asIds(settingsStore.globalSettings().cameras_list);
    const device = settingsStore.deviceSettings();
    const chosen = "cameras_list" in device ? asIds(device.cameras_list) : global;
    const limited = global.length ? chosen.filter((id) => global.includes(id)) : chosen;
    return limited.map((entity) => ({ entity }));
  }

  /** The cameras that should appear in the layout, in order. */
  private _enabledCameras(): CameraItemConfig[] {
    const cameras = this._sourceCameras().filter((cam) => cam.enabled !== false && cam.entity);
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

  /** The effective layout. In settings mode (and when the card doesn't pin `layout`),
   *  it comes from this device's `cameras_layout` setting; otherwise the card config. */
  private _effectiveLayout(): CameraLayout {
    if (this._config?.cameras_source === "settings" && this._config?.layout === undefined) {
      const valid: CameraLayout[] = ["single", "dual", "quad", "big-small", "auto"];
      const s = settingsStore.effective().cameras_layout;
      if (typeof s === "string" && (valid as string[]).includes(s)) return s as CameraLayout;
    }
    return this._config?.layout ?? "single";
  }

  /** Build the tile grid for the configured layout. */
  private _renderLayout(isGrid: boolean): TemplateResult {
    const cameras = this._enabledCameras();
    const layout: CameraLayout = this._effectiveLayout();

    if (layout === "auto") {
      const n = Math.max(cameras.length, 1);
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      return html`
        <div
          class="grid auto"
          style=${styleMap({
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          })}
        >
          ${cameras.map((cam) => this._renderTile(cam, isGrid))}
        </div>
      `;
    }

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
    const cam = this._sourceCameras().find((c) => c.entity === popup.entity);
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

  // --- Empty-state (settings mode) -------------------------------------------

  /** The path the empty-state "Settings" button navigates to. */
  private _settingsPath(): string {
    const root = String(settingsStore.effective().dashboard_root ?? "ted-dashboard");
    const raw = this._config?.settings_path || "[root]/settings?tab=cameras";
    let path = raw.replace("[root]", root);
    if (!path.startsWith("/")) path = `/${path}`;
    return path;
  }

  private _openSettings = (): void => {
    const path = this._settingsPath();
    window.history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
  };

  /** Shown in `settings` mode when this device has no cameras available. */
  private _renderEmpty(): TemplateResult {
    const title = this._config?.empty_title ?? "No cameras yet";
    const message =
      this._config?.empty_message ??
      "This device hasn't been given any cameras. Open Settings to choose which cameras to show.";
    return html`
      <div class="empty">
        <ha-svg-icon class="empty-icon" .path=${CCTV_ICON}></ha-svg-icon>
        <div class="empty-title">${title}</div>
        <div class="empty-msg">${message}</div>
        <button type="button" class="empty-btn" @click=${this._openSettings}>
          <ha-svg-icon .path=${COG_ICON}></ha-svg-icon>
          <span>Settings</span>
        </button>
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
      .grid.auto {
        /* grid-template-columns/rows are set inline from the camera count. */
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
      .empty {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 24px;
        box-sizing: border-box;
        text-align: center;
        color: var(--ted-style-text, var(--primary-text-color));
      }
      .empty-icon {
        --mdc-icon-size: 46px;
        color: var(--ted-style-accent, var(--primary-color));
        opacity: 0.9;
      }
      .empty-title {
        font-size: 1.05rem;
        font-weight: 600;
      }
      .empty-msg {
        max-width: 360px;
        font-size: 0.9rem;
        color: var(--ted-style-muted, var(--secondary-text-color));
      }
      .empty-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
        padding: 8px 16px;
        border: none;
        border-radius: 10px;
        background: var(--ted-style-accent, var(--primary-color));
        color: #fff;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .empty-btn ha-svg-icon {
        --mdc-icon-size: 18px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-camera-card": TedCameraCard;
  }
}
