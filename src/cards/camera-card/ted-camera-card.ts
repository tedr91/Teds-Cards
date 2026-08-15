import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import { ref } from "lit/directives/ref.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardConfig,
  type LovelaceCardEditor,
  handleAction,
  hasAction,
} from "custom-card-helpers";

import { ensureHuiImage, detectSubstream } from "../../shared/camera";
import type { CameraView, StreamQuality } from "../../shared/camera";
import {
  createMsePlayer,
  isMseSupported,
  type MsePlayerErrorKind,
  type MsePlayerHandle,
} from "../../shared/mse-player";
import {
  createWebRtcPlayer,
  isH265WebRtcSupported,
  isWebRtcSupported,
  type WebRtcPlayerErrorKind,
  type WebRtcPlayerHandle,
} from "../../shared/webrtc-player";
import { pendingCameraFocus, subscribeCameraFocus } from "../../shared/camera-focus";
import { registerCustomCard } from "../../shared/register-card";
import { appearanceStyle, cssColor } from "../../shared/appearance";
import { brushedOverlay, tedStyleTheme } from "../../shared/theme";
import { themedIcon } from "../../shared/icons";
import { SettingsController, settingsStore } from "../../shared/settings";
import { frigateCameraInfo, frigateUrl, isFrigateCamera } from "../../shared/frigate";
import {
  CAMERA_CARD_DESCRIPTION,
  CAMERA_CARD_EDITOR_TYPE,
  CAMERA_CARD_NAME,
  CAMERA_CARD_TYPE,
} from "./const";
import type { CameraCardConfig, CameraItemConfig, CameraLayout, FrigateCameraMeta } from "./types";

/** Home Assistant's `loadCardHelpers()` return shape (only what this card uses). */
interface CardHelpers {
  createCardElement(config: LovelaceCardConfig): LovelaceCard;
}

const DOUBLE_CLICK_MS = 250;
const LONG_PRESS_MS = 500;

/** go2rtc stream-name suffix per quality tier; `low` uses the base (detect) stream. */
const MSE_STREAM_SUFFIX: Record<StreamQuality, string> = { low: "", medium: "_med", high: "_high" };

/** Grace period before a hidden tab tears down its streams, so a quick alt-tab
 *  doesn't force a full reconnect on return. */
const HIDE_GRACE_MS = 10000;

// mdi:check — marks the active view in the long-press popover.
const CHECK_ICON = "M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z";
// mdi:crown — "Make primary camera" option.
const CROWN_ICON =
  "M5,16L3,5L8.5,10L12,4L15.5,10L21,5L19,16H5M19,19A1,1 0 0,1 18,20H6A1,1 0 0,1 5,19V18H19V19Z";
// mdi:filmstrip — "Recordings" (opens the Frigate web UI).
const FILMSTRIP_ICON =
  "M18,4L20,8H17L15,4H13L15,8H12L10,4H8L10,8H7L5,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V4H18Z";
// mdi:volume-high — primary tile audio is on.
const VOLUME_HIGH_ICON =
  "M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z";
// mdi:volume-off — primary tile audio is muted.
const VOLUME_OFF_ICON =
  "M12,4L9.91,6.09L12,8.18M4.27,3L3,4.27L7.73,9H3V15H7L12,20V13.27L16.25,17.53C15.58,18.04 14.83,18.46 14,18.7V20.77C15.38,20.45 16.63,19.82 17.68,18.96L19.73,21L21,19.73L12,10.73M19,12C19,12.94 18.8,13.82 18.46,14.64L19.97,16.15C20.62,14.91 21,13.5 21,12C21,7.72 18,4.14 14,3.23V5.29C16.89,6.15 19,8.83 19,12M16.5,12C16.5,10.23 15.5,8.71 14,7.97V10.18L16.45,12.63C16.5,12.43 16.5,12.21 16.5,12Z";

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
  /** Session-only: whether the primary tile's audio is muted (starts muted). */
  @state() private _primaryMuted = true;

  private _clickTimer?: number;
  private _longPressTimer?: number;
  private _longPressFired = false;
  private _io?: IntersectionObserver;
  private _unsubFocus?: () => void;
  /** Pending "tab hidden" teardown timer (grace period before going inactive). */
  private _hideTimer?: number;

  /** Live MSE players keyed by `${entity}|${stream}`. */
  private _msePlayers = new Map<string, MsePlayerHandle>();
  /** Stable Lit ref callbacks per key, so re-renders don't thrash the players. */
  private _mseRefCbs = new Map<string, (el: Element | undefined) => void>();
  /** Cameras whose MSE failed this session — they stick to `<hui-image>`. */
  private _mseFailed = new Set<string>();

  /** Live WebRTC players keyed by `${entity}|${stream}`. */
  private _webrtcPlayers = new Map<string, WebRtcPlayerHandle>();
  /** Stable Lit ref callbacks per WebRTC key. */
  private _webrtcRefCbs = new Map<string, (el: Element | undefined) => void>();
  /** Cameras whose WebRTC failed this session — they fall back to MSE. */
  private _webrtcFailed = new Set<string>();

  private _helpers?: CardHelpers;
  /** The empty-state messagebox child (built once via loadCardHelpers, json-guarded). */
  private _emptyCard?: LovelaceCard;
  private _emptyJson?: string;
  private _lastPropagatedHass?: HomeAssistant;

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
    void this._loadHelpers();
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
    // Vision "Display live feed" nudges this card to focus a camera (primary + live).
    this._unsubFocus = subscribeCameraFocus(this._focusCamera);
    const pending = pendingCameraFocus();
    if (pending) this._focusCamera(pending);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._clearTimers();
    this._io?.disconnect();
    this._popup = undefined;
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
    this._unsubFocus?.();
    this._unsubFocus = undefined;
    if (this._hideTimer !== undefined) {
      window.clearTimeout(this._hideTimer);
      this._hideTimer = undefined;
    }
    for (const player of this._msePlayers.values()) player.destroy();
    this._msePlayers.clear();
    this._mseRefCbs.clear();
    for (const player of this._webrtcPlayers.values()) player.destroy();
    this._webrtcPlayers.clear();
    this._webrtcRefCbs.clear();
  }

  /** Focus a camera on request: make it primary and switch it to a live stream. */
  private _focusCamera = (entity: string): void => {
    this._primaryEntity = entity;
    this._viewOverride = { ...this._viewOverride, [entity]: "live" };
  };

  private _onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      // Grace period: a brief alt-tab shouldn't tear down every stream and force a
      // full reconnect on return. Only go inactive if still hidden when it fires.
      if (this._hideTimer === undefined) {
        this._hideTimer = window.setTimeout(() => {
          this._hideTimer = undefined;
          this._tabVisible = false;
        }, HIDE_GRACE_MS);
      }
    } else {
      if (this._hideTimer !== undefined) {
        window.clearTimeout(this._hideTimer);
        this._hideTimer = undefined;
      }
      this._tabVisible = true;
    }
  };

  /** Feeds should only stream when the card is on-screen and the tab is visible. */
  private _streamsActive(): boolean {
    return this._imageReady && this._onScreen && this._tabVisible;
  }

  private async _loadHelpers(): Promise<void> {
    if (this._helpers) return;
    const loader = (window as unknown as { loadCardHelpers?: () => Promise<CardHelpers> })
      .loadCardHelpers;
    if (!loader) return;
    this._helpers = await loader();
    this.requestUpdate();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("hass") && this.hass && this.hass !== this._lastPropagatedHass) {
      this._lastPropagatedHass = this.hass;
      if (this._emptyCard) this._emptyCard.hass = this.hass;
    }
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;

    const themeMode = this._config.theme === "ted-style" ? "ted-style" : "ha";
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

    // Empty state: a transparent, centered ted-messagebox-card (matching the
    // Climate/Music/Calendar cards) rather than the opaque camera surface.
    if (empty) {
      if (!this._helpers) return html`<div class="loading"></div>`;
      return html`${this._renderEmpty()}${this._renderPopover()}`;
    }

    return html`
      <ha-card class=${classMap(themeClasses)} style=${styleMap(cardStyle)}>
        ${this._config.brushed ? brushedOverlay : nothing}
        ${this._renderLayout(isGrid)}
      </ha-card>
      ${this._renderPopover()}
    `;
  }

  /** The raw camera list — from config, or resolved from this device's settings.
   *  Both paths are enriched with Frigate MSE metadata from the TDS backend. */
  private _sourceCameras(): CameraItemConfig[] {
    const cams =
      this._config?.cameras_source === "settings"
        ? this._settingsCameras()
        : this._config?.cameras ?? [];
    return this._withFrigate(cams);
  }

  /** The global entity->Frigate metadata map surfaced by the TDS backend, if any. */
  private _frigateCameraMap(): Record<string, FrigateCameraMeta> | undefined {
    const raw = settingsStore.globalSettings().frigate_cameras;
    return raw && typeof raw === "object" ? (raw as Record<string, FrigateCameraMeta>) : undefined;
  }

  /** Attach `frigate` metadata to any camera the backend knows about (both config-
   *  and settings-sourced), so YAML-configured Frigate cameras get MSE too. */
  private _withFrigate(cams: CameraItemConfig[]): CameraItemConfig[] {
    const map = this._frigateCameraMap();
    if (!map) return cams;
    return cams.map((cam) => {
      if (cam.frigate || !cam.entity) return cam;
      const meta = map[cam.entity];
      return meta ? { ...cam, frigate: meta } : cam;
    });
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

  /** The view for a camera: session override, else its config, else `live` for the
   *  primary tile (one always-on feed) and `auto` (thumbnail) for the rest. */
  private _effectiveView(cam: CameraItemConfig): CameraView {
    const explicit = this._viewOverride[cam.entity] ?? cam.camera_view;
    if (explicit) return explicit;
    return this._isPrimaryCamera(cam.entity) ? "live" : "auto";
  }

  /** The camera entity to render for a given quality tier. Explicit config wins,
   *  then an auto-detected sibling substream (by naming convention), then the
   *  main `entity`. `high` is always the main `entity`. */
  private _streamEntity(cam: CameraItemConfig, quality: StreamQuality): string {
    if (quality === "high") return cam.entity;
    if (quality === "medium") {
      return cam.stream_medium ?? this._autoSubstream(cam.entity, "medium") ?? cam.entity;
    }
    return (
      cam.stream_low ??
      this._autoSubstream(cam.entity, "low") ??
      cam.stream_medium ??
      this._autoSubstream(cam.entity, "medium") ??
      cam.entity
    );
  }

  /** Find a sibling camera entity for the requested quality (same device + related
   *  name), so renamed cameras still resolve to their substreams. */
  private _autoSubstream(entity: string, quality: "medium" | "low"): string | undefined {
    if (!this.hass) return undefined;
    const cameraIds = Object.keys(this.hass.states).filter((id) => id.startsWith("camera."));
    return detectSubstream(entity, quality, cameraIds, (id) => this._deviceOf(id));
  }

  /** The registry device id for an entity, if the frontend exposes the registry. */
  private _deviceOf(entityId: string): string | undefined {
    const reg = (this.hass as unknown as { entities?: Record<string, { device_id?: string | null }> })
      .entities;
    return reg?.[entityId]?.device_id ?? undefined;
  }

  /** Render a tile's stream: for a live Frigate camera prefer go2rtc **WebRTC**
   *  (carries Opus audio + H.265), fall back to **MSE** (video-only), then to
   *  `<hui-image>` for everything else / after failures. */
  private _renderStream(
    cam: CameraItemConfig,
    quality: StreamQuality,
    aspectRatio: string | undefined,
  ): TemplateResult {
    const transport = this._frigateLiveTransport(cam);
    if (transport === "webrtc") return this._renderWebRtcVideo(cam, quality);
    if (transport === "mse") return this._renderMseVideo(cam, quality);
    return html`<hui-image
      .hass=${this.hass}
      .cameraImage=${this._streamEntity(cam, quality)}
      .cameraView=${this._effectiveView(cam)}
      .fitMode=${this._config?.fit_mode ?? "cover"}
      .aspectRatio=${aspectRatio}
    ></hui-image>`;
  }

  /** Which live transport a Frigate camera should use right now: WebRTC first, MSE
   *  after WebRTC fails, else none (falls back to `<hui-image>`). Only for cameras
   *  with backend Frigate metadata explicitly set to `live`. */
  private _frigateLiveTransport(cam: CameraItemConfig): "webrtc" | "mse" | null {
    if (!cam.frigate?.camera_name || this._effectiveView(cam) !== "live") return null;
    // WebRTC only where the browser can actually decode H.265 over it (Chrome/Electron);
    // browsers that can't (e.g. Edge) would receive no video, so they use MSE instead.
    if (!this._webrtcFailed.has(cam.entity) && isWebRtcSupported() && isH265WebRtcSupported())
      return "webrtc";
    if (!this._mseFailed.has(cam.entity) && isMseSupported()) return "mse";
    return null;
  }

  /** The primary camera is the first enabled tile; only it carries audio. */
  private _isPrimaryCamera(entity: string): boolean {
    return this._enabledCameras()[0]?.entity === entity;
  }

  /** Speaker toggle shown on the primary live WebRTC tile to mute/unmute its audio. */
  private _renderAudioToggle(): TemplateResult {
    const muted = this._primaryMuted;
    return html`<button
      class="cam-audio"
      @click=${this._toggleAudio}
      @pointerdown=${(ev: Event) => ev.stopPropagation()}
      title=${muted ? "Unmute" : "Mute"}
      aria-label=${muted ? "Unmute" : "Mute"}
    >
      <ha-svg-icon .path=${muted ? VOLUME_OFF_ICON : VOLUME_HIGH_ICON}></ha-svg-icon>
    </button>`;
  }

  private _toggleAudio = (ev: Event): void => {
    ev.stopPropagation();
    this._primaryMuted = !this._primaryMuted;
    const primary = this._enabledCameras()[0];
    if (!primary) return;
    for (const [key, player] of this._webrtcPlayers) {
      if (key.startsWith(`${primary.entity}|`)) player.setMuted(this._primaryMuted);
    }
  };

  /** A `<video>` bound to a go2rtc WebRTC player. Only the primary tile is unmuted. */
  private _renderWebRtcVideo(cam: CameraItemConfig, quality: StreamQuality): TemplateResult {
    const stream = cam.frigate!.camera_name + MSE_STREAM_SUFFIX[quality];
    // Every tile starts muted so it always autoplays; the primary tile carries a
    // speaker toggle to unmute (a user gesture the browser then allows).
    const muted = this._isPrimaryCamera(cam.entity) ? this._primaryMuted : true;
    const key = `${cam.entity}|${stream}`;
    const poster = this.hass?.states[cam.entity]?.attributes?.entity_picture as string | undefined;
    const fit = this._config?.fit_mode ?? "cover";
    return html`<video
      class=${classMap({ mse: true, [fit]: true })}
      ?muted=${muted}
      playsinline
      autoplay
      poster=${poster ?? nothing}
      ${ref(this._webrtcRef(cam, stream, key, muted))}
    ></video>`;
  }

  private _webrtcRef(
    cam: CameraItemConfig,
    stream: string,
    key: string,
    muted: boolean,
  ): (el: Element | undefined) => void {
    let cb = this._webrtcRefCbs.get(key);
    if (!cb) {
      cb = (el: Element | undefined): void => {
        if (el instanceof HTMLVideoElement) {
          this._attachWebRtc(cam, stream, key, muted, el);
        } else {
          this._destroyWebRtc(key);
          this._webrtcRefCbs.delete(key);
        }
      };
      this._webrtcRefCbs.set(key, cb);
    }
    return cb;
  }

  private _attachWebRtc(
    cam: CameraItemConfig,
    stream: string,
    key: string,
    muted: boolean,
    video: HTMLVideoElement,
  ): void {
    if (this._webrtcPlayers.has(key) || !cam.frigate || !this.hass) return;
    const player = createWebRtcPlayer({
      hass: this.hass,
      instanceId: cam.frigate.instance_id,
      stream,
      muted,
      onError: (kind, detail) => this._onWebRtcError(cam.entity, kind, detail),
    });
    this._webrtcPlayers.set(key, player);
    player.attach(video);
  }

  private _destroyWebRtc(key: string): void {
    const player = this._webrtcPlayers.get(key);
    if (player) {
      player.destroy();
      this._webrtcPlayers.delete(key);
    }
  }

  /** On WebRTC failure, mark the camera WebRTC-ineligible and re-render it through the
   *  MSE fallback. Silent to the user; logged for diagnostics only. */
  private _onWebRtcError(entity: string, kind: WebRtcPlayerErrorKind, detail: string): void {
    // eslint-disable-next-line no-console
    console.warn(`[ted-camera-card] WebRTC ${kind} for ${entity}: ${detail}; falling back to MSE`);
    this._webrtcFailed.add(entity);
    for (const [key, player] of this._webrtcPlayers) {
      if (key.startsWith(`${entity}|`)) {
        player.destroy();
        this._webrtcPlayers.delete(key);
      }
    }
    this.requestUpdate();
  }

  /** A `<video>` bound to an MSE player, with the current still as its poster so the
   *  tile shows a frame during the ~1 s connect instead of going black. */
  private _renderMseVideo(cam: CameraItemConfig, quality: StreamQuality): TemplateResult {
    const stream = cam.frigate!.camera_name + MSE_STREAM_SUFFIX[quality];
    const key = `${cam.entity}|${stream}`;
    const poster = this.hass?.states[cam.entity]?.attributes?.entity_picture as string | undefined;
    const fit = this._config?.fit_mode ?? "cover";
    return html`<video
      class=${classMap({ mse: true, [fit]: true })}
      muted
      playsinline
      autoplay
      poster=${poster ?? nothing}
      ${ref(this._mseRef(cam, stream, key))}
    ></video>`;
  }

  /** A stable ref callback per stream key: attach a player on mount, destroy on unmount. */
  private _mseRef(
    cam: CameraItemConfig,
    stream: string,
    key: string,
  ): (el: Element | undefined) => void {
    let cb = this._mseRefCbs.get(key);
    if (!cb) {
      cb = (el: Element | undefined): void => {
        if (el instanceof HTMLVideoElement) {
          this._attachMse(cam, stream, key, el);
        } else {
          this._destroyMse(key);
          this._mseRefCbs.delete(key);
        }
      };
      this._mseRefCbs.set(key, cb);
    }
    return cb;
  }

  private _attachMse(
    cam: CameraItemConfig,
    stream: string,
    key: string,
    video: HTMLVideoElement,
  ): void {
    if (this._msePlayers.has(key) || !cam.frigate || !this.hass) return;
    const player = createMsePlayer({
      hass: this.hass,
      instanceId: cam.frigate.instance_id,
      stream,
      onError: (kind, detail) => this._onMseError(cam.entity, kind, detail),
    });
    this._msePlayers.set(key, player);
    player.attach(video);
  }

  private _destroyMse(key: string): void {
    const player = this._msePlayers.get(key);
    if (player) {
      player.destroy();
      this._msePlayers.delete(key);
    }
  }

  /** On any MSE failure, mark the camera ineligible for the session and re-render it
   *  through `<hui-image>`. Silent to the user; logged for diagnostics only. */
  private _onMseError(entity: string, kind: MsePlayerErrorKind, detail: string): void {
    // eslint-disable-next-line no-console
    console.warn(`[ted-camera-card] MSE ${kind} for ${entity}: ${detail}; using hui-image`);
    this._mseFailed.add(entity);
    for (const [key, player] of this._msePlayers) {
      if (key.startsWith(`${entity}|`)) {
        player.destroy();
        this._msePlayers.delete(key);
      }
    }
    this.requestUpdate();
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
          ${cameras.map((cam) => this._renderTile(cam, isGrid, "medium"))}
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
          <div class="big">${this._renderTile(big ?? null, isGrid, "medium")}</div>
          ${smalls.length
            ? html`<div class="smalls" style=${styleMap({ flex: `0 0 ${pct}%`, ...smallsBasis })}>
                ${smalls.map((cam) => this._renderTile(cam, isGrid, "low"))}
              </div>`
            : nothing}
        </div>
      `;
    }

    const slots = layout === "quad" ? 4 : layout === "dual" ? 2 : 1;
    // Single fills the card (high-res); dual/quad tiles are smaller (medium).
    const quality: StreamQuality = layout === "single" ? "high" : "medium";
    const tiles: Array<CameraItemConfig | null> = [];
    for (let i = 0; i < slots; i++) tiles.push(cameras[i] ?? null);
    return html`
      <div class=${classMap({ grid: true, [layout]: true })}>
        ${tiles.map((cam) => this._renderTile(cam, isGrid, quality))}
      </div>
    `;
  }

  /** Render a single camera tile, or an empty placeholder when `cam` is null. */
  private _renderTile(
    cam: CameraItemConfig | null,
    isGrid: boolean,
    quality: StreamQuality,
  ): TemplateResult {
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
          ? this._renderStream(cam, quality, aspectRatio)
          : html`<div class="placeholder" aria-hidden="true"></div>`}
        ${this._isPrimaryCamera(cam.entity) && this._frigateLiveTransport(cam) === "webrtc"
          ? this._renderAudioToggle()
          : nothing}
        ${showName
          ? html`<div class="box">
              <div class="title" style=${styleMap({ fontSize: `${nameSize}px` })}>${caption}</div>
            </div>`
          : nothing}
        ${this._renderHealthChips(cam.entity)}
      </div>
    `;
  }

  /** Passive Frigate status chips (review status + active object counts) on a tile. */
  private _renderHealthChips(entity: string): TemplateResult | typeof nothing {
    if (!this.hass || settingsStore.effective().frigate_health === false) return nothing;
    if (!isFrigateCamera(this.hass, entity)) return nothing;
    const info = frigateCameraInfo(this.hass, entity);
    const status = (info.reviewStatus ?? "").toLowerCase();
    const showStatus = status === "alert" || status === "detection";
    if (!showStatus && info.counts.length === 0) return nothing;
    return html`<div class="cam-fchips">
      ${showStatus
        ? html`<span class="fchip status ${status}">${status === "alert" ? "Alert" : "Detection"}</span>`
        : nothing}
      ${info.counts.map((c) => html`<span class="fchip">${c.label} ${c.count}</span>`)}
    </div>`;
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
        ${this._renderFrigatePopItems(popup.entity)}
      </div>
    `;
  }

  /** Frigate control toggles (detect/recordings/snapshots) + a Recordings link, shown
   *  in the long-press popover for a Frigate camera. */
  private _renderFrigatePopItems(entity: string): TemplateResult | typeof nothing {
    if (!this.hass || !isFrigateCamera(this.hass, entity)) return nothing;
    const controls = settingsStore.effective().frigate_controls !== false;
    const info = controls ? frigateCameraInfo(this.hass, entity) : { switches: [], counts: [] };
    const url = frigateUrl(this.hass);
    if (info.switches.length === 0 && !url) return nothing;
    return html`
      <div class="cam-pop-sep"></div>
      ${info.switches.map(
        (sw) => html`<button
          type="button"
          class=${classMap({ "cam-pop-item": true, active: sw.on })}
          @click=${() => this._toggleFrigateSwitch(sw.entity)}
        >
          <ha-svg-icon class="check" .path=${CHECK_ICON}></ha-svg-icon>
          <span>${sw.label}</span>
          <span class="cam-pop-state">${sw.on ? "On" : "Off"}</span>
        </button>`,
      )}
      ${url
        ? html`<button type="button" class="cam-pop-item" @click=${() => this._openRecordings(url)}>
            <ha-svg-icon .path=${FILMSTRIP_ICON}></ha-svg-icon>
            <span>Recordings</span>
          </button>`
        : nothing}
    `;
  }

  private _toggleFrigateSwitch(entity: string): void {
    void this.hass?.callService("switch", "toggle", { entity_id: entity });
  }

  /** Open the Frigate review/recordings web UI in the dashboard's webview view. */
  private _openRecordings(url: string): void {
    const root = String(settingsStore.effective().dashboard_root ?? "ted-dashboard");
    const target = `/${root}/webview?url=${encodeURIComponent(`${url}/review`)}`;
    window.history.pushState(null, "", target);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
    this._closePopup();
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

  /** Config for the empty-state messagebox (rendered as a real ted-messagebox-card
   *  so the empty state matches the other cards' empty states). */
  private _emptyConfig(): LovelaceCardConfig {
    const title = this._config?.empty_title ?? "No cameras yet";
    const message =
      this._config?.empty_message ??
      "This device hasn't been given any cameras. Open Settings to choose which cameras to show.";
    return {
      type: "custom:ted-messagebox-card",
      theme: this._config?.theme === "ted-style" ? "ted-style" : "ha",
      severity: "info",
      icon: themedIcon("camera"),
      title,
      message,
      actions: [
        {
          label: "Settings",
          icon: themedIcon("settings"),
          action: "navigate",
          navigation_path: this._settingsPath(),
          variant: "primary",
        },
      ],
    };
  }

  /** Shown in `settings` mode when this device has no cameras available. */
  private _renderEmpty(): TemplateResult {
    const cfg = this._emptyConfig();
    const json = JSON.stringify(cfg);
    if (!this._emptyCard || this._emptyJson !== json) {
      this._emptyCard = this._helpers!.createCardElement(cfg);
      this._emptyJson = json;
    }
    if (this.hass) this._emptyCard.hass = this.hass;
    return html`<div class="empty-wrap">${this._emptyCard}</div>`;
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
      video.mse {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      video.mse.contain {
        object-fit: contain;
      }
      video.mse.fill {
        object-fit: fill;
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
      .cam-audio {
        position: absolute;
        top: 6px;
        right: 6px;
        z-index: 2;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        padding: 0;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        color: #fff;
        background: rgba(0, 0, 0, 0.55);
        --mdc-icon-size: 20px;
      }
      .cam-audio:hover {
        background: rgba(0, 0, 0, 0.75);
      }
      .cam-fchips {
        position: absolute;
        top: 6px;
        left: 6px;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        max-width: calc(100% - 12px);
        pointer-events: none;
      }
      .fchip {
        font-size: 11px;
        font-weight: 600;
        line-height: 1;
        padding: 3px 6px;
        border-radius: 6px;
        color: #fff;
        background: rgba(0, 0, 0, 0.55);
        white-space: nowrap;
      }
      .fchip.status.alert {
        background: var(--error-color, #db4437);
      }
      .fchip.status.detection {
        background: var(--warning-color, #ffa600);
        color: #1c1c1c;
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
      .cam-pop-sep {
        height: 1px;
        margin: 4px 6px;
        background: var(--divider-color, rgba(0, 0, 0, 0.12));
      }
      .cam-pop-state {
        margin-left: auto;
        font-size: 12px;
        color: var(--secondary-text-color);
      }
      /* Empty state — a centered ted-messagebox-card (matches Climate/Music/Calendar). */
      .empty-wrap {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
      }
      .empty-wrap > * {
        width: min(520px, 100%);
      }
      .loading {
        height: 100%;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-camera-card": TedCameraCard;
  }
}
