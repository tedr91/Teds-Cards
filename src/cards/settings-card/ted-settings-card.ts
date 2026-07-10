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

/** Sentinel value meaning "use the resolved default sound" (mirrors the backend). */
const DEFAULT_SOUND = "default";

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

  private _unsubScope?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    // Follow the shared UI scope when this card is driven by an external toggle.
    if (this._config?.scope === "shared" || this._config?.variant === "scope-toggle") {
      this._unsubScope ??= subscribeUiScope(() => this.requestUpdate());
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubScope?.();
    this._unsubScope = undefined;
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
    `,
  ];
}
