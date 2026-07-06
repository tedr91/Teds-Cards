import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig, LovelaceCardEditor } from "custom-card-helpers";

import { appearanceStyle, cssColor } from "../../shared/appearance";
import { brushedOverlay, tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { registerCustomCard } from "../../shared/register-card";
import {
  DEFAULT_TAB_PARAM,
  TAB_CARD_DESCRIPTION,
  TAB_CARD_EDITOR_TYPE,
  TAB_CARD_NAME,
  TAB_CARD_TYPE,
} from "./const";
import type { TabCardConfig, TabConfig } from "./types";

interface CardHelpers {
  createCardElement(config: LovelaceCardConfig): LovelaceCard;
}
declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
  }
}

interface TabEntry {
  el: LovelaceCard;
  json: string;
}

/** Subset of Home Assistant's LovelaceGridOptions. */
interface GridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  min_rows?: number;
}

registerCustomCard({
  type: TAB_CARD_TYPE,
  name: TAB_CARD_NAME,
  description: TAB_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/Teds-Cards#tab-card",
});

@customElement(TAB_CARD_TYPE)
export class TedTabCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-tab-card-editor");
    return document.createElement(TAB_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<TabCardConfig, "type"> {
    return {
      tabs: [
        { label: "Tab 1", slug: "tab-1" },
        { label: "Tab 2", slug: "tab-2" },
      ],
    };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: TabCardConfig;
  /** Index of the active tab. */
  @state() private _activeTab = 0;

  private _helpers?: CardHelpers;
  /** Embedded child cards, keyed by tab index. */
  private _tabEls = new Map<number, TabEntry>();
  private _lastPropagatedHass?: HomeAssistant;

  public setConfig(config: TabCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
    // Resolve the initial tab from the URL (deep link), else the configured default.
    const fromUrl = this._resolveTabFromUrl();
    if (fromUrl !== undefined) {
      this._activeTab = fromUrl;
    } else if (typeof config.default_tab === "number") {
      this._activeTab = config.default_tab;
    }
  }

  public getCardSize(): number {
    return 4;
  }

  public getGridOptions(): GridOptions {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("location-changed", this._onLocationChanged);
    window.addEventListener("popstate", this._onLocationChanged);
    void this._loadHelpers();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("location-changed", this._onLocationChanged);
    window.removeEventListener("popstate", this._onLocationChanged);
  }

  private _onLocationChanged = (): void => {
    // A deep link overrides a prior manual selection so notification taps work.
    const idx = this._resolveTabFromUrl();
    if (idx !== undefined && idx !== this._activeTab) {
      this._activeTab = idx;
    }
  };

  /** The active tab index encoded in the current URL, or undefined if none matches. */
  private _resolveTabFromUrl(): number | undefined {
    const cfg = this._config;
    if (!cfg) return undefined;
    const param = cfg.url_param || DEFAULT_TAB_PARAM;
    let raw: string | null = null;
    try {
      raw = new URLSearchParams(window.location.search).get(param);
    } catch {
      raw = null;
    }
    if (raw == null || raw === "") return undefined;
    const tabs = cfg.tabs ?? [];
    const bySlug = tabs.findIndex((t) => t.slug && t.slug === raw);
    if (bySlug >= 0) return bySlug;
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0 && n < tabs.length) return n;
    return undefined;
  }

  private _selectTab(index: number): void {
    this._activeTab = index;
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config")) this._buildTabElements();
    if (changed.has("hass")) this._propagateHass();
  }

  private async _loadHelpers(): Promise<void> {
    if (this._helpers || !window.loadCardHelpers) return;
    this._helpers = await window.loadCardHelpers();
    this._buildTabElements();
    this.requestUpdate();
  }

  /** (Re)build the cached child cards, reusing any whose config is unchanged. */
  private _buildTabElements(): void {
    if (!this._helpers || !this._config) return;
    const next = new Map<number, TabEntry>();
    (this._config.tabs ?? []).forEach((tab, idx) => {
      if (!tab.card) return;
      const json = JSON.stringify(tab.card);
      const existing = this._tabEls.get(idx);
      if (existing && existing.json === json) {
        next.set(idx, existing);
        return;
      }
      const el = this._helpers!.createCardElement(tab.card);
      (el as unknown as { layout?: string }).layout = "grid";
      if (this.hass) el.hass = this.hass;
      next.set(idx, { el, json });
    });
    this._tabEls = next;
    this._lastPropagatedHass = this.hass;
  }

  private _propagateHass(): void {
    if (this.hass === this._lastPropagatedHass) return;
    this._lastPropagatedHass = this.hass;
    for (const entry of this._tabEls.values()) {
      entry.el.hass = this.hass;
    }
  }

  protected render(): TemplateResult | typeof nothing {
    const cfg = this._config;
    if (!cfg) return nothing;

    const tabs = cfg.tabs ?? [];
    const activeIdx = Math.min(Math.max(this._activeTab, 0), Math.max(tabs.length - 1, 0));
    const theme = cfg.theme === "ted-style" ? "ted-style" : "ha";
    const shadow = cfg.shadow !== false;
    const brushed = cfg.brushed === true;
    const showTabs = cfg.show_tabs !== false && tabs.length > 0;
    const scale = typeof cfg.scale === "number" ? cfg.scale : 100;

    // The frosted surface is painted as an isolated background LAYER (a sibling of the
    // tab strip + panels), NOT as an ancestor of the child cards. A backdrop-filter on an
    // ancestor would become the containing block for a child card's position:fixed dialog
    // (trapping/clipping it inside the tab card); keeping it off the child chain lets those
    // modals cover the viewport. The theme-var class goes on the root (custom properties
    // don't establish a containing block).
    const rootStyle: Record<string, string> = {};
    if (scale !== 100) rootStyle.zoom = String(scale / 100);
    const surfaceStyle = appearanceStyle({
      background: cssColor(cfg.background),
      transparency: cfg.transparency,
      blur: cfg.blur,
    });

    return html`
      <div class="tab-root ${tedCardThemeClass(theme)}" style=${styleMap(rootStyle)}>
        <div class="tab-surface ${shadow ? "" : "no-shadow"}" style=${styleMap(surfaceStyle)}>
          ${brushed ? brushedOverlay : nothing}
        </div>
        ${showTabs
          ? html`<div class="tab-strip" role="tablist">
              ${tabs.map((tab, idx) => {
                const label = tab.label || `Tab ${idx + 1}`;
                return html`<button
                  type="button"
                  role="tab"
                  class="tab${idx === activeIdx ? " active" : ""}"
                  aria-selected=${idx === activeIdx ? "true" : "false"}
                  @click=${() => this._selectTab(idx)}
                >
                  ${tab.icon ? html`<ha-icon .icon=${tab.icon}></ha-icon>` : nothing}
                  <span>${label}</span>
                </button>`;
              })}
            </div>`
          : nothing}
        <div class="panels">
          ${tabs.length === 0
            ? html`<div class="empty">No tabs configured.</div>`
            : tabs.map((tab, idx) => this._renderPanel(tab, idx, idx === activeIdx))}
        </div>
      </div>
    `;
  }

  private _renderPanel(tab: TabConfig, idx: number, active: boolean): TemplateResult {
    const entry = this._tabEls.get(idx);
    return html`<div class="panel${active ? " active" : ""}" ?hidden=${!active} role="tabpanel">
      ${entry
        ? entry.el
        : tab.card
          ? html`<div class="empty">Loading…</div>`
          : html`<div class="empty">This tab has no card yet.</div>`}
    </div>`;
  }

  static styles = [
    tedStyleTheme,
    css`
      :host {
        display: block;
      }
      /* Root is a plain flow container: NO backdrop-filter / transform / contain, so it
         never becomes the containing block for a child card's position:fixed dialog. */
      .tab-root {
        position: relative;
        display: flex;
        flex-direction: column;
        height: 100%;
        box-sizing: border-box;
        padding: 12px;
        gap: 12px;
      }
      /* Frosted surface painted as an isolated layer behind the content — the only place
         the backdrop-filter lives, and it has no child-card descendants to trap. */
      .tab-surface {
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        overflow: hidden;
        border: 1px solid var(--ted-style-divider, var(--divider-color));
        border-radius: var(--ted-style-radius, 12px);
        background: color-mix(
          in srgb,
          var(--ted-style-surface, var(--ha-card-background, #fff)) var(--ted-card-bg-alpha, 100%),
          transparent
        );
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
        -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
        backdrop-filter: var(--ha-card-backdrop-filter, none);
      }
      .tab-surface.no-shadow {
        box-shadow: none;
      }
      .tab-strip {
        position: relative;
        z-index: 1;
        display: flex;
        gap: 4px;
        overflow-x: auto;
        scrollbar-width: none;
        border-bottom: 1px solid var(--ted-style-divider, var(--divider-color));
        flex: none;
      }
      .tab-strip::-webkit-scrollbar {
        display: none;
      }
      .tab {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px 9px;
        font: inherit;
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--ted-style-muted, var(--secondary-text-color));
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        cursor: pointer;
        white-space: nowrap;
        transition:
          color 0.16s ease,
          border-color 0.16s ease;
      }
      .tab ha-icon {
        --mdc-icon-size: 18px;
        flex: none;
      }
      .tab:hover {
        color: var(--ted-style-text, var(--primary-text-color));
      }
      .tab.active {
        color: var(--ted-style-accent, var(--primary-color));
        border-bottom-color: var(--ted-style-accent, var(--primary-color));
      }
      .panels {
        position: relative;
        z-index: 1;
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .panel {
        flex: 1 1 auto;
        min-height: 0;
      }
      .panel[hidden] {
        display: none;
      }
      .empty {
        padding: 16px;
        text-align: center;
        color: var(--ted-style-muted, var(--secondary-text-color));
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-tab-card": TedTabCard;
  }
}
