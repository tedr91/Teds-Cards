import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import {
  type HomeAssistant,
  type LovelaceCardConfig,
  type LovelaceCardEditor,
  type LovelaceConfig,
  fireEvent,
} from "custom-card-helpers";

import { transparencyBlurSchema } from "../../shared/appearance";
import { TAB_CARD_EDITOR_TYPE, DEFAULT_TAB_PARAM, DEFAULT_TAB_ICON } from "./const";
import type { TabCardConfig, TabConfig } from "./types";

// mdi:drag
const DRAG_ICON =
  "M7,19V17H9V19H7M11,19V17H13V19H11M15,19V17H17V19H15M7,15V13H9V15H7M11,15V13H13V15H11M15,15V13H17V15H15M7,11V9H9V11H7M11,11V9H13V11H11M15,11V9H17V11H15M7,7V5H9V7H7M11,7V5H13V7H11M15,7V5H17V7H15Z";
// mdi:delete
const DELETE_ICON = "M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z";
// mdi:plus
const PLUS_ICON = "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z";
// mdi:palette — Appearance section
const APPEARANCE_ICON_PATH =
  "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";

type AnyHtmlElement = HTMLElement & Record<string, unknown>;

@customElement(TAB_CARD_EDITOR_TYPE)
export class TedTabCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  /** Passed down by HA's card editor host; forwarded to the embedded native editors. */
  @property({ attribute: false }) public lovelace?: LovelaceConfig;
  @state() private _config?: TabCardConfig;
  /** Keys (`tab-<i>`) of the currently-expanded tab panels. */
  @state() private _expanded = new Set<string>();

  /** Cached native `hui-card-element-editor` elements, keyed by tab index. */
  private _cardEditors = new Map<number, AnyHtmlElement>();
  /** Last card JSON pushed to / received from each editor, to avoid mid-edit reverts. */
  private _editorJson = new Map<number, string>();
  /** True once the native `hui-card-picker` element is registered. */
  private _pickerReady = typeof customElements !== "undefined" && !!customElements.get("hui-card-picker");

  public setConfig(config: TabCardConfig): void {
    this._config = { ...config, tabs: [...(config.tabs ?? [])] };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    if (!this._pickerReady && typeof customElements !== "undefined") {
      customElements.whenDefined("hui-card-picker").then(() => {
        this._pickerReady = true;
        this.requestUpdate();
      });
    }
  }

  private get _tabs(): TabConfig[] {
    return this._config?.tabs ?? [];
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config") || changed.has("hass") || changed.has("lovelace")) {
      this._syncCardEditors();
    }
  }

  /** Ensure a native card editor exists for every tab that has a card. */
  private _syncCardEditors(): void {
    const tabs = this._tabs;
    for (const idx of [...this._cardEditors.keys()]) {
      if (idx >= tabs.length || !tabs[idx].card) {
        this._cardEditors.delete(idx);
        this._editorJson.delete(idx);
      }
    }
    tabs.forEach((tab, idx) => {
      if (!tab.card) return;
      const json = JSON.stringify(tab.card);
      let el = this._cardEditors.get(idx);
      if (!el) {
        el = document.createElement("hui-card-element-editor") as AnyHtmlElement;
        el.addEventListener("config-changed", (ev) => this._onCardChanged(idx, ev as CustomEvent));
        el.hass = this.hass;
        el.lovelace = this.lovelace;
        el.value = tab.card;
        this._cardEditors.set(idx, el);
        this._editorJson.set(idx, json);
        return;
      }
      el.hass = this.hass;
      el.lovelace = this.lovelace;
      // Only push EXTERNAL changes (not our own echoes) so typing isn't reverted.
      if (this._editorJson.get(idx) !== json) {
        el.value = tab.card;
        this._editorJson.set(idx, json);
      }
    });
  }

  /** Forget all cached editors (used on structural changes: reorder/delete). */
  private _resetCardEditors(): void {
    this._cardEditors.clear();
    this._editorJson.clear();
  }

  private _onCardChanged(idx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const card = ev.detail?.config as LovelaceCardConfig | undefined;
    if (!card) return;
    this._editorJson.set(idx, JSON.stringify(card));
    const tabs = [...this._tabs];
    if (!tabs[idx]) return;
    tabs[idx] = { ...tabs[idx], card };
    this._commit({ ...this._config!, tabs });
  }

  private _onCardPicked(idx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const card = ev.detail?.config as LovelaceCardConfig | undefined;
    if (!card) return;
    const tabs = [...this._tabs];
    if (!tabs[idx]) return;
    tabs[idx] = { ...tabs[idx], card };
    this._commit({ ...this._config!, tabs });
  }

  private _addTab(): void {
    const tabs = [...this._tabs];
    const n = tabs.length + 1;
    tabs.push({ label: `Tab ${n}`, icon: DEFAULT_TAB_ICON, slug: `tab-${n}` });
    this._expanded.add(`tab-${tabs.length - 1}`);
    this._commit({ ...this._config!, tabs });
  }

  private _deleteTab(idx: number): void {
    const tabs = [...this._tabs];
    tabs.splice(idx, 1);
    this._resetCardEditors();
    this._remapExpanded(idx, -1);
    this._commit({ ...this._config!, tabs });
  }

  private _tabMoved(ev: CustomEvent): void {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const tabs = [...this._tabs];
    const [moved] = tabs.splice(oldIndex, 1);
    tabs.splice(newIndex, 0, moved);
    this._resetCardEditors();
    this._commit({ ...this._config!, tabs });
  }

  /** Shift expanded-panel keys when a tab is removed (delta -1) at `at`. */
  private _remapExpanded(at: number, delta: number): void {
    const next = new Set<string>();
    for (const key of this._expanded) {
      const m = /^tab-(\d+)$/.exec(key);
      if (!m) {
        next.add(key);
        continue;
      }
      const i = Number(m[1]);
      if (i === at && delta < 0) continue;
      next.add(i > at ? `tab-${i + delta}` : key);
    }
    this._expanded = next;
  }

  private _onPanelToggle(key: string, ev: CustomEvent): void {
    // Ignore `expanded-changed` bubbling up from a NESTED expansion panel (e.g. an
    // expandable section inside the embedded card editor) — only react to this panel's own.
    if (ev.target !== ev.currentTarget) return;
    const expanded = (ev.detail as { expanded: boolean }).expanded;
    const next = new Set(this._expanded);
    if (expanded) next.add(key);
    else next.delete(key);
    this._expanded = next;
  }

  private _onTabFieldChanged(idx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value as { label?: string; icon?: string; slug?: string };
    const tabs = [...this._tabs];
    const tab: TabConfig = { ...tabs[idx] };
    tab.label = value.label || undefined;
    tab.icon = value.icon || undefined;
    tab.slug = value.slug || undefined;
    tabs[idx] = tab;
    this._commit({ ...this._config!, tabs });
  }

  private _onOptionsChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const value = ev.detail.value as Partial<TabCardConfig>;
    const config: TabCardConfig = { ...this._config!, ...value };
    if (config.url_param === DEFAULT_TAB_PARAM || config.url_param === "") delete config.url_param;
    if (typeof config.default_tab !== "number") delete config.default_tab;
    if (config.show_tabs !== false) delete config.show_tabs;
    if (config.tab_header === "both" || !config.tab_header) delete config.tab_header;
    if (config.auto_shrink !== false) delete config.auto_shrink;
    for (const key of ["background", "brushed", "shadow", "transparency", "blur", "scale", "theme"] as const) {
      const v = config[key];
      if (v === undefined || v === null || v === "") delete config[key];
    }
    this._commit(config);
  };

  private _commit(next: TabCardConfig): void {
    this._config = next;
    fireEvent(this, "config-changed", { config: next });
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const tabs = this._tabs;
    const optionsData = {
      url_param: this._config.url_param ?? DEFAULT_TAB_PARAM,
      default_tab: this._config.default_tab,
      show_tabs: this._config.show_tabs !== false,
      tab_header: this._config.tab_header ?? "both",
      auto_shrink: this._config.auto_shrink !== false,
      theme: this._config.theme,
      background: this._config.background,
      brushed: this._config.brushed ?? false,
      shadow: this._config.shadow !== false,
      transparency: this._config.transparency,
      blur: this._config.blur,
      scale: this._config.scale ?? 100,
    };
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${optionsData}
        .schema=${this._optionsSchema(tabs.length)}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._onOptionsChanged}
      ></ha-form>

      <div class="tabs-header">
        <span class="tabs-title">Tabs</span>
        <ha-icon-button .path=${PLUS_ICON} label="Add tab" @click=${this._addTab}></ha-icon-button>
      </div>

      <ha-sortable handle-selector=".tab-drag-handle" @item-moved=${this._tabMoved}>
        <div class="tab-list">
          ${repeat(
            tabs,
            (_tab, idx) => idx,
            (tab, idx) => this._renderTabRow(tab, idx),
          )}
        </div>
      </ha-sortable>
    `;
  }

  private _renderTabRow(tab: TabConfig, idx: number): TemplateResult {
    const key = `tab-${idx}`;
    const label = tab.label || `Tab ${idx + 1}`;
    return html`
      <ha-expansion-panel
        outlined
        .expanded=${this._expanded.has(key)}
        @expanded-changed=${(ev: CustomEvent) => this._onPanelToggle(key, ev)}
      >
        <div slot="header" class="tab-header">
          <ha-svg-icon class="tab-drag-handle" .path=${DRAG_ICON}></ha-svg-icon>
          ${tab.icon ? html`<ha-icon .icon=${tab.icon}></ha-icon>` : nothing}
          <span>${label}</span>
        </div>
        <ha-icon-button
          slot="icons"
          .path=${DELETE_ICON}
          label="Delete tab"
          @click=${(ev: Event) => {
            ev.stopPropagation();
            this._deleteTab(idx);
          }}
        ></ha-icon-button>
        <div class="tab-body">
          <ha-form
            .hass=${this.hass}
            .data=${{ label: tab.label ?? "", icon: tab.icon ?? "", slug: tab.slug ?? "" }}
            .schema=${TAB_FIELDS_SCHEMA}
            .computeLabel=${this._computeTabLabel}
            @value-changed=${(ev: CustomEvent) => this._onTabFieldChanged(idx, ev)}
          ></ha-form>
          <div class="card-label">Card</div>
          ${this._renderTabCard(tab, idx)}
        </div>
      </ha-expansion-panel>
    `;
  }

  private _renderTabCard(tab: TabConfig, idx: number): TemplateResult {
    if (tab.card) {
      const editor = this._cardEditors.get(idx);
      return html`${editor ?? html`<div class="hint">Loading editor…</div>`}`;
    }
    if (this._pickerReady) {
      return html`<hui-card-picker
        .hass=${this.hass}
        .lovelace=${this.lovelace}
        @config-changed=${(ev: CustomEvent) => this._onCardPicked(idx, ev)}
      ></hui-card-picker>`;
    }
    // Fallback until the native picker is available: type a card type to start.
    return html`
      <div class="hint">Enter a card type to add (e.g. <code>custom:ted-alarm-card</code>):</div>
      <ha-form
        .hass=${this.hass}
        .data=${{ card_type: "" }}
        .schema=${[{ name: "card_type", selector: { text: {} } }]}
        .computeLabel=${() => "Card type"}
        @value-changed=${(ev: CustomEvent) => this._onManualType(idx, ev)}
      ></ha-form>
    `;
  }

  private _onManualType(idx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const type = (ev.detail.value?.card_type as string | undefined)?.trim();
    if (!type) return;
    const tabs = [...this._tabs];
    tabs[idx] = { ...tabs[idx], card: { type } as LovelaceCardConfig };
    this._commit({ ...this._config!, tabs });
  }

  private _optionsSchema(tabCount: number) {
    return [
      { name: "url_param", selector: { text: { placeholder: "tab" } } },
      {
        type: "grid",
        name: "",
        column_min_width: "120px",
        schema: [
          {
            name: "default_tab",
            selector: { number: { min: 0, max: Math.max(tabCount - 1, 0), step: 1, mode: "box" } },
          },
          { name: "show_tabs", selector: { boolean: {} } },
        ],
      },
      {
        type: "grid",
        name: "",
        column_min_width: "120px",
        schema: [
          {
            name: "tab_header",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "both", label: "Icon + name (default)" },
                  { value: "icon", label: "Icon only" },
                  { value: "name", label: "Name only" },
                ],
              },
            },
          },
          { name: "auto_shrink", selector: { boolean: {} } },
        ],
      },
      {
        name: "",
        type: "expandable",
        title: "Appearance (general)",
        iconPath: APPEARANCE_ICON_PATH,
        flatten: true,
        schema: [
          {
            name: "theme",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "ted-style", label: "Ted's Style" },
                  { value: "ha", label: "Home Assistant theme (default)" },
                ],
              },
            },
          },
          { name: "background", selector: { ui_color: {} } },
          { name: "brushed", selector: { boolean: {} } },
          { name: "shadow", selector: { boolean: {} } },
          transparencyBlurSchema(this._config?.transparency),
          {
            name: "scale",
            selector: { number: { min: 50, max: 200, step: 5, mode: "box", unit_of_measurement: "%" } },
          },
        ],
      },
    ];
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "url_param":
        return "URL parameter (deep-links the active tab)";
      case "default_tab":
        return "Default tab index";
      case "show_tabs":
        return "Show tab strip";
      case "tab_header":
        return "Tab header";
      case "auto_shrink":
        return "Auto shrink tab header (icons only when tabs don't fit)";
      case "theme":
        return "Visual styling";
      case "background":
        return "Background color";
      case "brushed":
        return "Brushed effect";
      case "shadow":
        return "Subtle shadow for improved contrast";
      case "transparency":
        return "Transparency";
      case "blur":
        return "Background blur";
      case "scale":
        return "Card scale";
      default:
        return schema.name;
    }
  };

  private _computeTabLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "label":
        return "Label";
      case "icon":
        return "Icon";
      case "slug":
        return "URL slug (deep link value)";
      default:
        return schema.name;
    }
  };

  static styles = css`
    :host {
      display: block;
    }
    .tabs-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 12px 0 4px;
    }
    .tabs-title {
      font-weight: 600;
    }
    .tab-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    ha-expansion-panel {
      --expansion-panel-content-padding: 0;
    }
    .tab-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .tab-drag-handle {
      cursor: grab;
      color: var(--secondary-text-color);
    }
    .tab-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px 12px 12px;
    }
    .card-label {
      font-weight: 600;
      margin-top: 4px;
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: 0.9rem;
    }
    code {
      font-family: var(--code-font-family, monospace);
    }
  `;
}

/** Per-tab meta fields schema (label + icon grid, then slug). */
const TAB_FIELDS_SCHEMA = [
  {
    type: "grid",
    name: "",
    column_min_width: "120px",
    schema: [
      { name: "label", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
    ],
  },
  { name: "slug", selector: { text: {} } },
];

declare global {
  interface HTMLElementTagNameMap {
    "ted-tab-card-editor": TedTabCardEditor;
  }
}
