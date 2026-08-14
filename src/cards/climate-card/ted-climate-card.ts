import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardConfig,
  type LovelaceCardEditor,
} from "custom-card-helpers";

import { themedIcon } from "../../shared/icons";
import { SettingsController, settingsStore } from "../../shared/settings";
import {
  CLIMATE_CARD_EDITOR_TYPE,
  CLIMATE_CARD_TYPE,
} from "./const";
import type { ClimateCardConfig, ClimateLayout } from "./types";

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
  /** The empty-state messagebox child (built once via loadCardHelpers, json-guarded). */
  private _emptyCard?: LovelaceCard;
  private _emptyJson?: string;
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
    if (this._emptyCard) this._emptyCard.hass = this.hass;
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
      if (this._config.climate_source !== "settings") return nothing;
      if (!this._helpers) return html`<div class="loading"></div>`;
      return this._renderEmpty();
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
    const raw = this._config?.settings_path || "[root]/settings?tab=thermostats";
    let path = raw.replace("[root]", root);
    if (!path.startsWith("/")) path = `/${path}`;
    return path;
  }

  /** Config for the empty-state messagebox (rendered as a real ted-messagebox-card
   *  so the empty state matches the other cards' empty states). */
  private _emptyConfig(): LovelaceCardConfig {
    const title = this._config?.empty_title ?? "No thermostats yet";
    const message =
      this._config?.empty_message ??
      "This device hasn't been given any thermostats. Open Settings to choose which ones to show.";
    return {
      type: "custom:ted-messagebox-card",
      theme: this._config?.theme === "ted-style" ? "ted-style" : "ha",
      severity: "info",
      icon: themedIcon("thermostat"),
      title,
      message,
      actions: [
        {
          label: "Settings",
          icon: themedIcon("settings"),
          action: "navigate",
          navigation_path: this._settingsPath(),
          variant: "primary",
        },
      ],
    };
  }

  private _renderEmpty(): TemplateResult {
    const cfg = this._emptyConfig();
    const json = JSON.stringify(cfg);
    if (!this._emptyCard || this._emptyJson !== json) {
      this._emptyCard = this._helpers!.createCardElement(cfg);
      this._emptyJson = json;
    }
    if (this.hass) this._emptyCard.hass = this.hass;
    return html`<div class="empty-wrap">${this._emptyCard}</div>`;
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
    /* Empty state — a centered ted-messagebox-card. */
    .empty-wrap {
      box-sizing: border-box;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
    }
    .empty-wrap > * {
      width: min(520px, 100%);
    }
    .loading {
      height: 100%;
    }
  `;
}
