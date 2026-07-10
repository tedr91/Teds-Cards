import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardConfig,
  type LovelaceCardEditor,
} from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import { SettingsController, settingsStore } from "../../shared/settings";
import {
  CLIMATE_CARD_DESCRIPTION,
  CLIMATE_CARD_EDITOR_TYPE,
  CLIMATE_CARD_NAME,
  CLIMATE_CARD_TYPE,
} from "./const";
import type { ClimateCardConfig, ClimateLayout } from "./types";

// mdi:thermostat — empty-state illustration.
const THERMOSTAT_ICON =
  "M16.95,16.95C16.95,16.95 16.95,16.95 16.95,16.95C18.58,15.32 19.5,13.11 19.5,10.8C19.5,8.5 18.58,6.28 16.95,4.66C15.33,3.03 13.11,2.11 10.81,2.11C8.5,2.11 6.28,3.03 4.66,4.66L6.07,6.07C7.32,4.81 9.03,4.11 10.81,4.11C12.58,4.11 14.29,4.81 15.54,6.07C16.8,7.32 17.5,9.03 17.5,10.8C17.5,12.58 16.8,14.29 15.54,15.54L16.95,16.95M12,8A2,2 0 0,0 10,10C10,10.74 10.4,11.38 11,11.72V22H13V11.72C13.6,11.38 14,10.74 14,10A2,2 0 0,0 12,8Z";
// mdi:cog — empty-state "Settings" button.
const COG_ICON =
  "M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z";

/** Home Assistant's `loadCardHelpers()` return shape (only what this card uses). */
interface CardHelpers {
  createCardElement(config: LovelaceCardConfig): LovelaceCard;
}

/** Subset of Home Assistant's LovelaceGridOptions for the Sections grid layout. */
interface GridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  min_rows?: number;
}

const VALID_LAYOUTS: ClimateLayout[] = ["auto", "tabbed", "vertical", "horizontal"];

registerCustomCard({
  type: CLIMATE_CARD_TYPE,
  name: CLIMATE_CARD_NAME,
  description: CLIMATE_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/Teds-Cards#climate-card",
  getEntitySuggestion: (_hass, entityId) =>
    entityId.startsWith("climate.")
      ? { config: { type: `custom:${CLIMATE_CARD_TYPE}`, entities: [{ entity: entityId }] } }
      : null,
});

@customElement(CLIMATE_CARD_TYPE)
export class TedClimateCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-climate-card-editor");
    return document.createElement(CLIMATE_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(hass: HomeAssistant): Omit<ClimateCardConfig, "type"> {
    const climates = Object.keys(hass.states).filter((id) => id.startsWith("climate."));
    return { entities: climates[0] ? [{ entity: climates[0] }] : [] };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: ClimateCardConfig;
  @state() private _activeTab = 0;

  private _helpers?: CardHelpers;
  /** Embedded native thermostat cards, keyed by entity id (json guards rebuilds). */
  private _cards = new Map<string, { el: LovelaceCard; json: string }>();
  private _lastPropagatedHass?: HomeAssistant;

  public constructor() {
    super();
    // Keep this device's settings live so `climate_source: settings` stays in sync.
    new SettingsController(this, () => this.hass);
  }

  public connectedCallback(): void {
    super.connectedCallback();
    void this._loadHelpers();
  }

  public setConfig(config: ClimateCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    const fromSettings = config.climate_source === "settings";
    if (!fromSettings && (!Array.isArray(config.entities) || config.entities.length === 0)) {
      throw new Error("You must specify at least one climate entity");
    }
    for (const id of this._configEntities(config)) {
      const domain = id.split(".")[0];
      if (domain !== "climate") {
        throw new Error(`ted-climate-card only supports climate entities (got '${domain}')`);
      }
    }
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 6;
  }

  public getGridOptions(): GridOptions {
    return { columns: 12, rows: "auto", min_columns: 4, min_rows: 3 };
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
    if (changed.has("hass")) this._propagateHass();
  }

  // --- Entity resolution -----------------------------------------------------

  /** The raw entity ids from a config's `entities` (strings or `{entity}`). */
  private _configEntities(config?: ClimateCardConfig): string[] {
    return (config?.entities ?? [])
      .map((e) => (typeof e === "string" ? e : e?.entity))
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  }

  /** Resolve this device's thermostats from settings: the device's curated subset
   *  (else the global available list), always limited to the global allow-list. */
  private _settingsEntities(): string[] {
    const asIds = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    const global = asIds(settingsStore.globalSettings().climate_list);
    const device = settingsStore.deviceSettings();
    const chosen = "climate_list" in device ? asIds(device.climate_list) : global;
    return global.length ? chosen.filter((id) => global.includes(id)) : chosen;
  }

  /** The thermostats to show, in order — from config or this device's settings. */
  private _entities(): string[] {
    if (this._config?.climate_source === "settings") return this._settingsEntities();
    return this._configEntities(this._config);
  }

  /** The effective layout. In settings mode (and when the card doesn't pin `layout`),
   *  it comes from this device's `climate_layout` setting; otherwise the card config. */
  private _effectiveLayout(): ClimateLayout {
    if (this._config?.climate_source === "settings" && this._config?.layout === undefined) {
      const s = settingsStore.effective().climate_layout;
      if (typeof s === "string" && (VALID_LAYOUTS as string[]).includes(s)) {
        return s as ClimateLayout;
      }
    }
    return this._config?.layout ?? "auto";
  }

  // --- Embedded native thermostat cards --------------------------------------

  private _childConfig(entity: string): LovelaceCardConfig {
    return {
      type: "thermostat",
      entity,
      show_current_as_primary: this._config?.show_current_as_primary !== false,
    };
  }

  /** (Re)build the embedded thermostat cards, reusing unchanged ones. */
  private _buildCards(): void {
    if (!this._helpers) return;
    const entities = this._entities();
    const next = new Map<string, { el: LovelaceCard; json: string }>();
    for (const entity of entities) {
      const cfg = this._childConfig(entity);
      const json = JSON.stringify(cfg);
      const existing = this._cards.get(entity);
      if (existing && existing.json === json) {
        next.set(entity, existing);
        continue;
      }
      const el = this._helpers.createCardElement(cfg);
      if (this.hass) el.hass = this.hass;
      next.set(entity, { el, json });
    }
    this._cards = next;
    if (this._activeTab >= entities.length) this._activeTab = Math.max(0, entities.length - 1);
  }

  private _propagateHass(): void {
    if (!this.hass || this.hass === this._lastPropagatedHass) return;
    this._lastPropagatedHass = this.hass;
    for (const entry of this._cards.values()) entry.el.hass = this.hass;
  }

  private _entityName(id: string): string {
    const fn = this.hass?.states[id]?.attributes?.friendly_name;
    return typeof fn === "string" && fn ? fn : id;
  }

  // --- Render ----------------------------------------------------------------

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;
    const entities = this._entities();
    if (entities.length === 0) {
      return this._config.climate_source === "settings" ? this._renderEmpty() : nothing;
    }
    if (!this._helpers) return html`<div class="loading"></div>`;
    return this._renderLayout(entities);
  }

  private _renderLayout(entities: string[]): TemplateResult {
    const layout = this._effectiveLayout();

    if (layout === "tabbed") {
      const active = Math.min(this._activeTab, entities.length - 1);
      return html`
        <div class="tabbed">
          <div class="tabs" role="tablist">
            ${entities.map(
              (id, idx) => html`
                <button
                  type="button"
                  role="tab"
                  class=${classMap({ tab: true, active: idx === active })}
                  aria-selected=${idx === active ? "true" : "false"}
                  @click=${() => {
                    this._activeTab = idx;
                  }}
                >
                  ${this._entityName(id)}
                </button>
              `,
            )}
          </div>
          <div class="tab-panel">${this._cards.get(entities[active])?.el ?? nothing}</div>
        </div>
      `;
    }

    const cls = classMap({
      list: true,
      auto: layout === "auto",
      vertical: layout === "vertical",
      horizontal: layout === "horizontal",
    });
    return html`
      <div class=${cls}>
        ${entities.map((id) => html`<div class="item">${this._cards.get(id)?.el ?? nothing}</div>`)}
      </div>
    `;
  }

  // --- Empty-state (settings mode) -------------------------------------------

  private _settingsPath(): string {
    const root = String(settingsStore.effective().dashboard_root ?? "ted-dashboard");
    const raw = this._config?.settings_path || "[root]/settings?tab=temperatures";
    let path = raw.replace("[root]", root);
    if (!path.startsWith("/")) path = `/${path}`;
    return path;
  }

  private _openSettings = (): void => {
    const path = this._settingsPath();
    window.history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
  };

  private _renderEmpty(): TemplateResult {
    const title = this._config?.empty_title ?? "No thermostats yet";
    const message =
      this._config?.empty_message ??
      "This device hasn't been given any thermostats. Open Settings to choose which ones to show.";
    return html`
      <div class="empty">
        <ha-svg-icon class="empty-icon" .path=${THERMOSTAT_ICON}></ha-svg-icon>
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
      display: block;
      height: 100%;
    }
    /* The child thermostat cards bring their own <ha-card> surface, so this card is a
       transparent layout container only — no wrapping ha-card (avoids double borders and
       backdrop-filter/transform clipping of the child cards). */
    .list {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      gap: 12px;
    }
    .list.auto {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      grid-auto-rows: min-content;
      overflow-y: auto;
      align-content: start;
    }
    .list.vertical {
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }
    .list.horizontal {
      display: flex;
      flex-direction: row;
      overflow-x: auto;
    }
    .list.horizontal .item {
      flex: 0 0 320px;
      max-width: 90%;
    }
    .item {
      min-width: 0;
    }
    .item > * {
      height: 100%;
    }
    /* Tabbed layout */
    .tabbed {
      display: flex;
      flex-direction: column;
      height: 100%;
      box-sizing: border-box;
    }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
      flex: 0 0 auto;
    }
    .tab {
      appearance: none;
      border: none;
      cursor: pointer;
      font: inherit;
      padding: 6px 14px;
      border-radius: 999px;
      color: var(--secondary-text-color);
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.15));
    }
    .tab.active {
      color: var(--text-primary-color, #fff);
      background: var(--primary-color);
    }
    .tab-panel {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
    }
    .tab-panel > * {
      height: 100%;
    }
    /* Empty state */
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      height: 100%;
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
      max-width: 320px;
      line-height: 1.4;
    }
    .empty-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
      padding: 8px 18px;
      border: none;
      border-radius: 999px;
      cursor: pointer;
      font: inherit;
      color: var(--text-primary-color, #fff);
      background: var(--primary-color);
    }
    .loading {
      height: 100%;
    }
  `;
}
