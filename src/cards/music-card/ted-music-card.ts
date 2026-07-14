import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardConfig,
  type LovelaceCardEditor,
} from "custom-card-helpers";

import { resolveDeviceMediaPlayer } from "../../shared/device-id";
import { SettingsController, settingsStore } from "../../shared/settings";
import {
  MASS_PLAYER_CARD_TYPE,
  MASS_PLAYER_PLATFORM,
  MUSIC_CARD_EDITOR_TYPE,
  MUSIC_CARD_TYPE,
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

/** Frontend entity-registry entry shape (not on the custom-card-helpers HomeAssistant type). */
interface RegistryEntity {
  platform?: string;
  device_id?: string | null;
  area_id?: string | null;
}
interface RegistryDevice {
  manufacturer?: string | null;
  model?: string | null;
  name?: string | null;
}
type RegistryHass = HomeAssistant & {
  entities?: Record<string, RegistryEntity | undefined>;
  devices?: Record<string, RegistryDevice | undefined>;
};

/** When several Music Assistant players share an area, prefer these providers in
 *  order. Each entry lists keywords looked for in the player's device
 *  manufacturer / model / name (Music Assistant sets the device manufacturer to the
 *  real manufacturer, or the provider name when unknown). */
const PROVIDER_ORDER: string[][] = [
  ["sonos"],
  ["chromecast", "google cast", "google", "cast", "nest"],
  ["airplay", "apple"],
  ["dlna", "upnp"],
];

/** Outcome of resolving the player entity for this device. */
type Resolution =
  | { state: "empty" }
  | { state: "unmatched"; base: string }
  | { state: "ok"; entity: string };

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
  /** The embedded child card (the player, or a MessageBox for empty/unmatched states). */
  private _child?: { el: LovelaceCard; json: string };
  private _childKind?: "player" | "message";
  private _lastPropagatedHass?: HomeAssistant;

  public constructor() {
    super();
    // Keep this device's settings live so `player_source: settings` stays in sync.
    new SettingsController(this, () => this.hass);
  }

  public connectedCallback(): void {
    super.connectedCallback();
    void this._loadHelpers();
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
    this._buildCard();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("hass")) this._propagateHass();
  }

  // --- Entity resolution -----------------------------------------------------

  /** The starting media_player id — the card's `entity`, this device's music player,
   *  then the system-sound player, then the device's own registered player. */
  private _baseEntity(): string | undefined {
    if (this._config?.entity) return this._config.entity;
    if (this._config?.player_source === "config") return undefined;
    const music = settingsStore.get("music_player");
    if (typeof music === "string" && music) return music;
    const system = settingsStore.get("system_sound_player");
    if (typeof system === "string" && system) return system;
    return resolveDeviceMediaPlayer(this.hass);
  }

  private _registry(): Record<string, RegistryEntity | undefined> {
    return (this.hass as RegistryHass | undefined)?.entities ?? {};
  }

  private _devices(): Record<string, RegistryDevice | undefined> {
    return (this.hass as RegistryHass | undefined)?.devices ?? {};
  }

  /** Priority rank of a Music Assistant player by its provider (lower = preferred);
   *  unknown providers rank last. Uses the player's device manufacturer/model/name. */
  private _providerRank(id: string): number {
    const deviceId = this._registry()[id]?.device_id ?? undefined;
    const dev = deviceId ? this._devices()[deviceId] : undefined;
    const text = [dev?.manufacturer, dev?.model, dev?.name, this._name(id), id]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const idx = PROVIDER_ORDER.findIndex((keys) => keys.some((k) => text.includes(k)));
    return idx === -1 ? PROVIDER_ORDER.length : idx;
  }

  private _isMassPlayer(id: string): boolean {
    return this._registry()[id]?.platform === MASS_PLAYER_PLATFORM;
  }

  /** All Music Assistant media_player entity ids. */
  private _massPlayers(): string[] {
    const reg = this._registry();
    return Object.keys(reg).filter(
      (id) => id.startsWith("media_player.") && reg[id]?.platform === MASS_PLAYER_PLATFORM,
    );
  }

  private _name(id: string): string {
    const fn = this.hass?.states[id]?.attributes?.friendly_name;
    return typeof fn === "string" ? fn : id;
  }

  /** Best-effort: find the Music Assistant player matching a physical speaker.
   *  Tiers: same HA device → exact name → best name-token overlap (area as a tie-breaker). */
  private _matchMassPlayer(base: string): string | undefined {
    const reg = this._registry();
    const candidates = this._massPlayers();
    if (candidates.length === 0) return undefined;

    // 1) Same underlying HA device — the strongest signal.
    const baseDevice = reg[base]?.device_id ?? null;
    if (baseDevice) {
      const byDevice = candidates.find((id) => reg[id]?.device_id === baseDevice);
      if (byDevice) return byDevice;
    }

    const tokenize = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const baseTokens = tokenize(this._name(base));
    const baseJoined = baseTokens.join("");
    const baseArea = reg[base]?.area_id ?? null;

    // 2) Exact normalized name.
    if (baseJoined) {
      const exact = candidates.find((id) => tokenize(this._name(id)).join("") === baseJoined);
      if (exact) return exact;
    }
    if (baseTokens.length === 0) return undefined;

    // 3) Rank the rest by name-token overlap; a shared area breaks ties.
    let best: { id: string; score: number } | undefined;
    for (const id of candidates) {
      const cTokens = tokenize(this._name(id));
      if (cTokens.length === 0) continue;
      const lenGap = Math.abs(cTokens.length - baseTokens.length);
      let score: number;
      if (
        baseTokens.every((t) => cTokens.includes(t)) ||
        cTokens.every((t) => baseTokens.includes(t))
      ) {
        // One name's tokens fully contain the other (e.g. "Office" ↔ "Office Speaker").
        score = 60 - lenGap * 5;
      } else {
        const shared = baseTokens.filter((t) => cTokens.includes(t)).length;
        if (shared === 0) continue;
        score = 20 + shared * 5 - lenGap * 3;
      }
      if (baseArea && reg[id]?.area_id === baseArea) score += 15;
      if (!best || score > best.score) best = { id, score };
    }
    if (best && best.score >= 25) return best.id;

    // 4) No name match — fall back to a Music Assistant player in the same area,
    //    preferring providers in order (Sonos → Chromecast → AirPlay → DLNA).
    if (baseArea) {
      const inArea = candidates.filter((id) => reg[id]?.area_id === baseArea);
      if (inArea.length) {
        inArea.sort((a, b) => this._providerRank(a) - this._providerRank(b));
        return inArea[0];
      }
    }
    return undefined;
  }

  private _resolve(): Resolution {
    const base = this._baseEntity();
    if (!base) return { state: "empty" };
    if (this._isMassPlayer(base)) return { state: "ok", entity: base };
    // Trust an explicit entity / disabled auto-resolve as-is.
    if (this._config?.auto_resolve_mass_player === false) return { state: "ok", entity: base };
    const matched = this._matchMassPlayer(base);
    return matched ? { state: "ok", entity: matched } : { state: "unmatched", base };
  }

  // --- Embedded mass-player-card ---------------------------------------------

  private _childConfig(entity: string): LovelaceCardConfig {
    return {
      type: MASS_PLAYER_CARD_TYPE,
      entities: [entity],
      ...(this._config?.fill ? { panel: true } : {}),
      ...(this._config?.mass_config ?? {}),
    };
  }

  private _buildCard(): void {
    if (!this._helpers) return;
    const desired = this._desiredChild();
    if (!desired) {
      this._child = undefined;
      this._childKind = undefined;
      return;
    }
    const json = JSON.stringify(desired.cfg);
    if (this._child?.json === json) {
      this._childKind = desired.kind;
      return;
    }
    const el = this._helpers.createCardElement(desired.cfg);
    if (this.hass) el.hass = this.hass;
    this._child = { el, json };
    this._childKind = desired.kind;
  }

  private _propagateHass(): void {
    if (!this.hass || this.hass === this._lastPropagatedHass) return;
    this._lastPropagatedHass = this.hass;
    if (this._child) this._child.el.hass = this.hass;
  }

  // --- Navigation ------------------------------------------------------------

  private _settingsPath(): string {
    const root = String(settingsStore.effective().dashboard_root ?? "ted-dashboard");
    const raw = this._config?.settings_path || "[root]/settings?tab=media&scope=device";
    let path = raw.replace("[root]", root);
    if (!path.startsWith("/")) path = `/${path}`;
    return path;
  }

  // --- State cards -----------------------------------------------------------

  /** The child card to render for the current state: the player, or a MessageBox. */
  private _desiredChild(): { cfg: LovelaceCardConfig; kind: "player" | "message" } | undefined {
    const res = this._resolve();
    if (res.state === "ok") return { cfg: this._childConfig(res.entity), kind: "player" };
    if (res.state === "empty") return { cfg: this._emptyMessageConfig(), kind: "message" };
    if (res.state === "unmatched")
      return { cfg: this._unmatchedMessageConfig(res.base), kind: "message" };
    return undefined;
  }

  private _messageConfig(
    severity: string,
    icon: string,
    title: string,
    message: string,
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
          icon: "mdi:cog",
          variant: "primary",
          action: "navigate",
          navigation_path: this._settingsPath(),
        },
      ],
    };
  }

  private _emptyMessageConfig(): LovelaceCardConfig {
    return this._messageConfig(
      "info",
      "mdi:music",
      this._config?.empty_title ?? "No music player yet",
      this._config?.empty_message ??
        "This device hasn't been given a music player. Open Settings to choose one.",
    );
  }

  private _unmatchedMessageConfig(base: string): LovelaceCardConfig {
    return this._messageConfig(
      "warning",
      "mdi:music-note-off",
      this._config?.unmatched_title ?? "No Music Assistant player",
      this._config?.unmatched_message ??
        `"${this._name(base)}" isn't a Music Assistant player, and no matching one was found. ` +
          "Pick this device's Music Assistant player in Settings → Media.",
    );
  }

  // --- Render ----------------------------------------------------------------

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;
    if (!this._helpers || !this._child) return html`<div class="loading"></div>`;
    if (this._childKind === "message") return html`<div class="msg">${this._child.el}</div>`;
    const cls = this._config.fill ? "player fill" : "player natural";
    return html`<div class=${cls}>${this._child.el}</div>`;
  }

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
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
    /* Opt-in: stretch the player to fill the whole area (sets the child's panel mode). */
    .player.fill {
      height: 100%;
    }
    .player.fill > * {
      height: 100%;
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
