import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { MUSIC_CARD_EDITOR_TYPE } from "./const";
import type { MusicCardConfig, MusicPlayerSource } from "./types";

const SOURCE_OPTIONS = [
  { value: "settings", label: "This device's Settings player" },
  { value: "config", label: "This card (choose below)" },
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
    const topData = {
      player_source: source,
      auto_resolve_mass_player: this._config.auto_resolve_mass_player !== false,
      fill: this._config.fill ?? false,
    };
    const topSchema = [
      { name: "player_source", selector: { select: { mode: "dropdown", options: SOURCE_OPTIONS } } },
      {
        type: "grid",
        name: "",
        column_min_width: "160px",
        schema: [
          { name: "auto_resolve_mass_player", selector: { boolean: {} } },
          { name: "fill", selector: { boolean: {} } },
        ],
      },
    ];

    return html`
      <div class="editor">
        <ha-form
          .hass=${this.hass}
          .data=${topData}
          .schema=${topSchema}
          .computeLabel=${this._computeLabel}
          .computeHelper=${this._computeHelper}
          @value-changed=${this._valueChanged}
        ></ha-form>
        ${source === "settings"
          ? html`<div class="settings-note">
              The player is chosen per-device in <b>Settings → Media</b>. Non-Music-Assistant
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
      </div>
    `;
  }

  private _computeHelper = (schema: { name: string }): string | undefined => {
    if (schema.name === "player_source") {
      return "\"This device's Settings player\" uses the per-device Media player from Ted's Cards Settings.";
    }
    if (schema.name === "auto_resolve_mass_player") {
      return "If the player isn't a Music Assistant entity, find its Music Assistant match at runtime.";
    }
    if (schema.name === "fill") {
      return "Fill the parent container (e.g. a dashboard view area) instead of sizing to content.";
    }
    return undefined;
  };

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "player_source":
        return "Player source";
      case "auto_resolve_mass_player":
        return "Auto-match player";
      case "fill":
        return "Fill available space";
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    this._commit({ ...this._config, ...ev.detail.value } as MusicCardConfig);
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
