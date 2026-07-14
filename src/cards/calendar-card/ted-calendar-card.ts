import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardConfig,
  type LovelaceCardEditor,
} from "custom-card-helpers";

import { themedIcon } from "../../shared/icons";
import { appearanceStyle, cssColor } from "../../shared/appearance";
import { registerCustomCard } from "../../shared/register-card";
import { SettingsController, settingsStore } from "../../shared/settings";
import {
  CALENDAR_CARD_DESCRIPTION,
  CALENDAR_CARD_EDITOR_TYPE,
  CALENDAR_CARD_NAME,
  CALENDAR_CARD_TYPE,
  CALENDAR_DEFAULT_CONFIG,
  DAYLIGHT_CARD_TAG,
  DAYLIGHT_CARD_TYPE,
  DEFAULT_CALENDAR_VIEW,
} from "./const";
import type { CalendarCardConfig, CalendarItemConfig } from "./types";

/** The MessageBox card used for the empty / missing-dependency states (UX consistency). */
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

registerCustomCard({
  type: CALENDAR_CARD_TYPE,
  name: CALENDAR_CARD_NAME,
  description: CALENDAR_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/Teds-Cards#calendar-card",
  getEntitySuggestion: (_hass, entityId) =>
    entityId.startsWith("calendar.")
      ? { config: { type: `custom:${CALENDAR_CARD_TYPE}`, calendar_source: "config", entities: [entityId] } }
      : null,
});

@customElement(CALENDAR_CARD_TYPE)
export class TedCalendarCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-calendar-card-editor");
    return document.createElement(CALENDAR_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<CalendarCardConfig, "type"> {
    return { calendar_source: "config" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: CalendarCardConfig;

  private _helpers?: CardHelpers;
  /** The embedded child card (the calendar, or a MessageBox for empty/missing states). */
  private _child?: { el: LovelaceCard; json: string };
  private _childKind?: "calendar" | "message";
  private _lastPropagatedHass?: HomeAssistant;

  public constructor() {
    super();
    // Keep this device's settings live so `calendar_source: settings` stays in sync.
    new SettingsController(this, () => this.hass);
  }

  public connectedCallback(): void {
    super.connectedCallback();
    void this._loadHelpers();
    // If the dependency registers after first paint (lazy HACS resource), re-render
    // so we swap the missing-dependency message for the real calendar.
    if (typeof customElements !== "undefined" && !customElements.get(DAYLIGHT_CARD_TAG)) {
      void customElements.whenDefined(DAYLIGHT_CARD_TAG).then(() => this.requestUpdate());
    }
  }

  public setConfig(config: CalendarCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    for (const id of this._configEntities(config)) {
      if (!id.startsWith("calendar.")) {
        throw new Error(`ted-calendar-card only supports calendar entities (got '${id}')`);
      }
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
    if (changed.has("hass")) this._propagateHass();
  }

  // --- Entity resolution -----------------------------------------------------

  /** Whether the third-party daylight-calendar-card element is registered. */
  private _daylightInstalled(): boolean {
    return typeof customElements !== "undefined" && !!customElements.get(DAYLIGHT_CARD_TAG);
  }

  /** The calendars as item objects (bare id strings are normalized to `{entity}`). */
  private _configItems(config?: CalendarCardConfig): CalendarItemConfig[] {
    return (config?.entities ?? [])
      .map((e) => (typeof e === "string" ? { entity: e } : { ...e }))
      .filter((i): i is CalendarItemConfig => typeof i.entity === "string" && i.entity.length > 0);
  }

  /** The raw `calendar.*` ids from a config's `entities`. */
  private _configEntities(config?: CalendarCardConfig): string[] {
    return this._configItems(config).map((i) => i.entity);
  }

  /** Resolve this device's calendars from settings: the device's curated subset
   *  (else the global list), always limited to the global allow-list. When the
   *  global list is empty, nothing is available (the Global list is the gate). */
  private _settingsEntities(): string[] {
    const asIds = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    const global = asIds(settingsStore.globalSettings().calendars_list);
    const device = settingsStore.deviceSettings();
    const chosen = "calendars_list" in device ? asIds(device.calendars_list) : global;
    return chosen.filter((id) => global.includes(id));
  }

  /** The calendars to show, in order — from config or this device's settings.
   *  Empty (nothing selected) renders the empty state, not a fallback list. */
  private _entities(): string[] {
    return this._config?.calendar_source === "settings"
      ? this._settingsEntities()
      : this._configEntities(this._config);
  }

  // --- Embedded daylight-calendar-card ---------------------------------------

  private _childConfig(entities: string[]): LovelaceCardConfig {
    const cfg = this._config ?? ({} as CalendarCardConfig);
    const base = { ...CALENDAR_DEFAULT_CONFIG } as Record<string, unknown>;

    // --- Per-calendar customization (config mode only) ---
    const asMap = (v: unknown): Record<string, string> =>
      v && typeof v === "object" ? { ...(v as Record<string, string>) } : {};
    const colors = asMap(base.colors);
    const names = asMap(base.calendar_names);
    const persons = asMap(base.calendar_person_entities);
    const badgeIcons = asMap(base.calendar_badge_icons);
    const readonly = Array.isArray(base.readonly_calendars)
      ? [...(base.readonly_calendars as string[])]
      : [];
    if (cfg.calendar_source !== "settings") {
      for (const it of this._configItems(cfg)) {
        if (it.color) colors[it.entity] = cssColor(it.color) ?? it.color;
        if (it.name) names[it.entity] = it.name;
        if ((it.icon_source ?? "person") === "icon") {
          delete persons[it.entity];
          if (it.icon) badgeIcons[it.entity] = it.icon;
        } else {
          if (it.person) persons[it.entity] = it.person;
          else delete persons[it.entity];
          if (it.icon) badgeIcons[it.entity] = it.icon;
        }
        const ri = readonly.indexOf(it.entity);
        if (it.readonly === false) {
          if (ri >= 0) readonly.splice(ri, 1);
        } else if (ri < 0) {
          readonly.push(it.entity);
        }
      }
    }

    // --- Appearance ---
    const appearance: Record<string, unknown> = {};
    if (cfg.show_name === false) appearance.title = "";
    else if (cfg.name) appearance.title = cfg.name;
    const showHeader = cfg.show_header !== false;
    appearance.hide_header = !showHeader;
    if (showHeader) appearance.hide_calendars = cfg.allow_calendar_toggling === false;
    if (cfg.header_color) appearance.header_color = cssColor(cfg.header_color);
    if (cfg.weather_sensor) appearance.header_weather_sensor = cfg.weather_sensor;
    // When we paint our own frosted surface behind the (shadow-DOM) calendar, make
    // daylight's own body fully transparent so that surface shows through. Use the
    // NATIVE `background_opacity` (100) — daylight ignores the legacy
    // `background_transparent` boolean whenever `background_opacity` is present.
    if (this._surfaceStyle()) appearance.background_opacity = 100;

    return {
      type: DAYLIGHT_CARD_TYPE,
      ...base,
      ...appearance,
      colors,
      calendar_names: names,
      calendar_person_entities: persons,
      calendar_badge_icons: badgeIcons,
      readonly_calendars: readonly,
      entities,
      default_view: cfg.default_view ?? DEFAULT_CALENDAR_VIEW,
      ...(cfg.calendar_config ?? {}),
    };
  }

  /** Inline style for the frosted surface painted behind the calendar, or null when
   *  no appearance override is active. `theme: ted-style` seeds a translucent blur. */
  private _surfaceStyle(): Record<string, string> | null {
    const cfg = this._config;
    if (!cfg) return null;
    const ted = cfg.theme === "ted-style";
    let transparency = cfg.transparency;
    let blur = cfg.blur;
    if (ted) {
      if (transparency === undefined) transparency = 30;
      if (blur === undefined) blur = 40;
    }
    const hasColor = typeof cfg.background_color === "string" && cfg.background_color.length > 0;
    const active =
      hasColor ||
      ted ||
      (typeof transparency === "number" && transparency > 0) ||
      (typeof blur === "number" && blur > 0);
    if (!active) return null;
    const background = cssColor(cfg.background_color) ?? "var(--ha-card-background)";
    return appearanceStyle({ background, transparency, blur });
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
    const raw = this._config?.settings_path || "[root]/settings?tab=calendars";
    let path = raw.replace("[root]", root);
    if (!path.startsWith("/")) path = `/${path}`;
    return path;
  }

  /** The HACS panel path (`/hacs`), if the HACS integration is installed. */
  private _hacsPath(): string | undefined {
    const panels = this.hass?.panels as
      | Record<string, { url_path?: string; component_name?: string } | undefined>
      | undefined;
    if (!panels) return undefined;
    for (const [key, p] of Object.entries(panels)) {
      if ((p?.url_path ?? key) === "hacs" || p?.component_name === "hacs") {
        return `/${p?.url_path ?? key}`;
      }
    }
    return undefined;
  }

  // --- State cards -----------------------------------------------------------

  /** The child card to render for the current state: the calendar, or a MessageBox. */
  private _desiredChild(): { cfg: LovelaceCardConfig; kind: "calendar" | "message" } | undefined {
    if (!this._daylightInstalled()) return { cfg: this._missingMessageConfig(), kind: "message" };
    const entities = this._entities();
    if (entities.length === 0) return { cfg: this._emptyMessageConfig(), kind: "message" };
    return { cfg: this._childConfig(entities), kind: "calendar" };
  }

  private _messageConfig(
    severity: string,
    icon: string,
    title: string,
    message: string,
    actions: Record<string, unknown>[],
  ): LovelaceCardConfig {
    return { type: MESSAGEBOX_CARD_TYPE, severity, icon, title, message, actions };
  }

  private _missingMessageConfig(): LovelaceCardConfig {
    const hacs = this._hacsPath();
    const actions: Record<string, unknown>[] = [
      {
        label: "How to install",
        icon: themedIcon("web"),
        variant: hacs ? "secondary" : "primary",
        action: "url",
        url_path: "https://github.com/superdingo101/daylight-calendar-card",
      },
    ];
    if (hacs) {
      actions.unshift({
        label: "Open HACS",
        icon: themedIcon("web"),
        variant: "primary",
        action: "navigate",
        navigation_path: hacs,
      });
    }
    return this._messageConfig(
      "warning",
      themedIcon("calendar-off"),
      this._config?.missing_title ?? "Calendar card not installed",
      this._config?.missing_message ??
        "Ted's Calendar card needs the third-party Daylight Calendar card, which isn't installed.\n\n" +
          "Install it from HACS:\n" +
          "1. Open HACS → Frontend.\n" +
          '2. Search for "Daylight Calendar" (superdingo101/daylight-calendar-card).\n' +
          "3. Install it, then reload your browser.",
      actions,
    );
  }

  private _emptyMessageConfig(): LovelaceCardConfig {
    return this._messageConfig(
      "info",
      themedIcon("calendar"),
      this._config?.empty_title ?? "No calendars yet",
      this._config?.empty_message ??
        "This device hasn't been given any calendars. Open Settings to choose which ones to show.",
      [
        {
          label: "Settings",
          icon: themedIcon("settings"),
          variant: "primary",
          action: "navigate",
          navigation_path: this._settingsPath(),
        },
      ],
    );
  }

  // --- Render ----------------------------------------------------------------

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;
    if (!this._helpers || !this._child) return html`<div class="loading"></div>`;
    if (this._childKind === "message")
      return html`<div class="msg-wrap"><div class="msg">${this._child.el}</div></div>`;
    const surf = this._surfaceStyle();
    const cls = `calendar ${this._config.fill ? "fill" : "natural"}${surf ? " styled" : ""}`;
    return html`<div class=${cls} style=${styleMap(this._calendarStyle())}>
      ${surf ? html`<div class="surface" style=${styleMap(surf)}></div>` : nothing}
      ${this._child.el}
    </div>`;
  }

  /** Fixed width/height for the wrapper — only when not filling and not a direct
   *  grid (Sections) item (where the grid controls the size). */
  private _calendarStyle(): Record<string, string> {
    const cfg = this._config;
    const style: Record<string, string> = {};
    if (!cfg || cfg.fill || this.layout === "grid") return style;
    if (typeof cfg.width === "number") style.width = `${cfg.width}px`;
    if (typeof cfg.height === "number") {
      style.height = `${cfg.height}px`;
      style.overflow = "hidden";
    }
    return style;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }
    /* The daylight-calendar-card brings its own surface, so this card is a transparent
       passthrough — no wrapping ha-card (avoids double borders and backdrop-filter/
       transform clipping of the child card). */
    .calendar {
      width: 100%;
      position: relative;
    }
    /* Frosted surface painted BEHIND the calendar (a sibling, not an ancestor, so it
       never traps daylight's position:fixed event modals). daylight's own body is made
       transparent (background_transparent) so this shows through. */
    .calendar.styled > .surface {
      position: absolute;
      inset: 0;
      z-index: 0;
      border-radius: var(--ha-card-border-radius, 12px);
      pointer-events: none;
    }
    .calendar.styled > daylight-calendar-card {
      position: relative;
      z-index: 1;
    }
    /* Default: let the calendar size itself (its compact_height computes a
       viewport-based height). */
    .calendar.natural {
      display: block;
    }
    /* Opt-in: fill the parent area. Giving the calendar's parent an explicit height +
       overflow:hidden makes daylight-calendar-card's compact_height switch to
       height:100% (its "fixed-height parent allocation" mode) so it fills our cell.
       The inner overrides mirror the proven card_mod recipe for robustness. The
       daylight card renders LIGHT DOM as our shadow child, so these selectors reach
       its internals and survive its re-renders (unlike styles injected INTO it). */
    .calendar.fill {
      height: 100%;
      overflow: hidden;
    }
    .calendar.fill daylight-calendar-card {
      display: block;
      height: 100%;
      overflow: hidden;
    }
    .calendar.fill .calendar-container {
      height: 100% !important;
      max-height: 100% !important;
      min-height: 0 !important;
      overflow: hidden !important;
    }
    .calendar.fill .calendar-grid,
    .calendar.fill .agenda-container,
    .calendar.fill .week-standard-container,
    .calendar.fill .week-compact-container {
      height: 100% !important;
      max-height: 100% !important;
      overflow-y: auto !important;
    }
    .loading {
      height: 100%;
      min-height: 120px;
    }
    /* Empty / missing-dependency states are rendered as a MessageBox card, centered
       both horizontally and vertically within the card's area. */
    .msg-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      box-sizing: border-box;
      padding: 16px;
    }
    .msg {
      width: min(560px, 96%);
    }
  `;
}
