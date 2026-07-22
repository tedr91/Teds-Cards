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
import { brushedOverlay, tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { MUSIC_CARD_EDITOR_TYPE, MUSIC_CARD_TYPE } from "./const";
import type { MusicBackgroundMode, MusicCardConfig, MusicTab } from "./types";

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
  { id: "recent", label: "Recent" },
  { id: "lyrics", label: "Lyrics" },
];

/** mm:ss for a number of seconds. */
function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

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

  /** The currently selected right-side tab, and whether the user has picked one. */
  @state() private _tab: MusicTab = "media";
  private _tabTouched = false;

  /** Average album-art colour "r, g, b" + a legible foreground for the gradient/blur bg. */
  @state() private _avgColor?: string;
  @state() private _avgFg?: string;
  private _artColorUrl?: string;

  /** Ticks the progress bar while playing (bumped by a 1s interval). */
  @state() private _tick = 0;
  private _progressTimer?: number;

  /** For apply_music_volume: the resolved player's last observed entity/state. */
  private _lastPlayEntity?: string;
  private _lastPlayState?: string;

  /** Cast/grouping flyout open state. */
  @state() private _castOpen = false;

  /** Music Assistant config entry id (for get_library), lazily resolved. */
  private _maConfigEntryId?: string;
  /** Media tab (playlists). */
  @state() private _playlists?: MediaItem[];
  private _mediaLoading = false;
  /** Queue/Recent tab data + the currently-playing index within it. */
  @state() private _queue?: QueueItem[];
  private _queueCurrentIdx = 0;
  private _queueKey?: string;
  private _queueLoading = false;
  /** Lyrics: undefined = loading, null = none, [] = plain-only, [lines] = synced. */
  @state() private _lyrics?: LyricLine[] | null;
  private _lyricsPlain?: string;
  private _lyricsKey?: string;
  private _lyricsLoading = false;

  public constructor() {
    super();
    // Keep this device's settings live so `player_source: settings` stays in sync.
    new SettingsController(this, () => this.hass);
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._progressTimer ??= window.setInterval(() => {
      const s = this._stateObj();
      if (s?.state === "playing") this._tick++;
    }, 1000);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._progressTimer !== undefined) {
      clearInterval(this._progressTimer);
      this._progressTimer = undefined;
    }
  }

  public setConfig(config: MusicCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    if (config.player_source === "config" && !config.entity) {
      throw new Error("Set an entity when player_source is 'config'");
    }
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
      return { columns: 12, rows: 1, min_columns: 6, min_rows: 1 };
    }
    return { columns: 12, rows: 6, min_columns: 6, min_rows: 4 };
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("hass")) {
      this._maybeApplyStartVolume();
      this._updateAvgColor(this._artUrl());
      if (this.hass) void warmMassProviders(this.hass).then((c) => c && this.requestUpdate());
    }
    this._orchestrateTabData();
    this._scrollActiveLyric();
  }

  // --- Entity resolution -----------------------------------------------------

  private _resolve(): MusicPlayerResolution {
    return resolveMusicPlayer(this.hass, {
      entity: this._config?.entity,
      useSettings: this._config?.player_source !== "config",
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

  // --- Average colour extraction --------------------------------------------

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
        this._avgColor = `${r}, ${g}, ${b}`;
        // Relative luminance → pick a legible foreground for the gradient/blur bg.
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        this._avgFg = lum > 0.6 ? "#141414" : "#ffffff";
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
  };

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
    return Object.keys(reg).find(
      (id) =>
        id.startsWith("button.") &&
        reg[id]?.platform === "music_assistant" &&
        reg[id]?.device_id === dev,
    );
  }

  private _onFavorite = (): void => {
    const btn = this._favoriteButtonId();
    if (btn && this.hass) void this.hass.callService("button", "press", { entity_id: btn });
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

  private _toggleCast = (): void => {
    if (!this._locked()) this._castOpen = !this._castOpen;
  };

  private _closeCast = (): void => {
    this._castOpen = false;
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

  private _orchestrateTabData(): void {
    if (!this.hass || this._config?.mode === "mini") return;
    if (this._tab === "media") void this._ensureMedia();
    else if (this._tab === "queue" || this._tab === "recent") void this._ensureQueue();
    else if (this._tab === "lyrics") void this._ensureLyrics();
  }

  private async _ensureMedia(): Promise<void> {
    if (this._playlists || this._mediaLoading) return;
    this._mediaLoading = true;
    try {
      const cfg = await this._ensureConfigEntry();
      if (!cfg) {
        this._playlists = [];
        return;
      }
      const resp = await this._callWithResponse("music_assistant", "get_library", {
        config_entry_id: cfg,
        media_type: "playlist",
        limit: 100,
        order_by: "last_played_desc",
      });
      this._playlists = this._parseMediaItems(resp);
    } catch {
      this._playlists = [];
    } finally {
      this._mediaLoading = false;
      this.requestUpdate();
    }
  }

  private _parseMediaItems(resp: unknown): MediaItem[] {
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

  private async _ensureQueue(): Promise<void> {
    const entity = this._entityId();
    if (!entity || this._queueLoading) return;
    const key = `${entity}|${this._attr<string>("media_content_id") ?? ""}`;
    if (this._queue && this._queueKey === key) return;
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
      }));
      const cur = this._attr<string>("media_content_id");
      let idx = items.findIndex((x) => x.uri && x.uri === cur);
      if (idx < 0) idx = 0;
      this._queue = items;
      this._queueCurrentIdx = idx;
      this._queueKey = key;
    } catch {
      this._queue = [];
      this._queueCurrentIdx = 0;
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

  private _playMedia(uri: string): void {
    const e = this._entityId();
    if (e && this.hass && uri) {
      void this.hass.callService("music_assistant", "play_media", {
        entity_id: e,
        media_id: uri,
        media_type: "playlist",
        enqueue: "replace",
      });
    }
  }

  private _playQueueItem(id: string): void {
    const e = this._entityId();
    if (e && this.hass && id) {
      void this.hass.callService("mass_queue", "play_queue_item", {
        entity: e,
        queue_item_id: id,
      });
    }
  }

  private _removeQueueItem(id: string): void {
    const e = this._entityId();
    if (e && this.hass && id) {
      void this.hass.callService("mass_queue", "remove_queue_item", {
        entity: e,
        queue_item_id: id,
      });
      this._queueKey = undefined;
    }
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
    const themeClass = tedCardThemeClass(this._config?.theme);
    const mode: MusicBackgroundMode = this._config?.background_mode ?? "avg_gradient";
    const res = this._resolve();

    if (res.state !== "ok") {
      return html`<ha-card class="ted-card ${themeClass}">${this._renderMessage(res)}</ha-card>`;
    }

    const hasMedia = this._hasMedia();
    const fg =
      mode === "avg_gradient" || mode === "blur" ? (this._avgFg ?? "#ffffff") : "var(--ted-style-text)";

    if (this._config?.mode === "mini") {
      return html`
        <ha-card class="ted-card ${themeClass}" style="--music-fg:${fg}">
          ${this._renderBackground(mode)}
          <div class="content mini-content">${this._renderMini()}</div>
        </ha-card>
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
        ${this._renderBackground(mode)}
        <div class="content ${hasMedia ? "" : "idle"}">
          ${hasMedia ? this._renderPlayer() : nothing}
          <div class="tabs">${this._renderTabs()}</div>
        </div>
      </ha-card>
    `;
  }

  private _renderBackground(mode: MusicBackgroundMode): TemplateResult {
    if (mode === "ted") {
      return html`<div class="bg bg-ted">${brushedOverlay}</div>`;
    }
    if (mode === "ha") {
      return html`<div class="bg bg-ha"></div>`;
    }
    const art = this._artUrl();
    if (mode === "blur") {
      const img = art
        ? `background-image:url("${art}")`
        : "background:var(--ted-style-surface)";
      return html`<div class="bg bg-blur" style=${img}></div>
        <div class="bg bg-blur-scrim"></div>`;
    }
    // avg_gradient (default)
    const c = this._avgColor;
    const style = c
      ? `background:linear-gradient(180deg, color-mix(in srgb, rgb(${c}) 22%, #ffffff 78%) 0%, rgb(${c}) 100%)`
      : "background:linear-gradient(180deg, var(--ted-style-surface-2) 0%, var(--ted-style-surface) 100%)";
    return html`<div class="bg" style=${style}></div>`;
  }

  private _renderPlayer(): TemplateResult {
    const art = this._artUrl();
    const title = this._title() ?? "";
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

    return html`
      <div class="player">
        <div class="art-wrap">
          ${art
            ? html`<img class="art" src=${art} alt="" />`
            : html`<div class="art art-empty"><ha-icon icon="mdi:music"></ha-icon></div>`}
        </div>

        <div class="details">
          <div class="title" title=${title}>${title}</div>
          <div class="sub">
            <span class="artist">${artist}</span>${showAlbum
              ? html` <span class="album">(${album})</span>`
              : nothing}
          </div>
          ${this._renderSqBadge()}
        </div>

        <div class="progress">
          <input
            class="seek"
            type="range"
            min="0"
            max="100"
            .value=${String(pct)}
            @change=${this._onSeek}
            aria-label="Seek"
          />
          <div class="times">
            <span>${fmtTime(elapsed)}</span><span>${fmtTime(dur)}</span>
          </div>
        </div>

        <div class="controls">
          ${this._ctrl(
            "mdi:heart-outline",
            "Favorite current track",
            this._onFavorite,
            false,
            !this._favoriteButtonId(),
          )}
          ${this._ctrl("mdi:shuffle", "Shuffle", this._onShuffle, shuffle)}
          ${this._ctrl("mdi:skip-previous", "Previous", this._onPrev)}
          ${this._ctrl(
            playing ? "mdi:pause-circle" : "mdi:play-circle",
            playing ? "Pause" : "Play",
            this._onPlayPause,
            false,
            false,
            true,
          )}
          ${this._ctrl("mdi:skip-next", "Next", this._onNext)}
          ${this._ctrl(
            repeat === "one" ? "mdi:repeat-once" : "mdi:repeat",
            `Repeat: ${repeat}`,
            this._onRepeat,
            repeat !== "off",
          )}
        </div>

        <div class="volume">
          <ha-icon icon="mdi:volume-high"></ha-icon>
          <input
            class="vol"
            type="range"
            min="0"
            max="100"
            .value=${String(volPct)}
            @change=${this._onVolume}
            aria-label="Volume"
          />
          <span class="vol-num">${volPct}</span>
        </div>

        ${this._renderCastChip()}
      </div>
    `;
  }

  /** Compact one-row player (mode: mini). */
  private _renderMini(): TemplateResult {
    const art = this._artUrl();
    const title = this._title() ?? "Not playing";
    const artist = this._attr<string>("media_artist") ?? "";
    const dur = this._duration();
    const pct = dur ? (this._elapsed() / dur) * 100 : 0;
    const shuffle = !!this._attr<boolean>("shuffle");
    const repeat = this._attr<string>("repeat") ?? "off";
    const playing = this._isPlaying();
    const volLevel = this._attr<number>("volume_level");
    const volPct = typeof volLevel === "number" ? Math.round(volLevel * 100) : 0;
    const entity = this._entityId();
    const locked = this._locked();
    return html`
      <div class="mini">
        <div class="mini-art-wrap">
          ${art
            ? html`<img class="mini-art" src=${art} alt="" />`
            : html`<div class="mini-art ph"><ha-icon icon="mdi:music"></ha-icon></div>`}
        </div>
        <div class="mini-meta">
          <div class="mini-title one">${title}</div>
          <div class="mini-artist one">${artist}</div>
        </div>
        <div class="mini-controls">
          ${this._ctrl("mdi:shuffle", "Shuffle", this._onShuffle, shuffle)}
          ${this._ctrl("mdi:skip-previous", "Previous", this._onPrev)}
          ${this._ctrl(
            playing ? "mdi:pause-circle" : "mdi:play-circle",
            playing ? "Pause" : "Play",
            this._onPlayPause,
            false,
            false,
            true,
          )}
          ${this._ctrl("mdi:skip-next", "Next", this._onNext)}
          ${this._ctrl(
            repeat === "one" ? "mdi:repeat-once" : "mdi:repeat",
            `Repeat: ${repeat}`,
            this._onRepeat,
            repeat !== "off",
          )}
        </div>
        <div class="mini-right">
          <div class="cast-wrap">
            <button
              type="button"
              class="ctrl ${locked ? "" : ""}"
              title=${locked ? "Playback target (locked)" : "Change playback target"}
              aria-label="Playback target"
              ?disabled=${locked}
              @click=${this._toggleCast}
            >
              <ha-icon icon="mdi:cast-variant"></ha-icon>
            </button>
            ${this._castOpen ? this._renderCastFlyout(entity) : nothing}
          </div>
          <ha-icon class="mini-vol-icon" icon="mdi:volume-high"></ha-icon>
          <input
            class="vol mini-vol"
            type="range"
            min="0"
            max="100"
            .value=${String(volPct)}
            @change=${this._onVolume}
            aria-label="Volume"
          />
          <span class="vol-num">${volPct}</span>
        </div>
      </div>
      <input
        class="seek mini-seek"
        type="range"
        min="0"
        max="100"
        .value=${String(pct)}
        @change=${this._onSeek}
        aria-label="Seek"
      />
    `;
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

  /** Static "SQ" stream-quality badge (display-only). */
  private _renderSqBadge(): TemplateResult {
    return html`<span class="sq" title="Stream quality"><span class="sq-dot"></span>SQ</span>`;
  }

  /** The "cast to" target-device chip. Opens a device/grouping flyout unless
   *  `lock_target_device` is on (then it's a static label). */
  private _renderCastChip(): TemplateResult {
    const entity = this._entityId();
    const name = entity ? this._friendly(entity) : "";
    const locked = this._locked();
    return html`<div class="cast-wrap">
      <button
        type="button"
        class="cast ${locked ? "locked" : ""}"
        title=${locked ? "Playback target (locked)" : "Change playback target"}
        aria-label=${locked ? "Playback target" : "Change playback target"}
        ?disabled=${locked}
        @click=${this._toggleCast}
      >
        <ha-icon icon="mdi:cast-variant"></ha-icon><span>${name}</span>
      </button>
      ${this._castOpen ? this._renderCastFlyout(entity) : nothing}
    </div>`;
  }

  private _renderCastFlyout(current: string | undefined): TemplateResult {
    const members = this._groupMembers();
    const players = this._massPlayerIds();
    return html`
      <div class="cast-backdrop" @click=${this._closeCast}></div>
      <div class="cast-flyout" role="menu">
        ${players.map((id) => {
          const isCurrent = id === current;
          const grouped = members.includes(id);
          return html`<div class="cast-row ${isCurrent ? "cur" : ""}">
            <ha-icon icon="mdi:speaker"></ha-icon>
            <span class="cast-name">${this._friendly(id)}</span>
            ${isCurrent
              ? html`<span class="cast-tag">Target</span>`
              : html`<button
                  type="button"
                  class="cast-toggle ${grouped ? "on" : ""}"
                  title=${grouped ? "Ungroup" : "Group with target"}
                  @click=${() => (grouped ? this._unjoin(id) : this._join(id))}
                >
                  <ha-icon icon=${grouped ? "mdi:minus" : "mdi:plus"}></ha-icon>
                </button>`}
          </div>`;
        })}
      </div>`;
  }

  private _renderTabs(): TemplateResult {
    const tabs = this._visibleTabs();
    return html`
      <div class="tabbar" role="tablist">
        ${tabs.map(
          (t) => html`<button
            type="button"
            role="tab"
            class="tabbtn ${this._tab === t.id ? "sel" : ""}"
            aria-selected=${this._tab === t.id}
            @click=${() => this._pickTab(t.id)}
          >
            ${t.label}
          </button>`,
        )}
      </div>
      <div class="tabbody">${this._renderTabBody()}</div>
    `;
  }

  private _renderTabBody(): TemplateResult {
    switch (this._tab) {
      case "media":
        return this._renderMedia();
      case "queue":
        return this._renderQueue(false);
      case "recent":
        return this._renderQueue(true);
      case "lyrics":
        return this._renderLyrics();
    }
  }

  private _loadingBody(): TemplateResult {
    return html`<div class="placeholder">
      <ha-icon icon="mdi:loading" class="spin"></ha-icon>
    </div>`;
  }

  private _emptyBody(icon: string, msg: string): TemplateResult {
    return html`<div class="placeholder">
      <ha-icon icon=${icon}></ha-icon><span>${msg}</span>
    </div>`;
  }

  private _renderMedia(): TemplateResult {
    if (!this._playlists) return this._loadingBody();
    if (!this._playlists.length) return this._emptyBody("mdi:playlist-remove", "No playlists");
    return html`<div class="list">
      ${this._playlists.map(
        (p) => html`<button type="button" class="row" @click=${() => this._playMedia(p.uri)}>
          ${p.image
            ? html`<img class="thumb" src=${p.image} alt="" />`
            : html`<div class="thumb ph"><ha-icon icon="mdi:playlist-music"></ha-icon></div>`}
          <span class="row-title one">${p.name}</span>
          <ha-icon class="row-play" icon="mdi:play"></ha-icon>
        </button>`,
      )}
    </div>`;
  }

  private _renderQueue(recent: boolean): TemplateResult {
    if (!this._queue) return this._loadingBody();
    const idx = this._queueCurrentIdx;
    const items = recent ? this._queue.slice(0, idx).reverse() : this._queue.slice(idx);
    if (!items.length) {
      return this._emptyBody(
        "mdi:music-note-off",
        recent ? "Nothing played yet" : "Queue is empty",
      );
    }
    return html`<div class="list">
      ${items.map((it, i) => {
        const isCurrent = !recent && i === 0;
        const sub = `${it.duration ? fmtTime(it.duration) + " | " : ""}${it.album || it.artist}`;
        return html`<div class="row ${isCurrent ? "cur" : ""}">
          ${it.image
            ? html`<img class="thumb" src=${it.image} alt="" />`
            : html`<div class="thumb ph"><ha-icon icon="mdi:music"></ha-icon></div>`}
          <div class="row-main" @click=${() => this._playQueueItem(it.id)}>
            <div class="row-title one">${it.title}</div>
            <div class="row-sub one">${sub}</div>
          </div>
          ${isCurrent
            ? html`<span class="np">Now playing</span>`
            : html`<button
                type="button"
                class="row-x"
                title="Remove from queue"
                @click=${() => this._removeQueueItem(it.id)}
              >
                <ha-icon icon="mdi:close"></ha-icon>
              </button>`}
        </div>`;
      })}
    </div>`;
  }

  private _renderLyrics(): TemplateResult {
    if (this._lyrics === undefined) return this._loadingBody();
    if (this._lyrics === null) return this._emptyBody("mdi:comment-text-outline", "No lyrics found");
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
        <ha-icon icon="mdi:music-off"></ha-icon>
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
        overflow: hidden;
        padding: 0;
        color: var(--ted-style-text);
        container-type: inline-size;
      }

      /* Background layers */
      .bg {
        position: absolute;
        inset: 0;
        z-index: 0;
      }
      .bg-ted {
        background: linear-gradient(145deg, #2e2e32 0%, #222226 45%, #16161a 100%);
      }
      .bg-ha {
        background: var(--ha-card-background, var(--card-background-color, transparent));
      }
      .bg-blur {
        background-size: cover;
        background-position: center;
        filter: blur(42px) saturate(1.4);
        transform: scale(1.3);
      }
      .bg-blur-scrim {
        background: rgba(0, 0, 0, 0.28);
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
      .content.idle .tabs {
        flex: 1 1 auto;
      }
      .player {
        flex: 0 0 42%;
        min-width: 0;
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
        display: flex;
        justify-content: center;
      }
      .art {
        width: min(56%, 240px);
        aspect-ratio: 1 / 1;
        object-fit: cover;
        border-radius: 12px;
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.4);
      }
      .art-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(127, 127, 127, 0.25);
        color: var(--music-fg, #fff);
      }
      .art-empty ha-icon {
        --mdc-icon-size: 44px;
      }

      /* Details */
      .details {
        width: 100%;
        text-align: left;
      }
      .title {
        font-size: 1.5em;
        font-weight: 700;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sub {
        margin-top: 2px;
        font-size: 1.05em;
        opacity: 0.92;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .album {
        opacity: 0.62;
      }
      .sq {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        padding: 2px 8px;
        font-size: 0.72em;
        font-weight: 600;
        letter-spacing: 0.04em;
        border-radius: var(--ted-style-radius-sm);
        background: rgba(127, 127, 127, 0.28);
        color: inherit;
      }
      .sq-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--ted-style-success, #6ccb5f);
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

      /* Cast chip */
      .cast-wrap {
        position: relative;
        display: flex;
        justify-content: center;
        max-width: 100%;
      }
      .cast {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        border: none;
        cursor: pointer;
        color: inherit;
        border-radius: var(--ted-style-pill);
        background: rgba(127, 127, 127, 0.22);
        font-size: 0.85em;
        max-width: 100%;
      }
      .cast.locked {
        cursor: default;
      }
      .cast span {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
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
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%);
        z-index: 9;
        min-width: 220px;
        max-width: 300px;
        max-height: 260px;
        overflow: auto;
        padding: 6px;
        border-radius: 12px;
        background: var(--ted-style-surface, #2b2b2b);
        color: var(--ted-style-text, #fff);
        border: 1px solid var(--ted-style-divider, rgba(255, 255, 255, 0.12));
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
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
        display: flex;
        gap: 6px;
        border-bottom: 1px solid rgba(127, 127, 127, 0.25);
        padding-bottom: 8px;
      }
      .tabbtn {
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        padding: 6px 10px;
        font-size: 0.95em;
        font-weight: 600;
        opacity: 0.6;
        border-radius: var(--ted-style-radius-sm);
      }
      .tabbtn.sel {
        opacity: 1;
        color: var(--ted-style-accent);
      }
      .tabbody {
        flex: 1 1 0;
        min-height: 0;
        overflow: auto;
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
      .np {
        flex: 0 0 auto;
        font-size: 0.68em;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--ted-style-accent);
      }
      .row-x {
        flex: 0 0 auto;
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        opacity: 0.55;
        display: inline-flex;
      }
      .row-x:hover {
        opacity: 1;
      }
      .row-x ha-icon {
        --mdc-icon-size: 18px;
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
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .mini-art {
        width: 48px;
        height: 48px;
        border-radius: 6px;
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
      .mini-controls,
      .mini-right {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .mini-controls .ctrl ha-icon {
        --mdc-icon-size: 22px;
      }
      .mini-controls .ctrl.primary ha-icon {
        --mdc-icon-size: 40px;
      }
      .mini-vol-icon {
        --mdc-icon-size: 18px;
        opacity: 0.85;
      }
      .mini-vol {
        width: 84px;
      }
      .mini-seek {
        margin-top: 8px;
        height: 3px;
      }
      @container (max-width: 620px) {
        .mini-meta {
          flex: 1 1 60px;
        }
        .mini-vol,
        .mini-vol-icon,
        .mini-right .vol-num {
          display: none;
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
