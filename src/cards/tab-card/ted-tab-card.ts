import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig, LovelaceCardEditor } from "custom-card-helpers";

import { appearanceStyle, cssColor } from "../../shared/appearance";
import { brushedOverlay, tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { computeTabOverflow, positionOverflowPopover } from "../../shared/tab-overflow";
import { registerCustomCard } from "../../shared/register-card";
import {
  DEFAULT_TAB_ICON,
  DEFAULT_TAB_PARAM,
  TAB_CARD_DESCRIPTION,
  TAB_CARD_EDITOR_TYPE,
  TAB_CARD_NAME,
  TAB_CARD_TYPE,
} from "./const";
import type { TabCardConfig, TabConfig, TabHeaderMode } from "./types";

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
  /** Effective header mode after any auto-shrink (may differ from the configured mode). */
  @state() private _effectiveMode: TabHeaderMode = "both";
  /** How many tabs fit in the strip; the rest go into the overflow menu. */
  @state() private _visibleCount = Number.POSITIVE_INFINITY;

  private _helpers?: CardHelpers;
  /** Embedded child cards, keyed by tab index. */
  private _tabEls = new Map<number, TabEntry>();
  private _lastPropagatedHass?: HomeAssistant;
  /** Watches the host width so the tab strip can re-measure its overflow. */
  private _resizeObserver?: ResizeObserver;

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
    this._resizeObserver = new ResizeObserver(() => this._measureOverflow());
    this._resizeObserver.observe(this);
    void this._loadHelpers();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("location-changed", this._onLocationChanged);
    window.removeEventListener("popstate", this._onLocationChanged);
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
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
    if (changed.has("_config")) {
      this._buildTabElements();
      // Re-measure from scratch: show every tab at the configured mode, then let
      // _measureOverflow() (run in updated()) shrink / route to the overflow menu.
      this._visibleCount = Number.POSITIVE_INFINITY;
      this._effectiveMode = this._config?.tab_header ?? "both";
    }
    if (changed.has("hass")) this._propagateHass();
  }

  protected updated(): void {
    this._measureOverflow();
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

    // Work out which tabs are shown inline vs. moved into the overflow menu. The active
    // tab is always kept visible (it displaces the last inline slot if it would overflow).
    const configMode: TabHeaderMode = cfg.tab_header ?? "both";
    const total = tabs.length;
    const visibleCount = Math.min(this._visibleCount, total);
    const overflow = showTabs && visibleCount < total;
    const visible: number[] = [];
    for (let i = 0; i < visibleCount; i++) visible.push(i);
    if (overflow && !visible.includes(activeIdx) && visible.length > 0) {
      visible[visible.length - 1] = activeIdx;
    }
    const visibleSet = new Set(visible);
    const overflowList: number[] = [];
    for (let i = 0; i < total; i++) if (!visibleSet.has(i)) overflowList.push(i);

    return html`
      <div class="tab-root ${tedCardThemeClass(theme)}" style=${styleMap(rootStyle)}>
        <div class="tab-surface ${shadow ? "" : "no-shadow"}" style=${styleMap(surfaceStyle)}>
          ${brushed ? brushedOverlay : nothing}
        </div>
        ${showTabs
          ? html`<div class="tab-strip" role="tablist">
                ${visible.map((idx) => this._renderTabButton(tabs[idx], idx, this._effectiveMode, idx === activeIdx))}
                ${overflow
                  ? html`<button
                      id="tab-overflow-btn"
                      type="button"
                      class="tab tab-overflow"
                      popovertarget="tab-overflow-pop"
                      title="More tabs"
                      aria-label="More tabs"
                    >
                      <ha-icon .icon=${"mdi:dots-horizontal"}></ha-icon>
                    </button>`
                  : nothing}
              </div>
              ${overflow
                ? html`<div
                    id="tab-overflow-pop"
                    class="tab-overflow-popover"
                    popover
                    @toggle=${this._onOverflowToggle}
                  >
                    ${overflowList.map(
                      (idx) => html`<button
                        type="button"
                        class="tab-overflow-item${idx === activeIdx ? " active" : ""}"
                        @click=${() => this._selectFromOverflow(idx)}
                      >
                        <ha-icon .icon=${tabs[idx].icon || DEFAULT_TAB_ICON}></ha-icon>
                        <span>${tabs[idx].label || `Tab ${idx + 1}`}</span>
                      </button>`,
                    )}
                  </div>`
                : nothing}
              ${this._renderMeasure(tabs, configMode)}`
          : nothing}
        <div class="panels">
          ${tabs.length === 0
            ? html`<div class="empty">No tabs configured.</div>`
            : tabs.map((tab, idx) => this._renderPanel(tab, idx, idx === activeIdx))}
        </div>
      </div>
    `;
  }

  /** One tab button, respecting the header mode (icon+name / icon / name). */
  private _renderTabButton(tab: TabConfig, idx: number, mode: TabHeaderMode, active: boolean): TemplateResult {
    const label = tab.label || `Tab ${idx + 1}`;
    const showIcon = mode !== "name";
    const showLabel = mode !== "icon";
    // In icon-only mode a tab without its own icon falls back to the placeholder.
    const icon = tab.icon || (mode === "icon" ? DEFAULT_TAB_ICON : undefined);
    return html`<button
      type="button"
      role="tab"
      class="tab${active ? " active" : ""}${mode === "icon" ? " icon-only" : ""}"
      aria-selected=${active ? "true" : "false"}
      title=${label}
      @click=${() => this._selectTab(idx)}
    >
      ${showIcon && icon ? html`<ha-icon .icon=${icon}></ha-icon>` : nothing}
      ${showLabel ? html`<span>${label}</span>` : nothing}
    </button>`;
  }

  /**
   * Hidden mirror of every tab rendered at both the configured mode and icon-only, used
   * purely to measure natural widths so overflow decisions don't depend on the live strip
   * (which avoids a render→measure→render feedback loop).
   */
  private _renderMeasure(tabs: TabConfig[], configMode: TabHeaderMode): TemplateResult {
    return html`<div class="tab-measure" aria-hidden="true">
      <div class="measure-row measure-full">
        ${tabs.map((tab, idx) => this._renderTabButton(tab, idx, configMode, false))}
      </div>
      <div class="measure-row measure-icon">
        ${tabs.map((tab, idx) => this._renderTabButton(tab, idx, "icon", false))}
      </div>
    </div>`;
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

  /**
   * Decide the effective header mode + how many tabs fit. Runs after every render (and on
   * resize). Reads widths from the hidden measurement mirror so the result is stable; only
   * writes state when it changes, so it converges in a single extra pass.
   */
  private _measureOverflow(): void {
    const cfg = this._config;
    if (!cfg) return;
    const tabs = cfg.tabs ?? [];
    const total = tabs.length;
    const showTabs = cfg.show_tabs !== false && total > 0;
    if (!showTabs) return;
    const root = this.renderRoot as ShadowRoot;
    const strip = root.querySelector(".tab-strip") as HTMLElement | null;
    const fullRow = root.querySelector(".measure-full") as HTMLElement | null;
    const iconRow = root.querySelector(".measure-icon") as HTMLElement | null;
    if (!strip || !fullRow || !iconRow) return;
    const available = strip.clientWidth;
    if (available <= 0) return;

    const { mode, visibleCount } = computeTabOverflow<TabHeaderMode>({
      fullWidths: Array.from(fullRow.children).map((c) => (c as HTMLElement).offsetWidth),
      iconWidths: Array.from(iconRow.children).map((c) => (c as HTMLElement).offsetWidth),
      available,
      configMode: cfg.tab_header ?? "both",
      iconMode: "icon",
      autoShrink: cfg.auto_shrink !== false,
    });
    if (mode !== this._effectiveMode) this._effectiveMode = mode;
    if (visibleCount !== this._visibleCount) this._visibleCount = visibleCount;
  }

  private _onOverflowToggle = (ev: Event): void => {
    const pop = ev.currentTarget as HTMLElement;
    if ((ev as Event & { newState?: string }).newState !== "open") return;
    const anchor = (this.renderRoot as ShadowRoot).getElementById("tab-overflow-btn");
    this._positionOverflow(pop, anchor ?? undefined);
  };

  /** Anchor the overflow popover under the "…" trigger (flipping above if there's no room). */
  private _positionOverflow(pop: HTMLElement, anchor?: HTMLElement): void {
    positionOverflowPopover(pop, anchor);
  }

  private _selectFromOverflow(idx: number): void {
    this._selectTab(idx);
    const pop = (this.renderRoot as ShadowRoot).getElementById("tab-overflow-pop") as
      | (HTMLElement & { hidePopover?: () => void })
      | null;
    pop?.hidePopover?.();
  }

  static styles = [
    tedStyleTheme,
    css`
      :host {
        display: block;
        height: 100%;
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
        flex-wrap: nowrap;
        gap: 4px;
        overflow: hidden;
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
      .tab.icon-only {
        padding-left: 12px;
        padding-right: 12px;
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
      /* "…" overflow trigger — shares the tab look, sits right after the last inline tab. */
      .tab-overflow ha-icon {
        --mdc-icon-size: 20px;
      }
      /* Off-screen mirror used only to measure natural tab widths. */
      .tab-measure {
        position: absolute;
        left: -9999px;
        top: 0;
        visibility: hidden;
        pointer-events: none;
      }
      .measure-row {
        display: flex;
        gap: 4px;
        white-space: nowrap;
      }
      /* Overflow menu — a top-layer popover so the strip's overflow:hidden can't clip it. */
      .tab-overflow-popover {
        position: fixed;
        margin: 0;
        inset: unset;
        border: 1px solid var(--ted-style-divider, var(--divider-color));
        border-radius: 10px;
        padding: 6px;
        background: color-mix(
          in srgb,
          var(--ted-style-surface, var(--ha-card-background, #fff)) var(--ted-card-bg-alpha, 100%),
          transparent
        );
        -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
        backdrop-filter: var(--ha-card-backdrop-filter, none);
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.28);
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 160px;
        max-height: 60vh;
        overflow: auto;
      }
      .tab-overflow-popover:not(:popover-open) {
        display: none;
      }
      .tab-overflow-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        font: inherit;
        font-weight: 600;
        color: var(--ted-style-text, var(--primary-text-color));
        background: transparent;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        text-align: left;
        white-space: nowrap;
      }
      .tab-overflow-item ha-icon {
        --mdc-icon-size: 20px;
        flex: none;
        color: var(--ted-style-muted, var(--secondary-text-color));
      }
      .tab-overflow-item:hover {
        background: color-mix(in srgb, var(--ted-style-accent, var(--primary-color)) 12%, transparent);
      }
      .tab-overflow-item.active,
      .tab-overflow-item.active ha-icon {
        color: var(--ted-style-accent, var(--primary-color));
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
