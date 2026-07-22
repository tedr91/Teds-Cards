import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { MUSIC_CARD_EDITOR_TYPE } from "./const";
import type { MusicCardConfig, MusicPlayerSource } from "./types";

const SOURCE_OPTIONS = [
  { value: "settings", label: "This device's Settings player" },
  { value: "config", label: "This card (choose below)" },
];

const MODE_OPTIONS = [
  { value: "full", label: "Full player" },
  { value: "mini", label: "Mini player" },
];

const BACKGROUND_OPTIONS = [
  { value: "blur", label: "Blurred album art" },
  { value: "none", label: "None" },
];

const THEME_OPTIONS = [
  { value: "ted-style", label: "Ted's style" },
  { value: "ha", label: "Home Assistant theme" },
];

@customElement(MUSIC_CARD_EDITOR_TYPE)
export class TedMusicCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: MusicCardConfig;

  public setConfig(config: MusicCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const source: MusicPlayerSource = this._config.player_source ?? "settings";
    const sourceData = { player_source: source };
    const sourceSchema = [
      { name: "player_source", selector: { select: { mode: "dropdown", options: SOURCE_OPTIONS } } },
    ];
    const restData = {
      mode: this._config.mode ?? "full",
      background_mode: this._config.background_mode ?? "blur",
      theme: this._config.theme ?? "ted-style",
      auto_resolve_mass_player: this._config.auto_resolve_mass_player !== false,
      lock_target_device: this._config.lock_target_device ?? false,
      apply_music_volume: this._config.apply_music_volume !== false,
    };
    const restSchema = [
      {
        type: "grid",
        name: "",
        column_min_width: "160px",
        schema: [
          { name: "mode", selector: { select: { mode: "dropdown", options: MODE_OPTIONS } } },
          {
            name: "background_mode",
            selector: { select: { mode: "dropdown", options: BACKGROUND_OPTIONS } },
          },
          { name: "theme", selector: { select: { mode: "dropdown", options: THEME_OPTIONS } } },
        ],
      },
      {
        type: "grid",
        name: "",
        column_min_width: "160px",
        schema: [
          { name: "auto_resolve_mass_player", selector: { boolean: {} } },
          { name: "lock_target_device", selector: { boolean: {} } },
          { name: "apply_music_volume", selector: { boolean: {} } },
        ],
      },
    ];

    return html`
      <div class="editor">
        <ha-form
          .hass=${this.hass}
          .data=${sourceData}
          .schema=${sourceSchema}
          .computeLabel=${this._computeLabel}
          .computeHelper=${this._computeHelper}
          @value-changed=${this._valueChanged}
        ></ha-form>
        ${source === "settings"
          ? html`<div class="settings-note">
              The player is chosen per-device in <b>Settings → Sounds</b>. Non-Music-Assistant
              speakers are matched to their Music Assistant player automatically when possible.
            </div>`
          : html`<ha-entity-picker
              class="entity-picker"
              .hass=${this.hass}
              .value=${this._config.entity ?? ""}
              .includeDomains=${["media_player"]}
              allow-custom-entity
              @value-changed=${this._entityChanged}
            ></ha-entity-picker>`}
        <ha-form
          .hass=${this.hass}
          .data=${restData}
          .schema=${restSchema}
          .computeLabel=${this._computeLabel}
          .computeHelper=${this._computeHelper}
          @value-changed=${this._valueChanged}
        ></ha-form>
      </div>
    `;
  }

  private _computeHelper = (schema: { name: string }): string | undefined => {
    switch (schema.name) {
      case "player_source":
        return "\"This device's Settings player\" uses the per-device Music player from Ted's Cards Settings.";
      case "background_mode":
        return "How the player surface is painted.";
      case "auto_resolve_mass_player":
        return "If the player isn't a Music Assistant entity, find its Music Assistant match at runtime.";
      case "lock_target_device":
        return "Prevent switching the playback target device from the card (hides the cast picker).";
      case "apply_music_volume":
        return "Set this device's Music volume when playback first starts.";
      default:
        return undefined;
    }
  };

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "player_source":
        return "Player source";
      case "mode":
        return "Layout";
      case "background_mode":
        return "Background";
      case "theme":
        return "Theme";
      case "auto_resolve_mass_player":
        return "Auto-match player";
      case "lock_target_device":
        return "Lock target device";
      case "apply_music_volume":
        return "Apply music volume on start";
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    const value = ev.detail.value as Record<string, unknown>;
    this._commit({ ...this._config, ...value } as MusicCardConfig);
  };

  private _entityChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    this._commit({ ...this._config, entity: ev.detail.value ?? "" } as MusicCardConfig);
  };

  private _commit(config: MusicCardConfig): void {
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  static styles = css`
    .editor {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .entity-picker {
      display: block;
    }
    .settings-note {
      font-size: 0.9rem;
      line-height: 1.4;
      color: var(--secondary-text-color);
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.12));
      border-radius: 8px;
      padding: 10px 12px;
    }
  `;
}
