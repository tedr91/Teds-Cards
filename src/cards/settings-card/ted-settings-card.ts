import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import { type HomeAssistant, type LovelaceCard, type LovelaceCardEditor } from "custom-card-helpers";

import { appearanceStyle, cssColor } from "../../shared/appearance";
import { brushedOverlay, tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { registerCustomCard } from "../../shared/register-card";
import {
  SettingsController,
  settingsStore,
  getUiScope,
  setUiScope,
  subscribeUiScope,
} from "../../shared/settings";
import { resolveDeviceMediaPlayer } from "../../shared/device-id";
import {
  fieldsByGroup,
  SETTINGS_DEFAULTS,
  SETTINGS_GROUP_ICONS,
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
import { getMediaFolder, isMediaSourceUri, pickMedia, resolveMediaSource, uploadImage, uploadToMediaFolder } from "../../shared/media";
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

/** True when the `fluent` custom iconset is registered (new or legacy registry). */
function hasFluentIconset(): boolean {
  const w = window as unknown as {
    customIcons?: Record<string, unknown>;
    customIconsets?: Record<string, unknown>;
  };
  return !!(w.customIcons?.fluent || w.customIconsets?.fluent);
}

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
  /** Resolved display URLs for media-source:// wallpaper thumbnails (uri → url). */
  private _bgThumbs = new Map<string, string>();
  /** media-source URI of the backend's "Ted Dash System" wallpaper folder (or null). */
  @state() private _mediaFolder: string | null = null;
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

  public connectedCallback(): void {
    super.connectedCallback();
    // Discover the dedicated wallpaper folder for uploads + the media pickers.
    if (this.hass) void getMediaFolder(this.hass).then((f) => (this._mediaFolder = f));
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
    this._unsubScope?.();
    this._unsubScope = undefined;
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

  protected updated(): void {
    // Discover the wallpaper folder once hass is available (may be unset at connect).
    if (this.hass && this._mediaFolder === null) {
      void getMediaFolder(this.hass).then((f) => {
        if (f) this._mediaFolder = f;
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

  /** Category tab icon: the Fluent glyph when that iconset is installed, else the mdi fallback. */
  private _groupIcon(name: string): string {
    const entry = SETTINGS_GROUP_ICONS[name];
    if (!entry) return "";
    return hasFluentIconset() ? entry.fluent : entry.mdi;
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

    const gap = 4;
    const overflowBtn = 52; // "…" trigger + gap, reserved when tabs spill into the menu
    const wFull = Array.from(fullRow.children).map((c) => (c as HTMLElement).offsetWidth);
    const wIcon = Array.from(iconRow.children).map((c) => (c as HTMLElement).offsetWidth);
    const sum = (arr: number[]): number => arr.reduce((a, b) => a + b, 0) + Math.max(0, arr.length - 1) * gap;

    const configMode: SectionHeaderMode = this._config?.tab_header ?? "both";
    const autoShrink = this._config?.auto_shrink !== false;

    let mode: SectionHeaderMode;
    let visibleCount: number;
    if (sum(wFull) <= available) {
      mode = configMode;
      visibleCount = total;
    } else if (autoShrink && sum(wIcon) <= available) {
      // Auto-shrink forces icon-only (even for a "name" header) when that lets them all fit.
      mode = "icon";
      visibleCount = total;
    } else {
      mode = autoShrink ? "icon" : configMode;
      const widths = mode === "icon" ? wIcon : wFull;
      const budget = available - overflowBtn;
      let used = 0;
      let count = 0;
      for (let i = 0; i < total; i++) {
        const add = (count > 0 ? gap : 0) + widths[i];
        if (used + add > budget) break;
        used += add;
        count++;
      }
      visibleCount = Math.max(1, count);
    }
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
    const margin = 8;
    pop.style.position = "fixed";
    pop.style.margin = "0";
    const rect = pop.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    if (!anchor) {
      pop.style.left = `${Math.round((vw - rect.width) / 2)}px`;
      pop.style.top = `${Math.round((vh - rect.height) / 2)}px`;
      return;
    }
    const a = anchor.getBoundingClientRect();
    let left = a.right - rect.width;
    left = Math.max(margin, Math.min(left, vw - rect.width - margin));
    const fitsBelow = a.bottom + margin + rect.height <= vh - margin;
    let top = fitsBelow ? a.bottom + margin : a.top - margin - rect.height;
    top = Math.max(margin, Math.min(top, vh - rect.height - margin));
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
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
          ${(field.options ?? []).map(
            (o) => html`<option value=${o.value} ?selected=${String(value) === o.value}>${o.label}</option>`,
          )}
        </select>`;
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
        return html`<input
          class="txt"
          type="text"
          .value=${typeof value === "string" && value && value !== DEFAULT_SOUND ? value : ""}
          placeholder=${this._resolvedDefaultSound(field.key)}
          ?disabled=${disabled}
          @change=${(e: Event) => {
            const v = (e.target as HTMLInputElement).value.trim();
            onChange(v === "" ? DEFAULT_SOUND : v);
          }}
        />`;
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

  private _renderGlobalRow(field: SettingField): TemplateResult {
    if (field.kind === "entity-list") return this._renderCamerasGlobal(field);
    if (field.kind === "background") return this._renderBackground(field, "global");
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
          ${this._renderControl(field, this._globalValue(field.key), !this._isAdmin(), (v) =>
            this._isAdmin() ? this._setGlobal(field.key, v) : undefined,
          )}
        </div>
      </div>
    `;
  }

  private _renderDeviceRow(field: SettingField): TemplateResult {
    if (field.kind === "entity-list") return this._renderCamerasDevice(field);
    if (field.kind === "background") return this._renderBackground(field, "device");
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

  // --- Entity-list field (Global = available allow-list; Device = curated subset) ---
  //     Shared by Cameras (camera.*) and Temperatures (climate.*), keyed by field.entityDomain.

  /** Per-domain presentation: list icon and the noun used in labels/buttons. */
  private _listMeta(field: SettingField): { icon: string; noun: string; nounPlural: string } {
    if (field.entityDomain === "climate") {
      return { icon: "mdi:thermostat", noun: "thermostat", nounPlural: "thermostats" };
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

  /** A reorderable, removable list of entity rows. */
  private _renderCameraChips(
    ids: string[],
    icon: string,
    onRemove: (idx: number) => void,
    onMove: (from: number, to: number) => void,
  ): TemplateResult {
    return html`
      <ha-sortable
        handle-selector=".cam-grip"
        @item-moved=${(e: CustomEvent) => {
          const { oldIndex, newIndex } = e.detail as { oldIndex: number; newIndex: number };
          onMove(oldIndex, newIndex);
        }}
      >
        <div class="cam-list">
          ${ids.map(
            (id, idx) => html`
              <div class="cam-item">
                <div class="cam-grip" title="Drag to reorder">
                  <ha-icon icon="mdi:drag"></ha-icon>
                </div>
                <ha-icon class="cam-ico" .icon=${icon}></ha-icon>
                <span class="cam-name">${this._cameraName(id)}</span>
                <button class="cam-del" title="Remove" @click=${() => onRemove(idx)}>
                  <ha-icon icon="mdi:close"></ha-icon>
                </button>
              </div>
            `,
          )}
        </div>
      </ha-sortable>
    `;
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
            <span>${field.label} — available list</span>
            <span class="help">The ${meta.nounPlural} any device is allowed to show.</span>
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
                setList(n);
              },
            )
          : html`<div class="help">No ${meta.nounPlural} yet — add one below or tap “Auto-populate”.</div>`}
        ${admin && remaining.length
          ? html`<ha-entity-picker
              .hass=${this.hass}
              .value=${""}
              .includeEntities=${remaining}
              allow-custom-entity
              label=${`Add a ${meta.noun}`}
              @value-changed=${(e: CustomEvent) => {
                const id = e.detail.value;
                if (id && !ids.includes(id)) setList([...ids, id]);
              }}
            ></ha-entity-picker>`
          : nothing}
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
    const domain = field.entityDomain ?? "camera";
    const global = this._camerasArray(this._globalValue(field.key));
    const raw = settingsStore.deviceSettings();
    const hasDevice = field.key in raw;
    const stored = hasDevice ? this._camerasArray(raw[field.key]) : [];
    // Only global entities are choosable; hide any stale ids once a global list exists.
    const valid = global.length ? stored.filter((id) => global.includes(id)) : stored;
    const pool = global.length ? global : this._allCameras(domain);
    const remaining = pool.filter((id) => !valid.includes(id));
    const setList = (next: string[]): void => this._setDevice(field.key, next);
    return html`
      <div class="cam-row">
        <div class="cam-head">
          <div class="row-label">
            <span>${field.label} — this device</span>
            <span class="help">
              ${hasDevice
                ? `The ${meta.nounPlural} this device shows.`
                : `Not customized — this device shows all available ${meta.nounPlural}.`}
            </span>
          </div>
          <button class="cam-btn" @click=${() => this._syncDevice(field)}>
            <ha-icon icon="mdi:sync"></ha-icon><span>Sync list</span>
          </button>
        </div>
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
          : html`<div class="help">
              No ${meta.nounPlural} selected yet — add from the list or tap “Sync list”.
            </div>`}
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
          : nothing}
      </div>
    `;
  }

  /** Reconcile the device list with the global list: keep still-valid cameras in
   *  order, append newly-available global cameras, drop any no longer offered. */
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

  private _renderBackground(field: SettingField, scope: "global" | "device"): TemplateResult {
    const disabled = scope === "global" && !this._isAdmin();
    const overriding = scope === "device" && BACKGROUND_KEYS.some((k) => k in settingsStore.deviceSettings());

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
    };

    return html`
      <div class="bg-row">
        <div class="cam-head">
          <div class="row-label">
            <span>${field.label}${scope === "device" ? " — this device" : ""}</span>
            ${scope === "device" && !overriding
              ? html`<span class="help">Not customized — this device follows the Global wallpaper.</span>`
              : field.help
                ? html`<span class="help">${field.help}</span>`
                : nothing}
          </div>
          ${scope === "device" && overriding
            ? html`<button class="cam-btn" @click=${() => this._resetBgDevice()}>
                <ha-icon icon="mdi:backup-restore"></ha-icon><span>Reset</span>
              </button>`
            : nothing}
        </div>
        ${renderBackgroundFields(ctx)}
      </div>
    `;
  }

  private _resetBgDevice(): void {
    for (const k of BACKGROUND_KEYS) settingsStore.clearValue("device", k);
    this.requestUpdate();
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
                    ? html`<div class="group">
                        ${activeGroup.fields.map((f) =>
                          scope === "global" ? this._renderGlobalRow(f) : this._renderDeviceRow(f),
                        )}
                      </div>`
                    : nothing}
                </div>
              `}
        </ha-card>
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
    return { columns: 12, rows: 6, min_columns: 6 };
  }

  static styles = [
    tedStyleTheme,
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
      .cam-add {
        max-width: 260px;
      }
      .bg-row {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 8px 0;
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
    `,
  ];
}
