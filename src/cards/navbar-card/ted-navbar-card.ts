import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
  LovelaceCardEditor,
} from "custom-card-helpers";

import { appearanceStyle, cssColor } from "../../shared/appearance";
import { registerCustomCard } from "../../shared/register-card";
import { tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { renderStatusItem, type StatusItemContext } from "../../shared/status-items/render";
import { StatusSliderController } from "../../shared/status-items/slider-controller";
import { statusItemStyles } from "../../shared/status-items/styles";
import type { StatusItem } from "../../shared/status-items/types";
import {
  DEFAULT_NAVBAR_MAX_WIDTH,
  DEFAULT_NAVBAR_MIN_WIDTH,
  DEFAULT_NAVBAR_SIZE,
  NAVBAR_CARD_DESCRIPTION,
  NAVBAR_CARD_EDITOR_TYPE,
  NAVBAR_CARD_NAME,
  NAVBAR_CARD_TYPE,
} from "./const";
import { detectEditOrPreview, forceNavbarPadding, removeNavbarPadding } from "./navbar-dom";
import type { NavButtonConfig, NavItem, NavPopupConfig, NavSection, NavZone, NavbarCardConfig } from "./types";

interface CardHelpers {
  createCardElement(config: LovelaceCardConfig): LovelaceCard;
}
declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
  }
}

interface ButtonEntry {
  el: LovelaceCard;
  json: string;
}

const ZONES: NavZone[] = ["left", "center", "right"];

registerCustomCard({
  type: NAVBAR_CARD_TYPE,
  name: NAVBAR_CARD_NAME,
  description: NAVBAR_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/HA-Teds-Cards#navbar-card",
});

@customElement(NAVBAR_CARD_TYPE)
export class TedNavbarCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-navbar-card-editor");
    return document.createElement(NAVBAR_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<NavbarCardConfig, "type"> {
    return {
      sections: [
        {
          placement: "center",
          align: "center",
          buttons: [
            {
              type: "custom:ted-label-button-card",
              name: "Home",
              icon: "mdi:home",
              theme: "ha",
              neumorphic: false,
              transparency: 100,
            },
          ],
        },
      ],
    };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: NavbarCardConfig;

  private _helpers?: CardHelpers;
  private _buttonEls = new Map<string, ButtonEntry>();
  private _editMode = false;
  /** Shared controller for status-item brightness/volume popovers. */
  private _slider = new StatusSliderController(this);
  /** Interval id that re-renders live time/date items. */
  private _clockTimer?: number;
  /** Per-section (config index) visible item count when overflow trims the tail. */
  private _visible = new Map<number, number>();
  private _resizeRaf?: number;

  public setConfig(config: NavbarCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
    if (this._helpers) this._buildButtonElements();
  }

  public getCardSize(): number {
    return 1;
  }

  public getGridOptions() {
    return { columns: "full", rows: 1, min_rows: 1, max_rows: 1 };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._editMode = detectEditOrPreview(this);
    void this._loadHelpers();
    this._applyPadding();
    this._syncClockTimer();
    window.addEventListener("resize", this._onResize);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    removeNavbarPadding();
    window.removeEventListener("resize", this._onResize);
    if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
    if (this._clockTimer !== undefined) {
      window.clearInterval(this._clockTimer);
      this._clockTimer = undefined;
    }
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config")) {
      this._visible.clear();
      this._buildButtonElements();
      this._applyPadding();
      this._syncClockTimer();
    }
    if (changed.has("hass")) this._propagateHass();
  }

  private async _loadHelpers(): Promise<void> {
    if (this._helpers || !window.loadCardHelpers) return;
    this._helpers = await window.loadCardHelpers();
    this._buildButtonElements();
    this.requestUpdate();
  }

  private _thickness(): number {
    return typeof this._config?.size === "number" ? this._config.size : DEFAULT_NAVBAR_SIZE;
  }

  private _alignment(): "top" | "bottom" {
    return this._config?.alignment === "top" ? "top" : "bottom";
  }

  private _barType(): "snap" | "float" {
    return this._config?.bar_type === "float" ? "float" : "snap";
  }

  private _minWidth(): number {
    return typeof this._config?.min_width === "number" ? this._config.min_width : DEFAULT_NAVBAR_MIN_WIDTH;
  }

  private _maxWidth(): number {
    return typeof this._config?.max_width === "number" ? this._config.max_width : DEFAULT_NAVBAR_MAX_WIDTH;
  }

  /** Reserve view padding so dashboard content isn't hidden under the bar. */
  private _applyPadding(): void {
    const margin = this._barType() === "float" ? 16 : 0;
    forceNavbarPadding({
      alignment: this._alignment(),
      px: this._thickness() + margin,
      enabled: !this._editMode,
    });
  }

  /** (Re)build cached embedded button cards, reusing those whose config is unchanged. */
  private _buildButtonElements(): void {
    if (!this._helpers || !this._config) return;
    const next = new Map<string, ButtonEntry>();
    (this._config.sections ?? []).forEach((section, sIdx) => {
      this._collectButtonEls(this._sectionItems(section), `${sIdx}`, next);
    });
    this._buttonEls = next;
  }

  /** Recursively (re)build embedded button cards for items and popup sub-items. */
  private _collectButtonEls(items: NavItem[], pathBase: string, next: Map<string, ButtonEntry>): void {
    items.forEach((item, idx) => {
      if (this._isPopup(item)) {
        this._collectButtonEls(item.items ?? [], `${pathBase}:${idx}`, next);
        return;
      }
      if (!this._isButton(item)) return;
      const key = `${pathBase}:${idx}`;
      const cardConfig = this._buttonCardConfig(item);
      const json = JSON.stringify(cardConfig);
      const existing = this._buttonEls.get(key);
      if (existing && existing.json === json) {
        next.set(key, existing);
        return;
      }
      const el = this._helpers!.createCardElement(cardConfig);
      // Render buttons as grid items so the embedded card fills its cell.
      (el as unknown as { layout?: string }).layout = "grid";
      if (this.hass) el.hass = this.hass;
      next.set(key, { el, json });
    });
  }

  /** Strip the nav-only sizing key so the embedded label-button card stays clean. */
  private _buttonCardConfig(button: NavButtonConfig): LovelaceCardConfig {
    const { nav_button_size, ...cardConfig } = button;
    void nav_button_size;
    return cardConfig as LovelaceCardConfig;
  }

  /** A section's ordered items, falling back to the legacy buttons-only list. */
  private _sectionItems(section: NavSection): NavItem[] {
    return section.items ?? section.buttons ?? [];
  }

  /** A nav item is a button when its `type` is an embeddable `custom:` card. */
  private _isButton(item: NavItem): item is NavButtonConfig {
    return typeof item.type === "string" && item.type.startsWith("custom:");
  }

  /** A nav item is a popup when its `type` is "popup". */
  private _isPopup(item: NavItem): item is NavPopupConfig {
    return item.type === "popup";
  }

  /** Flatten a section's items, recursively including popup sub-items. */
  private _allItems(items: NavItem[]): NavItem[] {
    const out: NavItem[] = [];
    for (const item of items) {
      out.push(item);
      if (this._isPopup(item)) out.push(...this._allItems(item.items ?? []));
    }
    return out;
  }

  /** Re-render once a second while any live time/date item is present. */
  private _syncClockTimer(): void {
    const ticking = (this._config?.sections ?? [])
      .flatMap((s) => this._allItems(this._sectionItems(s)))
      .some((i) => i.type === "time" || i.type === "date");
    if (ticking && this._clockTimer === undefined) {
      this._clockTimer = window.setInterval(() => this.requestUpdate(), 1000);
    } else if (!ticking && this._clockTimer !== undefined) {
      window.clearInterval(this._clockTimer);
      this._clockTimer = undefined;
    }
  }

  private _lastPropagatedHass?: HomeAssistant;
  private _propagateHass(): void {
    if (!this.hass || this.hass === this._lastPropagatedHass) return;
    this._lastPropagatedHass = this.hass;
    for (const entry of this._buttonEls.values()) entry.el.hass = this.hass;
  }

  protected updated(): void {
    this._measureOverflow();
  }

  private _zoneOf(section: NavSection): NavZone {
    return ZONES.includes(section.placement as NavZone) ? (section.placement as NavZone) : "left";
  }

  /** Re-measure overflow on viewport resize, resetting trims so sections can regrow. */
  private _onResize = (): void => {
    if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
    this._resizeRaf = requestAnimationFrame(() => {
      this._resizeRaf = undefined;
      const had = this._visible.size > 0;
      this._visible.clear();
      if (had) this.requestUpdate();
      else this._measureOverflow();
    });
  };

  /**
   * Trim each section's trailing items into a “…” overflow popup when they don't fit.
   * Only sections currently showing all items (no map entry) are measured; a trim sticks
   * until the next reset (viewport resize or config change) so we never loop. Budget
   * model: the center zone keeps its natural width and the left/right zones split the
   * rest of the card — a deliberate approximation on this overlapping-zone bar.
   */
  private _measureOverflow(): void {
    if (this._editMode || !this._config) return;
    const root = this.renderRoot as ShadowRoot | undefined;
    const card = root?.querySelector?.(".navbar-card") as HTMLElement | null;
    if (!card || card.clientWidth === 0) return;
    const cs = getComputedStyle(card);
    const cardInner = card.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const gap = 8;
    const centerEl = root?.querySelector?.(".zone.center") as HTMLElement | null;
    const centerW = centerEl ? centerEl.offsetWidth : 0;

    // Which zones are occupied, and how many sections share each (to split its budget).
    const sections = this._config.sections ?? [];
    const perZone = new Map<NavZone, number>();
    sections.forEach((section) => {
      if (section.visible === false || this._sectionItems(section).length === 0) return;
      const zone = this._zoneOf(section);
      perZone.set(zone, (perZone.get(zone) ?? 0) + 1);
    });
    const occ = (z: NavZone): boolean => (perZone.get(z) ?? 0) > 0;
    /** Width a single zone may use before its items overflow. */
    const zoneBudget = (zone: NavZone): number => {
      if (zone === "center") return cardInner;
      if (occ("center")) return (cardInner - centerW) / 2 - gap;
      const other: NavZone = zone === "left" ? "right" : "left";
      return occ(other) ? cardInner / 2 - gap : cardInner;
    };

    const triggerW = this._thickness() - 12 + gap;
    let changed = false;
    sections.forEach((section, sIdx) => {
      if (this._visible.has(sIdx)) return; // already trimmed; wait for a reset
      if (section.overflow === false) return;
      const items = this._sectionItems(section);
      if (items.length === 0) return;
      const el = root?.querySelector?.(`.section[data-sidx="${sIdx}"]`) as HTMLElement | null;
      if (!el) return;
      const zone = this._zoneOf(section);
      const inZone = perZone.get(zone) ?? 1;
      const budget = Math.max(0, zoneBudget(zone) / inZone);
      // One element per item (popover children are display:none — skip them).
      const els = (Array.from(el.children) as HTMLElement[]).filter((c) => !c.hasAttribute("popover"));
      let total = 0;
      els.forEach((c, i) => (total += c.offsetWidth + (i > 0 ? gap : 0)));
      if (total <= budget) return; // fits — keep showing all items
      let used = 0;
      let vis = 0;
      for (let i = 0; i < els.length; i += 1) {
        const w = els[i].offsetWidth + (i > 0 ? gap : 0);
        if (used + w + triggerW > budget) break;
        used += w;
        vis += 1;
      }
      this._visible.set(sIdx, vis);
      changed = true;
    });
    if (changed) this.requestUpdate();
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;
    const theme = this._config.theme === "ted-style" ? "ted-style" : "ha";
    const navBg = cssColor(this._config.background);
    const cardStyle: Record<string, string> = appearanceStyle({
      background: navBg,
      transparency: this._config.transparency ?? (navBg ? 0 : 100),
      blur: this._config.blur,
    });
    if (this._barType() === "float") {
      cardStyle["min-width"] = `${this._minWidth()}px`;
      cardStyle["max-width"] = `${this._maxWidth()}px`;
    }
    const sections = this._config.sections ?? [];
    const byZone: Record<NavZone, Array<{ section: NavSection; idx: number }>> = {
      left: [],
      center: [],
      right: [],
    };
    sections.forEach((section, idx) => {
      if (section.visible === false) return;
      const zone = ZONES.includes(section.placement as NavZone)
        ? (section.placement as NavZone)
        : "left";
      byZone[zone].push({ section, idx });
    });

    // Center-only float bars shrink to fit their buttons; bars with left/right
    // items stay full width so those items can pin to the edges.
    const hasSides =
      byZone.left.some(({ section }) => this._sectionItems(section).length > 0) ||
      byZone.right.some(({ section }) => this._sectionItems(section).length > 0);
    const hug = this._barType() === "float" && !hasSides;

    const navClasses = {
      navbar: true,
      [this._alignment()]: true,
      [this._barType()]: true,
      "edit-mode": this._editMode,
    };

    return html`
      <div
        class=${classMap(navClasses)}
        style=${styleMap({ "--nav-size": `${this._thickness()}px` })}
      >
        <ha-card class="navbar-card ${tedCardThemeClass(theme)}${hug ? " hug" : ""}" style=${styleMap(cardStyle)}>
          ${ZONES.map(
            (zone) => html`
              <div class="zone ${zone}">
                ${byZone[zone].map(({ section, idx }) => this._renderSection(section, idx))}
              </div>
            `,
          )}
        </ha-card>
      </div>
    `;
  }

  private _renderSection(section: NavSection, sIdx: number): TemplateResult {
    const align = section.align ?? "center";
    const items = this._sectionItems(section);
    const vis = this._visible.get(sIdx);
    const trim = vis !== undefined && vis < items.length && section.overflow !== false;
    const visible = trim ? items.slice(0, vis) : items;
    const hidden = trim ? items.slice(vis) : [];
    return html`
      <div class="section align-${align}" data-sidx=${sIdx}>
        ${this._renderItems(visible, `${sIdx}`, `nav-${sIdx}`)}
        ${hidden.length ? this._renderOverflow(sIdx, hidden, visible.length) : nothing}
      </div>
    `;
  }

  /** The “…” trigger + popover holding a section's overflowed tail items. */
  private _renderOverflow(sIdx: number, hidden: NavItem[], offset: number): TemplateResult {
    const popId = `nav-${sIdx}-overflow`;
    const anchorId = `${popId}-btn`;
    return html`
      <button id=${anchorId} class="nav-button nav-popup" popovertarget=${popId} title="More" aria-label="More">
        <ha-icon .icon=${"mdi:dots-horizontal"}></ha-icon>
      </button>
      <div id=${popId} class="nav-popover" popover data-anchor=${anchorId} @toggle=${this._onPopoverToggle}>
        <div class="nav-popover-body">${this._renderItems(hidden, `${sIdx}`, `nav-${sIdx}`, offset)}</div>
      </div>
    `;
  }

  /**
   * Render an ordered list of nav items within a container (a section or a popup).
   * `pathBase` keys embedded button cards; `idBase` namespaces popover ids; `offset`
   * keeps absolute indices when rendering an overflowed tail.
   */
  private _renderItems(items: NavItem[], pathBase: string, idBase: string, offset = 0): TemplateResult[] {
    return items.map((item, i) => {
      const idx = offset + i;
      if (this._isButton(item)) return this._renderButton(`${pathBase}:${idx}`, item);
      if (this._isPopup(item)) return this._renderPopup(item, pathBase, idBase, idx);
      return this._renderStatusItem(item as StatusItem, idBase, idx);
    });
  }

  private _renderButton(path: string, button: NavButtonConfig): TemplateResult {
    const entry = this._buttonEls.get(path);
    const wide = button.nav_button_size === "wide";
    return html`<div class="nav-button ${wide ? "wide" : ""}">${entry ? entry.el : nothing}</div>`;
  }

  private _renderStatusItem(item: StatusItem, keyPrefix: string, idx: number): TemplateResult {
    if (!this.hass) return html`<div class="nav-status"></div>`;
    const ctx: StatusItemContext = {
      hass: this.hass,
      slider: this._slider,
      keyPrefix,
    };
    return html`<div class="nav-status">${renderStatusItem(item, ctx, idx)}</div>`;
  }

  /** A tappable icon that opens a native popover holding more nav items. */
  private _renderPopup(popup: NavPopupConfig, pathBase: string, idBase: string, idx: number): TemplateResult {
    const wide = popup.nav_button_size === "wide";
    const popId = `${idBase}-popup-${idx}`;
    const anchorId = `${popId}-btn`;
    const label = popup.name ?? "More";
    return html`
      <button
        id=${anchorId}
        class="nav-button nav-popup ${wide ? "wide" : ""}"
        popovertarget=${popId}
        title=${label}
        aria-label=${label}
      >
        <ha-icon .icon=${popup.icon ?? "mdi:dots-horizontal"}></ha-icon>
      </button>
      <div id=${popId} class="nav-popover" popover data-anchor=${anchorId} @toggle=${this._onPopoverToggle}>
        <div class="nav-popover-body">
          ${this._renderItems(popup.items ?? [], `${pathBase}:${idx}`, `${idBase}-${idx}`)}
        </div>
      </div>
    `;
  }

  /** Reposition a popup popover against its trigger when it opens. */
  private _onPopoverToggle = (ev: Event): void => {
    const popover = ev.currentTarget as HTMLElement;
    if ((ev as Event & { newState?: string }).newState !== "open") return;
    const anchorId = popover.dataset.anchor;
    const anchor = anchorId ? (this.renderRoot as ShadowRoot).getElementById(anchorId) : null;
    this._positionPopover(popover, anchor ?? undefined);
  };

  /** Center a popover over its trigger, opening above a bottom bar / below a top bar. */
  private _positionPopover(popover: HTMLElement, anchor?: HTMLElement): void {
    const margin = 8;
    const rect = popover.getBoundingClientRect();
    popover.style.position = "fixed";
    popover.style.margin = "0";
    if (!anchor) {
      popover.style.left = `${Math.round((window.innerWidth - rect.width) / 2)}px`;
      popover.style.top = `${Math.round((window.innerHeight - rect.height) / 2)}px`;
      return;
    }
    const a = anchor.getBoundingClientRect();
    let left = a.left + a.width / 2 - rect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
    const preferAbove = this._alignment() === "bottom";
    const fitsAbove = a.top - margin - rect.height >= margin;
    const fitsBelow = a.bottom + margin + rect.height <= window.innerHeight - margin;
    let top = preferAbove ? a.top - margin - rect.height : a.bottom + margin;
    if (preferAbove && !fitsAbove && fitsBelow) top = a.bottom + margin;
    else if (!preferAbove && !fitsBelow && fitsAbove) top = a.top - margin - rect.height;
    top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }

  static styles = [
    tedStyleTheme,
    statusItemStyles,
    css`
      :host {
        display: block;
      }

      .navbar {
        position: fixed;
        left: 0;
        right: 0;
        z-index: 5;
        pointer-events: none;
        box-sizing: border-box;
      }
      .navbar.bottom {
        bottom: 0;
      }
      .navbar.top {
        top: 0;
      }
      .navbar.float {
        padding: 8px;
      }
      /* In the editor / card picker preview, sit inline instead of overlaying. */
      .navbar.edit-mode {
        position: static;
      }

      .navbar-card {
        position: relative;
        pointer-events: auto;
        height: var(--nav-size);
        box-sizing: border-box;
        border-radius: 0;
        overflow: visible;
      }
      .navbar.float .navbar-card {
        margin: 0 auto;
        border-radius: var(--ted-style-radius, 12px);
      }
      /* Center-only float bars hug their content (just wider than the buttons),
         still capped by the configured min/max width. With left/right items the
         bar stays full width so those items can pin to the edges. */
      .navbar.float .navbar-card.hug {
        display: flex;
        align-items: center;
        justify-content: center;
        width: fit-content;
        padding: 0 12px;
      }
      .navbar.float .navbar-card.hug .zone.left,
      .navbar.float .navbar-card.hug .zone.right {
        display: none;
      }
      .navbar.float .navbar-card.hug .zone.center {
        position: static;
        transform: none;
      }

      /* Three zones: left pinned to the left edge, right to the right edge, and
         center pinned to the exact horizontal center (independent of side widths). */
      .zone {
        position: absolute;
        top: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .zone.left {
        left: 10px;
      }
      .zone.right {
        right: 10px;
      }
      .zone.center {
        left: 50%;
        transform: translateX(-50%);
      }

      .section {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 100%;
      }
      .section.align-left {
        justify-content: flex-start;
      }
      .section.align-center {
        justify-content: center;
      }
      .section.align-right {
        justify-content: flex-end;
      }

      .nav-button {
        height: calc(var(--nav-size) - 12px);
        width: calc(var(--nav-size) - 12px);
        flex: none;
      }
      .nav-button.wide {
        width: calc((var(--nav-size) - 12px) * 2 + 8px);
      }
      .nav-status {
        display: inline-flex;
        align-items: center;
        height: 100%;
        flex: none;
      }

      /* Popup trigger: an icon button styled like a nav button. */
      .nav-popup {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid var(--ted-style-divider);
        border-radius: var(--ted-style-radius-sm, 10px);
        background-color: var(--ted-style-surface);
        background-image: linear-gradient(var(--ted-style-surface-2), var(--ted-style-surface-2));
        color: var(--ted-style-muted);
        cursor: pointer;
        transition: color 0.18s ease, border-color 0.18s ease, transform 0.08s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .nav-popup ha-icon {
        --mdc-icon-size: calc((var(--nav-size) - 12px) * 0.55);
      }
      .nav-popup:hover {
        color: var(--ted-style-text);
        border-color: color-mix(in srgb, var(--ted-style-accent) 50%, var(--ted-style-divider));
      }
      .nav-popup:active {
        transform: scale(0.96);
      }

      /* Native popover holding a popup's (or the overflow's) items. */
      .nav-popover {
        position: fixed;
        inset: auto;
        margin: 0;
        box-sizing: border-box;
        padding: 10px;
        background: var(--ted-style-surface);
        border: 1px solid var(--ted-style-divider);
        border-radius: var(--ted-style-radius-sm);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
      }
      .nav-popover::backdrop {
        background: transparent;
      }
      .nav-popover-body {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        max-width: 80vw;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-navbar-card": TedNavbarCard;
  }
}
