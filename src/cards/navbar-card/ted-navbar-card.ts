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
import { isVisible } from "../../shared/conditions";
import { registerCustomCard } from "../../shared/register-card";
import { NotificationToastController } from "../../shared/notifications";
import { resolveDeviceArea } from "../../shared/device-area";
import { SettingsController } from "../../shared/settings";
import { AutoReturnController } from "../../shared/auto-return";
import { viewAssistSensor } from "../../shared/view-assist";
import { tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { renderStatusItem, type StatusItemContext } from "../../shared/status-items/render";
import { StatusSliderController } from "../../shared/status-items/slider-controller";
import { statusItemStyles } from "../../shared/status-items/styles";
import type { StatusItem } from "../../shared/status-items/types";
import {
  DEFAULT_NAVBAR_AUTOHIDE_DELAY,
  DEFAULT_NAVBAR_MAX_WIDTH,
  DEFAULT_NAVBAR_MIN_WIDTH,
  DEFAULT_NAVBAR_SIZE,
  NAVBAR_CARD_DESCRIPTION,
  NAVBAR_CARD_EDITOR_TYPE,
  NAVBAR_CARD_NAME,
  NAVBAR_CARD_TYPE,
  NAVBAR_PILL_RESERVE,
  defaultNavButton,
} from "./const";
import { detectEditOrPreview, forceNavbarPadding, navbarContentRect, navbarHeaderHeight, removeNavbarPadding, setNavbarBottomReserve } from "./navbar-dom";
import type { EntityAttrSource, NavButtonConfig, NavItem, NavSection, NavZone, NavbarAlignment, NavbarCardConfig } from "./types";
import { navItemKey, parseVaItem, vaSizeToThickness } from "./va-items";

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
  documentationURL: "https://github.com/tedr91/Teds-Cards#navbar-card",
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
        { placement: "left", align: "left", items: [] },
        { placement: "center", align: "right", items: [] },
        {
          placement: "center",
          align: "center",
          // Exactly an editor-added button, then given the Home name + icon.
          items: [{ ...defaultNavButton(), name: "Home", icon: "mdi:home" }],
        },
        { placement: "center", align: "left", items: [] },
        { placement: "right", align: "right", items: [] },
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
  /** True when any nav item uses `visible`/`visibility` — enables live re-evaluation. */
  private _hasConditional = false;
  /** True when any section sources items, or the bar sizes, from an entity attribute. */
  private _hasSource = false;
  /** Last bar thickness reserved as view padding (so a size source can refresh it). */
  private _lastThickness?: number;
  /** Per-section (config index) visible item count when overflow trims the tail. */
  private _visible = new Map<number, number>();
  private _resizeRaf?: number;
  /** Horizontal insets (px) so the bar clears the HA sidebar / matches the content area. */
  private _navLeft = 0;
  private _navRight = 0;
  /** Vertical insets (px) so a left/right bar clears the HA header / content top & bottom. */
  private _navTop = 0;
  private _navBottom = 0;
  /** Auto-hide: whether the bar is currently collapsed into its edge (pill showing). */
  @state() private _collapsed = false;
  /** Pending re-collapse timeout while an auto-hide bar is revealed. */
  private _hideTimer?: number;

  public constructor() {
    super();
    // Pop toasts for backend notifications when a Notifications bell item is present.
    new NotificationToastController(this, () => {
      const it = this._notifItem();
      return {
        hass: this.hass,
        // Resolve the device's area (config override → View Assist → browser_mod →
        // localStorage) so a shared navbar only toasts this device's area + house-wide.
        area: this.hass ? resolveDeviceArea(this.hass, it?.area).area : it?.area,
        enabled: !!it,
        // A fired notification reveals an auto-hidden bar (only if it carries a bell item).
        onNotify: it ? this._reveal : undefined,
      };
    });
    // Keep this device's settings live (+ registered) and auto-return home on idle.
    new SettingsController(this, () => this.hass);
    new AutoReturnController(this);
  }

  /** The first "notifications" status item across all sections (if any). */
  private _notifItem(): { area?: string } | undefined {
    for (const section of this._config?.sections ?? []) {
      const items = (section.items ?? section.buttons ?? []) as Array<{ type?: string; area?: string }>;
      for (const it of items) {
        if (it.type === "notifications") return it;
      }
    }
    return undefined;
  }

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
    this._collapsed = this._autoHide();
    void this._loadHelpers();
    this._applyPadding();
    this._syncClockTimer();
    window.addEventListener("resize", this._onResize);
    window.addEventListener("location-changed", this._onVisibilityEvent);
    window.addEventListener("popstate", this._onVisibilityEvent);
    window.addEventListener("view-assist-responsive-change", this._onVisibilityEvent);
    document.addEventListener("pointerdown", this._onDocPointerDown, true);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    removeNavbarPadding();
    setNavbarBottomReserve(0);
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("location-changed", this._onVisibilityEvent);
    window.removeEventListener("popstate", this._onVisibilityEvent);
    window.removeEventListener("view-assist-responsive-change", this._onVisibilityEvent);
    document.removeEventListener("pointerdown", this._onDocPointerDown, true);
    this._clearHide();
    if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
    if (this._clockTimer !== undefined) {
      window.clearInterval(this._clockTimer);
      this._clockTimer = undefined;
    }
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config")) {
      this._hasConditional = this._computeHasConditional();
      this._hasSource = this._computeHasSource();
      this._visible.clear();
      this._buildButtonElements();
      this._applyPadding();
      this._lastThickness = this._thickness();
      this._syncClockTimer();
      // Re-collapse (or fully show) when the auto-hide setting changes.
      this._collapsed = this._autoHide();
      if (!this._autoHide()) this._clearHide();
    } else if (changed.has("hass") && (this._hasConditional || this._hasSource)) {
      // Visibility conditions and sourced items may depend on entity state; rebuild so
      // newly hidden/shown/sourced items update (elements reuse by config = cheap).
      this._buildButtonElements();
      if (this._hasSource) this._syncSourcedThickness();
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
    const source = this._config?.size_source;
    const entity = source ? this._sourceEntity(source) : undefined;
    if (source && entity && this.hass) {
      const mapped = vaSizeToThickness(this.hass.states[entity]?.attributes?.[source.attribute]);
      if (mapped !== undefined) return mapped;
    }
    return typeof this._config?.size === "number" ? this._config.size : DEFAULT_NAVBAR_SIZE;
  }

  /** When a View Assist size source changes the bar thickness, refresh the reserved view
   *  padding and let overflow re-measure against the new size. */
  private _syncSourcedThickness(): void {
    const thickness = this._thickness();
    if (thickness === this._lastThickness) return;
    this._lastThickness = thickness;
    this._applyPadding();
    this._visible.clear();
  }

  private _alignment(): NavbarAlignment {
    const a = this._config?.alignment;
    return a === "top" || a === "left" || a === "right" ? a : "bottom";
  }

  /** Left/right bars are vertical (full height, fixed width); top/bottom are horizontal. */
  private _isVertical(): boolean {
    const a = this._alignment();
    return a === "left" || a === "right";
  }

  private _barType(): "snap" | "float" {
    // Float is horizontal-only; a vertical bar is always snap.
    return !this._isVertical() && this._config?.bar_type === "float" ? "float" : "snap";
  }

  private _minWidth(): number {
    return typeof this._config?.min_width === "number" ? this._config.min_width : DEFAULT_NAVBAR_MIN_WIDTH;
  }

  private _maxWidth(): number {
    return typeof this._config?.max_width === "number" ? this._config.max_width : DEFAULT_NAVBAR_MAX_WIDTH;
  }

  /** Reserve view padding so dashboard content isn't hidden under the bar. */
  private _applyPadding(): void {
    this._publishBottomReserve();
    // Auto-hide bars only reserve room for the collapsed pill; the revealed bar
    // overlays the dashboard temporarily.
    if (this._autoHide()) {
      forceNavbarPadding({
        alignment: this._alignment(),
        px: NAVBAR_PILL_RESERVE,
        enabled: !this._editMode,
      });
      return;
    }
    const margin = this._barType() === "float" ? 16 : 0;
    forceNavbarPadding({
      alignment: this._alignment(),
      px: this._thickness() + margin,
      enabled: !this._editMode,
    });
  }

  /** Publish how much space a bottom bar occupies so body-level fixed layers (the
   *  MessageBox toast stack) sit above it instead of overlapping. */
  private _publishBottomReserve(): void {
    if (this._editMode || this._alignment() !== "bottom") {
      setNavbarBottomReserve(0);
      return;
    }
    // Reserve the full bar footprint even for auto-hide bars, so a revealed bar clears
    // the toast (a fired notification reveals the bar anyway).
    const margin = this._barType() === "float" ? 16 : 0;
    setNavbarBottomReserve(this._thickness() + margin);
  }

  /** Whether auto-hide is active (configured on, and not in the editor/preview). */
  private _autoHide(): boolean {
    return this._config?.auto_hide === true && !this._editMode;
  }

  private _autoHideDelay(): number {
    const d = this._config?.auto_hide_delay;
    return (typeof d === "number" && d >= 0 ? d : DEFAULT_NAVBAR_AUTOHIDE_DELAY) * 1000;
  }

  /** Reveal the collapsed bar and (re)start the auto-collapse countdown. */
  private _reveal = (): void => {
    if (!this._autoHide()) return;
    if (this._collapsed) this._collapsed = false;
    this._scheduleHide();
  };

  private _collapse = (): void => {
    if (!this._autoHide()) return;
    this._clearHide();
    if (!this._collapsed) this._collapsed = true;
  };

  private _scheduleHide(): void {
    this._clearHide();
    this._hideTimer = window.setTimeout(() => this._collapse(), this._autoHideDelay());
  }

  private _clearHide(): void {
    if (this._hideTimer !== undefined) {
      window.clearTimeout(this._hideTimer);
      this._hideTimer = undefined;
    }
  }

  /** Collapse when a pointer press lands anywhere outside the navbar. */
  private _onDocPointerDown = (ev: PointerEvent): void => {
    if (!this._autoHide() || this._collapsed) return;
    if (ev.composedPath().includes(this)) return;
    this._collapse();
  };

  /** Hovering the revealed bar keeps it open; leaving restarts the countdown. */
  private _onBarEnter = (): void => {
    if (this._autoHide() && !this._collapsed) this._clearHide();
  };
  private _onBarLeave = (): void => {
    if (this._autoHide() && !this._collapsed) this._scheduleHide();
  };
  /** A tap on a nav item resets the countdown so it doesn't vanish mid-interaction. */
  private _onBarPointerDown = (): void => {
    if (this._autoHide() && !this._collapsed) this._scheduleHide();
  };

  /** (Re)build cached embedded button cards, reusing those whose config is unchanged. */
  private _buildButtonElements(): void {
    if (!this._helpers || !this._config) return;
    const next = new Map<string, ButtonEntry>();
    (this._config.sections ?? []).forEach((section, sIdx) => {
      this._collectButtonEls(this._sectionItems(section), `${sIdx}`, next);
    });
    this._buttonEls = next;
  }

  /** (Re)build embedded button cards for a section's items. */
  private _collectButtonEls(items: NavItem[], pathBase: string, next: Map<string, ButtonEntry>): void {
    items.forEach((item, idx) => {
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

  /** Strip the nav-only keys so the embedded button card stays clean. */
  private _buttonCardConfig(button: NavButtonConfig): LovelaceCardConfig {
    const { nav_button_size, visible, visibility, ...cardConfig } = button;
    void nav_button_size;
    void visible;
    void visibility;
    return cardConfig as LovelaceCardConfig;
  }

  /** A section's ordered items (legacy buttons-only list as fallback) plus any buttons
   *  sourced from an entity attribute, with items hidden by `visible: false` or unmet
   *  `visibility:` conditions filtered out. */
  private _sectionItems(section: NavSection): NavItem[] {
    const base = section.items ?? section.buttons ?? [];
    const items = section.items_source
      ? [...base, ...this._sourcedItems(section.items_source, base)]
      : base;
    return items.filter((item) => isVisible(item.visible, item.visibility, this.hass));
  }

  /** Build extra buttons from a View Assist status-icon / menu attribute (a list of
   *  strings), de-duped against the section's curated items so e.g. `home`/`weather`
   *  aren't doubled. Returns nothing until the source entity is available. */
  /** Resolve a source's entity: the current device's View Assist sensor when
   *  `va_device` is set (falling back to a static `entity`), else the static `entity`. */
  private _sourceEntity(source: EntityAttrSource): string | undefined {
    return source.va_device ? viewAssistSensor() ?? source.entity : source.entity;
  }

  private _sourcedItems(source: EntityAttrSource, base: NavItem[]): NavButtonConfig[] {
    const entity = this._sourceEntity(source);
    if (!this.hass || !entity) return [];
    const raw = this.hass.states[entity]?.attributes?.[source.attribute];
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    for (const item of base) {
      const key = navItemKey(item);
      if (key) seen.add(key);
    }
    const out: NavButtonConfig[] = [];
    for (const value of raw) {
      if (typeof value !== "string") continue;
      const button = parseVaItem(value, this.hass);
      if (!button) continue;
      const key = navItemKey(button);
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      out.push(button);
    }
    return out;
  }

  /** True when any item carries `visible`/`visibility`. */
  private _computeHasConditional(): boolean {
    const scan = (items: NavItem[]): boolean =>
      items.some(
        (i) =>
          i.visible !== undefined || (Array.isArray(i.visibility) && i.visibility.length > 0),
      );
    return (this._config?.sections ?? []).some((s) => scan(s.items ?? s.buttons ?? []));
  }

  /** True when the card sizes from, or any section sources items from, an entity attr. */
  private _computeHasSource(): boolean {
    if (this._config?.size_source) return true;
    return (this._config?.sections ?? []).some((s) => s.items_source !== undefined);
  }

  /** A nav item is a button when its `type` is an embeddable `custom:` card. */
  private _isButton(item: NavItem): item is NavButtonConfig {
    return typeof item.type === "string" && item.type.startsWith("custom:");
  }

  /** Re-render once a second while any live time/date item is present. */
  private _syncClockTimer(): void {
    const ticking = (this._config?.sections ?? [])
      .flatMap((s) => this._sectionItems(s))
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
    this._measureContentInset();
    this._measureOverflow();
  }

  /** Inset the fixed bar to the dashboard content area so the HA sidebar doesn't cover
   *  it (the bar is position:fixed to the viewport; HA offsets the content past the sidebar). */
  private _measureContentInset(): void {
    if (this._editMode) return;
    const rect = navbarContentRect();
    if (!rect || rect.width === 0) return;
    const left = Math.max(0, Math.round(rect.left));
    // Right inset is resolved against the viewport WITHOUT the scrollbar: a
    // position:fixed element's `right` is relative to documentElement.clientWidth
    // (scrollbar excluded), whereas window.innerWidth includes it — using innerWidth
    // would push the bar in by the scrollbar width, leaving a gap on the right.
    const right = Math.max(0, Math.round(document.documentElement.clientWidth - rect.right));
    // Vertical insets (only used by a left/right bar): clear the HA header (top) and
    // match the content bottom. The header sits above the content, so add its height.
    const top = Math.max(0, Math.round(rect.top) + navbarHeaderHeight());
    const bottom = Math.max(0, Math.round(document.documentElement.clientHeight - rect.bottom));
    if (
      left === this._navLeft &&
      right === this._navRight &&
      top === this._navTop &&
      bottom === this._navBottom
    )
      return;
    this._navLeft = left;
    this._navRight = right;
    this._navTop = top;
    this._navBottom = bottom;
    this._visible.clear(); // available width changed — let overflow recompute
    this.requestUpdate();
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
      if (this._hasConditional) {
        // `screen` conditions can change with the viewport — re-evaluate items.
        this._buildButtonElements();
        this.requestUpdate();
      } else if (had) {
        this.requestUpdate();
      } else {
        this._measureOverflow();
      }
    });
  };

  /** Re-evaluate conditional items on navigation (view change) or VA responsive change. */
  private _onVisibilityEvent = (): void => {
    if (!this._hasConditional) return;
    this._visible.clear();
    this._buildButtonElements();
    this.requestUpdate();
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
    // Measure along the bar's main axis: width for horizontal, height for vertical.
    const vert = this._isVertical();
    const cardInner = vert
      ? card.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)
      : card.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const gap = 8;
    const centerEl = root?.querySelector?.(".zone.center") as HTMLElement | null;
    // The center zone is a full-extent grid, so its size == the whole bar. Use the
    // actual content footprint (its sections summed) so the left/right budget stays sane.
    const centerSecs = centerEl
      ? (Array.from(centerEl.children) as HTMLElement[]).filter((c) => c.classList.contains("section"))
      : [];
    const centerW = centerSecs.reduce(
      (sum, s, i) => sum + (vert ? s.offsetHeight : s.offsetWidth) + (i > 0 ? gap : 0),
      0,
    );

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
      const extent = (c: HTMLElement): number => (vert ? c.offsetHeight : c.offsetWidth);
      let total = 0;
      els.forEach((c, i) => (total += extent(c) + (i > 0 ? gap : 0)));
      if (total <= budget) return; // fits — keep showing all items
      let used = 0;
      let vis = 0;
      for (let i = 0; i < els.length; i += 1) {
        const w = extent(els[i]) + (i > 0 ? gap : 0);
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
      transparency: this._config.transparency,
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
      vertical: this._isVertical(),
      "edit-mode": this._editMode,
      "auto-hide": this._autoHide(),
      collapsed: this._autoHide() && this._collapsed,
    };

    const autoHide = this._autoHide();

    return html`
      <div
        class=${classMap(navClasses)}
        style=${styleMap({
          "--nav-size": `${this._thickness()}px`,
          "--ted-nav-left": `${this._navLeft}px`,
          "--ted-nav-right": `${this._navRight}px`,
          "--ted-nav-top": `${this._navTop}px`,
          "--ted-nav-bottom": `${this._navBottom}px`,
        })}
      >
        ${autoHide
          ? html`<button
              class="nav-pill"
              aria-label="Show navigation"
              @click=${this._reveal}
              @pointerenter=${this._reveal}
            ></button>`
          : nothing}
        <ha-card
          class="navbar-card ${tedCardThemeClass(theme)}${hug ? " hug" : ""}"
          style=${styleMap(cardStyle)}
          @pointerenter=${this._onBarEnter}
          @pointerleave=${this._onBarLeave}
          @pointerdown=${this._onBarPointerDown}
        >
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
    // Same direction-aware chevron as a popup: points where the menu opens, flips when open.
    const a = this._alignment();
    const chevron =
      a === "bottom" ? "mdi:chevron-up" : a === "top" ? "mdi:chevron-down" : a === "left" ? "mdi:chevron-right" : "mdi:chevron-left";
    return html`
      <button id=${anchorId} class="nav-button nav-popup nav-popup-chevron" popovertarget=${popId} title="More" aria-label="More">
        <ha-icon .icon=${chevron}></ha-icon>
      </button>
      <div id=${popId} class="nav-popover" popover data-anchor=${anchorId} @toggle=${this._onPopoverToggle}>
        <div class="nav-popover-body">${this._renderItems(hidden, `${sIdx}`, `nav-${sIdx}`, offset)}</div>
      </div>
    `;
  }

  /**
   * Render an ordered list of nav items within a section. `pathBase` keys embedded
   * button cards; `idBase` namespaces status-item ids; `offset` keeps absolute indices
   * when rendering an overflowed tail.
   */
  private _renderItems(items: NavItem[], pathBase: string, idBase: string, offset = 0): TemplateResult[] {
    return items.map((item, i) => {
      const idx = offset + i;
      if (this._isButton(item)) return this._renderButton(`${pathBase}:${idx}`, item);
      return this._renderStatusItem(item as StatusItem, idBase, idx);
    });
  }

  private _renderButton(path: string, button: NavButtonConfig): TemplateResult {
    const entry = this._buttonEls.get(path);
    const wide = button.nav_button_size === "wide";
    // Native hover tooltip + a11y label from the button's name (bar buttons are usually icon-only).
    const label = typeof button.name === "string" ? button.name.trim() : "";
    return html`<div
      class="nav-button ${wide ? "wide" : ""}"
      title=${label || nothing}
      aria-label=${label || nothing}
    >
      ${entry ? entry.el : nothing}
    </div>`;
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

  /** Reposition an overflow popover against its trigger when it opens. */
  private _onPopoverToggle = (ev: Event): void => {
    const popover = ev.currentTarget as HTMLElement;
    if ((ev as Event & { newState?: string }).newState !== "open") return;
    const anchorId = popover.dataset.anchor;
    const anchor = anchorId ? (this.renderRoot as ShadowRoot).getElementById(anchorId) : null;
    this._positionPopover(popover, anchor ?? undefined);
  };

  /** Center a popover over its trigger: above/below a horizontal bar, beside a vertical one. */
  private _positionPopover(popover: HTMLElement, anchor?: HTMLElement): void {
    const margin = 8;
    const rect = popover.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    popover.style.position = "fixed";
    popover.style.margin = "0";
    if (!anchor) {
      popover.style.left = `${Math.round((vw - rect.width) / 2)}px`;
      popover.style.top = `${Math.round((vh - rect.height) / 2)}px`;
      return;
    }
    const a = anchor.getBoundingClientRect();
    if (this._isVertical()) {
      // Vertical bar: open beside the trigger (right of a left bar, left of a right bar),
      // vertically centered on it and clamped to the viewport.
      const openRight = this._alignment() === "left";
      let left = openRight ? a.right + margin : a.left - margin - rect.width;
      if (openRight && left + rect.width > vw - margin) left = a.left - margin - rect.width;
      else if (!openRight && left < margin) left = a.right + margin;
      left = Math.max(margin, Math.min(left, vw - rect.width - margin));
      let top = a.top + a.height / 2 - rect.height / 2;
      top = Math.max(margin, Math.min(top, vh - rect.height - margin));
      popover.style.left = `${Math.round(left)}px`;
      popover.style.top = `${Math.round(top)}px`;
      return;
    }
    let left = a.left + a.width / 2 - rect.width / 2;
    left = Math.max(margin, Math.min(left, vw - rect.width - margin));
    const preferAbove = this._alignment() === "bottom";
    const fitsAbove = a.top - margin - rect.height >= margin;
    const fitsBelow = a.bottom + margin + rect.height <= vh - margin;
    let top = preferAbove ? a.top - margin - rect.height : a.bottom + margin;
    if (preferAbove && !fitsAbove && fitsBelow) top = a.bottom + margin;
    else if (!preferAbove && !fitsBelow && fitsAbove) top = a.top - margin - rect.height;
    top = Math.max(margin, Math.min(top, vh - rect.height - margin));
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
        z-index: 5;
        pointer-events: none;
        box-sizing: border-box;
      }
      /* Horizontal bar (top/bottom): full width, thickness tall. */
      .navbar.top,
      .navbar.bottom {
        left: var(--ted-nav-left, 0);
        right: var(--ted-nav-right, 0);
      }
      .navbar.bottom {
        bottom: 0;
      }
      .navbar.top {
        top: 0;
      }
      /* Vertical bar (left/right): full height between header & content bottom. */
      .navbar.left,
      .navbar.right {
        top: var(--ted-nav-top, 0);
        bottom: var(--ted-nav-bottom, 0);
      }
      .navbar.left {
        left: var(--ted-nav-left, 0);
      }
      .navbar.right {
        right: var(--ted-nav-right, 0);
      }
      .navbar.float {
        padding: 8px;
      }
      /* In the editor / card picker preview, sit inline instead of overlaying. */
      .navbar.edit-mode {
        position: static;
      }

      /* Auto-hide: the bar slides fully off its edge when collapsed; the pill remains. */
      .navbar.auto-hide .navbar-card {
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        will-change: transform;
      }
      .navbar.collapsed .navbar-card {
        pointer-events: none;
      }
      .navbar.collapsed.bottom .navbar-card {
        transform: translateY(100%);
      }
      .navbar.collapsed.top .navbar-card {
        transform: translateY(-100%);
      }
      /* Float bars sit 8px in from the edge (container padding), so slide them the
         extra 8px too or a sliver of the bar stays visible when collapsed. */
      .navbar.float.collapsed.bottom .navbar-card {
        transform: translateY(calc(100% + 8px));
      }
      .navbar.float.collapsed.top .navbar-card {
        transform: translateY(calc(-100% - 8px));
      }
      .navbar.collapsed.left .navbar-card {
        transform: translateX(-100%);
      }
      .navbar.collapsed.right .navbar-card {
        transform: translateX(100%);
      }
      /* The pill handle: a small rounded bar centered on the aligned edge. */
      .nav-pill {
        position: absolute;
        z-index: 1;
        border: none;
        padding: 0;
        cursor: pointer;
        pointer-events: none;
        background: color-mix(in srgb, var(--ted-style-text, #888) 45%, transparent);
        opacity: 0;
        transition: opacity 0.25s ease;
        border-radius: 999px;
      }
      .navbar.collapsed .nav-pill {
        opacity: 0.85;
        pointer-events: auto;
      }
      .navbar.collapsed .nav-pill:hover {
        opacity: 1;
      }
      /* Horizontal bars: a wide, short pill centered on the top/bottom edge. */
      .navbar.bottom .nav-pill,
      .navbar.top .nav-pill {
        left: 50%;
        transform: translateX(-50%);
        width: 46px;
        height: 5px;
      }
      .navbar.bottom .nav-pill {
        bottom: 4px;
      }
      .navbar.top .nav-pill {
        top: 4px;
      }
      /* Vertical bars: a tall, thin pill centered on the left/right edge. */
      .navbar.left .nav-pill,
      .navbar.right .nav-pill {
        top: 50%;
        transform: translateY(-50%);
        width: 5px;
        height: 46px;
      }
      .navbar.left .nav-pill {
        left: 4px;
      }
      .navbar.right .nav-pill {
        right: 4px;
      }

      .navbar-card {
        position: relative;
        pointer-events: auto;
        box-sizing: border-box;
        border-radius: 0;
        overflow: visible;
        /* Shrink embedded button-card count badges so they stay proportionate on the
           small navbar buttons (inherits through the shadow boundary to .lbc-badge). */
        --lbc-badge-size: clamp(13px, calc(var(--nav-size, 48px) * 0.3), 20px);
        --lbc-badge-font: clamp(8px, calc(var(--nav-size, 48px) * 0.18), 12px);
        --lbc-badge-inset: clamp(1px, calc(var(--nav-size, 48px) * 0.06), 5px);
      }
      .navbar:not(.vertical) .navbar-card {
        height: var(--nav-size);
      }
      .navbar.vertical .navbar-card {
        width: var(--nav-size);
        height: 100%;
        display: flex;
        flex-direction: column;
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

      /* Three zones: side zones pin to opposite edges, center is a grid so the
         center-aligned section sits dead-center while flanks stay symmetric. */
      .zone {
        position: absolute;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      /* Horizontal (top/bottom): left/right edges + 3-column center grid. */
      .navbar:not(.vertical) .zone {
        top: 0;
        bottom: 0;
      }
      .navbar:not(.vertical) .zone.left {
        left: 10px;
      }
      .navbar:not(.vertical) .zone.right {
        right: 10px;
      }
      .navbar:not(.vertical) .zone.center {
        left: 0;
        right: 0;
        transform: none;
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        justify-items: center;
        pointer-events: none;
      }
      .navbar:not(.vertical) .zone.center > .section.align-right {
        grid-column: 1;
        justify-self: end;
      }
      .navbar:not(.vertical) .zone.center > .section.align-center {
        grid-column: 2;
        justify-self: center;
      }
      .navbar:not(.vertical) .zone.center > .section.align-left {
        grid-column: 3;
        justify-self: start;
      }
      /* Vertical (left/right): the card is a top→bottom column — top zone, center
         (grows), bottom zone — so sections keep their order and never overlap. */
      .navbar.vertical .zone {
        position: static;
        flex-direction: column;
        width: 100%;
      }
      .navbar.vertical .zone.left {
        padding-top: 10px;
      }
      .navbar.vertical .zone.right {
        padding-bottom: 10px;
      }
      .navbar.vertical .zone.center {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        pointer-events: none;
      }
      .zone.center > .section {
        pointer-events: auto;
      }

      .section {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .navbar:not(.vertical) .section {
        height: 100%;
      }
      .navbar.vertical .section {
        flex-direction: column;
        width: 100%;
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

      /* Popup / overflow trigger: a transparent icon button that blends in with
         the other nav buttons (accent icon, no surface box or border). */
      .nav-popup {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--ted-style-accent);
        cursor: pointer;
        transition: color 0.18s ease, transform 0.08s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .nav-popup ha-icon {
        --mdc-icon-size: calc((var(--nav-size) - 12px) * 0.78);
        transition: transform 0.2s ease;
      }
      /* The default chevron flips to point the opposite way while its popup is open. */
      .nav-popup-chevron:has(+ .nav-popover:popover-open) ha-icon {
        transform: rotate(180deg);
      }
      .nav-popup:hover {
        color: color-mix(in srgb, var(--ted-style-accent) 75%, var(--ted-style-text));
      }
      .nav-popup:active {
        transform: scale(0.96);
      }

      /* Native popover holding a popup's (or the overflow's) items. Opt into the
         theme's card frost (--ha-card-backdrop-filter) so on translucent themes
         (Mica/glass) the surface blurs the dashboard behind it instead of showing
         it straight through — a plain [popover] isn't an ha-card, so it doesn't
         get that blur automatically. Falls back to none on opaque/flat themes. */
      .nav-popover {
        position: fixed;
        inset: auto;
        margin: 0;
        box-sizing: border-box;
        padding: 10px;
        max-height: 80vh;
        overflow: auto;
        background: var(--ted-style-surface);
        -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
        backdrop-filter: var(--ha-card-backdrop-filter, none);
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
