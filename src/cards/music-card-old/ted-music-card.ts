import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardConfig,
  type LovelaceCardEditor,
} from "custom-card-helpers";

import { themedIcon } from "../../shared/icons";
import { SettingsController, settingsStore } from "../../shared/settings";
import {
  resolveMusicPlayer,
  warmMassProviders,
  type MusicPlayerResolution,
} from "../../shared/music-player";
import {
  MASS_PLAYER_CARD_TYPE,
  MUSIC_CARD_EDITOR_TYPE,
  MUSIC_CARD_TYPE,
  YAMP_CARD_TYPE,
} from "./const";
import type { MusicCardConfig } from "./types";

/** The MessageBox card used for the empty / unmatched states (UX consistency). */
const MESSAGEBOX_CARD_TYPE = "custom:ted-messagebox-card";

/** Home Assistant's `loadCardHelpers()` return shape (only what this card uses). */
interface CardHelpers {
  createCardElement(config: LovelaceCardConfig): LovelaceCard;
}

/** Subset of HA's LovelaceGridOptions for the Sections grid layout. */
interface GridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  min_rows?: number;
}

/** True for a mergeable plain object (not an array/null). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Recursively merge plain objects (later sources win per leaf; arrays/primitives replace). */
function deepMerge(
  target: Record<string, unknown>,
  ...sources: Record<string, unknown>[]
): Record<string, unknown> {
  for (const src of sources) {
    for (const [k, v] of Object.entries(src)) {
      const cur = target[k];
      target[k] = isPlainObject(cur) && isPlainObject(v) ? deepMerge({ ...cur }, v) : v;
    }
  }
  return target;
}

/** Layout choices offered by the switcher pill (LEFT width percent). */
const SPLIT_CHOICES: { value: number; label: string }[] = [
  { value: 100, label: "Player only" },
  { value: 70, label: "70 / 30" },
  { value: 60, label: "60 / 40" },
  { value: 50, label: "50 / 50" },
  { value: 40, label: "40 / 60" },
  { value: 30, label: "30 / 70" },
];

/** Gap (px) between the split panes; also used to center the switcher pill in it. */
const SPLIT_GAP_PX = 12;

@customElement(MUSIC_CARD_TYPE)
export class TedMusicCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-music-card-editor");
    return document.createElement(MUSIC_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<MusicCardConfig, "type"> {
    return { player_source: "settings" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: MusicCardConfig;

  private _helpers?: CardHelpers;
  /** The embedded pane cards, keyed by slot: `single` | `left` | `right` | `message`. */
  private _els = new Map<string, { el: LovelaceCard; json: string }>();
  private _paneKind?: "message" | "single" | "split";
  private _lastPropagatedHass?: HomeAssistant;
  /** Tracks the resolved player's last observed state to detect a fresh playback start. */
  private _lastPlayEntity?: string;
  private _lastPlayState?: string;
  /** For engine:yamp + fill, the measured content-area height passed as `card_height`. */
  @state() private _fillHeight?: number;
  private _resizeObserver?: ResizeObserver;
  /** Layout-switcher flyout state + the runtime split override (persisted per view path). */
  @state() private _flyoutOpen = false;
  @state() private _runtimeSplit?: number;
  /** Pill drag state (drag resizes the split; a tap without moving opens the flyout). */
  private _dragging = false;
  private _dragStartX = 0;
  private _dragMoved = false;

  public constructor() {
    super();
    // Keep this device's settings live so `player_source: settings` stays in sync.
    new SettingsController(this, () => this.hass);
  }

  public connectedCallback(): void {
    super.connectedCallback();
    void this._loadHelpers();
    // YAMP sizes via `card_height` (px), not a CSS var, so measure the content area
    // ourselves and feed it as card_height when engine:yamp + fill.
    this._resizeObserver ??= new ResizeObserver(() => this._measureFill());
    this._resizeObserver.observe(this);
    // Reject programmatic autofocus of the embedded search box. On tablets the child
    // card's search input auto-focuses on load, which opens the on-screen keyboard, which
    // resizes the layout, which steals+restores focus — an endless keyboard flicker loop.
    // We note real user gestures and blur any text input that gains focus WITHOUT one.
    this.addEventListener("pointerdown", this._noteUserGesture, { capture: true });
    this.addEventListener("touchstart", this._noteUserGesture, { capture: true, passive: true });
    this.addEventListener("keydown", this._noteUserGesture, { capture: true });
    this.addEventListener("focusin", this._onFocusIn, { capture: true });
    // Restore the per-view runtime layout choice from the switcher pill.
    try {
      const v = Number(window.localStorage.getItem(this._splitStorageKey()));
      if (Number.isFinite(v) && TedMusicCard.SPLITS.has(v)) this._runtimeSplit = v;
    } catch {
      /* localStorage unavailable — ignore */
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
    this.removeEventListener("pointerdown", this._noteUserGesture, { capture: true });
    this.removeEventListener("touchstart", this._noteUserGesture, { capture: true });
    this.removeEventListener("keydown", this._noteUserGesture, { capture: true });
    this.removeEventListener("focusin", this._onFocusIn, { capture: true });
  }

  /** Timestamp (ms) of the last real user gesture within the card, gating autofocus. */
  private _userGestureTs = 0;
  private _noteUserGesture = (): void => {
    this._userGestureTs = Date.now();
  };

  /** True for a typeable field (text/search input, textarea, or contenteditable). */
  private _isTextEntry(el: Element | undefined): el is HTMLElement {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
      const type = (el as HTMLInputElement).type;
      return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image", "hidden"].includes(
        type,
      );
    }
    return (el as HTMLElement).isContentEditable === true;
  }

  /** Blur a text input that gained focus without a recent user gesture (i.e. the child
   *  card's programmatic autofocus) to stop the on-screen-keyboard flicker loop. Focus
   *  that follows a real tap/keypress is left alone so manual searching still works. */
  private _onFocusIn = (e: FocusEvent): void => {
    if (Date.now() - this._userGestureTs < 700) return; // user-initiated — allow
    const target = e.composedPath()[0] as Element | undefined;
    if (this._isTextEntry(target)) target.blur();
  };

  /** Measure the host (content area) for engine:yamp + fill; updates `_fillHeight`. */
  private _measureFill(): void {
    if (this._config?.engine === "mass" || !this._effectiveFill()) {
      if (this._fillHeight !== undefined) this._fillHeight = undefined;
      return;
    }
    const h = Math.round(this.clientHeight);
    if (h > 0 && h !== this._fillHeight) this._fillHeight = h;
  }

  public setConfig(config: MusicCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    if (config.player_source === "config" && !config.entity) {
      throw new Error("Set an entity when player_source is 'config'");
    }
    if (config.entity && !config.entity.startsWith("media_player.")) {
      throw new Error(`ted-music-card only supports media_player entities (got '${config.entity}')`);
    }
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 12;
  }

  public getGridOptions(): GridOptions {
    return { columns: 12, rows: "auto", min_columns: 6, min_rows: 6 };
  }

  private async _loadHelpers(): Promise<void> {
    if (this._helpers) return;
    const loader = (window as unknown as { loadCardHelpers?: () => Promise<CardHelpers> })
      .loadCardHelpers;
    if (!loader) return;
    this._helpers = await loader();
    this.requestUpdate();
  }

  protected willUpdate(): void {
    this._buildCards();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("hass")) {
      this._propagateHass();
      this._maybeApplyStartVolume();
    }
    if (this.hass) void warmMassProviders(this.hass).then((c) => c && this.requestUpdate());
    this._measureFill();
  }

  /** On the leading edge of playback starting, set the player to this device's
   *  "Music volume" setting so a fresh session starts at the configured volume. */
  private _maybeApplyStartVolume(): void {
    if (this._config?.apply_music_volume === false || !this.hass) return;
    const res = this._resolve();
    if (res.state !== "ok") {
      this._lastPlayEntity = undefined;
      this._lastPlayState = undefined;
      return;
    }
    const entity = res.entity;
    const state = this.hass.states[entity]?.state;
    const prevEntity = this._lastPlayEntity;
    const prevState = this._lastPlayState;
    this._lastPlayEntity = entity;
    this._lastPlayState = state;
    // Only act on an observed transition INTO "playing" for the same player (not on
    // first mount, an entity switch, or a resume from paused/buffering).
    if (entity !== prevEntity || prevState === undefined || state !== "playing") return;
    if (prevState === "playing" || prevState === "paused" || prevState === "buffering") return;
    const vol = settingsStore.get("music_volume");
    if (typeof vol !== "number") return;
    void this.hass.callService("media_player", "volume_set", {
      entity_id: entity,
      volume_level: Math.max(0, Math.min(1, vol / 100)),
    });
  }

  // --- Entity resolution -----------------------------------------------------

  private _name(id: string): string {
    const fn = this.hass?.states[id]?.attributes?.friendly_name;
    return typeof fn === "string" ? fn : id;
  }

  private _resolve(): MusicPlayerResolution {
    return resolveMusicPlayer(this.hass, {
      entity: this._config?.entity,
      useSettings: this._config?.player_source !== "config",
      autoResolve: this._config?.auto_resolve_mass_player !== false,
    });
  }

  // --- Embedded player cards -------------------------------------------------

  /** Per-engine base config for the LEFT (player) pane in split mode. */
  private _leftBase(): Record<string, unknown> {
    if (this._config?.engine !== "mass") return { card_type: "default" };
    // mass: show only the player section.
    return {
      player: { enabled: true },
      queue: { enabled: false },
      media_browser: { enabled: false },
      players: { enabled: false },
      default_section: "music_player",
    };
  }

  /** Per-engine base config for the RIGHT (library/search/queue) pane in split mode. */
  private _rightBase(): Record<string, unknown> {
    if (this._config?.engine !== "mass") return { card_type: "search", hide_menu_player: true };
    // mass: show the media browser (search + favorites/recents/recommendations) + queue.
    return {
      player: { enabled: false },
      queue: { enabled: true },
      media_browser: { enabled: true },
      players: { enabled: false },
      default_section: "media_browser",
    };
  }

  /** Build the embedded card config for one pane. `single` = the whole card (split
   *  disabled, current behavior); `left`/`right` = the split panes. Merge order:
   *  per-engine base -> shared (mass_config/yamp_config) -> per-side override. */
  private _paneConfig(entity: string, side: "single" | "left" | "right"): LovelaceCardConfig {
    const yamp = this._config?.engine !== "mass";
    const type = yamp ? YAMP_CARD_TYPE : MASS_PLAYER_CARD_TYPE;
    const shared = (yamp ? this._config?.yamp_config : this._config?.mass_config) ?? {};
    const base =
      side === "left" ? this._leftBase() : side === "right" ? this._rightBase() : {};
    const override =
      side === "left"
        ? (this._config?.left_config ?? {})
        : side === "right"
          ? (this._config?.right_config ?? {})
          : {};
    const merged = deepMerge({}, base, shared, override);
    // YAMP sizes via `card_height` (px); mass fills via the section-height CSS var.
    const yampFill =
      yamp && this._effectiveFill() && this._fillHeight ? { card_height: this._fillHeight } : {};
    return { type, entities: [entity], ...yampFill, ...merged };
  }

  private _buildCards(): void {
    if (!this._helpers) return;
    const desired = this._desiredPanes();
    if (!desired) {
      this._els.clear();
      this._paneKind = undefined;
      return;
    }
    this._paneKind = desired.kind;
    const wanted = new Map<string, LovelaceCardConfig>();
    if (desired.kind === "message") wanted.set("message", desired.message);
    else if (desired.kind === "single") wanted.set("single", desired.single);
    else {
      wanted.set("left", desired.left);
      wanted.set("right", desired.right);
    }
    // Drop panes that are no longer needed (e.g. leaving split mode).
    for (const id of [...this._els.keys()]) if (!wanted.has(id)) this._els.delete(id);
    // Build or reuse each pane, cached by its config JSON.
    for (const [id, cfg] of wanted) {
      const json = JSON.stringify(cfg);
      const existing = this._els.get(id);
      if (existing && existing.json === json) continue;
      const el = this._helpers.createCardElement(cfg);
      if (this.hass) el.hass = this.hass;
      this._injectOverlayOpacity(id, el);
      this._els.set(id, { el, json });
    }
  }

  /** Force YAMP's search/menu overlay to a near-opaque, theme-tinted surface so the
   *  now-playing artwork doesn't bleed through it on translucent HA themes (match_theme).
   *  Inline styles on the child host win over YAMP's own :host rules. */
  private _injectOverlayOpacity(id: string, el: LovelaceCard): void {
    if (id === "message" || this._config?.engine === "mass") return;
    const overlay =
      "rgb(from var(--ha-card-background, var(--card-background-color, #1c1c1c)) r g b / 0.96)";
    el.style.setProperty("--yamp-overlay-bg", overlay);
    el.style.setProperty("--search-overlay-bg", overlay);
  }

  private _propagateHass(): void {
    if (!this.hass || this.hass === this._lastPropagatedHass) return;
    this._lastPropagatedHass = this.hass;
    for (const slot of this._els.values()) slot.el.hass = this.hass;
  }

  // --- Navigation ------------------------------------------------------------

  private _settingsPath(): string {
    const root = String(settingsStore.effective().dashboard_root ?? "ted-dashboard");
    const raw = this._config?.settings_path || "[root]/settings?tab=sounds&scope=device";
    let path = raw.replace("[root]", root);
    if (!path.startsWith("/")) path = `/${path}`;
    return path;
  }

  // --- Split / layout --------------------------------------------------------

  /** Allowed LEFT-width percentages for the side-by-side split. */
  private static readonly SPLITS = new Set([100, 70, 60, 50, 40, 30]);

  /** Normalized LEFT width percent (100 = single pane). Runtime pill choice wins. */
  private _splitLeft(): number {
    const rt = this._runtimeSplit;
    if (typeof rt === "number" && TedMusicCard.SPLITS.has(rt)) return rt;
    const s = this._config?.split;
    return typeof s === "number" && TedMusicCard.SPLITS.has(s) ? s : 100;
  }

  private _hasSplit(): boolean {
    return this._splitLeft() < 100;
  }

  /** Split always fills the content area; otherwise honor the `fill` flag. */
  private _effectiveFill(): boolean {
    return this._config?.fill === true || this._hasSplit();
  }

  /** The layout-switcher pill shows only when the card fills its area (and not opted out). */
  private _showSwitcher(): boolean {
    return this._config?.layout_switcher !== false && this._effectiveFill();
  }

  private _splitStorageKey(): string {
    let path = "";
    try {
      path = window.location.pathname;
    } catch {
      /* ignore */
    }
    return `ted-music-split:${path}`;
  }

  // --- Layout pill: tap opens the flyout, horizontal drag resizes the split ---

  private _onPillDown = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this._dragStartX = e.clientX;
    this._dragMoved = false;
    this._dragging = true;
  };

  private _onPillMove = (e: PointerEvent): void => {
    if (!this._dragging) return;
    if (!this._dragMoved && Math.abs(e.clientX - this._dragStartX) <= 4) return;
    this._dragMoved = true;
    e.preventDefault();
    const layout = this.renderRoot.querySelector(".layout");
    if (!(layout instanceof HTMLElement)) return;
    const rect = layout.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const snapped = this._snapSplit(pct);
    if (snapped !== this._splitLeft()) this._runtimeSplit = snapped;
  };

  private _onPillUp = (e: PointerEvent): void => {
    if (!this._dragging) return;
    this._dragging = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (this._dragMoved) {
      // A drag committed a new ratio — persist it (and don't open the flyout).
      try {
        window.localStorage.setItem(this._splitStorageKey(), String(this._splitLeft()));
      } catch {
        /* ignore */
      }
      this.requestUpdate();
    } else {
      // A plain tap — open/close the flyout.
      this._flyoutOpen = !this._flyoutOpen;
    }
  };

  /** Snap a raw percentage to the nearest allowed split value. */
  private _snapSplit(pct: number): number {
    let best = 100;
    let bestD = Infinity;
    for (const v of TedMusicCard.SPLITS) {
      const d = Math.abs(v - pct);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  private _closeFlyout = (): void => {
    this._flyoutOpen = false;
  };

  private _chooseSplit(value: number): void {
    this._runtimeSplit = value;
    this._flyoutOpen = false;
    try {
      window.localStorage.setItem(this._splitStorageKey(), String(value));
    } catch {
      /* ignore */
    }
  }

  // --- State cards -----------------------------------------------------------

  /** The pane(s) to render for the current state: a MessageBox, a single player,
   *  or a left/right split. */
  private _desiredPanes():
    | { kind: "message"; message: LovelaceCardConfig }
    | { kind: "single"; single: LovelaceCardConfig }
    | { kind: "split"; left: LovelaceCardConfig; right: LovelaceCardConfig }
    | undefined {
    const res = this._resolve();
    if (res.state === "empty") return { kind: "message", message: this._emptyMessageConfig() };
    if (res.state === "unmatched")
      return { kind: "message", message: this._unmatchedMessageConfig(res.base) };
    if (res.state === "ok") {
      if (this._hasSplit()) {
        return {
          kind: "split",
          left: this._paneConfig(res.entity, "left"),
          right: this._paneConfig(res.entity, "right"),
        };
      }
      return { kind: "single", single: this._paneConfig(res.entity, "single") };
    }
    return undefined;
  }

  private _messageConfig(
    severity: string,
    icon: string,
    title: string,
    message: string,
    extraActions: Record<string, unknown>[] = [],
  ): LovelaceCardConfig {
    return {
      type: MESSAGEBOX_CARD_TYPE,
      severity,
      icon,
      title,
      message,
      actions: [
        {
          label: "Settings",
          icon: themedIcon("settings"),
          variant: "primary",
          action: "navigate",
          navigation_path: this._settingsPath(),
        },
        ...extraActions,
      ],
    };
  }

  private _emptyMessageConfig(): LovelaceCardConfig {
    return this._messageConfig(
      "info",
      themedIcon("music"),
      this._config?.empty_title ?? "No music player yet",
      this._config?.empty_message ??
        "This device hasn't been given a music player. Open Settings to choose one.",
    );
  }

  private _unmatchedMessageConfig(base: string): LovelaceCardConfig {
    const massPath = this._massSetupPath();
    const extra = massPath
      ? [
          {
            label: "Music Assistant",
            icon: themedIcon("music"),
            variant: "secondary",
            action: "navigate",
            navigation_path: massPath,
          },
        ]
      : [];
    return this._messageConfig(
      "warning",
      themedIcon("music-off"),
      this._config?.unmatched_title ?? "No Music Assistant player",
      this._config?.unmatched_message ??
        `"${this._name(base)}" isn't a Music Assistant player, and no matching one was found.\n\n` +
          "Expose it in Music Assistant:\n" +
          "1. Music Assistant → Settings → Providers.\n" +
          "2. Add a Player Provider → “Home Assistant Media Players”.\n" +
          "3. Select this speaker, then Save.\n\n" +
          "Or pick a Music Assistant player in Settings → Sounds.",
      extra,
    );
  }

  /** The Music Assistant panel path: the card's `mass_setup_path`, else the actual
   *  Music Assistant sidebar panel discovered in `hass.panels` (undefined if none). */
  private _massSetupPath(): string | undefined {
    if (this._config?.mass_setup_path) return this._config.mass_setup_path;
    const panels = this.hass?.panels as
      | Record<string, { url_path?: string; title?: string | null; component_name?: string } | undefined>
      | undefined;
    if (!panels) return undefined;
    for (const [key, p] of Object.entries(panels)) {
      const hay = `${p?.url_path ?? key} ${p?.title ?? ""} ${p?.component_name ?? ""}`.toLowerCase();
      if (hay.includes("music_assistant") || hay.includes("music assistant") || hay.includes("music-assistant")) {
        return `/${p?.url_path ?? key}`;
      }
    }
    return undefined;
  }

  // --- Render ----------------------------------------------------------------

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;
    if (!this._helpers || !this._paneKind || this._els.size === 0)
      return html`<div class="loading"></div>`;
    if (this._paneKind === "message")
      return html`<div class="msg">${this._els.get("message")?.el}</div>`;

    const left = this._splitLeft();
    // Center the pill in the ACTUAL gap between panes (the flex gap shifts the true
    // divider off the raw left% by an amount that depends on the ratio).
    const pillPos =
      this._paneKind === "split"
        ? `calc(${left}% - ${((left * SPLIT_GAP_PX) / 100).toFixed(2)}px + ${SPLIT_GAP_PX / 2}px)`
        : `${left}%`;
    const panes =
      this._paneKind === "split"
        ? html`<div class="split" style="gap: ${SPLIT_GAP_PX}px">
            <div class="pane left" style="flex: ${left} 1 0">${this._els.get("left")?.el}</div>
            <div class="pane right" style="flex: ${100 - left} 1 0">${this._els.get("right")?.el}</div>
          </div>`
        : html`<div class=${this._effectiveFill() ? "player fill" : "player natural"}>
            ${this._els.get("single")?.el}
          </div>`;

    return html`<div class="layout">${panes}${this._renderSwitcher(pillPos)}</div>`;
  }

  /** The vertical layout pill (centered in the split gap) + its flyout of layout choices. */
  private _renderSwitcher(pos: string): TemplateResult | typeof nothing {
    if (!this._showSwitcher()) return nothing;
    const current = this._splitLeft();
    return html`
      ${this._flyoutOpen
        ? html`<div class="flyout-backdrop" @click=${this._closeFlyout}></div>`
        : nothing}
      <button
        type="button"
        class="split-pill ${this._flyoutOpen ? "open" : ""} ${this._dragging ? "dragging" : ""}"
        style="left: ${pos}"
        title="Drag to resize, tap for layouts"
        aria-label="Change layout"
        @pointerdown=${this._onPillDown}
        @pointermove=${this._onPillMove}
        @pointerup=${this._onPillUp}
      >
        <span class="grip"></span>
      </button>
      ${this._flyoutOpen
        ? html`<div class="split-flyout" @click=${(e: Event) => e.stopPropagation()}>
            ${SPLIT_CHOICES.map(
              (c) => html`<button
                class="flyout-item ${current === c.value ? "active" : ""}"
                @click=${() => this._chooseSplit(c.value)}
              >
                <span class="ratio">
                  <span class="seg l" style="flex: ${c.value}"></span>
                  ${c.value < 100
                    ? html`<span class="seg r" style="flex: ${100 - c.value}"></span>`
                    : nothing}
                </span>
                <span class="lbl">${c.label}</span>
              </button>`,
            )}
          </div>`
        : nothing}
    `;
  }

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      /* Establish a container so the split can collapse based on OUR width. */
      container-type: inline-size;
    }
    /* Positioning context for the panes + the layout-switcher pill/flyout. */
    .layout {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }
    /* The mass-player-card brings its own surface, so this card is a transparent
       passthrough — no wrapping ha-card (avoids double borders and backdrop-filter/
       transform clipping of the child card). */
    .player {
      width: 100%;
    }
    /* Default: let the player size to its content, centered in the view. */
    .player.natural {
      align-self: center;
    }
    /* Opt-in / split: fill the dashboard content area. mass-player-card's own panel
       mode hard-codes its height to window.innerHeight (unoverridable inline style),
       which overflows past our header/navbar. Instead we size it via its public
       --mass-player-card-section-height token: total card height = that + the card's
       internal tab bar (--navbar-height: 4em). We mirror shared/layout-content.yaml's
       content-area height and subtract 4em so the card lands exactly on the content area. */
    .player.fill,
    .split .pane {
      height: 100%;
      --mass-player-card-section-height: calc(
        100dvh - var(
            --ted-navbar-header-reserve,
            var(--kiosk-header-height, var(--header-height, 56px))
          ) - var(--safe-area-inset-top, 0px) -
          var(--ted-navbar-bottom-reserve, 48px) - 24px - 4em
      );
    }
    .player.fill > *,
    .split .pane > * {
      height: 100%;
    }
    /* Side-by-side split: player on the left, library/search/queue on the right.
       Pane widths come from the inline flex ratio set in render(). */
    .split {
      display: flex;
      flex-direction: row;
      align-items: stretch;
      /* gap is set inline (SPLIT_GAP_PX) so the pill can be centered in it. */
      width: 100%;
      height: 100%;
    }
    .split .pane {
      min-width: 0;
    }
    /* Narrow: collapse to the player pane only (inline flex overridden with !important). */
    @container (max-width: 700px) {
      .split .pane.right {
        display: none !important;
      }
      .split .pane.left {
        flex: 1 1 auto !important;
      }
    }
    /* --- Layout switcher (vertical pill at the divider + flyout of layout choices) --- */
    .flyout-backdrop {
      position: absolute;
      inset: 0;
      z-index: 3;
    }
    /* Just a subtle grabber bar (like the auto-hide navbar reveal pill) — no surface. */
    .split-pill {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      z-index: 5;
      width: 24px;
      height: 160px;
      padding: 0;
      border: none;
      background: none;
      cursor: ew-resize;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .split-pill .grip {
      width: 5px;
      height: 100%;
      border-radius: 999px;
      background: rgb(from var(--primary-text-color, #ffffff) r g b / 0.35);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
      transition: background 0.15s ease;
    }
    .split-pill:hover .grip,
    .split-pill.open .grip,
    .split-pill.dragging .grip {
      background: rgb(from var(--primary-text-color, #ffffff) r g b / 0.6);
    }
    .split-flyout {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 6;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 168px;
      padding: 6px;
      border-radius: 12px;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
      background: rgb(from var(--ha-card-background, var(--card-background-color, #1c1c1c)) r g b / 0.97);
      -webkit-backdrop-filter: blur(14px);
      backdrop-filter: blur(14px);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    }
    .flyout-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 10px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font: inherit;
      text-align: left;
      color: var(--primary-text-color, #e6edf3);
      background: none;
    }
    .flyout-item:hover {
      background: rgb(from var(--primary-text-color, #ffffff) r g b / 0.1);
    }
    .flyout-item.active {
      background: var(--primary-color, #3b82f6);
      color: var(--text-primary-color, #fff);
    }
    .flyout-item .ratio {
      display: flex;
      gap: 2px;
      width: 38px;
      height: 18px;
      flex: 0 0 auto;
    }
    .flyout-item .ratio .seg {
      background: currentColor;
      opacity: 0.45;
      border-radius: 2px;
    }
    .flyout-item.active .ratio .seg {
      opacity: 0.95;
    }
    .flyout-item .lbl {
      white-space: nowrap;
    }
    .loading {
      height: 100%;
      min-height: 120px;
    }
    /* Empty / unmatched states are rendered as a centered MessageBox card. */
    .msg {
      width: min(520px, 92%);
    }
  `;
}
