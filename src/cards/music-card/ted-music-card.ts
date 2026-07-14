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
  resolveMusicPlayer,
  type MusicPlayerResolution,
} from "../../shared/music-player";
import { MASS_PLAYER_CARD_TYPE, MUSIC_CARD_EDITOR_TYPE, MUSIC_CARD_TYPE } from "./const";
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
