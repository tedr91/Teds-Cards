import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardEditor,
} from "custom-card-helpers";

import { SettingsController, settingsStore } from "../../shared/settings";
import {
  resolveMusicPlayer,
  warmMassProviders,
  type MusicPlayerResolution,
} from "../../shared/music-player";
import { tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { computeTabOverflow, positionOverflowPopover } from "../../shared/tab-overflow";
import { resolveIcon } from "../../shared/icons";
import { readDashboardUrlPath } from "../../shared/launcher";
import { MUSIC_CARD_EDITOR_TYPE, MUSIC_CARD_TYPE } from "./const";
import type {
  MusicBackgroundMode,
  MusicCardConfig,
  MusicMediaLayout,
  MusicTab,
} from "./types";

/** Subset of HA's LovelaceGridOptions for the Sections grid layout. */
interface GridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  min_rows?: number;
}

/** The right-side tabs, in display order. */
const TABS: { id: MusicTab; label: string }[] = [
  { id: "media", label: "Media" },
  { id: "queue", label: "Queue" },
  { id: "lyrics", label: "Lyrics" },
];

/** The Media-tab library filters, in display order. */
type MediaFilter = "playlist" | "album" | "artist" | "favorite";
const MEDIA_FILTERS: { id: MediaFilter; label: string }[] = [
  { id: "favorite", label: "Favorites" },
  { id: "playlist", label: "Playlists" },
  { id: "artist", label: "Artists" },
  { id: "album", label: "Albums" },
];

/** Music Assistant `get_library` media_type for a filter (Favorites = favorited playlists). */
function filterMediaType(f: MediaFilter): string {
  return f === "favorite" ? "playlist" : f;
}

/** mm:ss for a number of seconds. */
function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** RGB (0-255) → HSL (h,s,l in 0-1). */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}

/** HSL (0-1) → RGB (0-255). */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (!s) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(hue(h + 1 / 3) * 255),
    g: Math.round(hue(h) * 255),
    b: Math.round(hue(h - 1 / 3) * 255),
  };
}

/** Music-card icons as `{ fluent, mdi }` maps — Fluent is preferred when installed,
 *  otherwise MDI (the guaranteed core fallback). Resolved via `resolveIcon`. */
const IC = {
  music: { fluent: "music-note-2-24-regular", mdi: "music" },
  favorite: { fluent: "heart-24-regular", mdi: "heart-outline" },
  favoriteOn: { fluent: "heart-24-filled", mdi: "heart" },
  shuffle: { fluent: "arrow-shuffle-24-filled", mdi: "shuffle" },
  previous: { fluent: "previous-24-filled", mdi: "skip-previous" },
  next: { fluent: "next-24-filled", mdi: "skip-next" },
  play: { fluent: "play-circle-24-filled", mdi: "play-circle" },
  pause: { fluent: "pause-circle-24-filled", mdi: "pause-circle" },
  repeat: { fluent: "arrow-repeat-all-24-filled", mdi: "repeat" },
  repeatOne: { fluent: "arrow-repeat-all-off-24-filled", mdi: "repeat-once" },
  volOff: { fluent: "speaker-mute-24-filled", mdi: "volume-off" },
  volLow: { fluent: "speaker-0-24-filled", mdi: "volume-low" },
  volMed: { fluent: "speaker-1-24-filled", mdi: "volume-medium" },
  volHigh: { fluent: "speaker-2-24-filled", mdi: "volume-high" },
  speaker: { fluent: "speaker-box-24-filled", mdi: "speaker" },
  cast: { fluent: "cast-24-regular", mdi: "cast-variant" },
  plus: { fluent: "add-24-filled", mdi: "plus" },
  minus: { fluent: "subtract-24-filled", mdi: "minus" },
  loading: { mdi: "loading" },
  playlist: { fluent: "music-note-2-24-regular", mdi: "playlist-music" },
  playlistRemove: { fluent: "text-bullet-list-dismiss-20-filled", mdi: "playlist-remove" },
  tiles: { fluent: "grid-24-regular", mdi: "view-grid-outline" },
  listView: { fluent: "apps-list-24-regular", mdi: "view-list-outline" },
  album: { fluent: "album-24-regular", mdi: "album" },
  artist: { fluent: "person-24-regular", mdi: "account-music" },
  playSmall: { fluent: "play-24-filled", mdi: "play" },
  queue: { fluent: "apps-list-24-regular", mdi: "playlist-play" },
  more: { fluent: "more-horizontal-24-filled", mdi: "dots-horizontal" },
  close: { fluent: "dismiss-24-regular", mdi: "close" },
  party: { fluent: "emoji-24-regular", mdi: "party-popper" },
  menu: { fluent: "more-vertical-24-filled", mdi: "dots-vertical" },
  drag: { fluent: "re-order-dots-vertical-24-regular", mdi: "drag-vertical" },
  playOutline: { fluent: "play-circle-24-regular", mdi: "play-circle-outline" },
  nextOutline: { fluent: "next-24-regular", mdi: "skip-next-outline" },
  up: { fluent: "arrow-up-24-filled", mdi: "arrow-up" },
  down: { fluent: "arrow-down-24-filled", mdi: "arrow-down" },
  del: { fluent: "delete-24-regular", mdi: "delete-outline" },
  lyricsOff: { fluent: "comment-24-regular", mdi: "comment-text-outline" },
  musicNoteOff: { fluent: "music-note-off-1-24-regular", mdi: "music-note-off" },
  musicOff: { fluent: "music-note-off-2-24-regular", mdi: "music-off" },
} as const;

/** Resolve a music-card icon (Fluent preferred, MDI fallback) to a concrete string. */
function ic(spec: { mdi: string; fluent?: string }): string {
  return resolveIcon(spec) ?? `mdi:${spec.mdi}`;
}

/** Parse a Music Assistant URI `<provider>://<mediatype>/<itemid>`. */
function parseMaUri(uri: string): { mediaType: string; itemId: string } | undefined {
  const m = uri.match(/^[^:]+:\/\/([^/]+)\/(.+)$/);
  return m ? { mediaType: m[1], itemId: m[2] } : undefined;
}

@customElement(MUSIC_CARD_TYPE)
export class TedMusicCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-music-card-editor");
    return document.createElement(MUSIC_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<MusicCardConfig, "type"> {
    return {};
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: MusicCardConfig;

  /** The currently selected right-side tab, and whether the user has picked one. */
  @state() private _tab: MusicTab = "media";
  private _tabTouched = false;
  /** How many right-side tabs fit in the strip; the rest go into the "…" overflow menu. */
  @state() private _tabVisibleCount = Number.POSITIVE_INFINITY;

  /** Adjusted frost tint "r, g, b" (from the album's average color) + a legible foreground. */
  @state() private _avgColor?: string;
  @state() private _avgFg?: string;
  private _artColorUrl?: string;

  /** Ticks the progress bar while playing (bumped by a 1s interval). */
  @state() private _tick = 0;
  private _progressTimer?: number;

  /** When the vertical album art would be no taller than the title/artist rows,
   *  switch to a horizontal header (art to the left of the details). */
  @state() private _compact = false;
  private _ro?: ResizeObserver;

  /** For apply_music_volume: the resolved player's last observed entity/state. */
  private _lastPlayEntity?: string;
  private _lastPlayState?: string;

  /** Cast/grouping flyout open state. */
  @state() private _castOpen = false;
  /** Whether the cast flyout opens upward (set by measurement to avoid clipping). */
  @state() private _castUp = true;
  /** Optimistic favorite state for the current track (instant heart feedback). */
  @state() private _favOptimistic?: boolean;
  private _favOptKey?: string;
  /** Volume slider flyout open state. */
  @state() private _volOpen = false;
  private _volHoldTimer?: number;
  private _volHeld = false;
  /** Mini bar "..." menu open state. */
  @state() private _miniMenuOpen = false;
  @state() private _miniMenuUp = true;
  /** Mini bar volume flyout open state. */
  @state() private _miniVolOpen = false;
  @state() private _miniVolUp = true;
  /** Which tab body (if any) the mini modal window is showing. */
  @state() private _miniPopup: "media" | "queue" | null = null;
  /** Mini bar: controls drop to a row below the title/artist when the card is tall. */
  @state() private _miniStacked = false;
  /** Debounce for persisting this device's "Music volume" setting on slider drags. */
  private _musicVolWriteTimer?: number;
  private _volClickTimer?: number;
  /** Shuffle button: reshuffle popup open state + hold/double-tap gesture bookkeeping. */
  @state() private _shuffleMenuOpen = false;
  @state() private _shuffleMenuUp = false;
  private _shuffleHoldTimer?: number;
  private _shuffleHeld = false;
  private _shuffleClickTimer?: number;

  /** Music Assistant config entry id (for get_library), lazily resolved. */
  private _maConfigEntryId?: string;
  /** mass_queue config entry id (for send_command), lazily resolved. */
  private _massQueueEntryId?: string;
  /** Media tab: per-filter library caches + in-flight flags, and the active filter. */
  @state() private _mediaCache: Partial<Record<MediaFilter, MediaItem[]>> = {};
  private _mediaLoading: Partial<Record<MediaFilter, boolean>> = {};
  @state() private _mediaFilter: MediaFilter = "favorite";
  /** Recently-played row (cross-type: playlists + albums), full mode only. */
  @state() private _recentMedia?: MediaItem[];
  private _recentLoading = false;
  /** User's tiles/list override for this session; falls back to config `media_layout`. */
  @state() private _mediaLayoutOverride?: MusicMediaLayout;
  /** Media tab: the item uri currently being started (shows a loading indicator on its row). */
  @state() private _mediaStartingUri?: string;
  private _mediaStartingPrevId?: string;
  private _mediaStartingTimer?: number;
  /** Queue/Recent tab data + the currently-playing index within it. */
  @state() private _queue?: QueueItem[];
  private _queueCurrentIdx = 0;
  private _queueKey?: string;
  private _queueLoading = false;
  /** The queue row whose 3-dots menu is open. */
  @state() private _queueMenuId?: string;
  /** Drag-to-reorder: the queue_item_id being dragged, and its original queue index. */
  @state() private _dragId?: string;
  private _dragOrigIdx?: number;
  /** Lyrics: undefined = loading, null = none, [] = plain-only, [lines] = synced. */
  @state() private _lyrics?: LyricLine[] | null;
  private _lyricsPlain?: string;
  private _lyricsKey?: string;
  private _lyricsLoading = false;

  public constructor() {
    super();
    // Keep this device's settings live so `dashboard_integration` stays in sync.
    new SettingsController(this, () => this.hass);
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._progressTimer ??= window.setInterval(() => {
      const s = this._stateObj();
      if (s?.state === "playing") this._tick++;
    }, 1000);
    this._ro ??= new ResizeObserver(() => {
      this._measureLayout();
      this._measureTabs();
      this._measureMini();
    });
    this._ro.observe(this);
    document.addEventListener("pointerdown", this._onDocDown, true);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._progressTimer !== undefined) {
      clearInterval(this._progressTimer);
      this._progressTimer = undefined;
    }
    this._ro?.disconnect();
    this._ro = undefined;
    document.removeEventListener("pointerdown", this._onDocDown, true);
    window.removeEventListener("pointermove", this._onDragMove, true);
    window.removeEventListener("pointerup", this._onDragEnd, true);
    window.removeEventListener("pointercancel", this._onDragEnd, true);
  }

  /** Close the cast / volume popups when the user interacts outside them. */
  private _onDocDown = (e: Event): void => {
    if (
      !this._castOpen &&
      !this._volOpen &&
      !this._shuffleMenuOpen &&
      !this._miniMenuOpen &&
      !this._miniVolOpen
    )
      return;
    const path = e.composedPath();
    if (this._castOpen) {
      const w = this.renderRoot?.querySelector?.(".cast-wrap");
      if (w && !path.includes(w)) this._castOpen = false;
    }
    if (this._volOpen) {
      const w = this.renderRoot?.querySelector?.(".vol-wrap");
      if (w && !path.includes(w)) this._volOpen = false;
    }
    if (this._shuffleMenuOpen) {
      const w = this.renderRoot?.querySelector?.(".shuffle-wrap");
      if (w && !path.includes(w)) this._shuffleMenuOpen = false;
    }
    if (this._miniMenuOpen || this._miniVolOpen) {
      const w = this.renderRoot?.querySelector?.(".mini");
      if (w && !path.includes(w)) {
        this._miniMenuOpen = false;
        this._miniVolOpen = false;
      }
    }
  };

  /** Drop the mini bar's controls to a row below the title/artist once the card is
   *  tall enough (2-high, or auto-height that ends up tall). Width-based control
   *  collapsing is handled purely by CSS container queries. */
  private _measureMini(): void {
    if (this._config?.mode !== "mini") return;
    const card = this.renderRoot?.querySelector?.("ha-card") as HTMLElement | null;
    if (!card) return;
    const h = card.clientHeight;
    if (h <= 0) return;
    // Hysteresis around the 1-row (~56px) vs 2-row (~120px) boundary.
    const next = this._miniStacked ? h >= 80 : h >= 92;
    if (next !== this._miniStacked) this._miniStacked = next;
  }

  /** Decide vertical vs. horizontal (compact) player layout by comparing the album
   *  art's would-be height to the title/artist block. Hysteresis avoids flapping. */
  private _measureLayout(): void {
    if (this._config?.mode === "mini") return;
    const root = this.renderRoot as ShadowRoot | undefined;
    const player = root?.querySelector(".player") as HTMLElement | null;
    const details = root?.querySelector(".details") as HTMLElement | null;
    if (!player || !details) return;
    const progress = root?.querySelector(".progress") as HTMLElement | null;
    const controls = root?.querySelector(".controls") as HTMLElement | null;
    const cast = root?.querySelector(".cast-wrap") as HTMLElement | null;
    const hd = details.offsetHeight;
    const hRest =
      (progress?.offsetHeight ?? 0) + (controls?.offsetHeight ?? 0) + (cast?.offsetHeight ?? 0);
    const gaps = 12 * 4;
    // Height the album art would occupy in the vertical layout.
    const artAvail = player.clientHeight - hd - hRest - gaps;
    if (artAvail < hd - 8) this._compact = true;
    else if (artAvail > hd + 8) this._compact = false;
    if (this._compact) player.style.setProperty("--art-sq", `${hd}px`);
  }

  public setConfig(config: MusicCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    if (config.entity && !config.entity.startsWith("media_player.")) {
      throw new Error(`ted-music-card only supports media_player entities (got '${config.entity}')`);
    }
    this._config = { ...config };
  }

  public getCardSize(): number {
    return this._config?.mode === "mini" ? 2 : 12;
  }

  public getGridOptions(): GridOptions {
    if (this._config?.mode === "mini") {
      return { columns: 12, rows: 2, min_columns: 6, min_rows: 1 };
    }
    return { columns: 12, rows: 6, min_columns: 6, min_rows: 4 };
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("hass")) {
      this._maybeApplyStartVolume();
      this._updateAvgColor(this._artUrl());
      this._clearMediaStartingIfPlaying();
      if (this.hass) void warmMassProviders(this.hass).then((c) => c && this.requestUpdate());
    }
    this._orchestrateTabData();
    this._scrollActiveLyric();
    this._measureLayout();
    this._measureTabs();
    this._measureMini();
    this._positionPopups();
    this._syncQueueMenuPopover();
    this._syncMiniModal();
  }

  /** Open/close the native <dialog> to match `_miniPopup` (top-layer modal). */
  private _syncMiniModal(): void {
    const dlg = this.renderRoot?.querySelector?.(".mini-modal") as
      | (HTMLDialogElement & { showModal?: () => void; close?: () => void })
      | null;
    if (!dlg) return;
    if (this._miniPopup && !dlg.open) dlg.showModal?.();
    else if (!this._miniPopup && dlg.open) dlg.close?.();
  }

  /** Flip the open popups above/below their trigger, whichever side has room, so
   *  they aren't clipped by the card's `overflow: hidden` edge. */
  private _positionPopups(): void {
    const root = this.renderRoot as ShadowRoot | undefined;
    const card = root?.querySelector("ha-card") as HTMLElement | null;
    const cardRect = card?.getBoundingClientRect();
    if (!cardRect) return;
    const wantsUp = (trigger: HTMLElement, popup: HTMLElement, gap: number): boolean => {
      const t = trigger.getBoundingClientRect();
      const below = cardRect.bottom - t.bottom;
      const above = t.top - cardRect.top;
      return popup.offsetHeight + gap > below && above > below;
    };
    if (this._castOpen) {
      const fly = root?.querySelector(".cast-flyout") as HTMLElement | null;
      const wrap = root?.querySelector(".cast-wrap") as HTMLElement | null;
      if (fly && wrap) {
        const up = wantsUp(wrap, fly, 8);
        if (up !== this._castUp) this._castUp = up;
      }
    }
    if (this._shuffleMenuOpen) {
      const menu = root?.querySelector(".shuffle-menu") as HTMLElement | null;
      const wrap = menu?.closest(".shuffle-wrap") as HTMLElement | null;
      if (menu && wrap) {
        const up = wantsUp(wrap, menu, 4);
        if (up !== this._shuffleMenuUp) this._shuffleMenuUp = up;
      }
    }
    // Mini popups anchor to the right side of the bar and fly up when there's room
    // above it; when the card sits near the top of the screen they fly down instead.
    const bar = root?.querySelector(".mini") as HTMLElement | null;
    const barTop = bar?.getBoundingClientRect().top ?? 0;
    if (this._miniMenuOpen) {
      const menu = root?.querySelector(".mini-menu") as HTMLElement | null;
      if (menu && bar) {
        const up = barTop >= menu.offsetHeight + 12;
        if (up !== this._miniMenuUp) this._miniMenuUp = up;
      }
    }
    if (this._miniVolOpen) {
      const fly = root?.querySelector(".mini-vol-flyout") as HTMLElement | null;
      if (fly && bar) {
        const up = barTop >= fly.offsetHeight + 12;
        if (up !== this._miniVolUp) this._miniVolUp = up;
      }
    }
  }

  /** Decide how many right-side tabs fit; the rest spill into the "…" overflow menu.
   *  Widths are read from the hidden `.tabbar-measure` mirror so it converges stably. */
  private _measureTabs(): void {
    if (this._config?.mode === "mini") return;
    const root = this.renderRoot as ShadowRoot | undefined;
    const strip = root?.querySelector(".tabbar") as HTMLElement | null;
    const measure = root?.querySelector(".tabbar-measure") as HTMLElement | null;
    if (!strip || !measure) return;
    const available = strip.clientWidth;
    if (available <= 0) return;
    const widths = Array.from(measure.children).map((c) => (c as HTMLElement).offsetWidth);
    if (!widths.length) return;
    // Music tabs are text-only (no icons), so auto-shrink is off: just fit-or-overflow.
    const { visibleCount } = computeTabOverflow({
      fullWidths: widths,
      iconWidths: widths,
      available,
      configMode: "both",
      iconMode: "icon",
      autoShrink: false,
      gap: 6,
    });
    if (visibleCount !== this._tabVisibleCount) this._tabVisibleCount = visibleCount;
  }

  private _onTabOverflowToggle = (ev: Event): void => {
    if ((ev as Event & { newState?: string }).newState !== "open") return;
    const pop = ev.currentTarget as HTMLElement;
    const anchor = (this.renderRoot as ShadowRoot).getElementById("music-tab-overflow-btn");
    positionOverflowPopover(pop, anchor ?? undefined);
  };

  private _pickTabFromOverflow(id: MusicTab): void {
    this._pickTab(id);
    const pop = (this.renderRoot as ShadowRoot).getElementById("music-tab-overflow-pop") as
      | (HTMLElement & { hidePopover?: () => void })
      | null;
    pop?.hidePopover?.();
  }

  // --- Entity resolution -----------------------------------------------------

  private _resolve(): MusicPlayerResolution {
    return resolveMusicPlayer(this.hass, {
      entity: this._config?.entity,
      useSettings: this._config?.dashboard_integration === true,
      autoResolve: this._config?.auto_resolve_mass_player !== false,
    });
  }

  /** The resolved media_player state object, or undefined if not resolvable. */
  private _stateObj(): HassEntityLike | undefined {
    const res = this._resolve();
    if (res.state !== "ok") return undefined;
    return this.hass?.states[res.entity] as HassEntityLike | undefined;
  }

  private _entityId(): string | undefined {
    const res = this._resolve();
    return res.state === "ok" ? res.entity : undefined;
  }

  // --- Now-playing accessors -------------------------------------------------

  private _attr<T = unknown>(key: string): T | undefined {
    return this._stateObj()?.attributes?.[key] as T | undefined;
  }

  private _title(): string | undefined {
    const t = this._attr<string>("media_title");
    return t && t.trim() ? t : undefined;
  }

  private _artUrl(): string | undefined {
    const p = this._attr<string>("entity_picture");
    return p && p.trim() ? p : undefined;
  }

  /** True when the player has current media (playing, paused or buffering). */
  private _hasMedia(): boolean {
    const s = this._stateObj();
    if (!s) return false;
    if (["playing", "paused", "buffering"].includes(s.state)) return true;
    return !!this._title();
  }

  private _isPlaying(): boolean {
    return this._stateObj()?.state === "playing";
  }

  /** Live playback position in seconds (interpolated while playing). */
  private _elapsed(): number {
    const s = this._stateObj();
    if (!s) return 0;
    const pos = Number(s.attributes?.media_position ?? 0);
    const dur = Number(s.attributes?.media_duration ?? 0);
    if (!dur) return 0;
    let e = pos;
    const updated = s.attributes?.media_position_updated_at;
    if (s.state === "playing" && typeof updated === "string") {
      e = pos + (Date.now() - new Date(updated).getTime()) / 1000;
    }
    return Math.max(0, Math.min(dur, e));
  }

  private _duration(): number {
    return Number(this._attr<number>("media_duration") ?? 0);
  }

  // --- Volume-on-play --------------------------------------------------------

  /** On the leading edge of playback starting, set the player to this device's
   *  "Music volume" setting so a fresh session starts at the configured volume. */
  private _maybeApplyStartVolume(): void {
    if (this._config?.apply_music_volume === false || !this.hass) return;
    const entity = this._entityId();
    if (!entity) {
      this._lastPlayEntity = undefined;
      this._lastPlayState = undefined;
      return;
    }
    const state = this.hass.states[entity]?.state;
    const prevEntity = this._lastPlayEntity;
    const prevState = this._lastPlayState;
    this._lastPlayEntity = entity;
    this._lastPlayState = state;
    if (entity !== prevEntity || prevState === undefined || state !== "playing") return;
    if (["playing", "paused", "buffering"].includes(prevState)) return;
    const vol = settingsStore.get("music_volume");
    if (typeof vol !== "number") return;
    void this.hass.callService("media_player", "volume_set", {
      entity_id: entity,
      volume_level: Math.max(0, Math.min(1, vol / 100)),
    });
  }

  // --- Average color extraction --------------------------------------------

  private _updateAvgColor(url?: string): void {
    if (!url) {
      this._artColorUrl = undefined;
      if (this._avgColor) this._avgColor = undefined;
      return;
    }
    if (url === this._artColorUrl) return;
    this._artColorUrl = url;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = (): void => {
      try {
        const n = 12;
        const canvas = document.createElement("canvas");
        canvas.width = n;
        canvas.height = n;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, n, n);
        const { data } = ctx.getImageData(0, 0, n, n);
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 8) continue;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
        if (!count) return;
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        // Smart frost tint: keep the album hue, but pull the lightness into a
        // comfortable band — lift very dark averages and deepen very light ones —
        // and slightly boost saturation so the frosted glass stays rich and legible.
        const { h, s, l } = rgbToHsl(r, g, b);
        const lt = Math.max(0.28, Math.min(0.48, l));
        const st = Math.min(1, s * 1.12);
        const f = hslToRgb(h, st, lt);
        this._avgColor = `${f.r}, ${f.g}, ${f.b}`;
        this._avgFg = lt > 0.58 ? "#141414" : "#ffffff";
      } catch {
        this._avgColor = undefined;
        this._avgFg = undefined;
      }
    };
    img.onerror = (): void => {
      this._avgColor = undefined;
      this._avgFg = undefined;
      this.requestUpdate();
    };
    img.src = url;
  }

  // --- Control handlers ------------------------------------------------------

  private _call(service: string, data: Record<string, unknown> = {}): void {
    const entity = this._entityId();
    if (!entity || !this.hass) return;
    void this.hass.callService("media_player", service, { entity_id: entity, ...data });
  }

  private _onPlayPause = (): void => this._call("media_play_pause");
  private _onPrev = (): void => this._call("media_previous_track");
  private _onNext = (): void => this._call("media_next_track");
  private _onShuffle = (): void =>
    this._call("shuffle_set", { shuffle: !this._attr<boolean>("shuffle") });

  private _onRepeat = (): void => {
    const cur = this._attr<string>("repeat") ?? "off";
    const next = cur === "off" ? "all" : cur === "all" ? "one" : "off";
    this._call("repeat_set", { repeat: next });
  };

  private _onVolume = (e: Event): void => {
    const v = Number((e.target as HTMLInputElement).value);
    this._call("volume_set", { volume_level: Math.max(0, Math.min(1, v / 100)) });
    this._persistMusicVolume(v);
  };

  /** Remember a user volume change as this device's "Music volume" setting. Writing
   *  a device-scoped value stops the device inheriting the global value. Debounced
   *  so dragging the slider doesn't spam the backend. */
  private _persistMusicVolume(percent: number): void {
    if (this._config?.apply_music_volume === false) return;
    const pct = Math.round(Math.max(0, Math.min(100, percent)));
    window.clearTimeout(this._musicVolWriteTimer);
    this._musicVolWriteTimer = window.setTimeout(() => {
      settingsStore.setValue("device", "music_volume", pct);
    }, 400);
  }

  // Volume button gestures: tap = open slider, hold/double-tap = mute toggle.
  private _onVolPointerDown = (): void => {
    this._volHeld = false;
    this._volHoldTimer = window.setTimeout(() => {
      this._volHeld = true;
      this._toggleMute();
    }, 500);
  };

  private _onVolPointerUp = (): void => {
    if (this._volHoldTimer) {
      clearTimeout(this._volHoldTimer);
      this._volHoldTimer = undefined;
    }
  };

  private _onVolClick = (): void => {
    if (this._volHeld) {
      this._volHeld = false;
      return;
    }
    if (this._volClickTimer) return; // second click of a double — let dblclick handle it
    this._volClickTimer = window.setTimeout(() => {
      this._volClickTimer = undefined;
      this._volOpen = !this._volOpen;
    }, 220);
  };

  private _onVolDblClick = (): void => {
    if (this._volClickTimer) {
      clearTimeout(this._volClickTimer);
      this._volClickTimer = undefined;
    }
    this._toggleMute();
  };

  private _toggleMute(): void {
    const muted = !!this._attr<boolean>("is_volume_muted");
    this._call("volume_mute", { is_volume_muted: !muted });
  }

  // Shuffle button gestures: tap = toggle shuffle; hold or double-tap = open the
  // "Reshuffle queue" popup.
  private _onShufflePointerDown = (): void => {
    this._shuffleHeld = false;
    this._shuffleHoldTimer = window.setTimeout(() => {
      this._shuffleHeld = true;
      this._shuffleMenuOpen = true;
    }, 500);
  };

  private _onShufflePointerUp = (): void => {
    if (this._shuffleHoldTimer) {
      clearTimeout(this._shuffleHoldTimer);
      this._shuffleHoldTimer = undefined;
    }
  };

  private _onShuffleClick = (): void => {
    if (this._shuffleHeld) {
      this._shuffleHeld = false;
      return;
    }
    if (this._shuffleClickTimer) return; // second click of a double — dblclick handles it
    this._shuffleClickTimer = window.setTimeout(() => {
      this._shuffleClickTimer = undefined;
      this._onShuffle();
    }, 220);
  };

  private _onShuffleDblClick = (): void => {
    if (this._shuffleClickTimer) {
      clearTimeout(this._shuffleClickTimer);
      this._shuffleClickTimer = undefined;
    }
    this._shuffleMenuOpen = true;
  };

  /** Reshuffle the queue. MA reshuffles the upcoming items whenever shuffle
   *  transitions OFF->ON (set_shuffle no-ops on no change), so toggle off then on;
   *  this always ends with shuffle enabled. */
  private _reshuffleQueue(): void {
    this._shuffleMenuOpen = false;
    const e = this._entityId();
    if (!e || !this.hass) return;
    const hass = this.hass;
    // MA re-randomizes the upcoming items when shuffle transitions OFF -> ON. Both
    // service calls resolve only after MA has applied the change, so a single refetch
    // afterwards reflects the new order. (The queue cache key also includes the shuffle
    // state, so a normal shuffle toggle refreshes the list the same way, event-driven.)
    void (async () => {
      await hass.callService("media_player", "shuffle_set", { entity_id: e, shuffle: false });
      await hass.callService("media_player", "shuffle_set", { entity_id: e, shuffle: true });
      this._queueKey = undefined;
      void this._ensureQueue();
    })();
  }

  private _onSeek = (e: Event): void => {
    const pct = Number((e.target as HTMLInputElement).value);
    const dur = this._duration();
    if (dur) this._call("media_seek", { seek_position: (pct / 100) * dur });
  };

  // --- Favorite (Music Assistant per-player button entity) -------------------

  private _reg(): Record<string, { device_id?: string | null; platform?: string } | undefined> {
    return (
      (this.hass as unknown as {
        entities?: Record<string, { device_id?: string | null; platform?: string } | undefined>;
      })?.entities ?? {}
    );
  }

  /** The Music Assistant "favorite now playing" button entity on the resolved
   *  player's device (MA registers one per player), or undefined if none. */
  private _favoriteButtonId(): string | undefined {
    const entity = this._entityId();
    if (!entity) return undefined;
    const reg = this._reg();
    const dev = reg[entity]?.device_id;
    if (!dev) return undefined;
    const buttons = Object.keys(reg).filter(
      (id) =>
        id.startsWith("button.") &&
        reg[id]?.platform === "music_assistant" &&
        reg[id]?.device_id === dev,
    );
    return buttons.find((id) => /favorite|favourite|like/.test(id)) ?? buttons[0];
  }

  /** Whether the currently-playing track is favorited (optimistic override, else the queue). */
  private _isCurrentFavorite(): boolean {
    const cur = this._attr<string>("media_content_id");
    if (this._favOptimistic !== undefined && this._favOptKey === cur) return this._favOptimistic;
    return !!this._queue?.[this._queueCurrentIdx]?.favorite;
  }

  private _onFavorite = (): void => {
    const cur = this._attr<string>("media_content_id");
    const currentlyFav = this._isCurrentFavorite();
    const e = this._entityId();
    if (!e || !this.hass) return;
    // Optimistic: flip the heart immediately for clear feedback.
    this._favOptKey = cur;
    this._favOptimistic = !currentlyFav;
    if (currentlyFav) {
      void this.hass.callService("mass_queue", "unfavorite_current_item", { entity: e });
    } else {
      const btn = this._favoriteButtonId();
      if (btn) void this.hass.callService("button", "press", { entity_id: btn });
    }
    // Reconcile with the server once it has processed the change.
    window.setTimeout(() => {
      this._favOptimistic = undefined;
      this._favOptKey = undefined;
      this._queueKey = undefined;
      void this._ensureQueue();
      this.requestUpdate();
    }, 1500);
  };

  // --- Cast target / grouping ------------------------------------------------

  private _locked(): boolean {
    return this._config?.lock_target_device === true;
  }

  private _friendly(id: string): string {
    const fn = this.hass?.states[id]?.attributes?.friendly_name;
    return typeof fn === "string" ? fn : id;
  }

  /** All Music Assistant media_player entity ids. */
  private _massPlayerIds(): string[] {
    const reg = this._reg();
    return Object.keys(reg)
      .filter((id) => id.startsWith("media_player.") && reg[id]?.platform === "music_assistant")
      .sort((a, b) => this._friendly(a).localeCompare(this._friendly(b)));
  }

  private _groupMembers(): string[] {
    const m = this._attr<string[]>("group_members");
    return Array.isArray(m) ? m : [];
  }

  /** Whether the resolved player supports grouping (MediaPlayerEntityFeature.GROUPING = 524288). */
  private _supportsGrouping(): boolean {
    const sf = Number(this._attr<number>("supported_features") ?? 0);
    return (sf & 524288) !== 0;
  }

  private _toggleCast = (): void => {
    if (!this._locked()) this._castOpen = !this._castOpen;
  };

  private _join(id: string): void {
    const e = this._entityId();
    if (e && this.hass) {
      void this.hass.callService("media_player", "join", { entity_id: e, group_members: [id] });
    }
  }

  private _unjoin(id: string): void {
    if (this.hass) void this.hass.callService("media_player", "unjoin", { entity_id: id });
  }

  // --- Right-tab data (Music Assistant via mass_queue / get_library) ---------

  private _conn():
    | { sendMessagePromise<T = unknown>(m: Record<string, unknown>): Promise<T> }
    | undefined {
    return (
      this.hass as unknown as {
        connection?: { sendMessagePromise<T>(m: Record<string, unknown>): Promise<T> };
      }
    ).connection;
  }

  private async _callWithResponse(
    domain: string,
    service: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    const conn = this._conn();
    if (!conn) return undefined;
    const r = await conn.sendMessagePromise<{ response?: unknown }>({
      type: "call_service",
      domain,
      service,
      service_data: data,
      return_response: true,
    });
    return r?.response;
  }

  /** True when the mass_queue integration (Queue/Recent/Lyrics data source) is present. */
  private _massQueueAvailable(): boolean {
    const svc = (this.hass as unknown as { services?: Record<string, Record<string, unknown>> })
      .services;
    return !!svc?.mass_queue?.get_queue_items;
  }

  private _visibleTabs(): { id: MusicTab; label: string }[] {
    return this._massQueueAvailable() ? TABS : TABS.filter((t) => t.id === "media");
  }

  private async _ensureConfigEntry(): Promise<string | undefined> {
    if (this._maConfigEntryId) return this._maConfigEntryId;
    const conn = this._conn();
    if (!conn) return undefined;
    try {
      const entries = await conn.sendMessagePromise<{ domain: string; entry_id: string }[]>({
        type: "config_entries/get",
      });
      this._maConfigEntryId = entries.find((e) => e.domain === "music_assistant")?.entry_id;
    } catch {
      /* ignore */
    }
    return this._maConfigEntryId;
  }

  private async _ensureMassQueueEntry(): Promise<string | undefined> {
    if (this._massQueueEntryId) return this._massQueueEntryId;
    const conn = this._conn();
    if (!conn) return undefined;
    try {
      const entries = await conn.sendMessagePromise<{ domain: string; entry_id: string }[]>({
        type: "config_entries/get",
      });
      this._massQueueEntryId = entries.find((e) => e.domain === "mass_queue")?.entry_id;
    } catch {
      /* ignore */
    }
    return this._massQueueEntryId;
  }

  /** Add/remove a specific queue item to/from favorites (Music Assistant). */
  private async _queueFavorite(it: QueueItem, makeFav: boolean): Promise<void> {
    this._queueMenuId = undefined;
    const e = this._entityId();
    if (!e || !this.hass || !it.uri) return;
    const isCurrent = it.uri === this._attr<string>("media_content_id");
    if (makeFav) {
      const cfg = await this._ensureMassQueueEntry();
      if (cfg) {
        void this.hass.callService("mass_queue", "send_command", {
          config_entry_id: cfg,
          command: "music/favorites/add_item",
          data: { item: it.uri },
        });
      }
    } else if (isCurrent) {
      void this.hass.callService("mass_queue", "unfavorite_current_item", { entity: e });
    } else {
      const p = parseMaUri(it.uri);
      const cfg = await this._ensureMassQueueEntry();
      if (p && cfg) {
        void this.hass.callService("mass_queue", "send_command", {
          config_entry_id: cfg,
          command: "music/favorites/remove_item",
          data: { media_type: p.mediaType, library_item_id: p.itemId },
        });
      }
    }
    // Reflect the new favorite state immediately, then reconcile with the server.
    if (this._queue) {
      const i = this._queue.findIndex((x) => x.id === it.id);
      if (i >= 0) {
        const next = this._queue.slice();
        next[i] = { ...next[i], favorite: makeFav };
        this._queue = next;
        this.requestUpdate();
      }
    }
    this._reconcileQueue();
  }

  /** The active Media-tab layout: session override, else config, else tiles. */
  private _layout(): MusicMediaLayout {
    return this._mediaLayoutOverride ?? this._config?.media_layout ?? "tiles";
  }

  private _orchestrateTabData(): void {
    if (!this.hass) return;
    if (this._config?.mode === "mini") {
      // Only fetch when a mini popup is open (keeps the idle mini bar cheap).
      if (this._miniPopup === "queue" && this._massQueueAvailable()) void this._ensureQueue();
      else if (this._miniPopup === "media") void this._ensureMedia(this._mediaFilter);
      return;
    }
    // Keep the queue warm (cached by track) so the favorite state is always known.
    if (this._massQueueAvailable()) void this._ensureQueue();
    if (this._tab === "media") {
      void this._ensureMedia(this._mediaFilter);
      void this._ensureRecent();
    } else if (this._tab === "lyrics") void this._ensureLyrics();
  }

  private async _ensureMedia(filter: MediaFilter): Promise<void> {
    if (this._mediaCache[filter] || this._mediaLoading[filter]) return;
    this._mediaLoading[filter] = true;
    try {
      const cfg = await this._ensureConfigEntry();
      if (!cfg) {
        this._mediaCache = { ...this._mediaCache, [filter]: [] };
        return;
      }
      const mediaType = filterMediaType(filter);
      const params: Record<string, unknown> = {
        config_entry_id: cfg,
        media_type: mediaType,
        limit: 100,
        order_by: "last_played_desc",
      };
      if (filter === "favorite") params.favorite = true;
      const resp = await this._callWithResponse("music_assistant", "get_library", params);
      this._mediaCache = { ...this._mediaCache, [filter]: this._parseMediaItems(resp, mediaType) };
    } catch {
      this._mediaCache = { ...this._mediaCache, [filter]: [] };
    } finally {
      this._mediaLoading[filter] = false;
      this.requestUpdate();
    }
  }

  /** Recently-played row: newest playlists + albums merged (best-effort, full mode only). */
  private async _ensureRecent(): Promise<void> {
    if (this._recentMedia || this._recentLoading) return;
    this._recentLoading = true;
    try {
      const cfg = await this._ensureConfigEntry();
      if (!cfg) {
        this._recentMedia = [];
        return;
      }
      const query = (media_type: string): Promise<unknown> =>
        this._callWithResponse("music_assistant", "get_library", {
          config_entry_id: cfg,
          media_type,
          limit: 10,
          order_by: "last_played_desc",
        });
      const [pl, al] = await Promise.all([query("playlist"), query("album")]);
      this._recentMedia = [
        ...this._parseMediaItems(pl, "playlist"),
        ...this._parseMediaItems(al, "album"),
      ].slice(0, 12);
    } catch {
      this._recentMedia = [];
    } finally {
      this._recentLoading = false;
      this.requestUpdate();
    }
  }

  private _parseMediaItems(resp: unknown, mediaType: string): MediaItem[] {
    if (!resp) return [];
    let arr: Record<string, unknown>[] = [];
    if (Array.isArray(resp)) arr = resp as Record<string, unknown>[];
    else {
      const found = Object.values(resp as Record<string, unknown>).find((v) => Array.isArray(v));
      arr = (found as Record<string, unknown>[]) ?? [];
    }
    return arr
      .map((it) => ({
        name: String(it.name ?? it.media_title ?? it.title ?? "Unknown"),
        uri: String(it.uri ?? it.media_content_id ?? ""),
        image: this._pickImage(it),
        mediaType,
      }))
      .filter((x) => x.uri);
  }

  private _pickImage(it: Record<string, unknown>): string | undefined {
    const direct = it.image ?? it.media_image ?? it.image_url;
    if (typeof direct === "string" && direct) return direct;
    const meta = it.metadata as { images?: { path?: string; url?: string }[] } | undefined;
    const first = meta?.images?.[0];
    return first?.path ?? first?.url ?? undefined;
  }

  private async _ensureQueue(force = false): Promise<void> {
    const entity = this._entityId();
    if (!entity || this._queueLoading) return;
    // Key on the current track AND shuffle state: toggling/reshuffling shuffle reorders
    // the upcoming items, so the resulting HA state update re-keys and refetches the
    // list automatically (event-driven, no polling).
    const key = `${entity}|${this._attr<string>("media_content_id") ?? ""}|${
      this._attr<boolean>("shuffle") ? "1" : "0"
    }`;
    if (!force && this._queue && this._queueKey === key) return;
    this._queueLoading = true;
    try {
      const resp = (await this._callWithResponse("mass_queue", "get_queue_items", {
        entity,
        limit_before: 20,
        limit_after: 100,
      })) as Record<string, Record<string, unknown>[]> | undefined;
      const arr = resp?.[entity] ?? (resp ? (Object.values(resp)[0] ?? []) : []);
      const items: QueueItem[] = arr.map((it) => ({
        id: String(it.queue_item_id ?? ""),
        title: String(it.media_title ?? "Unknown"),
        artist: String(it.media_artist ?? ""),
        album: String(it.media_album_name ?? ""),
        image: typeof it.media_image === "string" && it.media_image ? it.media_image : undefined,
        uri: typeof it.media_content_id === "string" ? it.media_content_id : undefined,
        duration: typeof it.duration === "number" ? it.duration : undefined,
        favorite: !!it.favorite,
      }));
      // Music Assistant briefly reports an empty queue while it applies a
      // reorder/removal. Don't clobber a good list (or an optimistic edit) with
      // that transient blank — a later reconcile / track change will refresh it.
      if (items.length === 0 && (this._queue?.length ?? 0) > 0) return;
      const cur = this._attr<string>("media_content_id");
      let idx = items.findIndex((x) => x.uri && x.uri === cur);
      if (idx < 0) idx = 0;
      this._queue = items;
      this._queueCurrentIdx = idx;
      this._queueKey = key;
    } catch {
      // Keep whatever we already have on error rather than blanking the list.
      if (!this._queue) {
        this._queue = [];
        this._queueCurrentIdx = 0;
      }
      this._queueKey = key;
    } finally {
      this._queueLoading = false;
      this.requestUpdate();
    }
  }

  private async _ensureLyrics(): Promise<void> {
    const title = this._title();
    const artist = this._attr<string>("media_artist") ?? "";
    if (!title) {
      this._lyrics = null;
      return;
    }
    const key = `${artist}|${title}`;
    if (this._lyricsLoading) return;
    if (this._lyricsKey === key && this._lyrics !== undefined) return;
    this._lyricsLoading = true;
    this._lyricsKey = key;
    this._lyrics = undefined;
    try {
      const album = this._attr<string>("media_album_name") ?? "";
      const dur = Math.round(this._duration());
      const url =
        "https://lrclib.net/api/get?" +
        `artist_name=${encodeURIComponent(artist)}` +
        `&track_name=${encodeURIComponent(title)}` +
        `&album_name=${encodeURIComponent(album)}` +
        `&duration=${dur}`;
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (r.ok) {
        const j = (await r.json()) as { syncedLyrics?: string; plainLyrics?: string };
        this._lyricsPlain = j.plainLyrics ?? undefined;
        this._lyrics = j.syncedLyrics ? this._parseLrc(j.syncedLyrics) : j.plainLyrics ? [] : null;
      } else {
        this._lyrics = null;
        this._lyricsPlain = undefined;
      }
    } catch {
      this._lyrics = null;
    } finally {
      this._lyricsLoading = false;
      this.requestUpdate();
    }
  }

  private _parseLrc(lrc: string): LyricLine[] {
    const out: LyricLine[] = [];
    for (const line of lrc.split(/\r?\n/)) {
      const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s?(.*)$/);
      if (!m) continue;
      out.push({ t: parseInt(m[1], 10) * 60 + parseFloat(m[2]), text: m[3] });
    }
    return out;
  }

  private _scrollActiveLyric(): void {
    if (this._tab !== "lyrics") return;
    const el = this.renderRoot?.querySelector?.(".lrc.on");
    (el as HTMLElement | null)?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }

  private _playMedia(uri: string, mediaType = "playlist"): void {
    const e = this._entityId();
    if (!e || !this.hass || !uri) return;
    // Show a loading indicator on the tapped row until playback actually starts (the
    // current track changes) or a safety timeout elapses.
    this._mediaStartingUri = uri;
    this._mediaStartingPrevId = this._attr<string>("media_content_id") ?? "";
    window.clearTimeout(this._mediaStartingTimer);
    this._mediaStartingTimer = window.setTimeout(() => {
      this._mediaStartingUri = undefined;
    }, 15000);
    void this.hass.callService("music_assistant", "play_media", {
      entity_id: e,
      media_id: uri,
      media_type: mediaType,
      enqueue: "replace",
    });
  }

  /** Clear the Media-tab loading indicator once playback of the started item begins. */
  private _clearMediaStartingIfPlaying(): void {
    if (!this._mediaStartingUri) return;
    const cur = this._attr<string>("media_content_id") ?? "";
    if (cur !== (this._mediaStartingPrevId ?? "")) {
      this._mediaStartingUri = undefined;
      window.clearTimeout(this._mediaStartingTimer);
    }
  }

  private _onDragStart(e: PointerEvent, id: string): void {
    if (!this._queue) return;
    e.preventDefault();
    e.stopPropagation();
    this._queueMenuId = undefined;
    this._dragId = id;
    this._dragOrigIdx = this._queue.findIndex((x) => x.id === id);
    window.addEventListener("pointermove", this._onDragMove, true);
    window.addEventListener("pointerup", this._onDragEnd, true);
    window.addEventListener("pointercancel", this._onDragEnd, true);
    this.requestUpdate();
  }

  /** Live-reorder the local queue as the pointer moves over the other rows. */
  private _onDragMove = (e: PointerEvent): void => {
    const dragId = this._dragId;
    const q = this._queue;
    if (!dragId || !q) return;
    e.preventDefault();
    const dragged = q.find((x) => x.id === dragId);
    if (!dragged) return;
    const root = this.renderRoot as ShadowRoot;
    const rows = (Array.from(root.querySelectorAll(".qrow")) as HTMLElement[]).filter(
      (r) => r.dataset.qid && r.dataset.qid !== dragId,
    );
    const rest = q.filter((x) => x.id !== dragId);
    // Insertion point among the remaining items, by pointer Y vs each row midpoint.
    let insert = rest.length;
    for (const r of rows) {
      const rect = r.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        insert = rest.findIndex((x) => x.id === r.dataset.qid);
        break;
      }
    }
    // Never move before/onto the currently-playing track.
    const curId = q[this._queueCurrentIdx]?.id;
    const curInRest = curId ? rest.findIndex((x) => x.id === curId) : -1;
    const minInsert = curInRest >= 0 ? curInRest + 1 : 0;
    if (insert < minInsert) insert = minInsert;
    const next = rest.slice();
    next.splice(insert, 0, dragged);
    if (next.some((x, i) => x.id !== q[i]?.id)) {
      this._queue = next;
      this.requestUpdate();
    }
  };

  private _onDragEnd = (): void => {
    window.removeEventListener("pointermove", this._onDragMove, true);
    window.removeEventListener("pointerup", this._onDragEnd, true);
    window.removeEventListener("pointercancel", this._onDragEnd, true);
    const id = this._dragId;
    const orig = this._dragOrigIdx;
    this._dragId = undefined;
    this._dragOrigIdx = undefined;
    this.requestUpdate();
    if (!id || orig === undefined || !this._queue) return;
    const finalIdx = this._queue.findIndex((x) => x.id === id);
    if (finalIdx < 0 || finalIdx === orig) return;
    this._commitReorder(id, finalIdx - orig);
  };

  /** Apply a net queue move as a run of single-step up/down service calls, then
   *  reconcile with the server. */
  private _commitReorder(id: string, delta: number): void {
    const e = this._entityId();
    if (!e || !this.hass || delta === 0) return;
    const hass = this.hass;
    const svc = delta < 0 ? "move_queue_item_up" : "move_queue_item_down";
    const steps = Math.abs(delta);
    void (async () => {
      for (let k = 0; k < steps; k++) {
        await hass.callService("mass_queue", svc, { entity: e, queue_item_id: id });
      }
      this._reconcileQueue();
    })();
  }

  private _toggleQueueMenu(e: Event, id: string): void {
    e.stopPropagation();
    this._queueMenuId = this._queueMenuId === id ? undefined : id;
  }

  /** Keep the open queue menu shown as a top-layer popover (so it escapes the tab
   *  body's scroll clipping) and anchored under its row. */
  private _syncQueueMenuPopover(): void {
    if (!this._queueMenuId) return;
    const root = this.renderRoot as ShadowRoot | undefined;
    const menu = root?.querySelector(".qmenu--pop") as
      | (HTMLElement & { showPopover?: () => void })
      | null;
    if (!menu) return;
    const anchor = menu.closest(".qmenu-wrap") as HTMLElement | null;
    if (!menu.matches(":popover-open")) {
      try {
        menu.showPopover?.();
      } catch {
        /* already open */
      }
    }
    positionOverflowPopover(menu, anchor ?? undefined);
  }

  private _onQueueMenuToggle = (ev: Event): void => {
    if ((ev as Event & { newState?: string }).newState === "closed") {
      this._queueMenuId = undefined;
    }
  };

  private _queueAct(action: "play" | "next" | "up" | "down" | "remove", id: string): void {
    const e = this._entityId();
    if (!e || !this.hass || !id) return;
    this._queueMenuId = undefined;
    if (action === "play") {
      // "Play now": reposition the item to the next slot (same as Play Next), then
      // stop the current track and advance to it. Sequence the two calls so the
      // move has landed before we skip.
      const hass = this.hass;
      void (async () => {
        await hass.callService("mass_queue", "move_queue_item_next", {
          entity: e,
          queue_item_id: id,
        });
        await hass.callService("media_player", "media_next_track", { entity_id: e });
      })();
      this._applyQueueOptimistic("next", id);
      this._reconcileQueue();
      return;
    }
    const svc = {
      next: "move_queue_item_next",
      up: "move_queue_item_up",
      down: "move_queue_item_down",
      remove: "remove_queue_item",
    }[action];
    void this.hass.callService("mass_queue", svc, { entity: e, queue_item_id: id });
    // Update the list immediately for instant feedback, then reconcile with the
    // server once it has applied the reorder/removal.
    this._applyQueueOptimistic(action, id);
    this._reconcileQueue();
  }

  /** Reorder/remove a queue item locally so the change shows instantly. */
  private _applyQueueOptimistic(action: "next" | "up" | "down" | "remove", id: string): void {
    const q = this._queue;
    if (!q) return;
    const i = q.findIndex((x) => x.id === id);
    if (i < 0) return;
    const curId = q[this._queueCurrentIdx]?.id;
    const next = q.slice();
    if (action === "up" && i > 0) {
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
    } else if (action === "down" && i < next.length - 1) {
      [next[i + 1], next[i]] = [next[i], next[i + 1]];
    } else if (action === "remove") {
      next.splice(i, 1);
    } else if (action === "next") {
      const [item] = next.splice(i, 1);
      const at = curId ? next.findIndex((x) => x.id === curId) : this._queueCurrentIdx;
      next.splice((at < 0 ? this._queueCurrentIdx : at) + 1, 0, item);
    } else {
      return;
    }
    this._queue = next;
    const newCur = curId ? next.findIndex((x) => x.id === curId) : -1;
    if (newCur >= 0) this._queueCurrentIdx = newCur;
    this.requestUpdate();
  }

  /** Re-fetch the queue a few times after a mutation to sync with the server
   *  once Music Assistant has finished applying it. */
  private _reconcileQueue(): void {
    [700, 1500, 2600].forEach((d) => window.setTimeout(() => void this._ensureQueue(true), d));
  }

  private _pickTab(id: MusicTab): void {
    this._tab = id;
    this._tabTouched = true;
  }

  // --- Navigation (empty/unmatched states) -----------------------------------

  private _navigate(path: string): void {
    const root = "/" + (location.pathname.split("/")[1] ?? "");
    const target = path.replace("[root]", root);
    history.pushState(null, "", target);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
  }

  // --- Render ----------------------------------------------------------------

  protected render(): TemplateResult {
    const themeClass = tedCardThemeClass(this._config?.theme ?? "ha");
    const mode: MusicBackgroundMode = this._config?.background_mode ?? "blur";
    const res = this._resolve();

    if (res.state !== "ok") {
      return html`<ha-card class="ted-card ${themeClass}">${this._renderMessage(res)}</ha-card>`;
    }

    const hasMedia = this._hasMedia();
    // In blur mode with no artwork (idle), match the themed card surface + text so an
    // idle player looks like every other card (theme color/opacity/blur).
    const hasArt = mode === "blur" && !!this._artUrl();
    const fg = hasArt ? (this._avgFg ?? "#ffffff") : "var(--ted-style-text)";

    if (this._config?.mode === "mini") {
      return html`
        <ha-card class="ted-card ${themeClass}" style="--music-fg:${fg}">
          <div class="bg-clip">${this._renderBackground(mode)}${this._renderScrim(mode)}${this._renderFrost(mode)}</div>
          <div class="content mini-content">${this._renderMini()}</div>
          ${this._renderMiniProgress()}
        </ha-card>
        ${this._renderMiniModal()}
      `;
    }

    const tabs = this._visibleTabs();
    if (!tabs.some((t) => t.id === this._tab)) {
      this._tab = "media";
    } else if (!this._tabTouched) {
      this._tab = hasMedia && this._massQueueAvailable() ? "queue" : "media";
    }

    return html`
      <ha-card class="ted-card ${themeClass}" style="--music-fg:${fg}">
        <div class="bg-clip">${this._renderBackground(mode)}${this._renderScrim(mode)}${this._renderFrost(mode)}</div>
        <div class="content">
          ${this._renderPlayer()}
          <div class="tabs">${this._renderTabs()}</div>
        </div>
      </ha-card>
    `;
  }

  /** A card-wide frosted-glass layer, tinted with the album's average color, over the
   *  blurred art so content stands out. */
  private _renderFrost(mode: MusicBackgroundMode): TemplateResult | typeof nothing {
    if (mode !== "blur" || !this._artUrl()) return nothing;
    const c = this._avgColor;
    const style = c ? `background:rgba(${c}, 0.6)` : "background:rgba(16, 16, 20, 0.4)";
    return html`<div class="frost" style=${style}></div>`;
  }

  /** Dark-mode scrim over the blurred art (keeps light artwork readable). No-op
   *  unless `background_mode: blur` with artwork, and only in dark mode. */
  private _renderScrim(mode: MusicBackgroundMode): TemplateResult | typeof nothing {
    if (mode !== "blur" || !this._artUrl()) return nothing;
    const dark = !!(this.hass as unknown as { themes?: { darkMode?: boolean } })?.themes?.darkMode;
    if (!dark) return nothing;
    return html`<div class="bg-scrim"></div>`;
  }

  private _renderBackground(mode: MusicBackgroundMode): TemplateResult | typeof nothing {
    // "none" (or blur with no artwork) lets the themed ha-card surface show through, so an
    // idle player matches every other card's color/opacity/blur instead of an opaque fill.
    if (mode !== "blur") return nothing;
    const art = this._artUrl();
    if (!art) return nothing;
    return html`<div class="bg bg-blur" style=${`background-image:url("${art}")`}></div>`;
  }

  private _renderPlayer(): TemplateResult {
    const art = this._artUrl();
    const title = this._title() ?? "Nothing playing";
    const artist = this._attr<string>("media_artist") ?? "";
    const album = this._attr<string>("media_album_name") ?? "";
    const showAlbum = album && album !== title;
    const dur = this._duration();
    const elapsed = this._elapsed();
    const pct = dur ? (elapsed / dur) * 100 : 0;
    const shuffle = !!this._attr<boolean>("shuffle");
    const repeat = this._attr<string>("repeat") ?? "off";
    const playing = this._isPlaying();
    const volLevel = this._attr<number>("volume_level");
    const volPct = typeof volLevel === "number" ? Math.round(volLevel * 100) : 0;
    const muted = !!this._attr<boolean>("is_volume_muted");
    const favBtn = !!this._favoriteButtonId();
    const fav = this._isCurrentFavorite();

    const artTpl = html`<div class="art-wrap">
      ${art
        ? html`<img class="art" src=${art} alt="" />`
        : html`<div class="art art-empty"><ha-icon icon=${ic(IC.music)}></ha-icon></div>`}
    </div>`;
    const detailsTpl = html`<div class="details">
      <div class="title-row">
        <span class="title" title=${title}>${title}</span>
        <button
          type="button"
          class="fav ${fav ? "on" : ""}"
          title="Favorite current track"
          aria-label="Favorite current track"
          ?disabled=${!favBtn}
          @click=${this._onFavorite}
        >
          <ha-icon icon=${fav ? ic(IC.favoriteOn) : ic(IC.favorite)}></ha-icon>
        </button>
        ${this._renderVolumeControl(volPct, muted)}
      </div>
      <div class="sub">
        <span class="sub-text"
          ><span class="artist">${artist}</span>${showAlbum
            ? html` <span class="album">(${album})</span>`
            : nothing}</span
        >
        ${this._renderCastChip()}
      </div>
    </div>`;

    return html`
      <div class="player ${this._compact ? "compact" : ""}">
        ${this._compact
          ? html`<div class="header">${artTpl}${detailsTpl}</div>`
          : html`${artTpl}${detailsTpl}`}

        <div class="progress">
          <input
            class="seek"
            type="range"
            min="0"
            max="100"
            style="--seek-fill:${Math.min(100, Math.max(0, pct))}%"
            .value=${String(pct)}
            @change=${this._onSeek}
            aria-label="Seek"
          />
          <div class="times">
            <span>${fmtTime(elapsed)}</span><span>${fmtTime(dur)}</span>
          </div>
        </div>

        <div class="controls">
          ${this._renderShuffleControl(shuffle)}
          ${this._ctrl(ic(IC.previous), "Previous", this._onPrev)}
          ${this._ctrl(
            playing ? ic(IC.pause) : ic(IC.play),
            playing ? "Pause" : "Play",
            this._onPlayPause,
            false,
            false,
            true,
          )}
          ${this._ctrl(ic(IC.next), "Next", this._onNext)}
          ${this._ctrl(
            repeat === "one" ? ic(IC.repeatOne) : ic(IC.repeat),
            `Repeat: ${repeat}`,
            this._onRepeat,
            repeat !== "off",
          )}
        </div>
      </div>
    `;
  }

  /** Volume button in the controls row: tap opens a slider, double-tap/hold mutes. */
  private _renderVolumeControl(volPct: number, muted: boolean): TemplateResult {
    const icon =
      muted || volPct === 0
        ? ic(IC.volOff)
        : volPct < 10
          ? ic(IC.volLow)
          : volPct < 50
            ? ic(IC.volMed)
            : ic(IC.volHigh);
    const tip = muted ? "Volume - Muted" : `Volume - ${volPct}%`;
    return html`<div class="vol-wrap ${this._volOpen ? "open" : ""}">
      <span class="vol-slide">
        <input
          class="vol"
          type="range"
          min="0"
          max="100"
          .value=${String(volPct)}
          @input=${this._onVolume}
          @change=${this._onVolume}
          aria-label="Volume"
        />
        <span class="vol-num">${volPct}</span>
      </span>
      <button
        type="button"
        class="ctrl vol-btn ${muted ? "active" : ""}"
        title=${tip}
        aria-label=${tip}
        @pointerdown=${this._onVolPointerDown}
        @pointerup=${this._onVolPointerUp}
        @pointercancel=${this._onVolPointerUp}
        @click=${this._onVolClick}
        @dblclick=${this._onVolDblClick}
      >
        <ha-icon icon=${icon}></ha-icon>
      </button>
    </div>`;
  }

  /** Compact adaptive bar player (mode: mini). Which transport controls appear
   *  inline vs. in the "…" menu is driven by CSS container queries on the card
   *  width; `_miniStacked` (card height) drops the controls to a row below the
   *  title/artist. */
  private _renderMini(): TemplateResult {
    const art = this._artUrl();
    const title = this._title() ?? "Not playing";
    const artist = this._attr<string>("media_artist") ?? "";
    const shuffle = !!this._attr<boolean>("shuffle");
    const repeat = this._attr<string>("repeat") ?? "off";
    const playing = this._isPlaying();
    const volLevel = this._attr<number>("volume_level");
    const volPct = typeof volLevel === "number" ? Math.round(volLevel * 100) : 0;
    const muted = !!this._attr<boolean>("is_volume_muted");
    const stacked = this._miniStacked;
    return html`
      <div class="mini ${stacked ? "stacked" : ""}" @click=${this._onMiniSurfaceTap}>
        <div class="mini-art-wrap">
          ${art
            ? html`<img class="mini-art" src=${art} alt="" />`
            : html`<div class="mini-art ph"><ha-icon icon=${ic(IC.music)}></ha-icon></div>`}
        </div>
        <div class="mini-body">
          <div class="mini-meta-wrap">
            <div class="mini-meta">
              <div class="mini-title one">${title}</div>
              <div class="mini-artist one">${artist}</div>
            </div>
            ${stacked && playing ? this._renderEq() : nothing}
          </div>
          <div class="mini-actions">
            <div class="mini-controls" @click=${this._stopEvt}>
              <span class="mini-tp mini-tp-extra">
                ${this._renderShuffleControl(shuffle)}
                ${this._ctrl(ic(IC.previous), "Previous", this._onPrev)}
              </span>
              <span class="mini-tp mini-tp-play">
                ${this._ctrl(
                  playing ? ic(IC.pause) : ic(IC.play),
                  playing ? "Pause" : "Play",
                  this._onPlayPause,
                  false,
                  false,
                  true,
                )}
              </span>
              <span class="mini-tp mini-tp-extra">
                ${this._ctrl(ic(IC.next), "Next", this._onNext)}
                ${this._ctrl(
                  repeat === "one" ? ic(IC.repeatOne) : ic(IC.repeat),
                  `Repeat: ${repeat}`,
                  this._onRepeat,
                  repeat !== "off",
                )}
              </span>
            </div>
            ${!stacked && playing
              ? html`<div class="mini-right">${this._renderEq()}</div>`
              : nothing}
          </div>
        </div>
        ${this._renderMiniPopups(volPct, muted, playing, shuffle, repeat)}
      </div>
    `;
  }

  /** Animated equalizer shown at the right of the bar while audio is playing.
   *  Reuses the full player's 3-bar indicator so both match. */
  private _renderEq(): TemplateResult {
    return html`<div class="eq" aria-hidden="true"><i></i><i></i><i></i></div>`;
  }

  /** The mini bar's popups: the action menu and the volume flyout. Both anchor to
   *  the right side of the bar and fly up or down (see `_positionPopups`). The menu
   *  always carries the full transport set (Play/Pause + Previous/Next/Shuffle/
   *  Repeat), but CSS container queries only reveal each item when its inline
   *  counterpart has been collapsed away. */
  private _renderMiniPopups(
    volPct: number,
    muted: boolean,
    playing = false,
    shuffle = false,
    repeat = "off",
  ): TemplateResult {
    const menuDir = this._miniMenuUp ? "up" : "down";
    const volDir = this._miniVolUp ? "up" : "down";
    return html`
      ${this._miniMenuOpen
        ? html`<div class="mini-menu ${menuDir}" role="menu" @click=${this._stopEvt}>
            <button
              type="button"
              class="mini-menu-item menu-tp menu-tp-play"
              @click=${this._onMiniPlayPause}
            >
              <ha-icon icon=${ic(playing ? IC.pause : IC.play)}></ha-icon
              ><span>${playing ? "Pause" : "Play"}</span>
            </button>
            <button type="button" class="mini-menu-item menu-tp menu-tp-extra" @click=${this._onMiniPrev}>
              <ha-icon icon=${ic(IC.previous)}></ha-icon><span>Previous</span>
            </button>
            <button type="button" class="mini-menu-item menu-tp menu-tp-extra" @click=${this._onMiniNext}>
              <ha-icon icon=${ic(IC.next)}></ha-icon><span>Next</span>
            </button>
            <button
              type="button"
              class="mini-menu-item menu-tp menu-tp-extra ${shuffle ? "active" : ""}"
              @click=${this._onMiniShuffle}
            >
              <ha-icon icon=${ic(IC.shuffle)}></ha-icon><span>Shuffle</span>
            </button>
            <button
              type="button"
              class="mini-menu-item menu-tp menu-tp-extra ${repeat !== "off" ? "active" : ""}"
              @click=${this._onMiniRepeat}
            >
              <ha-icon icon=${ic(repeat === "one" ? IC.repeatOne : IC.repeat)}></ha-icon
              ><span>Repeat${repeat === "one" ? ": one" : ""}</span>
            </button>
            <div class="mini-menu-sep tp-sep" role="separator"></div>
            <button type="button" class="mini-menu-item" @click=${() => this._openMiniPopup("media")}>
              <ha-icon icon=${ic(IC.playlist)}></ha-icon><span>Media</span>
            </button>
            <button type="button" class="mini-menu-item" @click=${() => this._openMiniPopup("queue")}>
              <ha-icon icon=${ic(IC.queue)}></ha-icon><span>Queue</span>
            </button>
            <button type="button" class="mini-menu-item" @click=${this._openMiniVol}>
              <ha-icon icon=${ic(muted || volPct === 0 ? IC.volOff : IC.volHigh)}></ha-icon
              ><span>Volume</span>
            </button>
            <button type="button" class="mini-menu-item" @click=${this._startParty}>
              <ha-icon icon=${ic(IC.party)}></ha-icon><span>Party Mode!</span>
            </button>
          </div>`
        : nothing}
      ${this._miniVolOpen
        ? html`<div class="mini-vol-flyout ${volDir}" role="group" @click=${this._stopEvt}>
            <span class="mini-vol-num">${volPct}</span>
            <span class="mini-vol-range-wrap">
              <input
                class="mini-vol-range"
                type="range"
                min="0"
                max="100"
                .value=${String(volPct)}
                @input=${this._onVolume}
                @change=${this._onVolume}
                aria-label="Volume"
              />
            </span>
            <button
              type="button"
              class="mini-vol-mute ${muted ? "active" : ""}"
              title=${muted ? "Unmute" : "Mute"}
              aria-label=${muted ? "Unmute" : "Mute"}
              @click=${this._onMiniMute}
            >
              <ha-icon
                icon=${ic(
                  muted || volPct === 0
                    ? IC.volOff
                    : volPct < 10
                      ? IC.volLow
                      : volPct < 50
                        ? IC.volMed
                        : IC.volHigh,
                )}
              ></ha-icon>
            </button>
          </div>`
        : nothing}
    `;
  }

  /** Tap anywhere on the bar surface (outside the transport controls) toggles the
   *  action menu. */
  private _onMiniSurfaceTap = (): void => {
    if (this._miniMenuOpen || this._miniVolOpen) {
      this._miniMenuOpen = false;
      this._miniVolOpen = false;
    } else {
      this._miniMenuOpen = true;
    }
  };

  private _stopEvt = (e: Event): void => {
    e.stopPropagation();
  };

  private _openMiniPopup(which: "media" | "queue"): void {
    this._miniMenuOpen = false;
    this._miniVolOpen = false;
    this._miniPopup = which;
  }

  private _openMiniVol = (): void => {
    this._miniMenuOpen = false;
    this._miniVolOpen = true;
  };

  private _onMiniPlayPause = (): void => {
    this._miniMenuOpen = false;
    this._onPlayPause();
  };

  private _onMiniPrev = (): void => {
    this._miniMenuOpen = false;
    this._onPrev();
  };

  private _onMiniNext = (): void => {
    this._miniMenuOpen = false;
    this._onNext();
  };

  private _onMiniShuffle = (): void => {
    this._miniMenuOpen = false;
    this._onShuffle();
  };

  private _onMiniRepeat = (): void => {
    this._miniMenuOpen = false;
    this._onRepeat();
  };

  /** Open Music Assistant's fullscreen `#/party` dashboard for the current player.
   *  Navigates to the in-dashboard Web View page (`party_view_path`, default `webview`);
   *  falls back to a top-level navigation when the page is HTTPS but the party URL is
   *  plain http (an iframe would be blocked as mixed content). */
  private _startParty = (): void => {
    this._miniMenuOpen = false;
    this._miniVolOpen = false;
    const entity = this._entityId();
    if (!entity) return;
    const base = (
      this._config?.party_url ?? `http://${window.location.hostname}:8095`
    ).replace(/\/+$/, "");
    const player = encodeURIComponent(this._friendly(entity));
    const partyUrl = `${base}/#/party?player=${player}`;

    const mixedBlocked =
      window.location.protocol === "https:" && /^http:/i.test(partyUrl);
    if (mixedBlocked) {
      window.location.href = partyUrl;
      return;
    }
    const root = readDashboardUrlPath();
    const view = this._config?.party_view_path || "webview";
    const target = `/${root}/${view}?url=${encodeURIComponent(partyUrl)}`;
    window.history.pushState(null, "", target);
    window.dispatchEvent(new Event("location-changed"));
  };

  private _closeMiniPopup = (): void => {
    this._miniPopup = null;
  };

  private _onMiniMute = (): void => {
    this._toggleMute();
  };

  private _onMiniModalClick = (e: MouseEvent): void => {
    // Tap on the dialog element itself (the backdrop area) closes; taps inside the
    // sheet stop at the sheet.
    if (e.target === e.currentTarget) this._closeMiniPopup();
  };

  /** Centered modal window (native <dialog>, top layer) showing the Media or Queue
   *  tab body reused from the full player. */
  private _renderMiniModal(): TemplateResult | typeof nothing {
    if (!this._miniPopup) return nothing;
    const title = this._miniPopup === "media" ? "Media" : "Queue";
    const body =
      this._miniPopup === "media" ? this._renderMedia() : this._renderQueue(false);
    return html`<dialog
      class="mini-modal"
      @click=${this._onMiniModalClick}
      @cancel=${this._onMiniModalCancel}
      @close=${this._onMiniModalClose}
    >
      <div class="mini-sheet">
        <div class="mini-sheet-head">
          <span class="mini-sheet-title">${title}</span>
          <button
            type="button"
            class="mini-sheet-close"
            title="Close"
            aria-label="Close"
            @click=${this._closeMiniPopup}
          >
            <ha-icon icon=${ic(IC.close)}></ha-icon>
          </button>
        </div>
        <div class="mini-sheet-body">${body}</div>
      </div>
    </dialog>`;
  }

  private _onMiniModalCancel = (e: Event): void => {
    e.preventDefault();
    this._closeMiniPopup();
  };

  private _onMiniModalClose = (): void => {
    if (this._miniPopup) this._miniPopup = null;
  };

  /** Non-interactive playback progress: a thin strip pinned to the card's bottom edge. */
  private _renderMiniProgress(): TemplateResult {
    const dur = this._duration();
    const pct = dur ? Math.min(100, Math.max(0, (this._elapsed() / dur) * 100)) : 0;
    return html`<div class="mini-progress-clip" aria-hidden="true">
      <div class="mini-progress ${this._miniStacked ? "tall" : ""}">
        <div class="mini-progress-fill" style="width:${pct}%"></div>
      </div>
    </div>`;
  }

  /** A single control button. `active` = accent tint; `disabled` greys it; `primary`
   *  = the large play/pause. */
  private _ctrl(
    icon: string,
    label: string,
    handler: () => void,
    active = false,
    disabled = false,
    primary = false,
  ): TemplateResult {
    return html`<button
      type="button"
      class="ctrl ${active ? "active" : ""} ${primary ? "primary" : ""}"
      title=${label}
      aria-label=${label}
      ?disabled=${disabled}
      @click=${handler}
    >
      <ha-icon icon=${icon}></ha-icon>
    </button>`;
  }

  /** Shuffle control: tap toggles shuffle; hold or double-tap opens a small popup
   *  with a "Reshuffle queue" action. */
  private _renderShuffleControl(shuffle: boolean): TemplateResult {
    return html`<div class="shuffle-wrap">
      <button
        type="button"
        class="ctrl ${shuffle ? "active" : ""}"
        title="Shuffle"
        aria-label="Shuffle"
        @pointerdown=${this._onShufflePointerDown}
        @pointerup=${this._onShufflePointerUp}
        @pointercancel=${this._onShufflePointerUp}
        @click=${this._onShuffleClick}
        @dblclick=${this._onShuffleDblClick}
      >
        <ha-icon icon=${ic(IC.shuffle)}></ha-icon>
      </button>
      ${this._shuffleMenuOpen ? this._renderShuffleMenu() : nothing}
    </div>`;
  }

  private _renderShuffleMenu(): TemplateResult {
    return html`
      <div class="qmenu shuffle-menu ${this._shuffleMenuUp ? "up" : "down"}" role="menu">
        <button type="button" class="qmi" @click=${() => this._reshuffleQueue()}>
          <ha-icon icon=${ic(IC.shuffle)}></ha-icon>Reshuffle queue
        </button>
      </div>
    `;
  }

  /** The "cast to" target-device chip. Opens a device/grouping flyout unless
   *  `lock_target_device` is on (then it's a static label). */
  private _renderCastChip(): TemplateResult {
    const entity = this._entityId();
    const name = entity ? this._friendly(entity) : "";
    const locked = this._locked();
    return html`<div class="cast-wrap ${this._castOpen ? "open" : ""}">
      <button
        type="button"
        class="cast ${locked ? "locked" : ""}"
        title=${locked ? `Playback target: ${name}` : name}
        aria-label=${locked ? "Playback target" : "Change playback target"}
        ?disabled=${locked}
        @click=${this._toggleCast}
      >
        <ha-icon icon=${ic(IC.speaker)}></ha-icon><span class="cast-name">${name}</span>
      </button>
      ${this._castOpen ? this._renderCastFlyout(entity) : nothing}
    </div>`;
  }

  private _renderCastFlyout(current: string | undefined): TemplateResult {
    const header = html`<div class="cast-header">
      ${current ? this._friendly(current) : "Playback target"}
    </div>`;
    const dir = this._castUp ? "up" : "down";
    if (!this._supportsGrouping()) {
      return html`
        <div class="cast-flyout ${dir}" role="menu">
          ${header}
          <div class="cast-note">This player can't be grouped with other speakers.</div>
        </div>`;
    }
    const members = this._groupMembers();
    const players = this._massPlayerIds();
    return html`
      <div class="cast-flyout ${dir}" role="menu">
        ${header}
        ${players.map((id) => {
          const isCurrent = id === current;
          const grouped = members.includes(id);
          return html`<div class="cast-row ${isCurrent ? "cur" : ""}">
            <ha-icon icon=${ic(IC.speaker)}></ha-icon>
            <span class="cast-name">${this._friendly(id)}</span>
            ${isCurrent
              ? html`<span class="cast-tag">Target</span>`
              : html`<button
                  type="button"
                  class="cast-toggle ${grouped ? "on" : ""}"
                  title=${grouped ? "Ungroup" : "Group with target"}
                  @click=${() => (grouped ? this._unjoin(id) : this._join(id))}
                >
                  <ha-icon icon=${grouped ? ic(IC.minus) : ic(IC.plus)}></ha-icon>
                </button>`}
          </div>`;
        })}
      </div>`;
  }

  private _renderTabs(): TemplateResult {
    const tabs = this._visibleTabs();
    const total = tabs.length;
    const visibleCount = Math.min(this._tabVisibleCount, total);
    const overflow = visibleCount < total;
    const activeIdx = Math.max(
      0,
      tabs.findIndex((t) => t.id === this._tab),
    );
    // Keep the active tab visible: it displaces the last inline slot if it would spill.
    const visible: number[] = [];
    for (let i = 0; i < visibleCount; i++) visible.push(i);
    if (overflow && !visible.includes(activeIdx) && visible.length > 0) {
      visible[visible.length - 1] = activeIdx;
    }
    const visibleSet = new Set(visible);
    const overflowList: number[] = [];
    for (let i = 0; i < total; i++) if (!visibleSet.has(i)) overflowList.push(i);

    return html`
      <div class="tabbar" role="tablist">
        ${visible.map((i) => this._renderTabBtn(tabs[i]))}
        ${overflow
          ? html`<button
              id="music-tab-overflow-btn"
              type="button"
              class="tabbtn tab-overflow"
              popovertarget="music-tab-overflow-pop"
              title="More tabs"
              aria-label="More tabs"
            >
              <ha-icon icon="mdi:dots-horizontal"></ha-icon>
            </button>`
          : nothing}
        <div class="tabbar-measure" aria-hidden="true">
          ${tabs.map((t) => this._renderTabBtn(t))}
        </div>
      </div>
      ${overflow
        ? html`<div
            id="music-tab-overflow-pop"
            class="tab-overflow-pop"
            popover
            @toggle=${this._onTabOverflowToggle}
          >
            ${overflowList.map((i) => {
              const count = this._tabCount(tabs[i].id);
              return html`<button
                type="button"
                class="tab-overflow-item ${tabs[i].id === this._tab ? "active" : ""}"
                @click=${() => this._pickTabFromOverflow(tabs[i].id)}
              >
                <span>${tabs[i].label}</span>
                ${count !== undefined ? html`<span class="tabcount">${count}</span>` : nothing}
              </button>`;
            })}
          </div>`
        : nothing}
      <div class="tabbody">${this._renderTabBody()}</div>
    `;
  }

  private _renderTabBtn(t: { id: MusicTab; label: string }): TemplateResult {
    const count = this._tabCount(t.id);
    return html`<button
      type="button"
      role="tab"
      class="tabbtn ${this._tab === t.id ? "sel" : ""}"
      aria-selected=${this._tab === t.id}
      @click=${() => this._pickTab(t.id)}
    >
      ${t.label}${count !== undefined ? html`<span class="tabcount">${count}</span>` : nothing}
    </button>`;
  }

  /** Item count shown next to the Queue tab (undefined = no badge). */
  private _tabCount(id: MusicTab): number | undefined {
    if (!this._queue) return undefined;
    if (id === "queue") return Math.max(0, this._queue.length - this._queueCurrentIdx);
    return undefined;
  }

  private _renderTabBody(): TemplateResult {
    switch (this._tab) {
      case "media":
        return this._renderMedia();
      case "queue":
        return this._renderQueue(false);
      case "lyrics":
        return this._renderLyrics();
    }
  }

  private _loadingBody(): TemplateResult {
    return html`<div class="placeholder">
      <ha-icon icon=${ic(IC.loading)} class="spin"></ha-icon>
    </div>`;
  }

  private _emptyBody(icon: string, msg: string): TemplateResult {
    return html`<div class="placeholder">
      <ha-icon icon=${icon}></ha-icon><span>${msg}</span>
    </div>`;
  }

  private _renderMedia(): TemplateResult {
    const filter = this._mediaFilter;
    const items = this._mediaCache[filter];
    const layout = this._layout();
    let body: TemplateResult;
    if (!items) body = this._loadingBody();
    else if (!items.length)
      body = this._emptyBody(ic(IC.playlistRemove), this._mediaEmptyMsg(filter));
    else body = layout === "tiles" ? this._renderMediaTiles(items) : this._renderMediaList(items);
    return html`<div class="media-pane">
      ${this._renderRecentRow()}${this._renderMediaControls(layout)}
      <div class="media-body">${body}</div>
    </div>`;
  }

  private _mediaEmptyMsg(f: MediaFilter): string {
    switch (f) {
      case "album":
        return "No albums";
      case "artist":
        return "No artists";
      case "favorite":
        return "No favorite playlists";
      default:
        return "No playlists";
    }
  }

  private _renderMediaControls(layout: MusicMediaLayout): TemplateResult {
    return html`<div class="media-controls">
      <div class="seg" role="tablist">
        ${MEDIA_FILTERS.map(
          (f) => html`<button
            type="button"
            role="tab"
            class="seg-btn ${this._mediaFilter === f.id ? "sel" : ""}"
            aria-selected=${this._mediaFilter === f.id}
            @click=${() => {
              this._mediaFilter = f.id;
            }}
          >
            ${f.label}
          </button>`,
        )}
      </div>
      <button
        type="button"
        class="layout-toggle"
        title=${layout === "tiles" ? "List view" : "Tile view"}
        aria-label=${layout === "tiles" ? "List view" : "Tile view"}
        @click=${() => {
          this._mediaLayoutOverride = layout === "tiles" ? "list" : "tiles";
        }}
      >
        <ha-icon icon=${layout === "tiles" ? ic(IC.listView) : ic(IC.tiles)}></ha-icon>
      </button>
    </div>`;
  }

  private _renderRecentRow(): TemplateResult | typeof nothing {
    if (this._config?.mode === "mini") return nothing;
    const items = this._recentMedia;
    if (!items?.length) return nothing;
    return html`<div class="recent">
      <div class="recent-label">Recently played</div>
      <div class="recent-row">
        ${items.map((p) => this._renderTile(p, "rtile"))}
      </div>
    </div>`;
  }

  private _renderMediaTiles(items: MediaItem[]): TemplateResult {
    return html`<div class="tiles">${items.map((p) => this._renderTile(p, "tile"))}</div>`;
  }

  /** A single artwork tile (shared by the grid and the Recently-played row). */
  private _renderTile(p: MediaItem, cls: "tile" | "rtile"): TemplateResult {
    const starting = this._mediaStartingUri === p.uri;
    return html`<button
      type="button"
      class="${cls} ${starting ? "starting" : ""}"
      title=${p.name}
      @click=${() => this._playMedia(p.uri, p.mediaType)}
    >
      <div class="${cls}-art-wrap">
        ${p.image
          ? html`<img class="${cls}-art" src=${p.image} alt="" loading="lazy" />`
          : html`<div class="${cls}-art ph"><ha-icon icon=${ic(IC.playlist)}></ha-icon></div>`}
        ${starting
          ? html`<div class="tile-loading">
              <ha-icon class="spin" icon=${ic(IC.loading)}></ha-icon>
            </div>`
          : nothing}
      </div>
      <span class="${cls}-name">${p.name}</span>
    </button>`;
  }

  private _renderMediaList(items: MediaItem[]): TemplateResult {
    return html`<div class="list">
      ${items.map((p) => {
        const starting = this._mediaStartingUri === p.uri;
        return html`<button
          type="button"
          class="row"
          @click=${() => this._playMedia(p.uri, p.mediaType)}
        >
          ${p.image
            ? html`<img class="thumb" src=${p.image} alt="" />`
            : html`<div class="thumb ph"><ha-icon icon=${ic(IC.playlist)}></ha-icon></div>`}
          <span class="row-title one">${p.name}</span>
          ${starting
            ? html`<span class="row-loading">loading…</span>
                <ha-icon class="row-play spin" icon=${ic(IC.loading)}></ha-icon>`
            : html`<ha-icon class="row-play" icon=${ic(IC.playSmall)}></ha-icon>`}
        </button>`;
      })}
    </div>`;
  }

  private _renderQueue(recent: boolean): TemplateResult {
    if (!this._queue) return this._loadingBody();
    const idx = this._queueCurrentIdx;
    const items = recent ? this._queue.slice(0, idx).reverse() : this._queue.slice(idx);
    if (!items.length) {
      return this._emptyBody(
        ic(IC.musicNoteOff),
        recent ? "Nothing played yet" : "Queue is empty",
      );
    }
    return html`<div class="list">
      ${items.map((it, i) => {
        const isCurrent = !recent && i === 0;
        return html`<div
          class="qrow ${isCurrent ? "cur" : ""} ${this._dragId === it.id ? "dragging" : ""}"
          data-qid=${it.id}
        >
          <div class="qhit tap" @click=${(e: Event) => this._toggleQueueMenu(e, it.id)}>
            ${it.image
              ? html`<img class="thumb" src=${it.image} alt="" />`
              : html`<div class="thumb ph"><ha-icon icon=${ic(IC.music)}></ha-icon></div>`}
            <div class="qmain">
              <div class="qtitle">${it.title}</div>
              <div class="qsub">${it.artist}</div>
            </div>
          </div>
          ${isCurrent
            ? html`<span class="np-pill">NOW PLAYING</span>
                <span class="eq ${this._isPlaying() ? "" : "paused"}"><i></i><i></i><i></i></span>`
            : nothing}
          <div class="qmenu-wrap">
            ${!recent && !isCurrent
              ? html`<button
                  type="button"
                  class="drag-handle"
                  title="Drag to reorder"
                  aria-label="Drag to reorder"
                  @pointerdown=${(e: PointerEvent) => this._onDragStart(e, it.id)}
                >
                  <ha-icon icon=${ic(IC.drag)}></ha-icon>
                </button>`
              : nothing}
            ${this._queueMenuId === it.id ? this._renderQueueMenu(it, isCurrent) : nothing}
          </div>
        </div>`;
      })}
    </div>`;
  }

  private _renderQueueMenu(it: QueueItem, isCurrent: boolean): TemplateResult {
    return html`
      <div class="qmenu qmenu--pop" popover="auto" role="menu" @toggle=${this._onQueueMenuToggle}>
        <button type="button" class="qmi" @click=${() => this._queueFavorite(it, !it.favorite)}>
          <ha-icon icon=${ic(it.favorite ? IC.favoriteOn : IC.favorite)}></ha-icon>
          ${it.favorite ? "Remove from Favorites" : "Add to Favorites"}
        </button>
        ${isCurrent
          ? nothing
          : html`
              <button type="button" class="qmi" @click=${() => this._queueAct("play", it.id)}>
                <ha-icon icon=${ic(IC.playOutline)}></ha-icon>Play now
              </button>
              <button type="button" class="qmi" @click=${() => this._queueAct("next", it.id)}>
                <ha-icon icon=${ic(IC.nextOutline)}></ha-icon>Play next
              </button>
              <button type="button" class="qmi" @click=${() => this._queueAct("up", it.id)}>
                <ha-icon icon=${ic(IC.up)}></ha-icon>Move up
              </button>
              <button type="button" class="qmi" @click=${() => this._queueAct("down", it.id)}>
                <ha-icon icon=${ic(IC.down)}></ha-icon>Move down
              </button>
            `}
        <button type="button" class="qmi danger" @click=${() => this._queueAct("remove", it.id)}>
          <ha-icon icon=${ic(IC.del)}></ha-icon>Delete item
        </button>
      </div>
    `;
  }

  private _renderLyrics(): TemplateResult {
    if (this._lyrics === undefined) return this._loadingBody();
    if (this._lyrics === null) return this._emptyBody(ic(IC.lyricsOff), "No lyrics found");
    if (this._lyrics.length === 0) {
      return html`<div class="lyrics plain">
        ${(this._lyricsPlain ?? "").split(/\n/).map((l) => html`<div>${l || html`&nbsp;`}</div>`)}
      </div>`;
    }
    const e = this._elapsed() + 0.2;
    let active = -1;
    for (const [i, ln] of this._lyrics.entries()) {
      if (ln.t <= e) active = i;
      else break;
    }
    return html`<div class="lyrics">
      ${this._lyrics.map(
        (ln, i) => html`<div class="lrc ${i === active ? "on" : ""}">${ln.text || html`&nbsp;`}</div>`,
      )}
    </div>`;
  }

  private _renderMessage(res: MusicPlayerResolution): TemplateResult {
    const empty = res.state === "empty";
    const title = empty
      ? (this._config?.empty_title ?? "No music player")
      : (this._config?.unmatched_title ?? "No Music Assistant player");
    const message = empty
      ? (this._config?.empty_message ??
        "Choose this device's music player in Settings → Sounds.")
      : (this._config?.unmatched_message ??
        "This device's speaker isn't linked to a Music Assistant player.");
    const settingsPath = this._config?.settings_path ?? "[root]/settings?tab=sounds&scope=device";
    return html`
      <div class="message">
        <ha-icon icon=${ic(IC.musicOff)}></ha-icon>
        <div class="message-title">${title}</div>
        <div class="message-text">${message}</div>
        <button type="button" class="message-btn" @click=${() => this._navigate(settingsPath)}>
          Settings
        </button>
      </div>
    `;
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
        height: 100%;
        overflow: visible;
        padding: 0;
        color: var(--ted-style-text);
        container-type: inline-size;
      }

      /* Clips only the (scaled/blurred) background layers to the card's rounded
         edge, while letting content (notably popups) overflow the card. Uses the
         card-radius var directly instead of inherit, which would resolve to the
         ha-card slot's 0 radius for this slotted child. */
      .bg-clip {
        position: absolute;
        inset: 0;
        overflow: hidden;
        border-radius: var(--ha-card-border-radius, 12px);
        z-index: 0;
      }

      /* Background layers */
      .bg {
        position: absolute;
        inset: 0;
        z-index: 0;
      }
      .bg-blur {
        background-size: cover;
        background-position: center;
        filter: blur(42px) saturate(1.4);
        transform: scale(1.3);
      }
      /* Dark-mode readability scrim over the blurred art (below the frost). */
      .bg-scrim {
        position: absolute;
        inset: 0;
        z-index: 0;
        background: rgba(0, 0, 0, 0.38);
      }
      /* Card-wide frosted glass, tinted with the album's average color (set inline),
         over the blurred art so content stands out. */
      .frost {
        position: absolute;
        inset: 0;
        z-index: 0;
        -webkit-backdrop-filter: blur(12px) saturate(1.1);
        backdrop-filter: blur(12px) saturate(1.1);
      }

      /* Layout */
      .content {
        position: relative;
        z-index: 1;
        display: flex;
        gap: 20px;
        height: 100%;
        padding: 18px 20px;
        box-sizing: border-box;
        color: var(--music-fg, var(--ted-style-text));
      }
      /* Lift text/glyphs off the (possibly light) background — same approach as the
         Clock-Weather card: a drop shadow whose opacity scales with the text
         lightness (relative-color syntax), so it fades out for dark text. */
      .title,
      .sub-text,
      .times,
      .tabbtn,
      .qtitle,
      .qsub,
      .row-title,
      .row-sub,
      .lrc,
      .vol-num,
      .cast-name,
      .placeholder,
      .mini-title,
      .mini-artist,
      .content ha-icon,
      .thumb {
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.28));
        filter: drop-shadow(0 1px 2px hsl(from currentColor 0 0% 0% / max(0, (l - 50) * 0.004)));
      }
      /* Badges: shadow the PILL itself, not the text/icon inside it. Popover menus
         and flyouts have their own solid surfaces, so keep their content crisp. */
      .np-pill,
      .qmenu,
      .qmenu *,
      .cast-flyout,
      .cast-flyout *,
      .vol-flyout,
      .vol-flyout * {
        filter: none;
      }
      .np-pill,
      .row-loading {
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      }
      .content.idle .tabs {
        flex: 1 1 0;
      }
      .player {
        flex: 1 1 0;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
      }
      .tabs {
        flex: 1 1 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      /* Album art */
      .art-wrap {
        width: 100%;
        flex: 1 1 0;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .art {
        max-width: 100%;
        max-height: 100%;
        width: auto;
        height: auto;
        object-fit: contain;
        border-radius: var(--ha-card-border-radius, 12px);
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.4);
      }
      .art-empty {
        width: 40%;
        aspect-ratio: 1 / 1;
        max-height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(127, 127, 127, 0.25);
        color: var(--music-fg, #fff);
      }

      /* Compact: album art becomes a square to the LEFT of the title/artist. */
      .player.compact {
        justify-content: center;
      }
      .player.compact .header {
        display: flex;
        align-items: center;
        gap: 14px;
        width: 100%;
        min-height: 0;
      }
      .player.compact .header .art-wrap {
        flex: 0 0 auto;
        width: var(--art-sq, 72px);
        height: var(--art-sq, 72px);
      }
      .player.compact .header .art {
        height: 100%;
        width: 100%;
        max-width: none;
        max-height: none;
        object-fit: cover;
      }
      .player.compact .header .details {
        flex: 1 1 auto;
        min-width: 0;
      }
      .art-empty ha-icon {
        --mdc-icon-size: 44px;
      }

      /* Details */
      .details {
        width: 100%;
        text-align: left;
      }
      .title-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .title {
        font-size: 1.5em;
        font-weight: 700;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 0 1 auto;
        min-width: 0;
      }
      .fav {
        flex: 0 0 auto;
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        display: inline-flex;
        padding: 2px;
        opacity: 0.9;
      }
      .fav:hover {
        opacity: 1;
      }
      .fav[disabled] {
        opacity: 0.4;
        cursor: default;
      }
      .fav.on {
        color: #ff5c7a;
        opacity: 1;
      }
      .fav ha-icon {
        --mdc-icon-size: 20px;
      }
      .title-row .vol-wrap {
        margin-left: auto;
      }
      .title-row .vol-wrap .ctrl {
        padding-right: 2px;
      }
      .title-row .vol-wrap .ctrl ha-icon {
        --mdc-icon-size: 22px;
      }
      .sub {
        margin-top: 2px;
        font-size: 1.05em;
        opacity: 0.92;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .sub-text {
        flex: 1 1 auto;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .album {
        opacity: 0.62;
      }

      /* Progress */
      .progress {
        width: 100%;
      }
      .times {
        display: flex;
        justify-content: space-between;
        font-size: 0.78em;
        opacity: 0.8;
        margin-top: 2px;
      }

      /* Controls */
      .controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 4px;
        width: 100%;
        margin-top: -10px;
      }
      .ctrl {
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        padding: 6px;
        border-radius: 50%;
        display: inline-flex;
        opacity: 0.9;
        transition: opacity 0.12s ease, color 0.12s ease;
      }
      .ctrl:hover {
        opacity: 1;
      }
      .ctrl[disabled] {
        opacity: 0.4;
        cursor: default;
      }
      .ctrl.active {
        color: var(--ted-style-accent);
        opacity: 1;
      }
      .ctrl ha-icon {
        --mdc-icon-size: 26px;
      }
      .ctrl.primary ha-icon {
        --mdc-icon-size: 52px;
      }

      /* Volume */
      .volume {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
      }
      .volume ha-icon {
        --mdc-icon-size: 20px;
        opacity: 0.85;
      }
      .vol-num {
        font-size: 0.8em;
        opacity: 0.8;
        min-width: 1.6em;
        text-align: right;
      }

      /* Volume: icon that expands a slider inline on hover (or tap). */
      .vol-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
      }
      .vol-slide {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        max-width: 0;
        opacity: 0;
        margin-right: 0;
        overflow: hidden;
        transition:
          max-width 0.2s ease,
          opacity 0.2s ease,
          margin-right 0.2s ease;
      }
      .vol-wrap:hover .vol-slide,
      .vol-wrap.open .vol-slide {
        max-width: 170px;
        opacity: 1;
        margin-right: 8px;
      }
      .vol-slide .vol {
        width: 110px;
      }

      /* Range inputs */
      input[type="range"] {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 4px;
        border-radius: 999px;
        background: rgba(127, 127, 127, 0.4);
        cursor: pointer;
      }
      /* Seek track: a 1px accent "played" line, centered in the grey bar, filling from
         the left to the current position (--seek-fill set inline per render). Qualified
         as input.seek to out-specify the base input[type=range] background. */
      input.seek {
        background:
          linear-gradient(var(--ted-style-accent), var(--ted-style-accent)) left center /
            var(--seek-fill, 0%) 1px no-repeat,
          rgba(127, 127, 127, 0.4);
      }
      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 13px;
        height: 13px;
        border-radius: 50%;
        background: currentColor;
        border: none;
      }
      input[type="range"]::-moz-range-thumb {
        width: 13px;
        height: 13px;
        border: none;
        border-radius: 50%;
        background: currentColor;
      }
      /* Progress/seek thumb: accent-filled with a thin black outline. Qualified as
         input.seek to out-specify the base input[type=range] thumb rules. */
      input.seek::-webkit-slider-thumb {
        background: var(--ted-style-accent);
        border: 1px solid #000;
        box-sizing: border-box;
      }
      input.seek::-moz-range-thumb {
        background: var(--ted-style-accent);
        border: 1px solid #000;
        box-sizing: border-box;
      }

      /* Cast chip */
      .cast-wrap {
        position: relative;
        flex: 0 0 auto;
        display: inline-flex;
        max-width: 100%;
      }
      .cast-wrap.open {
        z-index: 20;
      }
      .cast {
        display: inline-flex;
        align-items: center;
        padding: 4px 2px;
        border: none;
        cursor: pointer;
        color: inherit;
        background: none;
        font-size: 0.85em;
        max-width: 100%;
      }
      .cast.locked {
        cursor: default;
      }
      .cast-name {
        max-width: 0;
        opacity: 0;
        margin-left: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        transition:
          max-width 0.2s ease,
          opacity 0.2s ease,
          margin-left 0.2s ease;
      }
      .cast:hover .cast-name,
      .cast-wrap.open .cast-name {
        max-width: 160px;
        opacity: 1;
        margin-left: 6px;
      }
      .cast ha-icon {
        --mdc-icon-size: 18px;
      }
      .cast-backdrop {
        position: fixed;
        inset: 0;
        z-index: 8;
      }
      .cast-flyout {
        position: absolute;
        right: 0;
        z-index: 9;
        min-width: 220px;
        max-width: 300px;
        max-height: 260px;
        overflow: auto;
        padding: 6px;
        border-radius: 12px;
        /* Opaque surface: composite the (possibly translucent) theme surface over an
           opaque card base so the player controls never show through the popup. */
        background-color: var(--card-background-color, #1c1c1c);
        background-image: linear-gradient(
          var(--ted-style-surface, #2b2b2b),
          var(--ted-style-surface, #2b2b2b)
        );
        color: var(--ted-style-text, #fff);
        border: 1px solid var(--ted-style-divider, rgba(255, 255, 255, 0.12));
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
      }
      .cast-flyout.up {
        bottom: calc(100% + 8px);
        top: auto;
      }
      .cast-flyout.down {
        top: calc(100% + 8px);
        bottom: auto;
      }
      .cast-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 8px;
      }
      .cast-row.cur {
        background: rgba(127, 127, 127, 0.16);
      }
      .cast-note {
        padding: 10px 12px;
        font-size: 0.88em;
        opacity: 0.8;
        line-height: 1.4;
      }
      .cast-header {
        padding: 8px 10px 6px;
        font-size: 0.78em;
        font-weight: 700;
        opacity: 0.7;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .cast-row ha-icon {
        --mdc-icon-size: 20px;
        opacity: 0.85;
      }
      .cast-name {
        flex: 1 1 auto;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 0.9em;
      }
      .cast-tag {
        font-size: 0.72em;
        font-weight: 600;
        opacity: 0.7;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .cast-toggle {
        border: none;
        cursor: pointer;
        display: inline-flex;
        padding: 4px;
        border-radius: 50%;
        background: rgba(127, 127, 127, 0.28);
        color: inherit;
      }
      .cast-toggle.on {
        background: var(--ted-style-accent);
        color: var(--ted-style-on-accent);
      }
      .cast-toggle ha-icon {
        --mdc-icon-size: 18px;
      }

      /* Tabs */
      .tabbar {
        position: relative;
        display: flex;
        flex-wrap: nowrap;
        min-width: 0;
        gap: 6px;
        border-bottom: 1px solid rgba(127, 127, 127, 0.25);
        padding-bottom: 8px;
      }
      .tabbar-measure {
        position: absolute;
        top: 0;
        left: 0;
        display: flex;
        gap: 6px;
        visibility: hidden;
        pointer-events: none;
        white-space: nowrap;
      }
      .tabbtn {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        padding: 6px 10px;
        font-size: 0.9em;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.6;
        border-radius: var(--ted-style-radius-sm);
      }
      .tabbtn.tab-overflow {
        padding: 6px 8px;
        opacity: 0.7;
      }
      .tabbtn.tab-overflow ha-icon {
        --mdc-icon-size: 20px;
      }
      .tabbtn.sel {
        opacity: 1;
        font-weight: 700;
        color: var(--ted-style-accent);
      }
      .tabcount {
        font-size: 0.8em;
        font-weight: 700;
        min-width: 1.25em;
        padding: 1px 7px;
        text-align: center;
        line-height: 1.4;
        border-radius: 999px;
        background: rgba(127, 127, 127, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.14);
      }
      .tabbtn.sel .tabcount {
        opacity: 1;
      }
      .tab-overflow-pop {
        margin: 0;
        border: 1px solid var(--ted-style-divider, rgba(255, 255, 255, 0.12));
        border-radius: 10px;
        padding: 4px;
        background-color: var(--card-background-color, #1c1c1c);
        background-image: linear-gradient(
          var(--ted-style-surface, #2b2b2b),
          var(--ted-style-surface, #2b2b2b)
        );
        color: var(--ted-style-text, #fff);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
        min-width: 160px;
      }
      .tab-overflow-item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        padding: 8px 10px;
        border-radius: 6px;
        font-size: 0.85em;
        text-align: left;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .tab-overflow-item:hover {
        background: rgba(127, 127, 127, 0.16);
      }
      .tab-overflow-item.active {
        color: var(--ted-style-accent);
        font-weight: 700;
      }
      .tab-overflow-item .tabcount {
        margin-left: auto;
      }
      .tabbody {
        flex: 1 1 0;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
      }
      .placeholder {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        opacity: 0.5;
      }
      .placeholder ha-icon {
        --mdc-icon-size: 40px;
      }
      .spin {
        animation: ted-spin 1s linear infinite;
      }
      @keyframes ted-spin {
        to {
          transform: rotate(360deg);
        }
      }

      /* Tab lists (Media / Queue / Recent) */
      .list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 4px 0;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        text-align: left;
        padding: 6px 6px;
        border-radius: 8px;
      }
      .row:hover {
        background: rgba(127, 127, 127, 0.14);
      }
      .row.cur {
        background: rgba(127, 127, 127, 0.16);
      }
      .thumb {
        width: 44px;
        height: 44px;
        border-radius: 6px;
        object-fit: cover;
        flex: 0 0 auto;
        background: rgba(127, 127, 127, 0.25);
      }
      .thumb.ph {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .thumb.ph ha-icon {
        --mdc-icon-size: 22px;
        opacity: 0.7;
      }
      .row-main {
        flex: 1 1 auto;
        min-width: 0;
        cursor: pointer;
      }
      .row-title {
        font-weight: 600;
      }
      .row-title.one,
      .row-sub.one {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .row-title.one {
        flex: 1 1 auto;
        min-width: 0;
      }
      .row-sub {
        font-size: 0.82em;
        opacity: 0.7;
      }
      .row-play {
        --mdc-icon-size: 20px;
        opacity: 0.7;
        flex: 0 0 auto;
      }
      .row-loading {
        flex: 0 0 auto;
        font-size: 0.62em;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 3px 8px;
        border-radius: 999px;
        background: var(--ted-style-accent);
        color: var(--ted-style-on-accent);
        white-space: nowrap;
      }

      /* Media tab: filter bar + layout toggle */
      .media-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 2px 8px;
      }
      .seg {
        display: flex;
        gap: 4px;
        flex: 1 1 auto;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .seg::-webkit-scrollbar {
        display: none;
      }
      .seg-btn {
        border: none;
        background: rgba(127, 127, 127, 0.14);
        color: inherit;
        cursor: pointer;
        padding: 5px 10px;
        border-radius: 999px;
        font-size: 0.8em;
        font-weight: 600;
        white-space: nowrap;
      }
      .seg-btn.sel {
        background: var(--ted-style-accent);
        color: var(--ted-style-on-accent);
      }
      .layout-toggle {
        flex: 0 0 auto;
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        opacity: 0.7;
        padding: 4px;
        border-radius: 8px;
        display: flex;
      }
      .layout-toggle:hover {
        background: rgba(127, 127, 127, 0.14);
        opacity: 1;
      }

      /* Media tab: recently-played strip */
      .recent {
        padding: 2px 2px 0;
      }
      .recent-label {
        font-size: 0.72em;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        opacity: 0.6;
        padding: 4px 2px;
      }
      .recent-row {
        display: flex;
        gap: 10px;
        overflow-x: auto;
        padding-bottom: 6px;
      }
      .rtile {
        flex: 0 0 auto;
        width: 96px;
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .rtile-art-wrap {
        position: relative;
        width: 96px;
        height: 96px;
      }
      .rtile-art {
        width: 96px;
        height: 96px;
        border-radius: 10px;
        object-fit: cover;
        background: rgba(127, 127, 127, 0.25);
      }
      .rtile-name {
        width: 96px;
        font-size: 0.78em;
        font-weight: 600;
        line-height: 1.2;
        text-align: center;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      /* Media tab: artwork tile grid */
      .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
        gap: 12px 10px;
        padding: 8px 4px 4px;
      }
      .tile {
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .tile-art-wrap {
        position: relative;
        width: 100%;
      }
      .tile-art {
        width: 100%;
        aspect-ratio: 1 / 1;
        border-radius: 10px;
        object-fit: cover;
        background: rgba(127, 127, 127, 0.25);
        transition: transform 0.12s ease;
      }
      .tile:hover .tile-art {
        transform: scale(1.03);
      }
      .tile-name {
        font-size: 0.82em;
        font-weight: 600;
        line-height: 1.2;
        text-align: center;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .tile-art.ph,
      .rtile-art.ph {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .tile-art.ph ha-icon,
      .rtile-art.ph ha-icon {
        --mdc-icon-size: 34px;
        opacity: 0.7;
      }
      .tile-loading {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.35);
        color: #fff;
      }
      .np {
        flex: 0 0 auto;
        font-size: 0.68em;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--ted-style-accent);
      }

      /* Queue / Recent rows */
      .qrow {
        position: relative;
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        padding: 6px;
        border-radius: 8px;
      }
      .qrow:hover {
        background: rgba(127, 127, 127, 0.12);
      }
      .qrow.cur {
        background: rgba(255, 255, 255, 0.12);
        border: 1px solid rgba(255, 255, 255, 0.14);
        -webkit-backdrop-filter: blur(8px) saturate(1.3);
        backdrop-filter: blur(8px) saturate(1.3);
      }
      .qrow.dragging {
        opacity: 0.55;
        background: rgba(127, 127, 127, 0.2);
      }
      .qhit {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1 1 auto;
        min-width: 0;
      }
      .qhit.tap {
        cursor: pointer;
      }
      .qmain {
        flex: 1 1 auto;
        min-width: 0;
      }
      .qtitle {
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .qrow.cur .qtitle {
        color: var(--ted-style-accent);
      }
      .qsub {
        font-size: 0.82em;
        opacity: 0.7;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .np-pill {
        flex: 0 0 auto;
        font-size: 0.62em;
        font-weight: 700;
        letter-spacing: 0.04em;
        padding: 3px 8px;
        border-radius: 999px;
        background: var(--ted-style-accent);
        color: var(--ted-style-on-accent);
      }
      .eq {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: flex-end;
        gap: 2px;
        height: 16px;
      }
      .eq i {
        width: 3px;
        height: 5px;
        border-radius: 1px;
        background: var(--ted-style-accent);
        animation: ted-eq 1.3s ease-in-out infinite;
      }
      .eq i:nth-child(2) {
        animation-delay: 0.3s;
      }
      .eq i:nth-child(3) {
        animation-delay: 0.15s;
      }
      .eq.paused i {
        animation-play-state: paused;
      }
      @keyframes ted-eq {
        0%,
        100% {
          height: 4px;
        }
        50% {
          height: 15px;
        }
      }
      .qmenu-wrap {
        position: relative;
        flex: 0 0 auto;
      }
      .qmenu {
        position: absolute;
        right: 0;
        z-index: 9;
        min-width: 180px;
        padding: 4px;
        border-radius: 10px;
        /* Opaque surface: composite the (possibly translucent) theme surface over an
           opaque card base so queue rows never show through the menu. */
        background-color: var(--card-background-color, #1c1c1c);
        background-image: linear-gradient(
          var(--ted-style-surface, #2b2b2b),
          var(--ted-style-surface, #2b2b2b)
        );
        color: var(--ted-style-text, #fff);
        border: 1px solid var(--ted-style-divider, rgba(255, 255, 255, 0.12));
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
      }
      .qmenu.down {
        top: calc(100% + 4px);
        bottom: auto;
      }
      .qmenu.up {
        bottom: calc(100% + 4px);
        top: auto;
      }
      /* The queue item menu is a top-layer popover (escapes .tabbody scroll clipping);
         positionOverflowPopover sets its fixed position inline, so clear base offsets. */
      .qmenu--pop {
        right: auto;
        top: auto;
        bottom: auto;
        margin: 0;
      }
      .shuffle-wrap {
        position: relative;
        display: inline-flex;
      }
      /* Reshuffle popup reuses .qmenu (opaque surface + up/down flip) but anchors
         to the left of the shuffle button so it opens rightward into the card. */
      .shuffle-menu {
        left: 0;
        right: auto;
        min-width: 160px;
      }
      .qmi {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        padding: 8px 10px;
        border-radius: 6px;
        font-size: 0.9em;
        text-align: left;
      }
      .qmi:hover {
        background: rgba(127, 127, 127, 0.16);
      }
      .qmi.danger {
        color: var(--ted-style-danger);
      }
      .qmi ha-icon {
        --mdc-icon-size: 18px;
        opacity: 0.85;
      }
      .drag-handle {
        flex: 0 0 auto;
        border: none;
        background: none;
        color: inherit;
        cursor: grab;
        opacity: 0.55;
        display: inline-flex;
        touch-action: none;
      }
      .drag-handle:hover {
        opacity: 1;
      }
      .drag-handle:active {
        cursor: grabbing;
      }
      .drag-handle ha-icon {
        --mdc-icon-size: 20px;
      }

      /* Lyrics */
      .lyrics {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px 6px 40px;
        text-align: center;
      }
      .lrc {
        opacity: 0.4;
        font-size: 1.05em;
        font-weight: 600;
        transition: opacity 0.2s ease, color 0.2s ease;
      }
      .lrc.on {
        opacity: 1;
        color: var(--ted-style-accent);
      }
      .lyrics.plain {
        text-align: left;
        gap: 2px;
        opacity: 0.85;
      }

      /* Empty / unmatched message */
      .message {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 24px;
        text-align: center;
        color: var(--ted-style-text);
      }
      .message ha-icon {
        --mdc-icon-size: 40px;
        opacity: 0.7;
      }
      .message-title {
        font-weight: 700;
        font-size: 1.1em;
      }
      .message-text {
        opacity: 0.75;
        max-width: 32ch;
      }
      .message-btn {
        margin-top: 8px;
        border: none;
        cursor: pointer;
        padding: 8px 18px;
        border-radius: var(--ted-style-pill);
        background: var(--ted-style-accent);
        color: var(--ted-style-on-accent);
        font-weight: 600;
      }

      /* Narrow: stack player over tabs */
      @container (max-width: 560px) {
        .content {
          flex-direction: column;
        }
        .player {
          flex: 0 0 auto;
        }
      }

      /* Mini player (mode: mini) */
      .one {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .mini-content {
        display: block;
        padding: 10px 16px;
      }
      .mini {
        position: relative;
        display: flex;
        align-items: center;
        gap: 14px;
        height: 100%;
        cursor: pointer;
      }
      .mini-art-wrap {
        flex: 0 0 auto;
        align-self: stretch;
        display: flex;
        align-items: center;
      }
      /* Thumbnail auto-sizes to the bar height (album art fills; capped so an
         "auto height" card can't balloon to the art's intrinsic size, and the
         idle placeholder can't collapse to zero). */
      .mini-art {
        width: auto;
        height: 100%;
        aspect-ratio: 1 / 1;
        min-height: 44px;
        max-height: 104px;
        border-radius: var(--ha-card-border-radius, 12px);
        object-fit: cover;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
      }
      .mini-art.ph {
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(127, 127, 127, 0.25);
      }
      .mini-art.ph ha-icon {
        --mdc-icon-size: 24px;
      }
      .mini-meta-wrap {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .mini-meta {
        flex: 1 1 0;
        min-width: 0;
      }
      .mini-title {
        font-weight: 700;
      }
      .mini-artist {
        font-size: 0.85em;
        opacity: 0.72;
      }
      .mini-body {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .mini-actions {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .mini-controls,
      .mini-right {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .mini-controls {
        cursor: default;
      }
      /* Transport groups collapse individually via the container queries below. */
      .mini-tp {
        display: contents;
      }
      .mini-controls .ctrl ha-icon {
        --mdc-icon-size: 22px;
      }
      .mini-controls .ctrl.primary ha-icon {
        --mdc-icon-size: 40px;
      }
      /* Tall card: drop the controls to a row beneath the title/artist. */
      .mini.stacked .mini-body {
        flex-direction: column;
        align-items: stretch;
        justify-content: center;
        gap: 6px;
      }
      .mini.stacked .mini-meta-wrap {
        flex: 0 0 auto;
      }
      /* Controls get their own centered row; the equalizer sits in the meta row. */
      .mini.stacked .mini-actions {
        justify-content: center;
      }
      /* Menu transport items stay hidden until their inline counterpart collapses.
         Compound selectors so they beat the later .mini-menu-item display rule. */
      .mini-menu-item.menu-tp {
        display: none;
      }
      .mini-menu-sep.tp-sep {
        display: none;
      }
      /* Medium width: shuffle/prev/next/repeat move from inline into the menu. */
      @container (max-width: 460px) {
        .mini-tp-extra {
          display: none;
        }
        .mini-menu-item.menu-tp-extra {
          display: flex;
        }
        .mini-menu-sep.tp-sep {
          display: block;
        }
      }
      /* Narrow width: Play/Pause moves into the menu too (only "…" stays inline). */
      @container (max-width: 300px) {
        .mini-tp-play {
          display: none;
        }
        .mini-menu-item.menu-tp-play {
          display: flex;
        }
      }
      .mini-seek {
        margin-top: 8px;
        height: 3px;
      }
      /* Playback progress: a thin, non-interactive strip along the card's bottom edge
         (2px on short cards, a touch taller once the controls get their own row).
         The clip layer matches the card's rounded corners so the bar can't poke past
         them on themes with a large border radius. */
      .mini-progress-clip {
        position: absolute;
        inset: 0;
        z-index: 2;
        pointer-events: none;
        border-radius: var(--ha-card-border-radius, 12px);
        overflow: hidden;
      }
      .mini-progress {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 2px;
        background: rgba(127, 127, 127, 0.35);
      }
      .mini-progress.tall {
        height: 3px;
      }
      .mini-progress-fill {
        height: 100%;
        background: var(--ted-style-accent);
      }

      /* Mini action menu + anchored volume flyout (fly above/below the bar). */
      .mini-menu,
      .mini-vol-flyout {
        position: absolute;
        right: 0;
        z-index: 12;
        padding: 4px;
        border-radius: 10px;
        /* Opaque composite surface (theme surface over an opaque card base). */
        background-color: var(--card-background-color, #1c1c1c);
        background-image: linear-gradient(
          var(--ted-style-surface, #2b2b2b),
          var(--ted-style-surface, #2b2b2b)
        );
        color: var(--ted-style-text, #fff);
        border: 1px solid var(--ted-style-divider, rgba(255, 255, 255, 0.12));
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
      }
      .mini-menu.down,
      .mini-vol-flyout.down {
        top: calc(100% + 6px);
        bottom: auto;
      }
      .mini-menu.up,
      .mini-vol-flyout.up {
        bottom: calc(100% + 6px);
        top: auto;
      }
      .mini-menu {
        min-width: 168px;
      }
      .mini-menu-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        padding: 8px 10px;
        border-radius: 6px;
        font-size: 0.9em;
        text-align: left;
      }
      .mini-menu-item:hover {
        background: rgba(127, 127, 127, 0.16);
      }
      .mini-menu-item.active {
        color: var(--ted-style-accent);
      }
      .mini-menu-item ha-icon {
        --mdc-icon-size: 20px;
        opacity: 0.85;
      }
      .mini-menu-item.active ha-icon {
        opacity: 1;
      }
      .mini-menu-sep {
        height: 1px;
        margin: 4px 6px;
        background: rgba(127, 127, 127, 0.3);
      }
      .mini-vol-flyout {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 12px 10px;
        height: 200px;
        box-sizing: border-box;
        width: auto;
      }
      .mini-vol-mute {
        flex: 0 0 auto;
        display: inline-flex;
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        opacity: 0.9;
      }
      .mini-vol-mute.active {
        color: var(--ted-style-accent);
        opacity: 1;
      }
      .mini-vol-mute ha-icon {
        --mdc-icon-size: 22px;
      }
      /* Native vertical slider that fills the popup height between the level + speaker.
         writing-mode covers modern Chromium; -webkit-appearance the older webviews. */
      .mini-vol-range-wrap {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        align-items: stretch;
        justify-content: center;
      }
      .mini-vol-range {
        writing-mode: vertical-lr;
        direction: rtl;
        -webkit-appearance: slider-vertical;
        width: 8px;
        height: 100%;
        margin: 0;
        cursor: pointer;
        accent-color: var(--ted-style-accent);
      }
      .mini-vol-num {
        flex: 0 0 auto;
        min-width: 2.4ch;
        text-align: center;
        font-size: 0.82em;
        opacity: 0.75;
        font-variant-numeric: tabular-nums;
      }

      /* Mini modal window (native <dialog>, top layer) reusing the Media/Queue tabs */
      .mini-modal {
        border: none;
        padding: 0;
        margin: auto;
        background: transparent;
        max-width: none;
        max-height: none;
        color: var(--ted-style-text, #fff);
      }
      .mini-modal::backdrop {
        background: rgba(0, 0, 0, 0.5);
      }
      .mini-sheet {
        display: flex;
        flex-direction: column;
        width: min(560px, 92vw);
        max-height: 80vh;
        border-radius: 14px;
        overflow: hidden;
        background-color: var(--card-background-color, #1c1c1c);
        background-image: linear-gradient(
          var(--ted-style-surface, #2b2b2b),
          var(--ted-style-surface, #2b2b2b)
        );
        border: 1px solid var(--ted-style-divider, rgba(255, 255, 255, 0.12));
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
      }
      .mini-sheet-head {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 8px 12px 16px;
        border-bottom: 1px solid var(--ted-style-divider, rgba(255, 255, 255, 0.12));
      }
      .mini-sheet-title {
        flex: 1 1 auto;
        font-weight: 700;
        font-size: 1.05em;
      }
      .mini-sheet-close {
        flex: 0 0 auto;
        display: inline-flex;
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        opacity: 0.8;
        border-radius: 8px;
        padding: 4px;
      }
      .mini-sheet-close:hover {
        opacity: 1;
        background: rgba(127, 127, 127, 0.16);
      }
      .mini-sheet-close ha-icon {
        --mdc-icon-size: 22px;
      }
      .mini-sheet-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 6px;
      }

      @container (max-width: 620px) {
        .mini-meta {
          flex: 1 1 60px;
        }
      }
    `,
  ];
}

/** Minimal shape of a hass state entry this card reads. */
interface HassEntityLike {
  state: string;
  attributes?: Record<string, unknown>;
}

/** A library media item (Media tab). */
interface MediaItem {
  name: string;
  uri: string;
  image?: string;
  mediaType?: string;
}

/** A queue entry (Queue / Recent tabs). */
interface QueueItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  image?: string;
  uri?: string;
  duration?: number;
  favorite?: boolean;
}

/** A single synced lyric line. */
interface LyricLine {
  t: number;
  text: string;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-music-card": TedMusicCard;
  }
}

import { registerCustomCard } from "../../shared/register-card";
import { MUSIC_CARD_DESCRIPTION, MUSIC_CARD_NAME } from "./const";

registerCustomCard({
  type: MUSIC_CARD_TYPE,
  name: MUSIC_CARD_NAME,
  description: MUSIC_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/Teds-Cards#music-card",
});
