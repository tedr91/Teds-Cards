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
  /** Tracks the resolved player's last observed state to detect a fresh playback start. */
  private _lastPlayEntity?: string;
  private _lastPlayState?: string;
  /** For engine:yamp + fill, the measured content-area height passed as `card_height`. */
  @state() private _fillHeight?: number;
  private _resizeObserver?: ResizeObserver;

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
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
  }

  /** Measure the host (content area) for engine:yamp + fill; updates `_fillHeight`. */
  private _measureFill(): void {
    if (this._config?.engine !== "yamp" || !this._config.fill) {
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
    this._buildCard();
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

  // --- Embedded mass-player-card ---------------------------------------------

  private _childConfig(entity: string): LovelaceCardConfig {
    if (this._config?.engine === "yamp") {
      // YAMP has no section-height CSS var; for `fill` we pass the measured
      // content-area height as `card_height` (yamp_config can still override it).
      return {
        type: YAMP_CARD_TYPE,
        entities: [entity],
        ...(this._config.fill && this._fillHeight ? { card_height: this._fillHeight } : {}),
        ...(this._config.yamp_config ?? {}),
      };
    }
    // engine: mass (default). `fill` is handled purely with CSS (see the `.player.fill`
    // styles) by driving mass-player-card's `--mass-player-card-section-height`. We do NOT
    // set its `panel` option: panel mode hard-codes the card height to window.innerHeight
    // (an inline style we can't override), which overflows past our header/navbar.
    return {
      type: MASS_PLAYER_CARD_TYPE,
      entities: [entity],
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
    const raw = this._config?.settings_path || "[root]/settings?tab=sounds&scope=device";
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
    /* Opt-in: fill the dashboard content area. mass-player-card's own panel mode
       hard-codes its height to window.innerHeight (unoverridable inline style), which
       overflows past our header/navbar. Instead we size it via its public
       --mass-player-card-section-height token: total card height = that + the card's
       internal tab bar (--navbar-height: 4em). We mirror shared/layout-content.yaml's
       content-area height and subtract 4em so the card lands exactly on the content
       area. */
    .player.fill {
      height: 100%;
      --mass-player-card-section-height: calc(
        100dvh - var(
            --ted-navbar-header-reserve,
            var(--kiosk-header-height, var(--header-height, 56px))
          ) - var(--safe-area-inset-top, 0px) -
          var(--ted-navbar-bottom-reserve, 48px) - 24px - 4em
      );
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
