import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import { type HomeAssistant, type LovelaceCard, type LovelaceCardConfig, type LovelaceCardEditor } from "custom-card-helpers";

import { appearanceStyle, cssColor } from "../../shared/appearance";
import { brushedOverlay, tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { computeTabOverflow, positionOverflowPopover } from "../../shared/tab-overflow";
import { modalStyles, showConfirmation } from "../../shared/dialogs";
import { registerCustomCard } from "../../shared/register-card";
import {
  SettingsController,
  settingsStore,
  getUiScope,
  setUiScope,
  subscribeUiScope,
} from "../../shared/settings";
import { resolveDeviceMediaPlayer } from "../../shared/device-id";
import { resolveIconForSet, isIconSetAvailable, themedIcon } from "../../shared/icons";
import { resolveMusicPlayer } from "../../shared/music-player";
import {
  fieldsByGroup,
  SETTINGS_DEFAULTS,
  SETTINGS_GROUP_ICONS,
  type AnnounceMessage,
  type SettingField,
  type SettingsValue,
} from "../../shared/settings-schema";
import {
  BACKGROUND_KEYS,
  BACKGROUND_RECENT_MAX,
  renderBackgroundFields,
  stringList,
  type BackgroundFieldsCtx,
} from "../../shared/background";
import { NIGHTMODE_KEYS, resolveBrightnessEntity } from "../../shared/night-mode";
import { getMediaFolder, isMediaSourceUri, pickMedia, resolveMediaSource, uploadImage, uploadToMediaFolder, listSounds, type BundledSound } from "../../shared/media";
import { backgroundEngine } from "../background-card/background-engine";
import {
  applyCalendarOptionChange,
  calendarOptionHelper,
  calendarOptionLabel,
  calendarOptionsData,
  calendarOptionsSchema,
  calendarVirtualToggleSchema,
  renderHiddenEvents,
  renderVirtualLinkModal,
  renderVirtualMembers,
  reorderVirtualGroupIds,
  virtualGroupNameFor,
  virtualJoinCandidates,
} from "../calendar-card/calendar-options";
import { matchPerson } from "../calendar-card/const";
import type { CalendarItemConfig, HiddenEventRule } from "../calendar-card/types";
import { BUTTON_CARD_TYPE } from "../button-card/const";
import type { NavButtonSize } from "../navbar-card/types";
import {
  dashboardKeyByViewPath,
  effectiveLauncherPaths,
  groupLauncherViews,
  LAUNCHER_SECTIONS,
  launcherOptionsMap,
  readLovelaceViews,
  resolveLauncherViews,
  type LauncherButtonOptions,
  type LauncherViewInfo,
} from "../../shared/launcher";
import {
  SETTINGS_CARD_DESCRIPTION,
  SETTINGS_CARD_EDITOR_TYPE,
  SETTINGS_CARD_NAME,
  SETTINGS_CARD_TYPE,
} from "./const";
import type { SettingsCardConfig } from "./types";

const SETTINGS_SENSOR = "sensor.teds_settings";

/** Sentinel value meaning "use the resolved default sound" (mirrors the backend). */
const DEFAULT_SOUND = "default";

/** What each category tab shows in the strip. */
type SectionHeaderMode = "both" | "icon" | "name";

/** Icons for the collapsible subsection headers ({ fluent, mdi } — resolved via icon set). */
const SUBSECTION_ICONS: Record<string, { fluent: string; mdi: string }> = {
  Music: { fluent: "fluent:music-note-2-24-regular", mdi: "mdi:music" },
  Notifications: { fluent: "fluent:alert-24-regular", mdi: "mdi:bell-outline" },
  Alarms: { fluent: "fluent:clock-alarm-24-regular", mdi: "mdi:alarm" },
  Timers: { fluent: "fluent:timer-24-regular", mdi: "mdi:timer-outline" },
  Advanced: { fluent: "fluent:options-24-regular", mdi: "mdi:tune" },
};

/** Button Card editor sections hidden for a launcher button (its tap navigates to a
 *  view, and it's always grid-embedded, so entity/state/interactions/size don't apply). */
const LAUNCHER_BUTTON_TRIM = {
  entity: true,
  backgroundOn: true,
  state: true,
  interactions: true,
  size: true,
} as const;

/** ha-form schema for a launcher button's "Button size" (nav-only). */
const LAUNCHER_SIZE_SCHEMA = [
  {
    name: "nav_button_size",
    selector: { select: { mode: "dropdown", options: [
      { value: "normal", label: "Normal" },
      { value: "wide", label: "Wide" },
    ] } },
  },
];

/** ha-form schema for the group-level launcher settings. Colors, combine + quick-launch
 *  are rendered separately (colors so their default shows muted; the toggles for their
 *  richer helper text). */
const LAUNCHER_TOP_SCHEMA = [
  { name: "launcher_enabled", selector: { boolean: {} } },
  {
    name: "launcher_section",
    selector: { select: { mode: "dropdown", options: LAUNCHER_SECTIONS.map((s) => ({ value: s.value, label: s.label })) } },
  },
];

const LAUNCHER_HIGHLIGHT_SCHEMA = [{ name: "launcher_highlight_active", selector: { boolean: {} } }];

/** Single-field color schemas, each seeded with its default so the picker shows the
 *  default value (rendered muted while unset — see `.lc-field.is-default`). */
const LAUNCHER_BUTTON_COLOR_SCHEMA = [
  { name: "launcher_button_color", selector: { ui_color: { default_color: "white" } } },
];
const LAUNCHER_HIGHLIGHT_COLOR_SCHEMA = [
  { name: "launcher_highlight_color", selector: { ui_color: { default_color: "accent" } } },
];

const LAUNCHER_LABELS: Record<string, string> = {
  launcher_enabled: "Enabled",
  launcher_section: "Section",
  launcher_combine_groups: "Auto-combine similar views",
  launcher_quick_launch: "Quick launch groups",
  launcher_button_color: "Button color",
  launcher_highlight_active: "Highlight current view",
  launcher_highlight_color: "Highlight color",
  nav_button_size: "Button size",
};

/** Group-level launcher setting keys persisted from the settings ha-form. */
const LAUNCHER_SETTING_KEYS = [
  "launcher_enabled",
  "launcher_section",
  "launcher_combine_groups",
  "launcher_quick_launch",
  "launcher_button_color",
  "launcher_highlight_active",
  "launcher_highlight_color",
] as const;

/** ha-form schema pieces for the Automatic Night Mode composite. */
const NIGHT_ENABLED_SCHEMA = [{ name: "night_enabled", selector: { boolean: {} } }];
const NIGHT_TIME_SCHEMA = [
  { name: "night_start", selector: { time: {} } },
  { name: "night_end", selector: { time: {} } },
];
const NIGHT_NUM_SCHEMA = [
  { name: "night_dim_brightness", selector: { number: { min: 0, max: 100, mode: "box", unit_of_measurement: "%" } } },
  { name: "night_dim_background", selector: { number: { min: 0, max: 100, mode: "box", unit_of_measurement: "%" } } },
  { name: "night_transition_seconds", selector: { number: { min: 0, max: 600, mode: "box", unit_of_measurement: "s" } } },
];
const NIGHT_COLOR_SCHEMA = [{ name: "night_font_color", selector: { ui_color: { default_color: "red" } } }];
const NIGHT_DARK_SCHEMA = [{ name: "night_dark_mode", selector: { boolean: {} } }];
const NIGHT_ENTITY_SCHEMA = [
  { name: "night_brightness_entity", selector: { entity: { domain: ["light", "number", "input_number"] } } },
];

const NIGHT_LABELS: Record<string, string> = {
  night_enabled: "Enabled",
  night_start: "Night start time",
  night_end: "Night end time",
  night_dim_brightness: "Dim brightness (screen)",
  night_dim_background: "Dim brightness (background)",
  night_font_color: "Night font color",
  night_transition_seconds: "Transition duration",
  night_dark_mode: "Switch to Dark mode",
  night_brightness_entity: "Screen brightness entity",
};

const NIGHT_HELPERS: Record<string, string> = {
  night_dim_brightness: "Target brightness level for the entire screen",
  night_dim_background: "Independant target brightness level for the background; stacks with screen brightness",
  night_dark_mode:
    "Stores this device's Auto/Light/Dark setting, switches to Dark shortly after the night transition, and restores it when night ends (needs browser_mod).",
};

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
  /** Active section (group name) when `section_tabs` is enabled. */
  @state() private _section?: string;
  /** How many section tabs fit in the strip; the rest go into the overflow menu. */
  @state() private _sectionVisibleCount = Number.POSITIVE_INFINITY;
  /** Effective category-tab header mode after any auto-shrink. */
  @state() private _sectionMode: SectionHeaderMode = "both";
  /** Fields the user is actively overriding on this device but hasn't stored a value for yet. */
  private _editing = new Set<string>();
  /** Which calendars have their per-calendar Options disclosure open (by entity id). */
  @state() private _calOptOpen = new Set<string>();
  /** Which launcher buttons have their options disclosure open (by view path). */
  @state() private _launcherOptOpen = new Set<string>();
  /** Embedded (controlled) Button Card editors for launcher options, by view path. */
  private _launcherEditors = new Map<string, { el: LovelaceCardEditor; json: string }>();
  private _launcherCreating = new Set<string>();
  /** The anchor calendar id whose "Link a calendar" chooser is open (or none). */
  @state() private _linkFor?: string;
  /** Search query in the "Link a calendar" chooser. */
  @state() private _linkQuery = "";
  /** The entity-list field whose "Add" chooser popup is open (Global scope), or none. */
  @state() private _addListField?: SettingField;
  /** Search query in the "Add" chooser popup. */
  @state() private _addListQuery = "";
  /** Resolved display URLs for media-source:// wallpaper thumbnails (uri → url). */
  private _bgThumbs = new Map<string, string>();
  /** media-source URI of the backend's "Ted Dash System" wallpaper folder (or null). */
  @state() private _mediaFolder: string | null = null;
  /** Bundled alert sounds offered in the sound-picker dropdowns. */
  @state() private _sounds: BundledSound[] = [];
  /** Sound fields the user switched to "Custom…" (so we show the URL/browse row). */
  @state() private _soundCustom = new Set<string>();
  /** The sound field key currently previewing (for the play/stop icon), or none. */
  @state() private _soundPlaying?: string;
  /** Shared audio element used to preview sounds. */
  private _soundAudio?: HTMLAudioElement;
  /** Watches the host width so the section tab strip can re-measure its overflow. */
  private _sectionResizeObserver?: ResizeObserver;
  /** The `.section-strip` element currently observed for width changes. */
  private _observedStrip?: HTMLElement;
  /** Pending rAF handle for a deferred overflow measurement. */
  private _sectionMeasureRaf?: number;

  public constructor() {
    super();
    // Registers itself as a reactive controller; keeps settings live for this card.
    new SettingsController(this, () => this.hass);
  }

  public setConfig(config: SettingsCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
    if (config.show_global === false && config.show_device !== false) this._tab = "device";
    // Re-measure from scratch at the configured header mode on any config change.
    this._sectionMode = config.tab_header ?? "both";
    this._sectionVisibleCount = Number.POSITIVE_INFINITY;
  }

  private _unsubScope?: () => void;
  /** Live readability-scrim diagnostic subscription (Debug-mode panel). */
  private _unsubBgDiag?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    // Live wallpaper readability diagnostics for the Debug-mode panel.
    this._unsubBgDiag ??= backgroundEngine.subscribeDiagnostic(() => this.requestUpdate());
    // Discover the dedicated wallpaper folder for uploads + the media pickers.
    if (this.hass) void getMediaFolder(this.hass).then((f) => (this._mediaFolder = f));
    // Load the bundled alert sounds for the sound-picker dropdowns.
    if (this.hass && !this._sounds.length) void listSounds(this.hass).then((s) => (this._sounds = s));
    // Follow the shared UI scope when this card is driven by an external toggle.
    if (
      this._config?.scope === "shared" ||
      this._config?.variant === "scope-toggle" ||
      this._config?.section_tabs !== false
    ) {
      this._unsubScope ??= subscribeUiScope(() => this.requestUpdate());
    }
    // Deep links: the active category (`?tab=`) and the scope (`?scope=`).
    window.addEventListener("location-changed", this._onLocationChanged);
    window.addEventListener("popstate", this._onLocationChanged);
    if (this._config?.section_tabs !== false) {
      this._sectionResizeObserver = new ResizeObserver(() => this._scheduleSectionMeasure());
      this._sectionResizeObserver.observe(this);
    }
    this._applyScopeFromUrl();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopSoundPreview();
    this._unsubScope?.();
    this._unsubScope = undefined;
    this._unsubBgDiag?.();
    this._unsubBgDiag = undefined;
    window.removeEventListener("location-changed", this._onLocationChanged);
    window.removeEventListener("popstate", this._onLocationChanged);
    this._sectionResizeObserver?.disconnect();
    this._sectionResizeObserver = undefined;
    this._observedStrip = undefined;
    if (this._sectionMeasureRaf != null) {
      cancelAnimationFrame(this._sectionMeasureRaf);
      this._sectionMeasureRaf = undefined;
    }
  }

  protected willUpdate(changed: PropertyValues): void {
    // Keep the embedded launcher button editors in sync with open rows + hass.
    if (changed.has("_launcherOptOpen") || changed.has("hass")) this._syncLauncherEditors();
  }

  protected updated(): void {
    // Discover the wallpaper folder once hass is available (may be unset at connect).
    if (this.hass && this._mediaFolder === null) {
      void getMediaFolder(this.hass).then((f) => {
        if (f) this._mediaFolder = f;
      });
    }
    // Load the bundled sounds once hass is available (may be unset at connect).
    if (this.hass && !this._sounds.length) {
      void listSounds(this.hass).then((s) => {
        if (s.length) this._sounds = s;
      });
    }
    // Also watch the strip itself: its width (the real "available" space) can change
    // without the host resizing (e.g. a scrollbar appearing, layout settling).
    this._ensureStripObserved();
    this._scheduleSectionMeasure();
  }

  private _ensureStripObserved(): void {
    if (!this._sectionResizeObserver) return;
    const strip = (this.renderRoot as ShadowRoot).querySelector(".section-strip") as HTMLElement | null;
    if (strip && strip !== this._observedStrip) {
      if (this._observedStrip) this._sectionResizeObserver.unobserve(this._observedStrip);
      this._sectionResizeObserver.observe(strip);
      this._observedStrip = strip;
    }
  }

  /** Measure on the next frame so widths are read after layout has settled (deduped). */
  private _scheduleSectionMeasure(): void {
    if (this._sectionMeasureRaf != null) return;
    this._sectionMeasureRaf = requestAnimationFrame(() => {
      this._sectionMeasureRaf = undefined;
      this._measureSectionOverflow();
    });
  }

  private _onLocationChanged = (): void => {
    if (this._config?.section_tabs !== false) {
      const s = this._sectionFromUrl();
      if (s && s !== this._section) this._section = s;
    }
    this._applyScopeFromUrl();
  };

  /** Whether this card follows the shared UI scope (vs. its own local tab state). */
  private _usesSharedScope(): boolean {
    return (
      this._config?.scope === "shared" ||
      this._config?.variant === "scope-toggle" ||
      this._config?.section_tabs !== false
    );
  }

  /** The scope named by the current URL's `?scope=` param, if any. */
  private _scopeFromUrl(): "global" | "device" | undefined {
    let raw: string | null = null;
    try {
      raw = new URLSearchParams(window.location.search).get(this._config?.scope_param || "scope");
    } catch {
      raw = null;
    }
    if (!raw) return undefined;
    const v = raw.toLowerCase();
    if (v === "global") return "global";
    if (v === "device" || v === "this_device" || v === "this-device" || v === "local") return "device";
    return undefined;
  }

  /** Apply a `?scope=` deep link to the shared UI scope (or local tab). */
  private _applyScopeFromUrl(): void {
    const s = this._scopeFromUrl();
    if (!s) return;
    if (s === "global" && this._config?.show_global === false) return;
    if (s === "device" && this._config?.show_device === false) return;
    if (this._usesSharedScope()) {
      if (getUiScope() !== s) setUiScope(s);
    } else if (this._tab !== s) {
      this._tab = s;
    }
  }

  /** Groups shown as section tabs (optionally limited by the `sections` config). */
  private _sectionGroups(): ReturnType<typeof fieldsByGroup> {
    const cfg = this._config;
    return cfg?.sections?.length
      ? fieldsByGroup().filter((g) => cfg.sections!.includes(g.group))
      : fieldsByGroup();
  }

  /** The section named by the current URL's `?tab=` param, if it matches a group. */
  private _sectionFromUrl(): string | undefined {
    let raw: string | null = null;
    try {
      raw = new URLSearchParams(window.location.search).get(this._config?.url_param || "tab");
    } catch {
      raw = null;
    }
    if (!raw) return undefined;
    const match = this._sectionGroups().find((g) => g.group.toLowerCase() === raw!.toLowerCase());
    return match?.group;
  }

  /** Resolve the active section: explicit selection, else a deep link, else the first. */
  private _activeSection(groups: ReturnType<typeof fieldsByGroup>): string {
    if (this._section && groups.some((g) => g.group === this._section)) return this._section;
    return this._sectionFromUrl() ?? groups[0]?.group ?? "";
  }

  private _selectSection(name: string): void {
    this._section = name;
  }

  /** Category tab icon, following the configured `icon_set` (Fluent/mdi today; mdi fallback). */
  private _groupIcon(name: string): string {
    const entry = SETTINGS_GROUP_ICONS[name];
    if (!entry) return "";
    const set = String(settingsStore.effective().icon_set ?? "auto");
    return resolveIconForSet(entry, set) ?? entry.mdi;
  }

  /** Select options, annotating icon-set choices that aren't installed on this client. */
  private _selectOptions(field: SettingField): { value: string; label: string }[] {
    const opts = field.options ?? [];
    if (field.key !== "icon_set") return opts;
    return opts.map((o) =>
      o.value === "auto" || isIconSetAvailable(o.value)
        ? o
        : { value: o.value, label: `${o.label} — not installed` },
    );
  }

  /** One section tab button (shared by the visible strip and the hidden measure mirror). */
  private _renderSectionTab(name: string, active: string, mode: SectionHeaderMode): TemplateResult {
    const icon = this._groupIcon(name);
    const showIcon = mode !== "name";
    const showLabel = mode !== "icon";
    return html`<button
      type="button"
      role="tab"
      class="section-tab ${name === active ? "active" : ""}${mode === "icon" ? " icon-only" : ""}"
      aria-selected=${name === active ? "true" : "false"}
      title=${name}
      @click=${() => this._selectSection(name)}
    >
      ${showIcon && icon ? html`<ha-icon .icon=${icon}></ha-icon>` : nothing}
      ${showLabel ? html`<span>${name}</span>` : nothing}
    </button>`;
  }

  /**
   * Decide the effective category-tab header mode + how many tabs fit; the rest move into
   * the "…" overflow menu. Reads widths from the hidden `.section-measure` mirror (rendered
   * at both the configured mode and icon-only) so the result is stable (no measure→render
   * loop); only writes state when it changes, so it converges in one extra pass.
   */
  private _measureSectionOverflow(): void {
    if (this._config?.section_tabs === false) return;
    const root = this.renderRoot as ShadowRoot;
    const strip = root.querySelector(".section-strip") as HTMLElement | null;
    const fullRow = root.querySelector(".section-measure-full") as HTMLElement | null;
    const iconRow = root.querySelector(".section-measure-icon") as HTMLElement | null;
    if (!strip || !fullRow || !iconRow) return;
    const available = strip.clientWidth;
    if (available <= 0) return;
    const total = fullRow.children.length;
    if (total === 0) return;

    const { mode, visibleCount } = computeTabOverflow<SectionHeaderMode>({
      fullWidths: Array.from(fullRow.children).map((c) => (c as HTMLElement).offsetWidth),
      iconWidths: Array.from(iconRow.children).map((c) => (c as HTMLElement).offsetWidth),
      available,
      configMode: this._config?.tab_header ?? "both",
      iconMode: "icon",
      autoShrink: this._config?.auto_shrink !== false,
    });
    if (mode !== this._sectionMode) this._sectionMode = mode;
    if (visibleCount !== this._sectionVisibleCount) this._sectionVisibleCount = visibleCount;
  }

  private _onSectionOverflowToggle = (ev: Event): void => {
    const pop = ev.currentTarget as HTMLElement;
    if ((ev as Event & { newState?: string }).newState !== "open") return;
    const anchor = (this.renderRoot as ShadowRoot).getElementById("section-overflow-btn");
    this._positionSectionOverflow(pop, anchor ?? undefined);
  };

  /** Anchor the overflow popover under the “…” trigger (flipping above if there's no room). */
  private _positionSectionOverflow(pop: HTMLElement, anchor?: HTMLElement): void {
    positionOverflowPopover(pop, anchor);
  }

  private _selectSectionFromOverflow(name: string): void {
    this._selectSection(name);
    const pop = (this.renderRoot as ShadowRoot).getElementById("section-overflow-pop") as
      | (HTMLElement & { hidePopover?: () => void })
      | null;
    pop?.hidePopover?.();
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

  /** Non-admins may only read Global settings (device-scope stays editable). */
  private _isAdmin(): boolean {
    return !!this.hass?.user?.is_admin;
  }

  private _setDevice(key: string, value: SettingsValue): void {
    settingsStore.setValue("device", key, value);
  }

  /** This device's own media player (the playback fallback when nothing is set). */
  private _deviceMediaPlayer(): string | undefined {
    return resolveDeviceMediaPlayer(this.hass);
  }

  /** Entity ids from a given integration platform (optionally limited to a domain). */
  private _entitiesForPlatform(platform: string, domain?: string): string[] {
    const reg =
      (this.hass as unknown as { entities?: Record<string, { platform?: string } | undefined> })
        .entities ?? {};
    return Object.keys(reg).filter(
      (id) => reg[id]?.platform === platform && (!domain || id.startsWith(`${domain}.`)),
    );
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

  /** The fallback hint for the music player — shows the auto-matched Music Assistant player. */
  private _musicFallbackHint(): TemplateResult {
    const res = resolveMusicPlayer(this.hass);
    if (res.state === "ok") {
      return html`<span class="help"
        >When unset, uses this device's Music Assistant player:
        <b>${this._entityLabel(res.entity)}</b>${res.matched ? " (auto-matched)" : nothing}</span
      >`;
    }
    if (res.state === "unmatched") {
      return html`<span class="help"
        >No Music Assistant player found for this device (nearest speaker:
        <b>${this._entityLabel(res.base)}</b>).</span
      >`;
    }
    return html`<span class="help">No music player found for this device.</span>`;
  }

  /** The correct fallback hint for a media-player field key. */
  private _fallbackHintFor(key: string): TemplateResult | typeof nothing {
    if (key === "music_player") return this._musicFallbackHint();
    if (key === "system_sound_player") return this._mediaFallbackHint();
    return nothing;
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
    // Root-relative dashboard path: fixed `<root>/` prefix, stored as `[root]/<seg>`.
    if (field.rootRelative) {
      const root = String(settingsStore.effective().dashboard_root ?? "");
      const raw = typeof value === "string" ? value : "";
      const rel = raw.startsWith("[root]/")
        ? raw.slice(7)
        : raw.startsWith("[root]")
          ? raw.slice(6)
          : raw;
      return html`<div class="rootpath">
        <span class="rootprefix" title="Dashboard root">${root}/</span>
        <input
          class="txt"
          type="text"
          .value=${rel}
          ?disabled=${disabled}
          @change=${(e: Event) => {
            const seg = (e.target as HTMLInputElement).value.trim().replace(/^\/+/, "");
            onChange(`[root]/${seg}`);
          }}
        />
      </div>`;
    }
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
      case "select":
        return html`<select
          class="sel"
          .value=${String(value ?? "")}
          ?disabled=${disabled}
          @change=${(e: Event) => onChange((e.target as HTMLSelectElement).value)}
        >
          ${this._selectOptions(field).map(
            (o) => html`<option value=${o.value} ?selected=${String(value) === o.value}>${o.label}</option>`,
          )}
        </select>`;
      case "entity": {
        const includeEntities = field.entityPlatform
          ? this._entitiesForPlatform(field.entityPlatform, field.entityDomain)
          : undefined;
        return html`<ha-entity-picker
          .hass=${this.hass}
          .value=${typeof value === "string" ? value : ""}
          .includeDomains=${includeEntities || !field.entityDomain ? undefined : [field.entityDomain]}
          .includeEntities=${includeEntities}
          .disabled=${disabled}
          allow-custom-entity
          @value-changed=${(e: CustomEvent) => onChange(e.detail.value || null)}
        ></ha-entity-picker>`;
      }
      case "media":
        return this._renderSoundPicker(field, value, disabled, onChange);
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

  /** The actual sound a "default" media field resolves to (shown as its placeholder). */
  private _resolvedDefaultSound(key: string): string {
    const bundled = (name: string) => `/teds_cards_backend/sounds/${name}.mp3`;
    if (key === "timer_alert_sound") return bundled("timer");
    if (key === "alarm_alert_sound") return bundled("alarm");
    if (key === "notification_sound") return bundled("notification");
    // Per-severity notification sounds fall back to the general notification sound.
    const general = settingsStore.effective().notification_sound;
    if (typeof general === "string" && general && general !== DEFAULT_SOUND) return general;
    return bundled("notification");
  }

  /** Sound field: a dropdown of bundled sounds (+ Default / Custom), a preview
   *  play button, and a Browse/URL row when Custom is chosen. */
  private _renderSoundPicker(
    field: SettingField,
    value: SettingsValue,
    disabled: boolean,
    onChange: (v: SettingsValue) => void,
  ): TemplateResult {
    const cur = typeof value === "string" ? value : "";
    const isDefault = !cur || cur === DEFAULT_SOUND;
    const bundled = this._sounds.find((s) => s.url === cur);
    const isCustom = (!isDefault && !bundled) || this._soundCustom.has(field.key);
    const selectValue = isCustom ? "__custom__" : isDefault ? "" : bundled?.url ?? "";

    const cats: string[] = [];
    for (const s of this._sounds) if (!cats.includes(s.category)) cats.push(s.category);

    const onSelect = (e: Event): void => {
      const v = (e.target as HTMLSelectElement).value;
      if (v === "__custom__") {
        this._soundCustom = new Set(this._soundCustom).add(field.key);
        // Preserve an existing custom URL; a bundled/default pick starts blank.
        if (isDefault || bundled) onChange(DEFAULT_SOUND);
        return;
      }
      const next = new Set(this._soundCustom);
      next.delete(field.key);
      this._soundCustom = next;
      onChange(v === "" ? DEFAULT_SOUND : v);
    };

    const playing = this._soundPlaying === field.key;
    return html`
      <div class="sound-field">
        <div class="sound-row">
          <select class="sel sound-select" .value=${selectValue} ?disabled=${disabled} @change=${onSelect}>
            <option value="" ?selected=${selectValue === ""}>Default</option>
            ${cats.map(
              (c) => html`<optgroup label=${c}>
                ${this._sounds
                  .filter((s) => s.category === c)
                  .map((s) => html`<option value=${s.url} ?selected=${s.url === selectValue}>${s.name}</option>`)}
              </optgroup>`,
            )}
            <option value="__custom__" ?selected=${isCustom}>Custom…</option>
          </select>
          <button
            class="sound-play"
            title=${playing ? "Stop" : "Preview"}
            ?disabled=${disabled}
            @click=${() => (playing ? this._stopSoundPreview() : void this._previewSound(field, cur))}
          >
            <ha-icon icon=${playing ? "mdi:stop" : "mdi:play"}></ha-icon>
          </button>
        </div>
        ${isCustom
          ? html`<div class="sound-custom">
              <input
                class="txt"
                type="text"
                .value=${isDefault || bundled ? "" : cur}
                placeholder="media-source://… or https://…"
                ?disabled=${disabled}
                @change=${(e: Event) => {
                  const v = (e.target as HTMLInputElement).value.trim();
                  onChange(v === "" ? DEFAULT_SOUND : v);
                }}
              />
              <button class="sound-browse" ?disabled=${disabled} @click=${() => void this._browseSound(onChange)}>
                Browse…
              </button>
            </div>`
          : nothing}
      </div>
    `;
  }

  /** Open HA's media browser to pick a custom sound file (audio). */
  private async _browseSound(onChange: (v: SettingsValue) => void): Promise<void> {
    if (!this.hass) return;
    const uri = await pickMedia(this, this.hass, { accept: ["audio/*"] });
    if (uri) onChange(uri);
  }

  /** Preview a sound in-browser: resolves media-source URIs, plays a bundled/URL
   *  sound directly, and falls back to the field's default when unset. */
  private async _previewSound(field: SettingField, value: string): Promise<void> {
    if (!this.hass) return;
    this._stopSoundPreview();
    let url: string | null = !value || value === DEFAULT_SOUND ? this._resolvedDefaultSound(field.key) : value;
    if (isMediaSourceUri(url)) url = await resolveMediaSource(this.hass, url);
    if (!url) return;
    const audio = (this._soundAudio ??= new Audio());
    audio.onended = () => (this._soundPlaying = undefined);
    audio.onerror = () => (this._soundPlaying = undefined);
    audio.src = url;
    this._soundPlaying = field.key;
    try {
      await audio.play();
    } catch {
      this._soundPlaying = undefined;
    }
  }

  /** Stop any in-progress sound preview. */
  private _stopSoundPreview(): void {
    if (this._soundAudio) {
      this._soundAudio.pause();
      this._soundAudio.currentTime = 0;
    }
    this._soundPlaying = undefined;
  }

  /** Render a group's fields: un-subsectioned fields inline, then a collapsible panel
   *  per named `subsection` (in first-appearance order) at the bottom. */
  private _renderFields(fields: SettingField[], scope: "global" | "device"): TemplateResult {
    const row = (f: SettingField): TemplateResult =>
      scope === "global" ? this._renderGlobalRow(f) : this._renderDeviceRow(f);
    const inline = fields.filter((f) => !f.subsection);
    const order: string[] = [];
    for (const f of fields) {
      if (f.subsection && !order.includes(f.subsection)) order.push(f.subsection);
    }
    return html`
      ${inline.map(row)}
      ${order.map(
        (name) => html`<ha-expansion-panel outlined class="sub-panel">
          <div slot="header" class="sub-head">
            <ha-icon icon=${this._subsectionIcon(name)}></ha-icon>
            <span class="sub-head-label">${name}</span>
          </div>
          <div class="sub-body">
            ${fields.filter((f) => f.subsection === name).map(row)}
          </div>
        </ha-expansion-panel>`,
      )}
    `;
  }

  /** Icon for a collapsible subsection header, following the configured icon set. */
  private _subsectionIcon(name: string): string {
    const set = String(settingsStore.effective().icon_set ?? "auto");
    const entry = SUBSECTION_ICONS[name];
    return (entry && resolveIconForSet(entry, set)) || "mdi:tune";
  }

  private _renderGlobalRow(field: SettingField): TemplateResult {
    if (field.kind === "entity-list") return this._renderCamerasGlobal(field);
    if (field.kind === "announce-messages") return this._renderAnnounceMessages("global");
    if (field.kind === "background") return this._renderBackground(field, "global");
    if (field.kind === "nightmode") return this._renderNightMode(field, "global");
    if (field.kind === "launcher") return this._renderLauncher("global");
    // Device-only fields (e.g. the media player) have no sensible global value.
    if (field.deviceOnly) {
      return html`
        <div class="row">
          <div class="row-label">
            <span>${field.label}</span>
            <span class="help">Set on the “This device” tab.</span>
            ${this._fallbackHintFor(field.key)}
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
          ${this._renderControl(field, this._globalValue(field.key), !this._isAdmin(), (v) =>
            this._isAdmin() ? this._setGlobal(field.key, v) : undefined,
          )}
        </div>
      </div>
    `;
  }

  private _renderDeviceRow(field: SettingField): TemplateResult {
    if (field.kind === "entity-list") return this._renderCamerasDevice(field);
    if (field.kind === "announce-messages") return this._renderAnnounceMessages("device");
    if (field.kind === "background") return this._renderBackground(field, "device");
    if (field.kind === "nightmode") return this._renderNightMode(field, "device");
    if (field.kind === "launcher") return this._renderLauncher("device");
    const overriding = this._deviceOverriding(field.key);
    return html`
      <div class="row">
        <div class="row-label">
          <span>${field.label}</span>
          ${overriding ? nothing : html`<span class="inherit-tag">Inherited</span>`}
          ${(field.key === "system_sound_player" || field.key === "music_player") && !overriding
            ? this._fallbackHintFor(field.key)
            : nothing}
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

  // --- Announce: predefined message list (global; managed on the Global tab) ---
  private _announceMessages(): AnnounceMessage[] {
    const v = this._globalValue("announce_messages");
    return Array.isArray(v) ? (v as unknown as AnnounceMessage[]) : [];
  }

  private _commitAnnounceMessages(list: AnnounceMessage[]): void {
    // Keep every row (including a freshly-added blank one so it renders for editing);
    // trim the text and drop an empty icon. Empty rows are removed via the delete button.
    const clean = list.map((m) => ({
      id: m.id,
      label: (m.label || "").trim(),
      text: (m.text || "").trim(),
      ...(m.icon?.trim() ? { icon: m.icon.trim() } : {}),
    }));
    this._setGlobal("announce_messages", clean as unknown as SettingsValue);
  }

  private _updateAnnounceMessage(index: number, key: keyof AnnounceMessage, ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    const list = this._announceMessages().map((m) => ({ ...m }));
    if (!list[index]) return;
    (list[index][key] as string) = value;
    this._commitAnnounceMessages(list);
  }

  private _addAnnounceMessage(): void {
    if (!this._isAdmin()) return;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now().toString(36)}`;
    this._commitAnnounceMessages([...this._announceMessages(), { id, label: "", text: "", icon: "" }]);
  }

  private _removeAnnounceMessage(index: number): void {
    const list = this._announceMessages().filter((_, i) => i !== index);
    this._commitAnnounceMessages(list);
  }

  private _renderAnnounceMessages(scope: "global" | "device"): TemplateResult {
    if (scope === "device") {
      return html`
        <div class="row">
          <div class="row-label">
            <span>Predefined messages</span>
            <span class="help">Managed globally — edit them on the “Global” tab.</span>
          </div>
        </div>
      `;
    }
    const admin = this._isAdmin();
    const messages = this._announceMessages();
    return html`
      <div class="row col">
        <div class="row-label">
          <span>Predefined messages</span>
          <span class="help">Ready-made announcements shown in the Announce view.</span>
        </div>
        <div class="ann-list">
          ${messages.map(
            (m, i) => html`
              <div class="ann-row">
                <input
                  class="ann-input ann-icon"
                  type="text"
                  .value=${m.icon ?? ""}
                  placeholder="mdi:bullhorn"
                  ?disabled=${!admin}
                  @change=${(e: Event) => this._updateAnnounceMessage(i, "icon", e)}
                />
                <input
                  class="ann-input ann-label"
                  type="text"
                  .value=${m.label ?? ""}
                  placeholder="Label"
                  ?disabled=${!admin}
                  @change=${(e: Event) => this._updateAnnounceMessage(i, "label", e)}
                />
                <input
                  class="ann-input ann-text"
                  type="text"
                  .value=${m.text ?? ""}
                  placeholder="Spoken message"
                  ?disabled=${!admin}
                  @change=${(e: Event) => this._updateAnnounceMessage(i, "text", e)}
                />
                <button
                  class="ovr"
                  title="Remove message"
                  ?disabled=${!admin}
                  @click=${() => this._removeAnnounceMessage(i)}
                >
                  <ha-icon icon="mdi:delete"></ha-icon>
                </button>
              </div>
            `,
          )}
          ${admin
            ? html`<button class="ann-add" @click=${() => this._addAnnounceMessage()}>
                <ha-icon icon="mdi:plus"></ha-icon> Add message
              </button>`
            : nothing}
        </div>
      </div>
    `;
  }

  // --- Entity-list field (Global = available allow-list; Device = curated subset) ---
  //     Shared by Cameras (camera.*) and Thermostats (climate.*), keyed by field.entityDomain.

  /** Per-domain presentation: list icon and the noun used in labels/buttons. */
  private _listMeta(field: SettingField): { icon: string; noun: string; nounPlural: string } {
    if (field.entityDomain === "climate") {
      return { icon: "mdi:thermostat", noun: "thermostat", nounPlural: "thermostats" };
    }
    if (field.entityDomain === "calendar") {
      return { icon: "mdi:calendar", noun: "calendar", nounPlural: "calendars" };
    }
    return { icon: "mdi:cctv", noun: "camera", nounPlural: "cameras" };
  }

  private _camerasArray(v: SettingsValue): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  }

  /** All entities in the given domain (e.g. `camera` or `climate`), sorted. */
  private _allCameras(domain: string): string[] {
    if (!this.hass) return [];
    return Object.keys(this.hass.states)
      .filter((id) => id.startsWith(`${domain}.`))
      .sort();
  }

  private _cameraName(id: string): string {
    const fn = this.hass?.states[id]?.attributes?.friendly_name;
    return typeof fn === "string" && fn ? fn : id;
  }

  /** A list of entity rows. Editable (drag to reorder + remove) unless `readonly`,
   *  in which case it's a static, non-interactive display (used for the inherited view).
   *  When `options` is provided (Calendars Global list), each row gains a collapsible
   *  per-calendar Options disclosure. */
  private _renderCameraChips(
    ids: string[],
    icon: string,
    onRemove: (idx: number) => void,
    onMove: (from: number, to: number) => void,
    readonly = false,
    options?: {
      isOpen: (id: string) => boolean;
      toggle: (id: string) => void;
      body: (id: string) => TemplateResult;
      /** Per-row icon override (e.g. a calendar's configured/own icon). */
      icon?: (id: string) => string;
      /** Per-row name override (e.g. a calendar's configured name). */
      name?: (id: string) => string;
      /** Per-row color swatch (resolved CSS color; empty = no swatch). */
      color?: (id: string) => string;
      /** Per-row person avatar URL (empty = none). */
      person?: (id: string) => string;
      /** Whether the person avatar is available but NOT the active badge (greyed). */
      personMuted?: (id: string) => boolean;
      /** Whether to show the virtual-group indicator icon on the row. */
      badge?: (id: string) => boolean;
      /** The group-indicator icon (defaults to the calendar-multiple glyph). */
      badgeIcon?: string;
      /** A "linked to <group>" tag for calendars linked into a virtual calendar. */
      tag?: (id: string) => string;
      /** Word shown before the tag's group name (defaults to "linked to"). */
      tagPrefix?: string;
      /** When false, a tagged row keeps its drag handle + remove button (defaults true). */
      tagLocksRow?: boolean;
      /** Whether to hide the Options disclosure (for grouped member rows). */
      optionsHidden?: (id: string) => boolean;
    },
  ): TemplateResult {
    const rows = ids.map((id, idx) => {
      const rowIcon = options?.icon?.(id) || icon;
      const rowName = options?.name?.(id) || this._cameraName(id);
      const rowColor = options?.color?.(id) || "";
      const rowPerson = options?.person?.(id) || "";
      const rowPersonMuted = options?.personMuted?.(id) || false;
      const rowBadge = options?.badge?.(id) || false;
      const rowTag = options?.tag?.(id) || "";
      const optHidden = options?.optionsHidden?.(id) || false;
      const isLinked = !!rowTag;
      const locked = isLinked && options?.tagLocksRow !== false;
      const row = html`
        <div
          class="cam-item ${readonly ? "readonly" : ""} ${rowColor && !isLinked ? "tinted" : ""} ${isLinked ? "linked" : ""}"
          style=${rowColor && !isLinked ? styleMap({ "--cam-tint": rowColor }) : nothing}
        >
          ${readonly || locked
            ? nothing
            : html`<div class="cam-grip" title="Drag to reorder">
                <ha-icon icon="mdi:drag"></ha-icon>
              </div>`}
          <ha-icon class="cam-ico" .icon=${rowIcon}></ha-icon>
          <span class="cam-name">${rowName}</span>
          ${rowBadge
            ? html`<ha-icon class="cam-groupico" .icon=${options?.badgeIcon || "mdi:calendar-multiple"} title="Group"></ha-icon>`
            : nothing}
          ${rowTag
            ? html`<span class="cam-tag" title="${options?.tagPrefix || "linked to"} ${rowTag}">${options?.tagPrefix || "linked to"} ${rowTag}</span>`
            : nothing}
          ${!readonly && rowPerson
            ? html`<img
                class="cam-avatar ${rowPersonMuted ? "muted" : ""}"
                src=${rowPerson}
                alt=""
                title=${rowPersonMuted ? "Person available (badge source is Icon)" : "Person badge"}
              />`
            : nothing}
          ${!readonly && options && !optHidden
            ? html`<button
                class="cam-opt ${options.isOpen(id) ? "on" : ""}"
                title="Options"
                @click=${() => options.toggle(id)}
              >
                <ha-icon icon=${options.isOpen(id) ? "mdi:chevron-up" : "mdi:chevron-down"}></ha-icon>
              </button>`
            : nothing}
          ${readonly || locked
            ? nothing
            : html`<button class="cam-del" title="Remove" @click=${() => onRemove(idx)}>
                <ha-icon icon="mdi:close"></ha-icon>
              </button>`}
        </div>
      `;
      if (!options) return row;
      return html`<div class="cam-entry">
        ${row}
        ${options.isOpen(id) && !optHidden
          ? html`<div class="cam-opt-body">${options.body(id)}</div>`
          : nothing}
      </div>`;
    });
    if (readonly) return html`<div class="cam-list">${rows}</div>`;
    return html`
      <ha-sortable
        handle-selector=".cam-grip"
        @item-moved=${(e: CustomEvent) => {
          const { oldIndex, newIndex } = e.detail as { oldIndex: number; newIndex: number };
          onMove(oldIndex, newIndex);
        }}
      >
        <div class="cam-list">${rows}</div>
      </ha-sortable>
    `;
  }

  // --- Per-calendar options (Calendars Global list; calendar-wide, stored global) ---

  private _toggleCalOpt(id: string): void {
    const next = new Set(this._calOptOpen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this._calOptOpen = next;
  }

  /** The global per-calendar options map, keyed by calendar entity id. */
  private _calendarOptionsMap(): Record<string, Record<string, unknown>> {
    const v = this._globalValue("calendar_options");
    const out: Record<string, Record<string, unknown>> = {};
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [id, opt] of Object.entries(v as Record<string, unknown>)) {
        if (opt && typeof opt === "object" && !Array.isArray(opt)) {
          out[id] = { ...(opt as Record<string, unknown>) };
        }
      }
    }
    return out;
  }

  /** A calendar's collapsed-row icon: its configured icon, else the entity's own
   *  icon, else the default calendar glyph. */
  private _calendarRowIcon(id: string): string {
    const opt = this._calendarOptionsMap()[id] ?? {};
    const configured = typeof opt.icon === "string" ? opt.icon : "";
    const entityIcon = this.hass?.states[id]?.attributes?.icon;
    return configured || (typeof entityIcon === "string" ? entityIcon : "") || "mdi:calendar";
  }

  /** A calendar's collapsed-row name: its configured name (or virtual name), else friendly. */
  private _calendarRowName(id: string): string {
    const opt = this._calendarOptionsMap()[id] ?? {};
    const configured = opt.virtual
      ? typeof opt.virtual_name === "string"
        ? opt.virtual_name
        : ""
      : typeof opt.name === "string"
        ? opt.name
        : "";
    return configured || this._cameraName(id);
  }

  /** A calendar's collapsed-row color swatch (resolved CSS color), or "" when unset. */
  private _calendarRowColor(id: string): string {
    const opt = this._calendarOptionsMap()[id] ?? {};
    const c = typeof opt.color === "string" ? opt.color : "";
    return c ? (cssColor(c) ?? c) : "";
  }

  /** The avatar URL for a calendar's linked person (explicit, else auto-matched by
   *  name), or "" when there's no matching person / picture. Shown even when the badge
   *  source is Icon (greyed via `_calendarRowPersonMuted`) to indicate it's available. */
  private _calendarRowPersonPicture(id: string): string {
    const opt = this._calendarOptionsMap()[id] ?? {};
    const explicit = typeof opt.person === "string" ? opt.person : "";
    const name = typeof opt.name === "string" && opt.name ? opt.name : this._cameraName(id);
    const person = explicit || matchPerson(this.hass?.states, name) || "";
    if (!person) return "";
    const pic = this.hass?.states[person]?.attributes?.entity_picture;
    return typeof pic === "string" ? pic : "";
  }

  /** Whether a calendar's person avatar is present but NOT the active badge (badge
   *  source explicitly set to Icon) — rendered greyscale as an "available" hint. */
  private _calendarRowPersonMuted(id: string): boolean {
    return this._calendarOptionsMap()[id]?.icon_source === "icon";
  }

  /** The per-calendar Options form for one calendar in the Global list. The Virtual
   *  toggle sits at the top; when on, the Linked Calendars block appears directly below
   *  it, above the rest of the options. */
  private _renderCalendarOptions(id: string): TemplateResult {
    const opt = this._calendarOptionsMap()[id] ?? {};
    const item = { entity: id, ...(opt as Partial<CalendarItemConfig>) } as CalendarItemConfig;
    const form = (schema: unknown): TemplateResult => html`
      <ha-form
        .hass=${this.hass}
        .data=${calendarOptionsData(this.hass, item)}
        .schema=${schema}
        .computeLabel=${(s: { name: string }) => calendarOptionLabel(s.name)}
        .computeHelper=${(s: { name: string }) => calendarOptionHelper(s.name)}
        @value-changed=${(ev: CustomEvent) => this._calendarOptionChanged(id, ev)}
      ></ha-form>
    `;
    return html`
      ${form(calendarVirtualToggleSchema())}
      ${item.virtual
        ? renderVirtualMembers(
            this.hass,
            Array.isArray(item.virtual_members) ? item.virtual_members : [],
            (next) => this._calendarMembersChanged(id, next),
            () => this._openLink(id),
          )
        : nothing}
      ${form(calendarOptionsSchema(this.hass, item))}
      ${renderHiddenEvents(
        Array.isArray(item.hidden_events) ? item.hidden_events : [],
        (next) => this._calendarHiddenChanged(id, next),
      )}
    `;
  }

  private _openLink(id: string): void {
    this._linkQuery = "";
    this._linkFor = id;
  }

  private _closeLink(): void {
    this._linkFor = undefined;
  }

  /** The "Link a calendar" chooser modal (sibling of the card). */
  private _renderLinkModal(): TemplateResult | typeof nothing {
    const id = this._linkFor;
    if (!id) return nothing;
    const map = this._calendarOptionsMap();
    const members = Array.isArray(map[id]?.virtual_members)
      ? (map[id]!.virtual_members as string[])
      : [];
    const candidates = virtualJoinCandidates(
      this._camerasArray(this._globalValue("calendars_list")),
      id,
      this._calendarItems(),
    ).filter((c) => !members.includes(c));
    return renderVirtualLinkModal(
      this.hass,
      candidates,
      this._linkQuery,
      (q) => (this._linkQuery = q),
      (memberId) => this._calendarMembersChanged(id, [...members, memberId]),
      () => this._closeLink(),
    );
  }

  /** Calendar items (global list ids merged with their options), for virtual grouping. */
  private _calendarItems(): CalendarItemConfig[] {
    const ids = this._camerasArray(this._globalValue("calendars_list"));
    const map = this._calendarOptionsMap();
    return ids.map((id) => ({ entity: id, ...(map[id] ?? {}) }) as CalendarItemConfig);
  }

  /** A virtual group's member list changed — persist it into `calendar_options`. */
  private _calendarMembersChanged(id: string, members: string[]): void {
    const map = this._calendarOptionsMap();
    const opt = { ...(map[id] ?? {}) };
    if (members.length) opt.virtual_members = members;
    else delete opt.virtual_members;
    if (Object.keys(opt).length) map[id] = opt;
    else delete map[id];
    this._setGlobal("calendar_options", map);
    // Re-order the global list so linked children sit directly under their parent.
    const ids = this._camerasArray(this._globalValue("calendars_list"));
    const items = ids.map((e) => ({ entity: e, ...(map[e] ?? {}) }) as CalendarItemConfig);
    const reordered = reorderVirtualGroupIds(ids, items);
    if (reordered.some((v, i) => v !== ids[i])) this._setGlobal("calendars_list", reordered);
  }

  /** A calendar's hidden-events rules changed — persist into `calendar_options`. */
  private _calendarHiddenChanged(id: string, rules: HiddenEventRule[]): void {
    const map = this._calendarOptionsMap();
    const opt = { ...(map[id] ?? {}) };
    if (rules.length) opt.hidden_events = rules;
    else delete opt.hidden_events;
    if (Object.keys(opt).length) map[id] = opt;
    else delete map[id];
    this._setGlobal("calendar_options", map);
  }

  private _calendarOptionChanged(id: string, ev: CustomEvent): void {
    ev.stopPropagation();
    const v = ev.detail.value as Record<string, unknown>;
    const map = this._calendarOptionsMap();
    const cur = { entity: id, ...(map[id] ?? {}) } as CalendarItemConfig;
    const next = applyCalendarOptionChange(this.hass, cur, v);
    // Store only real options (drop the entity key + empty/undefined values).
    const opt: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(next)) {
      if (k === "entity" || val === undefined || val === "") continue;
      if (Array.isArray(val) && val.length === 0) continue;
      opt[k] = val;
    }
    if (Object.keys(opt).length) map[id] = opt;
    else delete map[id];
    this._setGlobal("calendar_options", map);
  }

  private _renderCamerasGlobal(field: SettingField): TemplateResult {
    const admin = this._isAdmin();
    const meta = this._listMeta(field);
    const domain = field.entityDomain ?? "camera";
    const ids = this._camerasArray(this._globalValue(field.key));
    const remaining = this._allCameras(domain).filter((id) => !ids.includes(id));
    const setList = (next: string[]): void => this._setGlobal(field.key, next);
    return html`
      <div class="cam-row">
        <div class="cam-head">
          <div class="row-label">
            <span>${field.label} — available list and settings</span>
          </div>
          ${admin
            ? html`<button class="cam-btn" @click=${() => this._autoPopulateGlobal(field)}>
                <ha-icon icon="mdi:auto-fix"></ha-icon><span>Auto-populate</span>
              </button>`
            : nothing}
        </div>
        ${ids.length
          ? this._renderCameraChips(
              ids,
              meta.icon,
              (idx) => {
                if (!admin) return;
                const n = [...ids];
                n.splice(idx, 1);
                setList(n);
              },
              (from, to) => {
                if (!admin) return;
                const n = [...ids];
                n.splice(to, 0, n.splice(from, 1)[0]);
                // Keep virtual children directly under their parent when a parent moves.
                if (domain === "calendar") {
                  const map = this._calendarOptionsMap();
                  const items = n.map((e) => ({ entity: e, ...(map[e] ?? {}) }) as CalendarItemConfig);
                  setList(reorderVirtualGroupIds(n, items));
                } else {
                  setList(n);
                }
              },
              false,
              admin && domain === "calendar"
                ? {
                    isOpen: (id) => this._calOptOpen.has(id),
                    toggle: (id) => this._toggleCalOpt(id),
                    body: (id) => this._renderCalendarOptions(id),
                    icon: (id) => this._calendarRowIcon(id),
                    name: (id) => this._calendarRowName(id),
                    color: (id) => this._calendarRowColor(id),
                    person: (id) => this._calendarRowPersonPicture(id),
                    personMuted: (id) => this._calendarRowPersonMuted(id),
                    badge: (id) => this._calendarOptionsMap()[id]?.virtual === true,
                    tag: (id) => virtualGroupNameFor(this.hass, id, this._calendarItems()),
                    optionsHidden: (id) =>
                      !!virtualGroupNameFor(this.hass, id, this._calendarItems()),
                  }
                : undefined,
            )
          : html`<div class="help">No ${meta.nounPlural} yet — add one below or tap “Auto-populate”.</div>`}
        ${admin && remaining.length
          ? html`<button class="cam-btn add-list-btn" @click=${() => this._openAddList(field)}>
              <ha-icon icon="mdi:plus"></ha-icon><span>Add a ${meta.noun}</span>
            </button>`
          : nothing}
      </div>
    `;
  }

  /** Open the "Add" chooser popup for an entity-list field (Global scope). */
  private _openAddList(field: SettingField): void {
    this._addListQuery = "";
    this._addListField = field;
  }

  private _closeAddList(): void {
    this._addListField = undefined;
  }

  /** The searchable chooser popup for adding entities to an entity-list's Global list. */
  private _renderAddListModal(): TemplateResult | typeof nothing {
    const field = this._addListField;
    if (!field) return nothing;
    const meta = this._listMeta(field);
    const domain = field.entityDomain ?? "camera";
    const ids = this._camerasArray(this._globalValue(field.key));
    const q = this._addListQuery.trim().toLowerCase();
    const remaining = this._allCameras(domain)
      .filter((id) => !ids.includes(id))
      .filter(
        (id) => !q || this._cameraName(id).toLowerCase().includes(q) || id.toLowerCase().includes(q),
      );
    const themeClass = tedCardThemeClass(this._config?.theme === "ted-style" ? "ted-style" : "ha");
    const add = (id: string): void => {
      this._setGlobal(field.key, [...ids, id]);
    };
    return html`
      <div class="ted-modal ${themeClass}" @click=${() => this._closeAddList()}>
        <div class="ted-sheet add-sheet" @click=${(e: Event) => e.stopPropagation()}>
          <div class="ted-sheet-head">Add a ${meta.noun}</div>
          <div class="add-search">
            <ha-icon icon="mdi:magnify"></ha-icon>
            <input
              class="ted-input"
              type="text"
              placeholder=${`Search ${meta.nounPlural}…`}
              .value=${this._addListQuery}
              @input=${(e: Event) => (this._addListQuery = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="add-list">
            ${remaining.length
              ? remaining.map(
                  (id) => html`<button class="add-item" @click=${() => add(id)}>
                    <ha-icon
                      class="cam-ico"
                      .icon=${this.hass?.states[id]?.attributes?.icon || meta.icon}
                    ></ha-icon>
                    <span class="add-item-name">${this._cameraName(id)}</span>
                    <span class="add-item-id">${id}</span>
                  </button>`,
                )
              : html`<div class="add-empty">
                  ${q ? `No ${meta.nounPlural} match “${this._addListQuery}”.` : `No more ${meta.nounPlural} to add.`}
                </div>`}
          </div>
          <div class="add-actions">
            <button class="cam-btn" @click=${() => this._closeAddList()}>Done</button>
          </div>
        </div>
      </div>
    `;
  }

  private _autoPopulateGlobal(field: SettingField): void {
    const domain = field.entityDomain ?? "camera";
    const ids = this._camerasArray(this._globalValue(field.key));
    const merged = [...ids, ...this._allCameras(domain).filter((id) => !ids.includes(id))];
    this._setGlobal(field.key, merged);
  }

  private _renderCamerasDevice(field: SettingField): TemplateResult {
    const meta = this._listMeta(field);
    const global = this._camerasArray(this._globalValue(field.key));
    const overriding = this._deviceOverriding(field.key);

    const head = (
      tag: TemplateResult | typeof nothing,
      help: string,
      extra: TemplateResult | typeof nothing = nothing,
    ): TemplateResult => html`
      <div class="cam-head">
        <div class="row-label">
          <span>${field.label} — this device</span>
          ${tag}
          <span class="help">${help}</span>
        </div>
        <div class="cam-head-actions">
          ${extra}
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

    // Inheriting: read-only view of the Global list; click the link icon to override.
    if (!overriding) {
      return html`
        <div class="cam-row">
          ${head(
            html`<span class="inherit-tag">Inherited</span>`,
            global.length
              ? `Inheriting the Global list — ${global.length} ${global.length === 1 ? meta.noun : meta.nounPlural}. Click the link icon to customize this device.`
              : `No ${meta.nounPlural} in the Global list yet.`,
          )}
          ${global.length
            ? this._renderCameraChips(
                global,
                meta.icon,
                () => {},
                () => {},
                true,
              )
            : nothing}
        </div>
      `;
    }

    // Overriding: this device curates its own subset of the Global list.
    const stored = this._camerasArray(settingsStore.deviceSettings()[field.key]);
    const valid = stored.filter((id) => global.includes(id));
    const remaining = global.filter((id) => !valid.includes(id));
    const setList = (next: string[]): void => this._setDevice(field.key, next);
    return html`
      <div class="cam-row">
        ${head(
          nothing,
          `The ${meta.nounPlural} this device shows.`,
          html`<button
            class="cam-btn"
            title="Reset to the current Global list"
            @click=${() => this._syncDevice(field)}
          >
            <ha-icon icon="mdi:sync"></ha-icon><span>Sync list</span>
          </button>`,
        )}
        ${valid.length
          ? this._renderCameraChips(
              valid,
              meta.icon,
              (idx) => {
                const n = [...valid];
                n.splice(idx, 1);
                setList(n);
              },
              (from, to) => {
                const n = [...valid];
                n.splice(to, 0, n.splice(from, 1)[0]);
                setList(n);
              },
            )
          : html`<div class="help">No ${meta.nounPlural} selected — add from the list below.</div>`}
        ${remaining.length
          ? html`<select
              class="sel cam-add"
              @change=${(e: Event) => {
                const sel = e.target as HTMLSelectElement;
                const id = sel.value;
                sel.value = "";
                if (id) setList([...valid, id]);
              }}
            >
              <option value="">${`Add a ${meta.noun}…`}</option>
              ${remaining.map((id) => html`<option value=${id}>${this._cameraName(id)}</option>`)}
            </select>`
          : !global.length
            ? html`<div class="help">
                Add ${meta.nounPlural} to the <b>Global</b> list first, then choose which ones
                this device shows.
              </div>`
            : nothing}
      </div>
    `;
  }

  /** Reset this device's override to the current Global list (keep still-valid entries
   *  in order, then append any newly-available Global entries). */
  private _syncDevice(field: SettingField): void {
    const global = this._camerasArray(this._globalValue(field.key));
    const raw = settingsStore.deviceSettings();
    const current = field.key in raw ? this._camerasArray(raw[field.key]) : [];
    const kept = current.filter((id) => global.includes(id));
    const added = global.filter((id) => !kept.includes(id));
    this._setDevice(field.key, [...kept, ...added]);
  }

  // --- Background Wallpaper composite (mode-driven; solid/image/slideshow/theme) ---

  /** Read a background_* value in the given scope (device falls back to inherited). */
  private _bgVal(key: string, scope: "global" | "device"): SettingsValue {
    return scope === "global" ? this._globalValue(key) : this._deviceValue(key);
  }

  /** Write a background_* value at the given scope. */
  private _setBg(key: string, scope: "global" | "device", value: SettingsValue): void {
    if (scope === "global") this._setGlobal(key, value);
    else this._setDevice(key, value);
    this.requestUpdate();
  }

  /** A directly-usable <img>/CSS URL for a stored image ref (resolves media-source). */
  private _bgDisplayUrl(ref: string): string {
    if (!isMediaSourceUri(ref)) return ref;
    const cached = this._bgThumbs.get(ref);
    if (cached) return cached;
    if (this.hass) {
      void resolveMediaSource(this.hass, ref).then((url) => {
        if (url) {
          this._bgThumbs.set(ref, url);
          this.requestUpdate();
        }
      });
    }
    return "";
  }

  /** Record a picked/uploaded image as the current wallpaper + push onto the MRU. */
  private _selectBgImage(scope: "global" | "device", ref: string): void {
    this._setBg("background_image", scope, ref);
    const recent = stringList(this._bgVal("background_recent_images", scope));
    const next = [ref, ...recent.filter((r) => r !== ref)].slice(0, BACKGROUND_RECENT_MAX);
    this._setBg("background_recent_images", scope, next);
  }

  private async _pickBgImage(scope: "global" | "device"): Promise<void> {
    if (!this.hass) return;
    const uri = await pickMedia(this, this.hass, { accept: ["image/*"], startFolder: this._mediaFolder ?? undefined });
    if (uri) this._selectBgImage(scope, uri);
  }

  private async _uploadBgImage(scope: "global" | "device", file: File): Promise<void> {
    if (!this.hass) return;
    // Prefer the dedicated "My media" folder; fall back to the image store.
    const url = this._mediaFolder
      ? await uploadToMediaFolder(this.hass, file, this._mediaFolder)
      : await uploadImage(this.hass, file);
    if (url) this._selectBgImage(scope, url);
  }

  /** Derive a folder media-source id from an image inside it (strip the file segment). */
  private async _pickBgFolder(scope: "global" | "device"): Promise<void> {
    if (!this.hass) return;
    const uri = await pickMedia(this, this.hass, { accept: ["image/*"], startFolder: this._mediaFolder ?? undefined });
    if (uri && uri.includes("/")) this._setBg("background_folder", scope, uri.replace(/\/[^/]*$/, ""));
  }

  /** Clear the HA-wide Bing "Photo of the Day" cache (admin only). */
  private async _clearBingCache(): Promise<void> {
    if (!this.hass) return;
    const ok = await showConfirmation(this, {
      title: "Clear Bing photo cache?",
      text: "This deletes the downloaded Bing “Photo of the Day” images for the whole Home Assistant instance. They re-download the next time the slideshow runs.",
      confirmText: "Clear",
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.hass.callWS({ type: "teds_cards_backend/clear_bing_photos_cache" });
    } catch {
      /* best-effort */
    }
  }

  private _renderBackground(field: SettingField, scope: "global" | "device"): TemplateResult {
    const overriding = scope === "device" && BACKGROUND_KEYS.some((k) => k in settingsStore.deviceSettings());
    const disabled = (scope === "global" && !this._isAdmin()) || (scope === "device" && !overriding);

    const ctx: BackgroundFieldsCtx = {
      get: (k) => this._bgVal(k, scope),
      set: (k, v) => this._setBg(k, scope, v),
      disabled,
      backendAvailable: !!this.hass?.states[SETTINGS_SENSOR],
      mediaFolder: this._mediaFolder,
      displayUrl: (ref) => this._bgDisplayUrl(ref),
      selectImage: () => void this._pickBgImage(scope),
      uploadImage: (f) => void this._uploadBgImage(scope, f),
      clearImage: () => this._setBg("background_image", scope, null),
      selectRecent: (ref) => this._selectBgImage(scope, ref),
      pickFolder: () => void this._pickBgFolder(scope),
      clearBingCache: this._isAdmin() ? () => void this._clearBingCache() : undefined,
    };

    const modeVal = String(this._bgVal("background_mode", scope) ?? "solid");
    const MODE_LABELS: Record<string, string> = {
      solid: "Solid Color",
      image: "Image",
      slideshow: "Slideshow",
      theme: "Theme",
    };

    return html`
      <ha-expansion-panel outlined class="sub-panel bg-panel">
        <div slot="header" class="sub-head">
          <ha-icon icon="mdi:image-multiple-outline"></ha-icon>
          <span class="sub-head-label">${field.label}${scope === "device" ? " — this device" : ""}</span>
          <span class="sub-head-value">${MODE_LABELS[modeVal] ?? modeVal}</span>
        </div>
        <div class="bg-row">
          <div class="cam-head">
            ${scope === "device"
              ? html`<div class="row-label">
                    ${overriding
                      ? html`<span class="help">Overriding for this device.</span>`
                      : html`<span class="inherit-tag">Inherited</span>`}
                  </div>
                  <button
                    class="ovr ${overriding ? "on" : ""}"
                    title=${overriding ? "Overriding — click to inherit" : "Inheriting — click to override"}
                    @click=${() => this._setCompositeOverride("background_mode", BACKGROUND_KEYS, !overriding)}
                  >
                    <ha-icon .icon=${overriding ? "mdi:link-off" : "mdi:link-variant"}></ha-icon>
                  </button>`
              : field.help
                ? html`<div class="row-label"><span class="help">${field.help}</span></div>`
                : nothing}
          </div>
          ${renderBackgroundFields(ctx)}
          ${this._renderBgDebug()}
        </div>
      </ha-expansion-panel>
    `;
  }

  /** A Debug-mode readout of the live readability-scrim decision, so you can see
   *  exactly whether/why a scrim is being applied to the current wallpaper. */
  private _renderBgDebug(): TemplateResult | typeof nothing {
    if (settingsStore.effective().debug_mode !== true) return nothing;
    const d = backgroundEngine.getDiagnostic();
    const lum = d.luminance === null ? "—" : d.luminance.toFixed(2);
    const scrim =
      d.scrimOpacity > 0 && d.scrimColor ? `rgba(${d.scrimColor}, ${d.scrimOpacity.toFixed(2)})` : "none";
    const url = d.url ? `…${d.url.slice(-44)}` : "—";
    return html`
      <div class="bg-debug">
        <div class="bg-debug-title">Readability diagnostics (Debug mode)</div>
        <div><b>Mode:</b> ${d.mode} • <b>Theme:</b> ${d.dark ? "dark" : "light"}</div>
        <div><b>Enhance:</b> ${d.enhance ? "on" : "off"} • <b>Strength:</b> ${d.strength}%</div>
        <div><b>Image:</b> ${url}</div>
        <div><b>Luminance:</b> ${lum}</div>
        <div><b>Scrim applied:</b> ${scrim}</div>
        <div><b>Why:</b> ${d.reason}</div>
      </div>
    `;
  }

  /** Toggle a composite (Background / Night mode) between inheriting Global and overriding for this
   *  device. Turning override ON seeds the anchor key from Global so the fields enable with the
   *  inherited values; turning it OFF clears all the composite's device keys (back to inherit). */
  private _setCompositeOverride(anchorKey: string, allKeys: readonly string[], on: boolean): void {
    if (on) this._setDevice(anchorKey, this._globalValue(anchorKey));
    else for (const k of allKeys) settingsStore.clearValue("device", k);
    this.requestUpdate();
  }

  // --- Automatic Night Mode composite --------------------------------------

  private _nightLabel = (s: { name: string }): string => NIGHT_LABELS[s.name] ?? s.name;
  private _nightHelper = (s: { name: string }): string => NIGHT_HELPERS[s.name] ?? "";

  /** Read a night_* value in the given scope (device falls back to inherited). */
  private _nmVal(key: string, scope: "global" | "device"): SettingsValue {
    return scope === "global" ? this._globalValue(key) : this._deviceValue(key);
  }

  /** Write a night_* value at the given scope. */
  private _setNm(key: string, scope: "global" | "device", value: SettingsValue): void {
    if (scope === "global") this._setGlobal(key, value);
    else this._setDevice(key, value);
    this.requestUpdate();
  }

  private _onNightModeChanged(ev: CustomEvent, scope: "global" | "device"): void {
    ev.stopPropagation();
    if (scope === "global" && !this._isAdmin()) return;
    const v = ev.detail.value as Record<string, unknown>;
    for (const key of NIGHTMODE_KEYS) {
      if (!(key in v)) continue;
      let val = v[key] as SettingsValue;
      if ((key === "night_font_color" || key === "night_brightness_entity") && (val === "" || val == null))
        val = null;
      if (val !== this._nmVal(key, scope)) this._setNm(key, scope, val);
    }
  }

  private _renderNightMode(field: SettingField, scope: "global" | "device"): TemplateResult {
    const overriding = scope === "device" && NIGHTMODE_KEYS.some((k) => k in settingsStore.deviceSettings());
    const disabled = (scope === "global" && !this._isAdmin()) || (scope === "device" && !overriding);
    const val = (k: string): SettingsValue => this._nmVal(k, scope);
    const enabled = val("night_enabled") !== false;
    const explicitEntity =
      typeof val("night_brightness_entity") === "string" ? String(val("night_brightness_entity")) : "";
    const autoEntity = resolveBrightnessEntity(this.hass);
    const fontColor =
      typeof val("night_font_color") === "string" && val("night_font_color") ? String(val("night_font_color")) : "red";

    return html`
      <ha-expansion-panel outlined class="sub-panel bg-panel">
        <div slot="header" class="sub-head">
          <ha-icon icon=${themedIcon("weather-night")}></ha-icon>
          <span class="sub-head-label">${field.label}${scope === "device" ? " — this device" : ""}</span>
          <span class="sub-head-value">${enabled ? "Enabled" : "Disabled"}</span>
        </div>
        <div class="bg-row">
          <div class="cam-head">
            ${scope === "device"
              ? html`<div class="row-label">
                    ${overriding
                      ? html`<span class="help">Overriding for this device.</span>`
                      : html`<span class="inherit-tag">Inherited</span>`}
                  </div>
                  <button
                    class="ovr ${overriding ? "on" : ""}"
                    title=${overriding ? "Overriding — click to inherit" : "Inheriting — click to override"}
                    @click=${() => this._setCompositeOverride("night_enabled", NIGHTMODE_KEYS, !overriding)}
                  >
                    <ha-icon .icon=${overriding ? "mdi:link-off" : "mdi:link-variant"}></ha-icon>
                  </button>`
              : field.help
                ? html`<div class="row-label"><span class="help">${field.help}</span></div>`
                : nothing}
          </div>

          <ha-form
            .hass=${this.hass}
            .data=${{ night_enabled: enabled }}
            .schema=${NIGHT_ENABLED_SCHEMA}
            .disabled=${disabled}
            .computeLabel=${this._nightLabel}
            @value-changed=${(ev: CustomEvent) => this._onNightModeChanged(ev, scope)}
          ></ha-form>

          ${enabled
            ? html`
                <ha-form
                  .hass=${this.hass}
                  .data=${{
                    night_start: String(val("night_start") ?? "21:00:00"),
                    night_end: String(val("night_end") ?? "07:00:00"),
                  }}
                  .schema=${NIGHT_TIME_SCHEMA}
                  .disabled=${disabled}
                  .computeLabel=${this._nightLabel}
                  @value-changed=${(ev: CustomEvent) => this._onNightModeChanged(ev, scope)}
                ></ha-form>
                <ha-form
                  .hass=${this.hass}
                  .data=${{
                    night_dim_brightness: Number(val("night_dim_brightness") ?? 75),
                    night_dim_background: Number(val("night_dim_background") ?? 25),
                    night_transition_seconds: Number(val("night_transition_seconds") ?? 30),
                  }}
                  .schema=${NIGHT_NUM_SCHEMA}
                  .disabled=${disabled}
                  .computeLabel=${this._nightLabel}
                  .computeHelper=${this._nightHelper}
                  @value-changed=${(ev: CustomEvent) => this._onNightModeChanged(ev, scope)}
                ></ha-form>
                <ha-form
                  .hass=${this.hass}
                  .data=${{ night_font_color: fontColor }}
                  .schema=${NIGHT_COLOR_SCHEMA}
                  .disabled=${disabled}
                  .computeLabel=${this._nightLabel}
                  @value-changed=${(ev: CustomEvent) => this._onNightModeChanged(ev, scope)}
                ></ha-form>
                <ha-form
                  .hass=${this.hass}
                  .data=${{ night_dark_mode: val("night_dark_mode") !== false }}
                  .schema=${NIGHT_DARK_SCHEMA}
                  .disabled=${disabled}
                  .computeLabel=${this._nightLabel}
                  .computeHelper=${this._nightHelper}
                  @value-changed=${(ev: CustomEvent) => this._onNightModeChanged(ev, scope)}
                ></ha-form>
                <ha-form
                  .hass=${this.hass}
                  .data=${{ night_brightness_entity: explicitEntity || undefined }}
                  .schema=${NIGHT_ENTITY_SCHEMA}
                  .disabled=${disabled}
                  .computeLabel=${this._nightLabel}
                  @value-changed=${(ev: CustomEvent) => this._onNightModeChanged(ev, scope)}
                ></ha-form>
                <div class="row-label">
                  <span class="help">
                    ${explicitEntity
                      ? "Screen brightness is controlled via this entity."
                      : autoEntity
                        ? html`When empty, this device auto-uses its browser_mod screen light:
                            <code>${autoEntity}</code>.`
                        : "When empty, night mode looks for this device's browser_mod screen light. None found — pick a light/number entity that controls the display."}
                  </span>
                </div>
              `
            : nothing}
        </div>
      </ha-expansion-panel>
    `;
  }

  // --- View Launcher (Navbar group) -----------------------------------------

  private _launcherLabel = (s: { name: string }): string => LAUNCHER_LABELS[s.name] ?? s.name;

  private _toggleLauncherOpt(path: string): void {
    const next = new Set(this._launcherOptOpen);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    this._launcherOptOpen = next;
  }

  /** The global per-view launcher options map, keyed by view path. */
  private _launcherOptionsMap(): Record<string, LauncherButtonOptions> {
    return launcherOptionsMap(this._globalValue("launcher_options"));
  }

  private _launcherView(path: string, discovered: LauncherViewInfo[]): LauncherViewInfo | undefined {
    return discovered.find((v) => v.path === path);
  }

  private _launcherRowIcon(path: string, discovered: LauncherViewInfo[]): string {
    const opt = this._launcherOptionsMap()[path] ?? {};
    if (typeof opt.icon === "string" && opt.icon) return opt.icon;
    return this._launcherView(path, discovered)?.icon || "mdi:gesture-tap-button";
  }

  private _launcherRowName(path: string, discovered: LauncherViewInfo[]): string {
    const opt = this._launcherOptionsMap()[path] ?? {};
    if (typeof opt.name === "string" && opt.name) return opt.name;
    return this._launcherView(path, discovered)?.title || path;
  }

  private _renderLauncher(scope: "global" | "device"): TemplateResult {
    const enabled = this._globalValue("launcher_enabled") !== false;
    return html`
      <ha-expansion-panel outlined class="sub-panel">
        <div slot="header" class="sub-head">
          <ha-icon icon="mdi:rocket-launch-outline"></ha-icon>
          <span class="sub-head-label">Launcher Buttons${scope === "device" ? " — this device" : ""}</span>
          <span class="sub-head-value">${enabled ? "On" : "Off"}</span>
        </div>
        <div class="bg-row">
          ${scope === "global" ? this._renderLauncherGlobal() : this._renderLauncherDevice()}
        </div>
      </ha-expansion-panel>
    `;
  }

  /** The ordered display views with grouping info (members contiguous under primary). */
  private _launcherDisplay(
    discovered: LauncherViewInfo[],
  ): { views: LauncherViewInfo[]; groupOf: Map<string, { primary: boolean; group: string }> } {
    const combine = this._globalValue("launcher_combine_groups") !== false;
    const paths = effectiveLauncherPaths(this._camerasArray(this._globalValue("launcher_list")), discovered);
    const primaryPaths = new Set(Object.keys(dashboardKeyByViewPath(settingsStore.effective())));
    const groups = groupLauncherViews(resolveLauncherViews(paths, discovered), combine, primaryPaths);
    const views: LauncherViewInfo[] = [];
    const groupOf = new Map<string, { primary: boolean; group: string }>();
    for (const g of groups) {
      if (g.isGroup) {
        const ordered = [g.primary, ...g.members.filter((m) => m.path !== g.primary.path)];
        for (const v of ordered) {
          views.push(v);
          groupOf.set(v.path, { primary: v.path === g.primary.path, group: g.primary.title });
        }
      } else {
        views.push(g.primary);
      }
    }
    return { views, groupOf };
  }

  private _renderLauncherGlobal(): TemplateResult {
    const admin = this._isAdmin();
    const discovered = readLovelaceViews();
    const { views, groupOf } = this._launcherDisplay(discovered);
    const displayPaths = views.map((v) => v.path);
    const setList = (next: string[]): void => this._setGlobal("launcher_list", next);
    const remaining = discovered.filter((v) => !displayPaths.includes(v.path));

    return html`
      ${this._renderLauncherSettingsForm("global")}
      ${this._renderLauncherCombineBlock("global")}
      <div class="cam-row">
        <div class="cam-head">
          <div class="row-label"><span>Buttons — available views &amp; settings</span></div>
          ${admin
            ? html`<button class="cam-btn" @click=${() => this._autoPopulateLauncher(discovered)}>
                <ha-icon icon="mdi:auto-fix"></ha-icon><span>Auto-populate</span>
              </button>`
            : nothing}
        </div>
        ${!discovered.length
          ? html`<div class="help">No dashboard views found.</div>`
          : displayPaths.length
            ? this._renderCameraChips(
                displayPaths,
                "mdi:gesture-tap-button",
                (idx) => {
                  const n = [...displayPaths];
                  n.splice(idx, 1);
                  setList(n);
                },
                (from, to) => {
                  const n = [...displayPaths];
                  n.splice(to, 0, n.splice(from, 1)[0]);
                  setList(n);
                },
                false,
                admin
                  ? {
                      isOpen: (id) => this._launcherOptOpen.has(id),
                      toggle: (id) => this._toggleLauncherOpt(id),
                      body: (id) => this._renderLauncherOptions(id, discovered),
                      icon: (id) => this._launcherRowIcon(id, discovered),
                      name: (id) => this._launcherRowName(id, discovered),
                      badge: (id) => groupOf.get(id)?.primary === true,
                      badgeIcon: "mdi:animation",
                      tag: (id) => {
                        const g = groupOf.get(id);
                        return g && !g.primary ? g.group : "";
                      },
                      tagPrefix: "in",
                      tagLocksRow: false,
                    }
                  : undefined,
              )
            : html`<div class="help">No views selected — add one below or tap “Auto-populate”.</div>`}
        ${admin && remaining.length
          ? html`<select
              class="sel cam-add"
              @change=${(e: Event) => {
                const sel = e.target as HTMLSelectElement;
                const v = sel.value;
                if (v) setList([...displayPaths, v]);
                sel.value = "";
              }}
            >
              <option value="">Add a view…</option>
              ${remaining.map((v) => html`<option value=${v.path}>${v.title}</option>`)}
            </select>`
          : nothing}
      </div>
    `;
  }

  /** A launcher button's collapsible options body: Button size + an embedded Button Card
   *  editor (Name / Icon / Badge / Dynamic highlighting). */
  private _renderLauncherOptions(path: string, discovered: LauncherViewInfo[]): TemplateResult {
    const opt = this._launcherOptionsMap()[path] ?? {};
    const editor = this._launcherEditors.get(path);
    void discovered;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${{ nav_button_size: opt.nav_button_size ?? "normal" }}
        .schema=${LAUNCHER_SIZE_SCHEMA}
        .computeLabel=${this._launcherLabel}
        @value-changed=${(ev: CustomEvent) => this._onLauncherSizeChanged(path, ev)}
      ></ha-form>
      ${editor ? editor.el : html`<div class="help">Loading…</div>`}
    `;
  }

  private _autoPopulateLauncher(discovered: LauncherViewInfo[]): void {
    this._setGlobal("launcher_list", discovered.filter((v) => !v.subview).map((v) => v.path));
  }

  /** The group-level launcher settings ha-form, bound to global or device values. In
   *  device scope, editing a setting stores a per-device override for that key. */
  private _renderLauncherSettingsForm(scope: "global" | "device"): TemplateResult {
    const disabled = scope === "global" && !this._isAdmin();
    const val = (k: string): SettingsValue => (scope === "global" ? this._globalValue(k) : this._deviceValue(k));
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${{
          launcher_enabled: val("launcher_enabled") !== false,
          launcher_section: String(val("launcher_section") ?? "center"),
        }}
        .schema=${LAUNCHER_TOP_SCHEMA}
        .disabled=${disabled}
        .computeLabel=${this._launcherLabel}
        @value-changed=${(ev: CustomEvent) => this._onLauncherSettingsChanged(ev, scope)}
      ></ha-form>
      <div class="launcher-colors">
        ${this._renderLauncherColor(scope, "launcher_button_color", LAUNCHER_BUTTON_COLOR_SCHEMA, disabled)}
        ${this._renderLauncherColor(scope, "launcher_highlight_color", LAUNCHER_HIGHLIGHT_COLOR_SCHEMA, disabled)}
      </div>
      <ha-form
        .hass=${this.hass}
        .data=${{ launcher_highlight_active: val("launcher_highlight_active") !== false }}
        .schema=${LAUNCHER_HIGHLIGHT_SCHEMA}
        .disabled=${disabled}
        .computeLabel=${this._launcherLabel}
        @value-changed=${(ev: CustomEvent) => this._onLauncherSettingsChanged(ev, scope)}
      ></ha-form>
    `;
  }

  /** One color picker (Button / Highlight color). When no explicit value is set the
   *  picker shows its default (via the selector's `default_color`) rendered muted so it
   *  reads as "unset — using the default". */
  private _renderLauncherColor(
    scope: "global" | "device",
    key: string,
    schema: unknown,
    disabled: boolean,
  ): TemplateResult {
    const raw = scope === "global" ? this._globalValue(key) : this._deviceValue(key);
    const value = typeof raw === "string" && raw ? raw : undefined;
    return html`
      <div class="lc-field ${value === undefined ? "is-default" : ""}">
        <ha-form
          .hass=${this.hass}
          .data=${{ [key]: value }}
          .schema=${schema}
          .disabled=${disabled}
          .computeLabel=${this._launcherLabel}
          @value-changed=${(ev: CustomEvent) => this._onLauncherSettingsChanged(ev, scope)}
        ></ha-form>
      </div>
    `;
  }

  /** The grouping toggles (Auto-combine + Quick launch), rendered just above the Buttons
   *  list so their richer helper text (incl. a link into the Navigation tab) reads inline. */
  private _renderLauncherCombineBlock(scope: "global" | "device"): TemplateResult {
    const val = (k: string): SettingsValue => (scope === "global" ? this._globalValue(k) : this._deviceValue(k));
    const disabled = scope === "global" && !this._isAdmin();
    const combine = val("launcher_combine_groups") !== false;
    const quick = val("launcher_quick_launch") !== false;
    const set = (k: string, v: SettingsValue): void => {
      if (scope === "global") {
        if (this._isAdmin()) this._setGlobal(k, v);
      } else this._setDevice(k, v);
    };
    return html`
      <div class="row">
        <div class="row-label">
          <span>Auto-combine similar views</span>
          <span class="help">e.g. Home*, Calendar*, etc.</span>
        </div>
        <div class="row-control">
          <ha-switch
            .checked=${combine}
            .disabled=${disabled}
            @change=${(e: Event) => set("launcher_combine_groups", (e.target as HTMLInputElement).checked)}
          ></ha-switch>
        </div>
      </div>
      <div class="row">
        <div class="row-label">
          <span>Quick launch groups</span>
          <span class="help">Single tap on a group opens the corresponding
            <button class="link-inline" @click=${() => this._selectSection("Navigation")}>navigation dashboard</button>;
            hold on a group opens the group selector popout.</span>
        </div>
        <div class="row-control">
          <ha-switch
            .checked=${quick}
            .disabled=${disabled || !combine}
            @change=${(e: Event) => set("launcher_quick_launch", (e.target as HTMLInputElement).checked)}
          ></ha-switch>
        </div>
      </div>
    `;
  }

  private _onLauncherSettingsChanged(ev: CustomEvent, scope: "global" | "device"): void {
    ev.stopPropagation();
    if (scope === "global" && !this._isAdmin()) return;
    const v = ev.detail.value as Record<string, unknown>;
    const cur = (k: string): SettingsValue => (scope === "global" ? this._globalValue(k) : this._deviceValue(k));
    for (const key of LAUNCHER_SETTING_KEYS) {
      if (!(key in v)) continue;
      let val = v[key] as SettingsValue;
      if ((key === "launcher_button_color" || key === "launcher_highlight_color") && (val === "" || val == null))
        val = null;
      if (val !== cur(key)) {
        if (scope === "global") this._setGlobal(key, val);
        else this._setDevice(key, val);
      }
    }
  }

  private _onLauncherSizeChanged(path: string, ev: CustomEvent): void {
    ev.stopPropagation();
    const v = ev.detail.value as { nav_button_size?: string };
    const prev = { ...(this._launcherOptionsMap()[path] ?? {}) };
    if (v.nav_button_size && v.nav_button_size !== "normal") prev.nav_button_size = v.nav_button_size as NavButtonSize;
    else delete prev.nav_button_size;
    this._storeLauncherOption(path, prev);
  }

  /** Persist a launcher button's options (dropping empties; removing an emptied entry). */
  private _storeLauncherOption(path: string, opt: LauncherButtonOptions): void {
    const map = this._launcherOptionsMap();
    const clean: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(opt)) {
      if (val === undefined || val === "" || val === null) continue;
      clean[k] = val;
    }
    if (Object.keys(clean).length) map[path] = clean as LauncherButtonOptions;
    else delete map[path];
    this._setGlobal("launcher_options", map as unknown as SettingsValue);
  }

  /** The Button Card config a launcher button's embedded editor edits. */
  private _launcherEditorConfig(path: string, discovered: LauncherViewInfo[]): LovelaceCardConfig {
    const opt = this._launcherOptionsMap()[path] ?? {};
    const view = this._launcherView(path, discovered);
    const { nav_button_size, ...rest } = opt;
    void nav_button_size;
    return {
      type: `custom:${BUTTON_CARD_TYPE}`,
      icon: (typeof opt.icon === "string" && opt.icon) || view?.icon || "mdi:gesture-tap-button",
      name: (typeof opt.name === "string" && opt.name) || view?.title || path,
      ...rest,
    } as LovelaceCardConfig;
  }

  private _onLauncherEditorChanged(path: string, ev: CustomEvent): void {
    const cfg = ev.detail?.config as Record<string, unknown> | undefined;
    if (!cfg) return;
    // Drop keys the launcher manages itself (navigation target + always grid-embedded).
    const { type, entity, tap_action, hold_action, double_tap_action, width, height, ...rest } = cfg;
    void type;
    void entity;
    void tap_action;
    void hold_action;
    void double_tap_action;
    void width;
    void height;
    const next: LauncherButtonOptions = { ...(rest as LauncherButtonOptions) };
    const prevSize = this._launcherOptionsMap()[path]?.nav_button_size;
    if (prevSize) next.nav_button_size = prevSize;
    this._storeLauncherOption(path, next);
    // Push the derived config back to the controlled editor so it doesn't revert.
    const entry = this._launcherEditors.get(path);
    if (entry) {
      const editorCfg = this._launcherEditorConfig(path, readLovelaceViews());
      const json = JSON.stringify(editorCfg);
      if (entry.json !== json) {
        entry.json = json;
        entry.el.setConfig(editorCfg);
      }
    }
  }

  private _syncLauncherEditors(): void {
    if (!this.hass) return;
    for (const path of [...this._launcherEditors.keys()]) {
      if (!this._launcherOptOpen.has(path)) this._launcherEditors.delete(path);
    }
    const discovered = readLovelaceViews();
    for (const path of this._launcherOptOpen) {
      const entry = this._launcherEditors.get(path);
      if (entry) {
        entry.el.hass = this.hass;
        continue;
      }
      void this._createLauncherEditor(path, discovered);
    }
  }

  private async _createLauncherEditor(path: string, discovered: LauncherViewInfo[]): Promise<void> {
    if (this._launcherCreating.has(path)) return;
    const cardClass = customElements.get(BUTTON_CARD_TYPE) as
      | (CustomElementConstructor & { getConfigElement?: () => Promise<LovelaceCardEditor> })
      | undefined;
    if (!cardClass?.getConfigElement) return;
    this._launcherCreating.add(path);
    try {
      const el = await cardClass.getConfigElement();
      el.hass = this.hass;
      (el as unknown as { trim?: typeof LAUNCHER_BUTTON_TRIM }).trim = LAUNCHER_BUTTON_TRIM;
      const cfg = this._launcherEditorConfig(path, discovered);
      el.setConfig(cfg);
      el.addEventListener("config-changed", (ev: Event) => {
        ev.stopPropagation();
        this._onLauncherEditorChanged(path, ev as CustomEvent);
      });
      this._launcherEditors.set(path, { el, json: JSON.stringify(cfg) });
      this.requestUpdate();
    } finally {
      this._launcherCreating.delete(path);
    }
  }

  private _renderLauncherDevice(): TemplateResult {
    const discovered = readLovelaceViews();
    const key = "launcher_list";
    const globalList = effectiveLauncherPaths(this._camerasArray(this._globalValue(key)), discovered);
    const overriding = this._deviceOverriding(key);
    const groupOverridden = LAUNCHER_SETTING_KEYS.some((k) => k in settingsStore.deviceSettings());
    const resetGroup = (): void => {
      for (const k of LAUNCHER_SETTING_KEYS) settingsStore.clearValue("device", k);
      this.requestUpdate();
    };
    const settingsBlock = html`
      <div class="cam-head">
        <div class="row-label">
          <span>Launcher settings — this device</span>
          ${groupOverridden ? nothing : html`<span class="inherit-tag">Inherited</span>`}
          <span class="help">${groupOverridden
            ? "This device overrides the launcher settings below."
            : "Change a setting to override it on this device."}</span>
        </div>
        ${groupOverridden
          ? html`<button class="cam-btn" title="Reset to the Global launcher settings" @click=${resetGroup}>
              <ha-icon icon="mdi:backup-restore"></ha-icon><span>Reset</span>
            </button>`
          : nothing}
      </div>
      ${this._renderLauncherSettingsForm("device")}
      ${this._renderLauncherCombineBlock("device")}
    `;
    const chipOptions = {
      isOpen: () => false,
      toggle: () => {},
      body: () => html``,
      icon: (id: string) => this._launcherRowIcon(id, discovered),
      name: (id: string) => this._launcherRowName(id, discovered),
      optionsHidden: () => true,
    };
    const head = (tag: TemplateResult | typeof nothing, help: string, extra: TemplateResult | typeof nothing = nothing): TemplateResult => html`
      <div class="cam-head">
        <div class="row-label">
          <span>Buttons — this device</span>
          ${tag}
          <span class="help">${help}</span>
        </div>
        <div class="cam-head-actions">
          ${extra}
          <button
            class="ovr ${overriding ? "on" : ""}"
            title=${overriding ? "Overriding — click to inherit" : "Inheriting — click to override"}
            @click=${() => this._toggleOverride({ key, label: "Launcher Buttons", group: "Navbar", kind: "launcher" } as SettingField, !overriding)}
          >
            <ha-icon .icon=${overriding ? "mdi:link-off" : "mdi:link-variant"}></ha-icon>
          </button>
        </div>
      </div>
    `;

    if (!overriding) {
      return html`
        <div class="cam-row">
          ${settingsBlock}
          ${head(
            html`<span class="inherit-tag">Inherited</span>`,
            globalList.length
              ? `Inheriting the Global list — ${globalList.length} view${globalList.length === 1 ? "" : "s"}. Options are set on the Global tab.`
              : "No views in the Global list yet.",
          )}
          ${globalList.length
            ? this._renderCameraChips(globalList, "mdi:gesture-tap-button", () => {}, () => {}, true, chipOptions)
            : nothing}
        </div>
      `;
    }

    const stored = this._camerasArray(settingsStore.deviceSettings()[key]);
    const valid = stored.filter((id) => globalList.includes(id));
    const remaining = globalList.filter((id) => !valid.includes(id));
    const setList = (next: string[]): void => this._setDevice(key, next);
    return html`
      <div class="cam-row">
        ${settingsBlock}
        ${head(
          nothing,
          "The launcher buttons this device shows.",
          html`<button class="cam-btn" title="Reset to the current Global list" @click=${() => setList([...globalList])}>
            <ha-icon icon="mdi:sync"></ha-icon><span>Sync list</span>
          </button>`,
        )}
        ${valid.length
          ? this._renderCameraChips(
              valid,
              "mdi:gesture-tap-button",
              (idx) => {
                const n = [...valid];
                n.splice(idx, 1);
                setList(n);
              },
              (from, to) => {
                const n = [...valid];
                n.splice(to, 0, n.splice(from, 1)[0]);
                setList(n);
              },
              false,
              chipOptions,
            )
          : html`<div class="help">No views selected — add from the list below.</div>`}
        ${remaining.length
          ? html`<select
              class="sel cam-add"
              @change=${(e: Event) => {
                const sel = e.target as HTMLSelectElement;
                if (sel.value) setList([...valid, sel.value]);
                sel.value = "";
              }}
            >
              <option value="">Add a view…</option>
              ${remaining.map((p) => html`<option value=${p}>${this._launcherRowName(p, discovered)}</option>`)}
            </select>`
          : nothing}
      </div>
    `;
  }

  protected render(): TemplateResult | typeof nothing {
    const cfg = this._config;
    if (!cfg || !this.hass) return nothing;
    const theme = cfg.theme === "ted-style" ? "ted-style" : "ha";
    const showGlobal = cfg.show_global !== false;
    const showDevice = cfg.show_device !== false;
    const showHeader = cfg.show_header !== false;
    const scopeShared = cfg.scope === "shared";
    const isToggle = cfg.variant === "scope-toggle";
    const missing = !this.hass.states[SETTINGS_SENSOR];

    // Section cards stay invisible when the backend is missing — the scope-toggle
    // (or a header card) carries the single "install the backend" warning.
    if (missing && !showHeader && !isToggle) return nothing;

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

    const header = showHeader
      ? html`<div class="head">
          <ha-icon icon="mdi:cog"></ha-icon>
          <span>${cfg.title ?? "Settings"}</span>
        </div>`
      : nothing;

    // Scope-toggle variant: just the Global / This device switch (drives shared scope).
    if (isToggle) {
      const scope = getUiScope();
      return html`
        <ha-card class=${classMap(cardClasses)} style=${styleMap(cardStyle)}>
          ${cfg.brushed ? brushedOverlay : nothing} ${header}
          ${missing
            ? html`<div class="warn">Install the <b>Ted's Cards Backend</b> integration to use settings.</div>`
            : html`<div class="tabs" role="tablist">
                <button class="tab ${scope === "global" ? "active" : ""}" @click=${() => setUiScope("global")}>
                  Global
                </button>
                <button class="tab ${scope === "device" ? "active" : ""}" @click=${() => setUiScope("device")}>
                  This device
                </button>
              </div>
              ${scope === "global" && !this._isAdmin()
                ? html`<div class="device-note">Global settings are read-only — administrator access required.</div>`
                : nothing}`}
        </ha-card>
      `;
    }

    // Built-in section tabs: a self-contained settings UI (shared Global / This device
    // toggle + a tab per group) that doesn't need an external tab card to compose the
    // categories. Honours a `?tab=<group>` deep link. On by default.
    if (cfg.section_tabs !== false) {
      const scope = getUiScope();
      const groups = this._sectionGroups();
      const active = this._activeSection(groups);
      const activeGroup = groups.find((g) => g.group === active);
      const activeIdx = groups.findIndex((g) => g.group === active);

      // Work out which section tabs fit inline vs. move into the "…" overflow menu. The
      // active section is always kept visible (it displaces the last inline slot if needed).
      const total = groups.length;
      const visibleCount = Math.min(this._sectionVisibleCount, total);
      const overflow = visibleCount < total;
      const visible: number[] = [];
      for (let i = 0; i < visibleCount; i++) visible.push(i);
      if (overflow && !visible.includes(activeIdx) && visible.length > 0) {
        visible[visible.length - 1] = activeIdx;
      }
      const visibleSet = new Set(visible);
      const overflowList: number[] = [];
      for (let i = 0; i < total; i++) if (!visibleSet.has(i)) overflowList.push(i);

      return html`
        <ha-card class=${classMap(cardClasses)} style=${styleMap(cardStyle)}>
          ${cfg.brushed ? brushedOverlay : nothing} ${header}
          ${missing
            ? html`<div class="warn">Install the <b>Ted's Cards Backend</b> integration to use settings.</div>`
            : html`
                <div class="tabs" role="tablist">
                  <button class="tab ${scope === "global" ? "active" : ""}" @click=${() => setUiScope("global")}>
                    Global
                  </button>
                  <button class="tab ${scope === "device" ? "active" : ""}" @click=${() => setUiScope("device")}>
                    This device
                  </button>
                </div>
                ${scope === "device"
                  ? html`<div class="device-note">
                      Overrides apply to <b>this device only</b>. Un-overridden settings inherit the Global value.
                    </div>`
                  : scope === "global" && !this._isAdmin()
                    ? html`<div class="device-note">Global settings are read-only — administrator access required.</div>`
                    : nothing}
                <div class="section-strip" role="tablist">
                  ${visible.map((idx) => this._renderSectionTab(groups[idx].group, active, this._sectionMode))}
                  ${overflow
                    ? html`<button
                        id="section-overflow-btn"
                        type="button"
                        class="section-tab section-overflow"
                        popovertarget="section-overflow-pop"
                        title="More"
                        aria-label="More categories"
                      >
                        <ha-icon icon="mdi:dots-horizontal"></ha-icon>
                      </button>`
                    : nothing}
                </div>
                ${overflow
                  ? html`<div
                      id="section-overflow-pop"
                      class="section-overflow-popover"
                      popover
                      @toggle=${this._onSectionOverflowToggle}
                    >
                      ${overflowList.map(
                        (idx) => html`<button
                          type="button"
                          class="section-overflow-item${groups[idx].group === active ? " active" : ""}"
                          @click=${() => this._selectSectionFromOverflow(groups[idx].group)}
                        >
                          ${this._groupIcon(groups[idx].group)
                            ? html`<ha-icon .icon=${this._groupIcon(groups[idx].group)}></ha-icon>`
                            : nothing}
                          <span>${groups[idx].group}</span>
                        </button>`,
                      )}
                    </div>`
                  : nothing}
                <div class="section-measure" aria-hidden="true">
                  <div class="section-measure-row section-measure-full">
                    ${groups.map((g) => this._renderSectionTab(g.group, active, cfg.tab_header ?? "both"))}
                  </div>
                  <div class="section-measure-row section-measure-icon">
                    ${groups.map((g) => this._renderSectionTab(g.group, active, "icon"))}
                  </div>
                </div>
                <div class="groups">
                  ${activeGroup
                    ? html`<div class="group">${this._renderFields(activeGroup.fields, scope)}</div>`
                    : nothing}
                </div>
              `}
        </ha-card>
        ${this._renderAddListModal()}${this._renderLinkModal()}
      `;
    }

    const tab = scopeShared
      ? getUiScope()
      : !showGlobal
        ? "device"
        : !showDevice
          ? "global"
          : this._tab;
    const sections = cfg.sections;
    const groups = sections?.length
      ? fieldsByGroup().filter((g) => sections.includes(g.group))
      : fieldsByGroup();

    return html`
      <ha-card class=${classMap(cardClasses)} style=${styleMap(cardStyle)}>
        ${cfg.brushed ? brushedOverlay : nothing} ${header}
        ${missing
          ? html`<div class="warn">Install the <b>Ted's Cards Backend</b> integration to use settings.</div>`
          : html`
              ${!scopeShared && showGlobal && showDevice
                ? html`<div class="tabs" role="tablist">
                    <button class="tab ${tab === "global" ? "active" : ""}" @click=${() => (this._tab = "global")}>
                      Global
                    </button>
                    <button class="tab ${tab === "device" ? "active" : ""}" @click=${() => (this._tab = "device")}>
                      This device
                    </button>
                  </div>`
                : nothing}
              ${!scopeShared && tab === "device"
                ? html`<div class="device-note">
                    Overrides apply to <b>this device only</b>. Un-overridden settings inherit the Global value.
                  </div>`
                : nothing}
              ${!scopeShared && tab === "global" && !this._isAdmin()
                ? html`<div class="device-note">Global settings are read-only — administrator access required.</div>`
                : nothing}
              <div class="groups">
                ${groups.map(
                  (g) => html`
                    <div class="group">
                      <div class="group-title">${g.group}</div>
                      ${this._renderFields(g.fields, tab)}
                    </div>
                  `,
                )}
              </div>
            `}
      </ha-card>
      ${this._renderAddListModal()}${this._renderLinkModal()}
    `;
  }

  public getGridOptions() {
    return { columns: 12, rows: 6, min_columns: 6 };
  }

  static styles = [
    tedStyleTheme,
    modalStyles,
    css`
      :host {
        display: block;
        height: 100%;
        /* Grid items default to min-width:auto (their content's min size), which lets a
           custom:grid-layout 1fr (minmax(auto,1fr)) column expand this card past the
           viewport when its content is wide — breaking the tab-strip overflow measurement.
           Allow the card to shrink to its track instead. */
        min-width: 0;
      }
      ha-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        box-sizing: border-box;
        height: 100%;
        min-width: 0;
        overflow: hidden;
        color: var(--ted-style-text);
      }
      .head {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 1.1rem;
        font-weight: 600;
        flex: none;
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
        flex: none;
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
      .section-strip {
        display: flex;
        flex-wrap: nowrap;
        gap: 4px;
        overflow: hidden;
        flex: none;
      }
      .section-tab {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font: inherit;
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--ted-style-muted);
        background: transparent;
        border: 1px solid var(--ted-style-divider);
        border-radius: 999px;
        padding: 6px 14px;
        cursor: pointer;
        white-space: nowrap;
        flex: none;
      }
      .section-tab ha-icon {
        --mdc-icon-size: 18px;
        flex: none;
      }
      .section-tab.active {
        color: var(--ted-style-accent);
        border-color: var(--ted-style-accent);
        background: color-mix(in srgb, var(--ted-style-accent) 12%, transparent);
      }
      .section-tab.icon-only {
        padding-left: 10px;
        padding-right: 10px;
      }
      .section-overflow {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 10px;
      }
      .section-overflow ha-icon {
        --mdc-icon-size: 18px;
      }
      /* Off-screen mirror used only to measure natural section-tab widths (full + icon-only). */
      .section-measure {
        position: absolute;
        left: -9999px;
        top: 0;
        visibility: hidden;
        pointer-events: none;
      }
      .section-measure-row {
        display: flex;
        gap: 4px;
        white-space: nowrap;
      }
      /* Overflow menu — a top-layer popover so the strip's overflow:hidden can't clip it. */
      .section-overflow-popover {
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
        min-width: 150px;
        max-height: 60vh;
        overflow: auto;
      }
      .section-overflow-popover:not(:popover-open) {
        display: none;
      }
      .section-overflow-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font: inherit;
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--ted-style-text, var(--primary-text-color));
        background: transparent;
        border: none;
        border-radius: 6px;
        padding: 8px 12px;
        cursor: pointer;
        text-align: left;
        white-space: nowrap;
      }
      .section-overflow-item ha-icon {
        --mdc-icon-size: 18px;
        flex: none;
        color: var(--ted-style-muted);
      }
      .section-overflow-item:hover {
        background: color-mix(in srgb, var(--ted-style-accent) 12%, transparent);
      }
      .section-overflow-item.active {
        color: var(--ted-style-accent);
      }
      .section-overflow-item.active ha-icon {
        color: var(--ted-style-accent);
      }
      .device-note {
        color: var(--ted-style-muted);
        font-size: 0.85rem;
        flex: none;
      }
      .groups {
        display: flex;
        flex-direction: column;
        gap: 14px;
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
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
      .link-inline {
        display: inline;
        padding: 0;
        border: none;
        background: none;
        font: inherit;
        color: var(--ted-style-accent, var(--primary-color));
        text-decoration: underline;
        cursor: pointer;
      }
      .launcher-colors {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      /* An unset color shows its default value muted (it isn't an explicit choice). */
      .lc-field.is-default {
        --primary-text-color: var(--ted-style-muted, var(--secondary-text-color));
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
      select.sel {
        font: inherit;
        padding: 5px 8px;
        border-radius: 8px;
        border: 1px solid var(--ted-style-divider);
        background: var(--ted-style-surface-2);
        color: inherit;
        cursor: pointer;
      }
      select.sel:disabled {
        opacity: 0.5;
        cursor: default;
      }
      /* Sound picker: dropdown + preview button, with an optional custom URL row. */
      .sound-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        align-items: flex-end;
      }
      .sound-row {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      select.sound-select {
        max-width: 46vw;
      }
      .sound-play {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        border: 1px solid var(--ted-style-divider);
        background: var(--ted-style-surface-2);
        color: inherit;
        cursor: pointer;
        --mdc-icon-size: 18px;
      }
      .sound-play:hover:not(:disabled) {
        background: var(--ted-style-surface-3, var(--ted-style-surface-2));
      }
      .sound-play:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .sound-custom {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .sound-browse {
        font: inherit;
        font-size: 0.85em;
        padding: 5px 10px;
        border-radius: 8px;
        border: 1px solid var(--ted-style-divider);
        background: var(--ted-style-surface-2);
        color: inherit;
        cursor: pointer;
        white-space: nowrap;
      }
      .sound-browse:hover:not(:disabled) {
        background: var(--ted-style-surface-3, var(--ted-style-surface-2));
      }
      /* Entity pickers: widen the field so its dropdown (which matches the field
         width) can show full entity names instead of clipping them. */
      ha-entity-picker {
        width: min(340px, 60vw);
      }
      .unit {
        color: var(--ted-style-muted);
        font-size: 0.85rem;
      }
      .rootpath {
        display: inline-flex;
        align-items: stretch;
        max-width: 42vw;
      }
      .rootprefix {
        display: inline-flex;
        align-items: center;
        padding: 5px 6px 5px 8px;
        border-radius: 8px 0 0 8px;
        border: 1px solid var(--ted-style-divider);
        border-right: none;
        background: var(--ted-style-surface-2);
        color: var(--ted-style-muted);
        font-size: 0.9em;
        white-space: nowrap;
      }
      .rootpath input.txt {
        border-radius: 0 8px 8px 0;
        max-width: none;
        min-width: 0;
        flex: 1 1 auto;
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
      .cam-row {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 8px 0;
        border-bottom: 1px solid color-mix(in srgb, var(--ted-style-divider) 60%, transparent);
      }
      .cam-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      .cam-head-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex: none;
      }
      .cam-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font: inherit;
        font-size: 0.85rem;
        padding: 6px 10px;
        border-radius: 8px;
        border: 1px solid var(--ted-style-divider);
        background: var(--ted-style-surface-2);
        color: inherit;
        cursor: pointer;
        white-space: nowrap;
        flex: none;
      }
      .cam-btn ha-icon {
        --mdc-icon-size: 18px;
      }
      .cam-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .cam-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 8px;
        border: 1px solid var(--ted-style-divider);
        background: var(--ted-style-surface-2);
      }
      .cam-item.readonly {
        opacity: 0.72;
        border-style: dashed;
      }
      /* A calendar linked into a virtual group: indented to read as a child row. */
      .cam-item.linked {
        margin-left: 28px;
      }
      /* A calendar row tinted with a pleasant horizontal gradient of its color. */
      .cam-item.tinted {
        background: linear-gradient(
          90deg,
          color-mix(in srgb, var(--cam-tint) 34%, var(--ted-style-surface-2)) 0%,
          color-mix(in srgb, var(--cam-tint) 12%, var(--ted-style-surface-2)) 55%,
          var(--ted-style-surface-2) 100%
        );
        border-color: color-mix(in srgb, var(--cam-tint) 45%, var(--ted-style-divider));
      }
      .cam-grip {
        display: flex;
        align-items: center;
        color: var(--ted-style-muted);
        cursor: grab;
        touch-action: none;
      }
      .cam-grip > * {
        pointer-events: none;
      }
      .cam-ico {
        flex: none;
        color: var(--ted-style-muted);
        --mdc-icon-size: 20px;
      }
      .cam-name {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cam-avatar {
        flex: none;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        object-fit: cover;
        border: 1px solid color-mix(in srgb, var(--ted-style-divider) 80%, transparent);
      }
      .cam-avatar.muted {
        filter: grayscale(1);
        opacity: 0.5;
      }
      .cam-groupico {
        flex: none;
        color: var(--primary-color, #3f7cf0);
        --mdc-icon-size: 20px;
      }
      .cam-tag {
        flex: none;
        font-size: 0.72rem;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 999px;
        color: var(--primary-color, #3f7cf0);
        background: color-mix(in srgb, var(--primary-color, #3f7cf0) 15%, transparent);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 45%;
      }
      .cam-vc {
        margin-top: 8px;
      }
      .cam-vc-label {
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--ted-style-muted);
        margin-bottom: 2px;
      }
      .cam-del {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 8px;
        border: none;
        background: none;
        color: var(--ted-style-muted);
        cursor: pointer;
      }
      .cam-del:hover {
        color: var(--error-color, #db4437);
      }
      .cam-del ha-icon {
        --mdc-icon-size: 18px;
      }
      .cam-entry {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .cam-opt {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 8px;
        border: none;
        background: none;
        color: var(--ted-style-muted);
        cursor: pointer;
      }
      .cam-opt:hover,
      .cam-opt.on {
        color: var(--primary-color, #3f7cf0);
      }
      .cam-opt ha-icon {
        --mdc-icon-size: 20px;
      }
      .cam-opt-body {
        padding: 4px 8px 8px 30px;
      }
      .cam-add {
        max-width: 260px;
      }
      /* Announce: predefined message editor. */
      .row.col {
        flex-direction: column;
        align-items: stretch;
      }
      .ann-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
        margin-top: 6px;
      }
      .ann-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ann-input {
        box-sizing: border-box;
        font: inherit;
        font-size: 0.9rem;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--ted-style-divider);
        background: color-mix(in srgb, var(--ted-style-text) 6%, transparent);
        color: var(--ted-style-text);
        outline: none;
      }
      .ann-input::placeholder {
        color: var(--ted-style-muted);
      }
      .ann-input:focus {
        border-color: var(--ted-style-accent, var(--primary-color));
      }
      .ann-input:disabled {
        opacity: 0.5;
      }
      .ann-icon {
        flex: 0 0 130px;
        width: 130px;
      }
      .ann-label {
        flex: 0 0 160px;
        width: 160px;
      }
      .ann-text {
        flex: 1 1 auto;
        min-width: 0;
      }
      .ann-add {
        align-self: flex-start;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 8px;
        border: 1px dashed color-mix(in srgb, var(--ted-style-divider) 80%, transparent);
        background: none;
        color: var(--ted-style-text);
        cursor: pointer;
      }
      .ann-add:hover {
        border-color: var(--ted-style-accent, var(--primary-color));
        color: var(--ted-style-accent, var(--primary-color));
      }
      .ann-add ha-icon {
        --mdc-icon-size: 18px;
      }
      .add-list-btn {
        align-self: flex-start;
      }
      /* "Add a …" chooser popup. */
      .add-sheet {
        width: min(420px, 100%);
        display: flex;
        flex-direction: column;
        max-height: min(70vh, 560px);
      }
      .add-search {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px 8px;
      }
      .add-search ha-icon {
        color: var(--ted-style-muted);
        --mdc-icon-size: 20px;
        flex: none;
      }
      .add-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        overflow: auto;
        padding: 4px 12px;
      }
      .add-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        box-sizing: border-box;
        text-align: left;
        font: inherit;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid transparent;
        background: none;
        color: inherit;
        cursor: pointer;
      }
      .add-item:hover {
        background: var(--ted-style-surface-2);
        border-color: var(--ted-style-divider);
      }
      .add-item .cam-ico {
        flex: none;
      }
      .add-item-name {
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .add-item-id {
        margin-left: auto;
        flex: none;
        font-size: 0.72rem;
        color: var(--ted-style-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 45%;
      }
      .add-empty {
        padding: 18px 12px;
        text-align: center;
        color: var(--ted-style-muted);
        font-size: 0.85rem;
      }
      .add-actions {
        display: flex;
        justify-content: flex-end;
        padding: 10px 16px 14px;
      }
      .bg-row {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 8px 0;
      }
      /* Collapsible sub-sections (Background, Advanced). */
      ha-expansion-panel.sub-panel {
        --expansion-panel-summary-padding: 0 8px;
        --expansion-panel-content-padding: 0 8px 8px;
        border-radius: 10px;
        margin: 4px 0;
        --ha-card-border-color: var(--ted-style-divider);
      }
      .sub-head {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        font-weight: 500;
      }
      .sub-head ha-icon {
        --mdc-icon-size: 20px;
        color: var(--ted-style-muted);
        flex: 0 0 auto;
      }
      .sub-head-label {
        flex: 1 1 auto;
        min-width: 0;
      }
      .sub-head-value {
        color: var(--ted-style-muted);
        font-size: 0.9em;
        font-weight: 400;
      }
      .sub-body {
        display: flex;
        flex-direction: column;
      }
      .bg-field {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .bg-field .row-control {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: none;
      }
      .bg-color {
        width: 44px;
        height: 30px;
        padding: 0;
        border: 1px solid var(--ted-style-divider);
        border-radius: 8px;
        background: none;
        cursor: pointer;
      }
      .bg-image-panel {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: flex-end;
      }
      .bg-preview {
        width: 160px;
        height: 90px;
        border-radius: 10px;
        border: 1px solid var(--ted-style-divider);
        background-color: var(--ted-style-surface-2);
        background-size: cover;
        background-position: center;
      }
      .bg-recents {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .bg-thumb {
        width: 48px;
        height: 32px;
        border-radius: 6px;
        border: 2px solid transparent;
        background-color: var(--ted-style-surface-2);
        background-size: cover;
        background-position: center;
        cursor: pointer;
        padding: 0;
      }
      .bg-thumb.on {
        border-color: var(--primary-color, #03a9f4);
      }
      .bg-actions {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .cam-btn.disabled {
        opacity: 0.5;
        pointer-events: none;
      }
      .cam-btn input[type="file"] {
        display: none;
      }
      .bg-folder {
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .bg-debug {
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px dashed var(--ted-style-divider);
        background: var(--ted-style-surface-2);
        font-size: 0.78rem;
        line-height: 1.55;
        color: var(--ted-style-muted);
        word-break: break-all;
      }
      .bg-debug-title {
        font-weight: 700;
        color: var(--ted-style-text);
        margin-bottom: 4px;
      }
      .bg-debug b {
        color: var(--ted-style-text);
        font-weight: 600;
      }
    `,
  ];
}
