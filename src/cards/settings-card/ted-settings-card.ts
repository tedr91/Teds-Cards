import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import { type HomeAssistant, type LovelaceCard, type LovelaceCardEditor } from "custom-card-helpers";

import { appearanceStyle, cssColor } from "../../shared/appearance";
import { brushedOverlay, tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { registerCustomCard } from "../../shared/register-card";
import { SettingsController, settingsStore } from "../../shared/settings";
import { resolveDeviceMediaPlayer } from "../../shared/device-id";
import {
  fieldsByGroup,
  SETTINGS_DEFAULTS,
  type SettingField,
  type SettingsValue,
} from "../../shared/settings-schema";
import {
  SETTINGS_CARD_DESCRIPTION,
  SETTINGS_CARD_EDITOR_TYPE,
  SETTINGS_CARD_NAME,
  SETTINGS_CARD_TYPE,
} from "./const";
import type { SettingsCardConfig } from "./types";

const SETTINGS_SENSOR = "sensor.teds_settings";

registerCustomCard({
  type: SETTINGS_CARD_TYPE,
  name: SETTINGS_CARD_NAME,
  description: SETTINGS_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/Teds-Cards#settings-card",
});

@customElement(SETTINGS_CARD_TYPE)
export class TedSettingsCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-settings-card-editor");
    return document.createElement(SETTINGS_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<SettingsCardConfig, "type"> {
    return {};
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: SettingsCardConfig;
  @state() private _tab: "global" | "device" = "global";
  /** Fields the user is actively overriding on this device but hasn't stored a value for yet. */
  private _editing = new Set<string>();

  public constructor() {
    super();
    // Registers itself as a reactive controller; keeps settings live for this card.
    new SettingsController(this, () => this.hass);
  }

  public setConfig(config: SettingsCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
    if (config.show_global === false && config.show_device !== false) this._tab = "device";
  }

  public getCardSize(): number {
    return 12;
  }

  // --- value helpers --------------------------------------------------------

  /** The value this device inherits (global override, else default). */
  private _inherited(key: string): SettingsValue {
    const g = settingsStore.globalSettings();
    return key in g ? g[key] : (SETTINGS_DEFAULTS[key] ?? null);
  }

  private _globalValue(key: string): SettingsValue {
    const g = settingsStore.globalSettings();
    return key in g ? g[key] : (SETTINGS_DEFAULTS[key] ?? null);
  }

  private _deviceOverridden(key: string): boolean {
    return key in settingsStore.deviceSettings();
  }

  /** True when the device row should be editable: a stored override, or the user just
   *  clicked "override" on a field whose inherited value is empty (nothing stored yet). */
  private _deviceOverriding(key: string): boolean {
    return this._deviceOverridden(key) || this._editing.has(key);
  }

  private _deviceValue(key: string): SettingsValue {
    const d = settingsStore.deviceSettings();
    return key in d ? d[key] : this._inherited(key);
  }

  private _setGlobal(key: string, value: SettingsValue): void {
    settingsStore.setValue("global", key, value);
  }

  private _setDevice(key: string, value: SettingsValue): void {
    settingsStore.setValue("device", key, value);
  }

  /** This device's own media player (the playback fallback when nothing is set). */
  private _deviceMediaPlayer(): string | undefined {
    return resolveDeviceMediaPlayer(this.hass);
  }

  /** Friendly name for an entity id, or a readable "none" placeholder. */
  private _entityLabel(entityId?: string): string {
    if (!entityId) return "none detected";
    const fn = this.hass?.states[entityId]?.attributes?.friendly_name;
    return typeof fn === "string" && fn ? `${fn} (${entityId})` : entityId;
  }

  /** The fallback hint shown on the media-player rows. */
  private _mediaFallbackHint(): TemplateResult {
    return html`<span class="help"
      >When unset, plays on this device: <b>${this._entityLabel(this._deviceMediaPlayer())}</b></span
    >`;
  }

  private _toggleOverride(field: SettingField, on: boolean): void {
    if (on) {
      // Mark as editing so the control enables even when the inherited value is
      // empty (e.g. media_player); seed a real override only when there's a value.
      this._editing.add(field.key);
      const inherited = this._inherited(field.key);
      if (inherited !== null && inherited !== undefined && inherited !== "") {
        settingsStore.setValue("device", field.key, inherited);
      }
    } else {
      this._editing.delete(field.key);
      settingsStore.clearValue("device", field.key);
    }
    this.requestUpdate();
  }

  // --- rendering ------------------------------------------------------------

  private _renderControl(
    field: SettingField,
    value: SettingsValue,
    disabled: boolean,
    onChange: (v: SettingsValue) => void,
  ): TemplateResult {
    switch (field.kind) {
      case "boolean":
        return html`<ha-switch
          .checked=${value === true}
          .disabled=${disabled}
          @change=${(e: Event) => onChange((e.target as HTMLInputElement).checked)}
        ></ha-switch>`;
      case "percent":
        return html`<div class="pct">
          <input
            type="range"
            min="0"
            max="100"
            .value=${String(typeof value === "number" ? value : 0)}
            ?disabled=${disabled}
            @input=${(e: Event) => onChange(Number((e.target as HTMLInputElement).value))}
          />
          <span class="pct-val">${typeof value === "number" ? value : 0}%</span>
        </div>`;
      case "number":
        return html`<input
          class="num"
          type="number"
          min=${field.min ?? 0}
          max=${field.max ?? 9999}
          step=${field.step ?? 1}
          .value=${String(typeof value === "number" ? value : "")}
          ?disabled=${disabled}
          @change=${(e: Event) => onChange(Number((e.target as HTMLInputElement).value))}
        />${field.unit ? html`<span class="unit">${field.unit}</span>` : nothing}`;
      case "entity":
        return html`<ha-entity-picker
          .hass=${this.hass}
          .value=${typeof value === "string" ? value : ""}
          .includeDomains=${field.entityDomain ? [field.entityDomain] : undefined}
          .disabled=${disabled}
          allow-custom-entity
          @value-changed=${(e: CustomEvent) => onChange(e.detail.value || null)}
        ></ha-entity-picker>`;
      case "media":
      case "text":
      default:
        return html`<input
          class="txt"
          type="text"
          .value=${typeof value === "string" ? value : ""}
          ?disabled=${disabled}
          @change=${(e: Event) => onChange((e.target as HTMLInputElement).value)}
        />`;
    }
  }

  private _renderGlobalRow(field: SettingField): TemplateResult {
    // Device-only fields (e.g. the media player) have no sensible global value.
    if (field.deviceOnly) {
      return html`
        <div class="row">
          <div class="row-label">
            <span>${field.label}</span>
            <span class="help">Set on the “This device” tab.</span>
            ${field.key === "media_player" ? this._mediaFallbackHint() : nothing}
          </div>
          <div class="row-control">
            ${this._renderControl(field, null, true, () => undefined)}
          </div>
        </div>
      `;
    }
    return html`
      <div class="row">
        <div class="row-label">
          <span>${field.label}</span>
          ${field.help ? html`<span class="help">${field.help}</span>` : nothing}
        </div>
        <div class="row-control">
          ${this._renderControl(field, this._globalValue(field.key), false, (v) =>
            this._setGlobal(field.key, v),
          )}
        </div>
      </div>
    `;
  }

  private _renderDeviceRow(field: SettingField): TemplateResult {
    const overriding = this._deviceOverriding(field.key);
    return html`
      <div class="row">
        <div class="row-label">
          <span>${field.label}</span>
          ${overriding ? nothing : html`<span class="inherit-tag">Inherited</span>`}
          ${field.key === "media_player" && !overriding ? this._mediaFallbackHint() : nothing}
        </div>
        <div class="row-control">
          ${this._renderControl(field, this._deviceValue(field.key), !overriding, (v) =>
            this._setDevice(field.key, v),
          )}
          <button
            class="ovr ${overriding ? "on" : ""}"
            title=${overriding ? "Overriding — click to inherit" : "Inheriting — click to override"}
            @click=${() => this._toggleOverride(field, !overriding)}
          >
            <ha-icon .icon=${overriding ? "mdi:link-off" : "mdi:link-variant"}></ha-icon>
          </button>
        </div>
      </div>
    `;
  }

  protected render(): TemplateResult | typeof nothing {
    const cfg = this._config;
    if (!cfg || !this.hass) return nothing;
    const theme = cfg.theme === "ted-style" ? "ted-style" : "ha";
    const showGlobal = cfg.show_global !== false;
    const showDevice = cfg.show_device !== false;
    const missing = !this.hass.states[SETTINGS_SENSOR];

    const cardStyle = appearanceStyle({
      background: cssColor(cfg.background),
      transparency: cfg.transparency,
      blur: cfg.blur,
    });
    const cardClasses = {
      "ted-card": true,
      [tedCardThemeClass(theme)]: true,
      "no-shadow": cfg.shadow === false,
    };

    const tab = !showGlobal ? "device" : !showDevice ? "global" : this._tab;
    const groups = fieldsByGroup();

    return html`
      <ha-card class=${classMap(cardClasses)} style=${styleMap(cardStyle)}>
        ${cfg.brushed ? brushedOverlay : nothing}
        <div class="head">
          <ha-icon icon="mdi:cog"></ha-icon>
          <span>${cfg.title ?? "Settings"}</span>
        </div>
        ${missing
          ? html`<div class="warn">Install the <b>Ted's Cards Backend</b> integration to use settings.</div>`
          : html`
              ${showGlobal && showDevice
                ? html`<div class="tabs" role="tablist">
                    <button class="tab ${tab === "global" ? "active" : ""}" @click=${() => (this._tab = "global")}>
                      Global
                    </button>
                    <button class="tab ${tab === "device" ? "active" : ""}" @click=${() => (this._tab = "device")}>
                      This device
                    </button>
                  </div>`
                : nothing}
              ${tab === "device"
                ? html`<div class="device-note">
                    Overrides apply to <b>this device only</b>. Un-overridden settings inherit the Global value.
                  </div>`
                : nothing}
              <div class="groups">
                ${groups.map(
                  (g) => html`
                    <div class="group">
                      <div class="group-title">${g.group}</div>
                      ${g.fields.map((f) =>
                        tab === "global" ? this._renderGlobalRow(f) : this._renderDeviceRow(f),
                      )}
                    </div>
                  `,
                )}
              </div>
            `}
      </ha-card>
    `;
  }

  public getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  static styles = [
    tedStyleTheme,
    css`
      :host {
        display: block;
        height: 100%;
      }
      ha-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        box-sizing: border-box;
        height: 100%;
        overflow-y: auto;
        color: var(--ted-style-text);
      }
      .head {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 1.1rem;
        font-weight: 600;
      }
      .head ha-icon {
        --mdc-icon-size: 22px;
        color: var(--ted-style-accent);
      }
      .warn {
        color: var(--ted-style-muted);
        font-size: 0.95rem;
      }
      .tabs {
        display: flex;
        gap: 4px;
        border-bottom: 1px solid var(--ted-style-divider);
      }
      .tab {
        font: inherit;
        font-weight: 600;
        font-size: 0.95rem;
        color: var(--ted-style-muted);
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        padding: 8px 14px 9px;
        cursor: pointer;
      }
      .tab.active {
        color: var(--ted-style-accent);
        border-bottom-color: var(--ted-style-accent);
      }
      .device-note {
        color: var(--ted-style-muted);
        font-size: 0.85rem;
      }
      .groups {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .group-title {
        font-size: 0.8rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--ted-style-muted);
        margin-bottom: 4px;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 6px 0;
        border-bottom: 1px solid color-mix(in srgb, var(--ted-style-divider) 60%, transparent);
      }
      .row-label {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .row-label > span:first-child {
        font-weight: 500;
      }
      .help {
        font-size: 0.78rem;
        color: var(--ted-style-muted);
      }
      .inherit-tag {
        font-size: 0.72rem;
        color: var(--ted-style-muted);
      }
      .row-control {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex: none;
      }
      input.num {
        width: 68px;
      }
      input.txt {
        width: 180px;
        max-width: 42vw;
      }
      input.num,
      input.txt {
        font: inherit;
        padding: 5px 8px;
        border-radius: 8px;
        border: 1px solid var(--ted-style-divider);
        background: var(--ted-style-surface-2);
        color: inherit;
      }
      .unit {
        color: var(--ted-style-muted);
        font-size: 0.85rem;
      }
      .pct {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .pct input {
        width: 130px;
      }
      .pct-val {
        width: 38px;
        text-align: right;
        color: var(--ted-style-muted);
        font-variant-numeric: tabular-nums;
      }
      .ovr {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: 8px;
        border: 1px solid var(--ted-style-divider);
        background: var(--ted-style-surface-2);
        color: var(--ted-style-muted);
        cursor: pointer;
      }
      .ovr.on {
        color: #fff;
        background: var(--ted-style-accent);
        border-color: var(--ted-style-accent);
      }
      .ovr ha-icon {
        --mdc-icon-size: 18px;
      }
    `,
  ];
}
