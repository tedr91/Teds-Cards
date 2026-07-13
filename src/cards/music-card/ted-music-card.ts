import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardConfig,
  type LovelaceCardEditor,
} from "custom-card-helpers";

import { SettingsController, settingsStore } from "../../shared/settings";
import {
  MASS_PLAYER_CARD_TYPE,
  MASS_PLAYER_PLATFORM,
  MUSIC_CARD_EDITOR_TYPE,
  MUSIC_CARD_TYPE,
} from "./const";
import type { MusicCardConfig } from "./types";

// mdi:music — empty-state illustration.
const MUSIC_ICON =
  "M21,3V15.5A3.5,3.5 0 0,1 17.5,19A3.5,3.5 0 0,1 14,15.5A3.5,3.5 0 0,1 17.5,12C18.04,12 18.55,12.12 19,12.34V6.47L9,8.6V17.5A3.5,3.5 0 0,1 5.5,21A3.5,3.5 0 0,1 2,17.5A3.5,3.5 0 0,1 5.5,14C6.04,14 6.55,14.12 7,14.34V6L21,3Z";
// mdi:cog — empty-state "Settings" button.
const COG_ICON =
  "M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z";
// mdi:speaker-off — "needs mapping" illustration.
const SPEAKER_OFF_ICON =
  "M12,4A3,3 0 0,1 15,7A3,3 0 0,1 12,10A3,3 0 0,1 9,7A3,3 0 0,1 12,4M12,6A1,1 0 0,0 11,7A1,1 0 0,0 12,8A1,1 0 0,0 13,7A1,1 0 0,0 12,6M3.28,4L20,20.72L18.73,22L15.79,19.06C15.34,19.65 14.71,20 14,20H10C8.89,20 8,19.11 8,18V13.27L2,7.27L3.28,4M10,13V18H14V17L10,13M8.2,4C8.61,4 9,4.16 9.28,4.44L10,5.16V6C10,6.55 10.45,7 11,7L11.84,7L14,9.16V4C14,2.89 13.11,2 12,2H8.2Z";

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
}
type RegistryHass = HomeAssistant & { entities?: Record<string, RegistryEntity | undefined> };

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
  /** The embedded mass-player-card, rebuilt only when its config JSON changes. */
  private _child?: { el: LovelaceCard; json: string };
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

  /** The starting media_player id — the card's `entity` or this device's setting. */
  private _baseEntity(): string | undefined {
    if (this._config?.entity) return this._config.entity;
    if (this._config?.player_source === "config") return undefined;
    const setting = settingsStore.get("media_player");
    return typeof setting === "string" && setting ? setting : undefined;
  }

  private _registry(): Record<string, RegistryEntity | undefined> {
    return (this.hass as RegistryHass | undefined)?.entities ?? {};
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

  /** Best-effort: find the Music Assistant player matching a physical speaker. */
  private _matchMassPlayer(base: string): string | undefined {
    const candidates = this._massPlayers();
    if (candidates.length === 0) return undefined;
    // 1) Same underlying HA device.
    const baseDevice = this._registry()[base]?.device_id ?? null;
    if (baseDevice) {
      const byDevice = candidates.find((id) => this._registry()[id]?.device_id === baseDevice);
      if (byDevice) return byDevice;
    }
    // 2) Matching friendly name (exact, then containment).
    const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const target = norm(this._name(base));
    if (target) {
      const exact = candidates.find((id) => norm(this._name(id)) === target);
      if (exact) return exact;
      const partial = candidates.find((id) => {
        const n = norm(this._name(id));
        return n.length > 2 && (n.includes(target) || target.includes(n));
      });
      if (partial) return partial;
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
    const res = this._resolve();
    if (res.state !== "ok") {
      this._child = undefined;
      return;
    }
    const cfg = this._childConfig(res.entity);
    const json = JSON.stringify(cfg);
    if (this._child?.json === json) return;
    const el = this._helpers.createCardElement(cfg);
    if (this.hass) el.hass = this.hass;
    this._child = { el, json };
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

  private _openSettings = (): void => {
    const path = this._settingsPath();
    window.history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
  };

  // --- Render ----------------------------------------------------------------

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;
    const res = this._resolve();
    if (res.state === "empty") return this._renderEmpty();
    if (res.state === "unmatched") return this._renderUnmatched(res.base);
    if (!this._helpers || !this._child) return html`<div class="loading"></div>`;
    const cls = this._config.fill ? "player fill" : "player natural";
    return html`<div class=${cls}>${this._child.el}</div>`;
  }

  private _renderEmpty(): TemplateResult {
    const title = this._config?.empty_title ?? "No player yet";
    const message =
      this._config?.empty_message ??
      "This device hasn't been given a media player. Open Settings to choose one.";
    return html`
      <div class="empty">
        <ha-svg-icon class="empty-icon" .path=${MUSIC_ICON}></ha-svg-icon>
        <div class="empty-title">${title}</div>
        <div class="empty-msg">${message}</div>
        <button type="button" class="empty-btn" @click=${this._openSettings}>
          <ha-svg-icon .path=${COG_ICON}></ha-svg-icon>
          <span>Settings</span>
        </button>
      </div>
    `;
  }

  private _renderUnmatched(base: string): TemplateResult {
    const title = this._config?.unmatched_title ?? "No Music Assistant player";
    const message =
      this._config?.unmatched_message ??
      `"${this._name(base)}" isn't a Music Assistant player, and no matching one was found. ` +
        "Pick this device's Music Assistant player in Settings → Media.";
    return html`
      <div class="empty">
        <ha-svg-icon class="empty-icon" .path=${SPEAKER_OFF_ICON}></ha-svg-icon>
        <div class="empty-title">${title}</div>
        <div class="empty-msg">${message}</div>
        <button type="button" class="empty-btn" @click=${this._openSettings}>
          <ha-svg-icon .path=${COG_ICON}></ha-svg-icon>
          <span>Settings</span>
        </button>
      </div>
    `;
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
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      height: 100%;
      min-height: 200px;
      padding: 24px;
      box-sizing: border-box;
      text-align: center;
      color: var(--secondary-text-color);
    }
    .empty-icon {
      --mdc-icon-size: 56px;
      color: var(--primary-color);
      opacity: 0.8;
    }
    .empty-title {
      font-size: 1.15rem;
      font-weight: 600;
      color: var(--primary-text-color);
    }
    .empty-msg {
      max-width: 340px;
      line-height: 1.4;
    }
    .empty-btn {
      appearance: none;
      cursor: pointer;
      font: inherit;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
      padding: 8px 16px;
      border: none;
      border-radius: 999px;
      color: var(--text-primary-color, #fff);
      background: var(--primary-color);
    }
    .empty-btn ha-svg-icon {
      --mdc-icon-size: 20px;
    }
  `;
}
