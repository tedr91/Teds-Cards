import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  type HomeAssistant,
  type LovelaceCardConfig,
  type LovelaceCardEditor,
  fireEvent,
} from "custom-card-helpers";

import { BUTTON_CARD_TYPE } from "../button-card/const";
import {
  EXPANDABLE_BUTTON_CARD_EDITOR_TYPE,
  EXPANDABLE_BUTTON_CARD_TYPE,
  defaultChildButton,
  defaultChildExpandable,
} from "./const";
import type { ExpandableButtonCardConfig, ExpandableChildConfig } from "./types";

// mdi:gesture-tap-button — Trigger section
const TRIGGER_ICON_PATH =
  "M10,9A1,1 0 0,1 11,8A1,1 0 0,1 12,9V13.47L13.21,13.6L18.15,15.79C18.68,16.03 19,16.56 19,17.13V21.5C18.97,22.32 18.32,22.97 17.5,23H11C10.62,23 10.26,22.85 10,22.57L5.1,18.37L5.84,17.6C6.03,17.39 6.3,17.28 6.59,17.28H6.75L10,19V9M11,5A4,4 0 0,1 15,9C15,10.5 14.2,11.77 13,12.46V11.24C13.61,10.69 14,9.89 14,9A3,3 0 0,0 11,6A3,3 0 0,0 8,9C8,9.89 8.39,10.69 9,11.24V12.46C7.8,11.77 7,10.5 7,9A4,4 0 0,1 11,5Z";
// mdi:view-grid — Popup buttons section
const ITEMS_ICON_PATH = "M3,11H11V3H3M3,21H11V13H3M13,21H21V13H13M13,3V11H21V3";
// mdi:drag — reorder handle
const GRIP_ICON_PATH =
  "M7,19V17H9V19H7M11,19V17H13V19H11M15,19V17H17V19H15M7,15V13H9V15H7M11,15V13H13V15H11M15,15V13H17V15H15M7,11V9H9V11H7M11,11V9H13V11H11M15,11V9H17V11H15M7,7V5H9V7H7M11,7V5H13V7H11M15,7V5H17V7H15Z";
// mdi:delete
const DELETE_ICON_PATH = "M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z";

const TRIGGER_KEY = "trigger";

/** Sections hidden on the trigger's Button Card editor: a tap only opens the popup, so
 *  entity/state/badge/highlight/interactions and the active-state background don't apply. */
const TRIGGER_TRIM = {
  entity: true,
  backgroundOn: true,
  state: true,
  badge: true,
  highlight: true,
  interactions: true,
} as const;

interface EditorEntry {
  el: LovelaceCardEditor;
  type: string;
  json: string;
}

@customElement(EXPANDABLE_BUTTON_CARD_EDITOR_TYPE)
export class TedExpandableButtonCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: ExpandableButtonCardConfig;
  /** Keys (`child-<i>`) of currently expanded child panels. */
  @state() private _expanded = new Set<string>();
  /** Whether the "add item" menu is open. */
  @state() private _addOpen = false;

  /** Embedded controlled editors: `trigger` and `child-<i>`. */
  private _editors = new Map<string, EditorEntry>();
  private _creating = new Set<string>();

  public setConfig(config: ExpandableButtonCardConfig): void {
    this._config = config;
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config") || changed.has("hass")) this._syncEditors();
  }

  private _items(): ExpandableChildConfig[] {
    return Array.isArray(this._config?.items) ? this._config!.items! : [];
  }

  private _isExpandable(child: ExpandableChildConfig): boolean {
    return child.type === `custom:${EXPANDABLE_BUTTON_CARD_TYPE}`;
  }

  // --- Render ----------------------------------------------------------------

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const layout = this._config.popup_layout === "list" ? "list" : "grid";
    const trigger = this._editors.get(TRIGGER_KEY);
    return html`
      <div class="editor">
        <ha-expansion-panel outlined class="group-panel" .expanded=${true}>
          <div slot="header" class="group-header">
            <ha-svg-icon .path=${TRIGGER_ICON_PATH}></ha-svg-icon>
            <span>Trigger button</span>
          </div>
          <div class="group-body">
            ${trigger ? trigger.el : html`<div class="loading">Loading…</div>`}
          </div>
        </ha-expansion-panel>

        <ha-form
          .hass=${this.hass}
          .data=${{
            popup_layout: layout,
            popup_max_columns: this._config.popup_max_columns,
            popup_title: this._config.popup_title ?? "",
            flip_icon: this._config.flip_icon !== false,
          }}
          .schema=${this._popupSchema(layout)}
          .computeLabel=${this._computeLabel}
          @value-changed=${this._onPopupFieldsChanged}
        ></ha-form>

        <ha-expansion-panel outlined class="group-panel">
          <div slot="header" class="group-header">
            <ha-svg-icon .path=${ITEMS_ICON_PATH}></ha-svg-icon>
            <span>Popup buttons</span>
          </div>
          <div class="group-body">${this._renderItemList()}</div>
        </ha-expansion-panel>
      </div>
    `;
  }

  private _popupSchema(layout: string) {
    return [
      {
        type: "grid",
        name: "",
        column_min_width: "120px",
        schema: [
          {
            name: "popup_layout",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "grid", label: "Grid" },
                  { value: "list", label: "List" },
                ],
              },
            },
          },
          ...(layout === "grid"
            ? [
                {
                  name: "popup_max_columns",
                  selector: { number: { min: 1, max: 12, step: 1, mode: "box" } },
                },
              ]
            : []),
        ],
      },
      { name: "popup_title", selector: { text: {} } },
      { name: "flip_icon", selector: { boolean: {} } },
    ];
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "popup_layout":
        return "Popup layout";
      case "popup_max_columns":
        return "Max columns (optional)";
      case "popup_title":
        return "Popup title";
      case "flip_icon":
        return "Flip icon when open";
      default:
        return schema.name;
    }
  };

  private _renderItemList(): TemplateResult {
    const items = this._items();
    return html`
      <ha-sortable handle-selector=".drag-handle" @item-moved=${this._itemMoved}>
        <div class="row-list">${items.map((item, idx) => this._renderItemRow(idx, item))}</div>
      </ha-sortable>
      ${this._renderAddMenu()}
    `;
  }

  private _renderItemRow(idx: number, item: ExpandableChildConfig): TemplateResult {
    const key = `child-${idx}`;
    const expanded = this._expanded.has(key);
    const entry = this._editors.get(key);
    const expandable = this._isExpandable(item);
    return html`
      <ha-expansion-panel
        outlined
        class="row"
        .expanded=${expanded}
        @expanded-changed=${(ev: CustomEvent) => this._onPanelToggle(key, ev)}
      >
        <div slot="header" class="row-header">
          <div class="drag-handle" @click=${this._stop} title="Drag to reorder">
            <ha-svg-icon .path=${GRIP_ICON_PATH}></ha-svg-icon>
          </div>
          <ha-icon class="row-icon" icon=${item.icon || "mdi:gesture-tap-button"}></ha-icon>
          <span class="row-title">${expandable ? "Expandable button" : "Button"}</span>
          ${item.name ? html`<span class="row-subtitle">${item.name}</span>` : nothing}
          <ha-icon-button
            class="warning"
            label="Delete button"
            .path=${DELETE_ICON_PATH}
            @click=${(ev: Event) => this._removeItem(idx, ev)}
          ></ha-icon-button>
        </div>
        <div class="row-body">${entry ? entry.el : html`<div class="loading">Loading…</div>`}</div>
      </ha-expansion-panel>
    `;
  }

  private _renderAddMenu(): TemplateResult {
    const open = this._addOpen;
    return html`
      <div class="add-menu">
        <button
          type="button"
          class="add-btn ${open ? "open" : ""}"
          aria-expanded=${open ? "true" : "false"}
          @click=${this._toggleAddMenu}
        >
          + Add button
        </button>
        ${open
          ? html`
              <div class="add-menu-list" @click=${this._stop}>
                <button type="button" class="add-menu-item" @click=${() => this._addItem("button")}>
                  Button
                </button>
                <button type="button" class="add-menu-item" @click=${() => this._addItem("expandable")}>
                  Expandable button
                </button>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  // --- Mutations -------------------------------------------------------------

  private _stop = (ev: Event): void => {
    ev.stopPropagation();
  };

  private _onPanelToggle(key: string, ev: CustomEvent): void {
    if (ev.target !== ev.currentTarget) return;
    const open = (ev.detail as { expanded: boolean }).expanded;
    const next = new Set(this._expanded);
    if (open) next.add(key);
    else next.delete(key);
    this._expanded = next;
  }

  private _toggleAddMenu = (ev: Event): void => {
    ev.stopPropagation();
    this._addOpen = !this._addOpen;
  };

  private _commit(next: ExpandableButtonCardConfig): void {
    this._config = next;
    fireEvent(this, "config-changed", { config: next });
  }

  private _commitItems(items: ExpandableChildConfig[]): void {
    this._commit({ ...this._config, items } as ExpandableButtonCardConfig);
  }

  private _onPopupFieldsChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const value = (ev.detail?.value ?? {}) as {
      popup_layout?: string;
      popup_max_columns?: number;
      popup_title?: string;
      flip_icon?: boolean;
    };
    const next = { ...this._config } as ExpandableButtonCardConfig;
    if (value.popup_layout === "list") next.popup_layout = "list";
    else delete next.popup_layout;
    if (typeof value.popup_max_columns === "number" && value.popup_max_columns > 0)
      next.popup_max_columns = value.popup_max_columns;
    else delete next.popup_max_columns;
    if (value.popup_title) next.popup_title = value.popup_title;
    else delete next.popup_title;
    if (value.flip_icon === false) next.flip_icon = false;
    else delete next.flip_icon;
    this._commit(next);
  };

  private _addItem(kind: "button" | "expandable"): void {
    this._addOpen = false;
    const child = kind === "expandable" ? defaultChildExpandable() : defaultChildButton();
    const items = [...this._items(), child as ExpandableChildConfig];
    this._expanded = new Set([...this._expanded, `child-${items.length - 1}`]);
    this._commitItems(items);
  }

  private _removeItem(idx: number, ev: Event): void {
    ev.stopPropagation();
    const items = [...this._items()];
    items.splice(idx, 1);
    this._editors.clear();
    this._commitItems(items);
  }

  private _itemMoved = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const items = [...this._items()];
    items.splice(newIndex, 0, items.splice(oldIndex, 1)[0]);
    this._editors.clear();
    this._commitItems(items);
  };

  // --- Embedded controlled editors ------------------------------------------

  private _syncEditors(): void {
    if (!this.hass || !this._config) return;
    const wanted = new Set<string>([TRIGGER_KEY]);
    this._items().forEach((_, idx) => wanted.add(`child-${idx}`));
    for (const key of [...this._editors.keys()]) {
      if (!wanted.has(key)) this._editors.delete(key);
    }

    // Trigger editor (a Button Card editor over the appearance config).
    const triggerConfig = this._triggerConfig();
    this._syncEditor(TRIGGER_KEY, `custom:${BUTTON_CARD_TYPE}`, triggerConfig);

    // Child editors (Button or Expandable Button editor per item).
    this._items().forEach((item, idx) => {
      this._syncEditor(`child-${idx}`, item.type, item as LovelaceCardConfig);
    });
  }

  private _syncEditor(key: string, type: string, config: LovelaceCardConfig): void {
    const entry = this._editors.get(key);
    if (entry && entry.type === type) {
      // Keep hass fresh; never push setConfig here (an async round-trip could revert
      // fast typing). Structural changes clear the map.
      entry.el.hass = this.hass;
      return;
    }
    if (entry) this._editors.delete(key);
    void this._createEditor(key, type, config);
  }

  private async _createEditor(key: string, type: string, config: LovelaceCardConfig): Promise<void> {
    if (this._creating.has(key)) return;
    const tag = type.replace(/^custom:/, "");
    const cardClass = customElements.get(tag) as
      | (CustomElementConstructor & { getConfigElement?: () => Promise<LovelaceCardEditor> })
      | undefined;
    if (!cardClass?.getConfigElement) return;
    this._creating.add(key);
    try {
      const el = await cardClass.getConfigElement();
      el.hass = this.hass;
      if (key === TRIGGER_KEY) (el as unknown as { trim?: typeof TRIGGER_TRIM }).trim = TRIGGER_TRIM;
      el.setConfig(config);
      el.addEventListener("config-changed", (ev: Event) => {
        ev.stopPropagation();
        this._onEditorConfigChanged(key, ev as CustomEvent);
      });
      this._editors.set(key, { el, type, json: JSON.stringify(config) });
      this.requestUpdate();
    } finally {
      this._creating.delete(key);
    }
  }

  /** The trigger's appearance config: the parent config minus popup-only keys, typed as
   *  a Button Card so the embedded Button Card editor can edit it. */
  private _triggerConfig(): LovelaceCardConfig {
    const { items, popup_layout, popup_columns, popup_title, ...rest } = this._config ?? {};
    void items;
    void popup_layout;
    void popup_columns;
    void popup_title;
    return { ...rest, type: `custom:${BUTTON_CARD_TYPE}` } as LovelaceCardConfig;
  }

  private _onEditorConfigChanged(key: string, ev: CustomEvent): void {
    const newConfig = ev.detail?.config as LovelaceCardConfig | undefined;
    if (!newConfig) return;
    const entry = this._editors.get(key);

    if (key === TRIGGER_KEY) {
      // Merge the edited appearance back, preserving popup-only keys and the card's own type.
      const merged = {
        ...newConfig,
        type: `custom:${EXPANDABLE_BUTTON_CARD_TYPE}`,
        ...(this._config?.items ? { items: this._config.items } : {}),
        ...(this._config?.popup_layout ? { popup_layout: this._config.popup_layout } : {}),
        ...(this._config?.popup_columns ? { popup_columns: this._config.popup_columns } : {}),
        ...(this._config?.popup_title ? { popup_title: this._config.popup_title } : {}),
      } as ExpandableButtonCardConfig;
      const triggerConfig = this._triggerConfigFrom(merged);
      const json = JSON.stringify(triggerConfig);
      if (entry && entry.json === json) return;
      // Push the config back so the controlled child editor updates its own state
      // (it fires config-changed but doesn't self-update); otherwise edits revert.
      if (entry) {
        entry.json = json;
        entry.el.setConfig(triggerConfig);
      }
      this._commit(merged);
      return;
    }

    const idx = Number(key.slice("child-".length));
    const items = [...this._items()];
    if (idx < 0 || idx >= items.length) return;
    const json = JSON.stringify(newConfig);
    if (entry && entry.json === json) return;
    if (entry) {
      entry.json = json;
      entry.el.setConfig(newConfig);
    }
    items[idx] = newConfig as ExpandableChildConfig;
    this._commitItems(items);
  }

  private _triggerConfigFrom(config: ExpandableButtonCardConfig): LovelaceCardConfig {
    const { items, popup_layout, popup_columns, popup_title, ...rest } = config;
    void items;
    void popup_layout;
    void popup_columns;
    void popup_title;
    return { ...rest, type: `custom:${BUTTON_CARD_TYPE}` } as LovelaceCardConfig;
  }

  static styles = css`
    :host {
      display: block;
    }
    .editor {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .group-panel {
      --expansion-panel-content-padding: 0;
      border-radius: 6px;
    }
    .group-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
    }
    .group-header ha-svg-icon {
      color: var(--secondary-text-color);
    }
    .group-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 16px 16px;
    }
    .row-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .row {
      border-radius: 6px;
    }
    .row-header {
      display: flex;
      align-items: center;
      gap: 4px;
      width: 100%;
    }
    .drag-handle {
      display: flex;
      align-items: center;
      padding: 4px;
      color: var(--secondary-text-color);
      cursor: grab;
      touch-action: none;
    }
    .drag-handle > * {
      pointer-events: none;
    }
    .row-title {
      flex: 1 1 auto;
      font-weight: 500;
    }
    .row-icon {
      flex: none;
      color: var(--secondary-text-color);
      --mdc-icon-size: 20px;
    }
    .row-subtitle {
      flex: 0 1 auto;
      color: var(--secondary-text-color);
      font-size: 0.85em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .row-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 4px 4px 12px;
    }
    .add-menu {
      position: relative;
      align-self: flex-start;
    }
    .add-btn {
      align-self: flex-start;
      background: none;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
      border-radius: 6px;
      color: inherit;
      font: inherit;
      padding: 6px 12px;
      cursor: pointer;
    }
    .add-menu-list {
      position: absolute;
      z-index: 10;
      top: calc(100% + 4px);
      left: 0;
      display: flex;
      flex-direction: column;
      min-width: 180px;
      padding: 4px;
      background: var(--card-background-color, #1c1c1c);
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }
    .add-menu-item {
      background: none;
      border: none;
      border-radius: 4px;
      color: inherit;
      font: inherit;
      text-align: left;
      padding: 8px 10px;
      cursor: pointer;
    }
    .add-menu-item:hover {
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.08));
    }
    .warning {
      color: var(--error-color, #db4437);
    }
    .loading {
      color: var(--secondary-text-color);
      padding: 8px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-expandable-button-card-editor": TedExpandableButtonCardEditor;
  }
}
