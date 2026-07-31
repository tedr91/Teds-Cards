import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardConfig, type LovelaceCardEditor } from "custom-card-helpers";

import {
  NAVBAR_STATUS_ITEM_TYPES,
  STATUS_ITEM_DEFAULT_DISPLAY,
  STATUS_ITEM_DEFAULT_ICON,
  STATUS_ITEM_LABEL,
} from "../../shared/status-items/const";
import {
  newStatusItem,
  statusItemData,
  statusItemFieldLabel,
  statusItemSchema,
  statusItemSubtitle,
} from "../../shared/status-items/editor";
import type { StatusItem, StatusItemType } from "../../shared/status-items/types";
import { EXPANDABLE_BUTTON_CARD_TYPE } from "../expandable-button-card/const";
import {
  NAV_SECTION_ALIGN_LOCKED,
  NAV_SECTION_DEFAULT_ALIGN,
  NAV_SECTION_DEFAULT_PRIORITY,
  NAV_SECTION_NAMES,
  defaultNavButton,
} from "./const";
import type { NavAlign, NavButtonConfig, NavButtonSize, NavItem, NavSection } from "./types";

/** Tag for the shared five-section item editor (used by the navbar card editor AND the
 *  Ted's Cards Settings → Navbar panel). */
export const NAVBAR_SECTIONS_EDITOR_TYPE = "ted-navbar-sections-editor";

// mdi:drag — reorder handle
const GRIP_ICON_PATH =
  "M7,19V17H9V19H7M11,19V17H13V19H11M15,19V17H17V19H15M7,15V13H9V15H7M11,15V13H13V15H11M15,15V13H17V15H15M7,11V9H9V11H7M11,11V9H13V11H11M15,11V9H17V11H15M7,7V5H9V7H7M11,7V5H13V7H11M15,7V5H17V7H15Z";
// mdi:delete-outline (delete item)
const DELETE_ICON_PATH =
  "M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z";
// mdi:chevron-down / chevron-up (row expand indicator)
const CHEVRON_DOWN_PATH = "M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z";
const CHEVRON_UP_PATH = "M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z";

interface ButtonEditorEntry {
  el: LovelaceCardEditor;
  type: string;
  json: string;
}

/** Strip the nav-only sizing key so the embedded button editor stays clean. */
function stripNavSize(button: NavButtonConfig): LovelaceCardConfig {
  const { nav_button_size, ...rest } = button;
  void nav_button_size;
  return rest as LovelaceCardConfig;
}

/**
 * Controlled editor for the navbar's five fixed positional sections and their items
 * (status items + buttons/popup menus). Operates on the `sections` property and emits
 * `sections-changed` with the full updated array — the parent owns the source of truth
 * (the navbar card's YAML `sections`, or the Ted's Cards `navbar_sections` setting).
 */
@customElement(NAVBAR_SECTIONS_EDITOR_TYPE)
export class TedNavbarSectionsEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public sections: NavSection[] = [];
  /** Left/right (vertical) bar — flips section align labels to Up/Down. */
  @property({ type: Boolean }) public vertical = false;
  /** Index of the section the View Launcher auto-populates (−1 = none), so that section
   *  can show a note. */
  @property({ type: Number }) public launcherSectionIndex = -1;
  /** Whether the View Launcher is active (drives the note above). */
  @property({ type: Boolean }) public launcherEnabled = false;

  /** Keys (`sec-<i>` / `btn-<s>-<b>` / `item-<s>-<i>`) of currently expanded panels. */
  @state() private _expanded = new Set<string>();
  /** The container awaiting an item-type choice from the Add popup, if any. */
  @state() private _addPicker?: { path: number[]; allowPopup: boolean };

  private _buttonEditors = new Map<string, ButtonEditorEntry>();
  private _creatingEditors = new Set<string>();

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("sections") || changed.has("hass")) {
      this._syncButtonEditors();
    }
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass) return nothing;
    return html`
      <div class="sec-list">
        ${this._sectionsPadded().map((section, sIdx) => this._renderSectionRow(section, sIdx))}
      </div>
      ${this._renderAddPickerModal()}
    `;
  }

  // --- Source of truth ------------------------------------------------------

  private _sections(): NavSection[] {
    return Array.isArray(this.sections) ? this.sections : [];
  }

  /** A section's ordered items, falling back to the legacy buttons-only list. */
  private _items(section: NavSection): NavItem[] {
    return section.items ?? section.buttons ?? [];
  }

  /** The five fixed sections, padded so every slot has a row. */
  private _sectionsPadded(): NavSection[] {
    const cfg = this._sections();
    return NAV_SECTION_NAMES.map((_n, i) => cfg[i] ?? {});
  }

  /** A nav item is a button when its `type` is an embeddable `custom:` card. */
  private _isButton(item: NavItem): item is NavButtonConfig {
    return typeof item.type === "string" && item.type.startsWith("custom:");
  }

  /** The ordered item list of a section ([sIdx]). */
  private _itemsAt(containerPath: number[]): NavItem[] {
    const section = this._sections()[containerPath[0]];
    return section ? this._items(section) : [];
  }

  /** Emit the full, updated sections array to the parent. */
  private _emit(sections: NavSection[]): void {
    this.sections = sections;
    this.dispatchEvent(
      new CustomEvent("sections-changed", { detail: { sections }, bubbles: true, composed: true }),
    );
  }

  /** Write an item list back to its section, dropping the legacy buttons key. */
  private _commitItemList(containerPath: number[], items: NavItem[]): void {
    const sections = [...this._sectionsPadded()];
    const section = sections[containerPath[0]];
    if (!section) return;
    const { buttons, ...rest } = section;
    void buttons;
    sections[containerPath[0]] = { ...rest, items };
    this._emit(sections);
  }

  /** Drag-handle selector class for a container's rows. */
  private _handleClass(containerPath: number[]): string {
    return `lvl-${containerPath.length}-handle`;
  }

  private _stop = (ev: Event): void => {
    ev.stopPropagation();
  };

  private _onPanelToggle(key: string, ev: CustomEvent): void {
    if (ev.target !== ev.currentTarget) return; // ignore bubbled events from nested panels
    const open = (ev.detail as { expanded: boolean }).expanded;
    const next = new Set(this._expanded);
    if (open) next.add(key);
    else next.delete(key);
    this._expanded = next;
  }

  private _toggleExpanded(key: string): void {
    const next = new Set(this._expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this._expanded = next;
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "align":
        return "Content alignment";
      case "overflow":
        return "Auto-collapse overflow";
      case "priority":
        return "Auto-collapse priority";
      case "nav_button_size":
        return "Button size";
      case "visible":
        return "Visible";
      default:
        return statusItemFieldLabel(schema.name) ?? schema.name;
    }
  };

  // --- Sections -------------------------------------------------------------

  /** Content-alignment dropdown options for a section (up/down on a vertical bar). */
  private _alignOptions(sIdx: number) {
    const v = this.vertical;
    const left = { value: "left", label: v ? "Up" : "Left" };
    const right = { value: "right", label: v ? "Down" : "Right" };
    const center = { value: "center", label: "Center" };
    if (!NAV_SECTION_ALIGN_LOCKED[sIdx]) return [left, right];
    const fixed = NAV_SECTION_DEFAULT_ALIGN[sIdx];
    return [fixed === "center" ? center : fixed === "left" ? left : right];
  }

  /** Per-section fields: alignment (locked on 0/2/4) + overflow & priority grid. */
  private _sectionSchema(sIdx: number, overflow: boolean) {
    return [
      {
        name: "align",
        disabled: NAV_SECTION_ALIGN_LOCKED[sIdx],
        selector: { select: { mode: "dropdown", options: this._alignOptions(sIdx) } },
      },
      {
        type: "grid",
        name: "",
        column_min_width: "120px",
        schema: [
          { name: "overflow", selector: { boolean: {} } },
          {
            name: "priority",
            disabled: !overflow,
            selector: { number: { min: 1, max: 5, step: 1, mode: "box" } },
          },
        ],
      },
    ];
  }

  private _renderSectionRow(section: NavSection, sIdx: number): TemplateResult {
    const key = `sec-${sIdx}`;
    const expanded = this._expanded.has(key);
    const visible = section.visible !== false;
    const items = this._items(section);
    const locked = NAV_SECTION_ALIGN_LOCKED[sIdx];
    const align = locked
      ? NAV_SECTION_DEFAULT_ALIGN[sIdx]
      : (section.align ?? NAV_SECTION_DEFAULT_ALIGN[sIdx]);
    const overflow = section.overflow !== false;
    const priority =
      typeof section.priority === "number" ? section.priority : NAV_SECTION_DEFAULT_PRIORITY[sIdx];
    const isLauncher = this.launcherEnabled && sIdx === this.launcherSectionIndex;
    return html`
      <ha-expansion-panel
        outlined
        class="row"
        .expanded=${expanded}
        @expanded-changed=${(ev: CustomEvent) => this._onPanelToggle(key, ev)}
      >
        <div slot="header" class="row-header">
          <span class="row-title">${NAV_SECTION_NAMES[sIdx]}</span>
          <span class="row-count">${items.length || nothing}</span>
          <ha-switch
            .checked=${visible}
            @click=${this._stop}
            @change=${(ev: Event) => this._toggleSectionVisible(sIdx, ev)}
          ></ha-switch>
        </div>
        <div class="row-body">
          <ha-form
            .hass=${this.hass}
            .data=${{ align, overflow, priority }}
            .schema=${this._sectionSchema(sIdx, overflow)}
            .computeLabel=${this._computeLabel}
            @value-changed=${(ev: CustomEvent) => this._onSectionFieldsChanged(sIdx, ev)}
          ></ha-form>
          ${isLauncher
            ? html`<div class="launcher-note">
                The View Launcher auto-adds its buttons here. Manage them in Settings →
                Navbar → Launcher Buttons.
              </div>`
            : nothing}
          <div class="subgroup-label">Items</div>
          ${this._renderItemList([sIdx], items, true)}
        </div>
      </ha-expansion-panel>
    `;
  }

  /** Render a container's sortable rows + add-menu. */
  private _renderItemList(containerPath: number[], items: NavItem[], allowPopup: boolean): TemplateResult {
    const handle = this._handleClass(containerPath);
    return html`
      <ha-sortable
        handle-selector=".${handle}"
        @item-moved=${(ev: CustomEvent) => this._itemMoved(containerPath, ev)}
      >
        <div class="row-list">
          ${items.map((item, idx) => this._renderItemRow(containerPath, idx, item))}
        </div>
      </ha-sortable>
      ${this._renderAddMenu(containerPath, allowPopup)}
    `;
  }

  private _renderItemRow(containerPath: number[], idx: number, item: NavItem): TemplateResult {
    if (this._isButton(item)) return this._renderButtonRow(containerPath, idx, item);
    return this._renderStatusItemRow(containerPath, idx, item as StatusItem);
  }

  private _renderButtonRow(containerPath: number[], idx: number, button: NavButtonConfig): TemplateResult {
    const path = [...containerPath, idx];
    const key = `btn-${path.join("-")}`;
    const expanded = this._expanded.has(key);
    const entry = this._buttonEditors.get(path.join(":"));
    const isPopupMenu = button.type === `custom:${EXPANDABLE_BUTTON_CARD_TYPE}`;
    return html`
      <div class="item">
        <div class="item-head" @click=${() => this._toggleExpanded(key)}>
          <div class="drag-handle ${this._handleClass(containerPath)}" @click=${this._stop} title="Drag to reorder">
            <ha-svg-icon .path=${GRIP_ICON_PATH}></ha-svg-icon>
          </div>
          <ha-icon class="row-icon" icon=${button.icon || "mdi:gesture-tap-button"}></ha-icon>
          <span class="row-title">${isPopupMenu ? "Popup menu" : "Button"}</span>
          ${button.name ? html`<span class="row-subtitle">${button.name}</span>` : nothing}
          <ha-icon-button
            class="item-del"
            label="Delete button"
            .path=${DELETE_ICON_PATH}
            @click=${(ev: Event) => this._removeItem(containerPath, idx, ev)}
          ></ha-icon-button>
          <ha-svg-icon class="item-chev" .path=${expanded ? CHEVRON_UP_PATH : CHEVRON_DOWN_PATH}></ha-svg-icon>
        </div>
        <div class="item-body" ?hidden=${!expanded}>
          <ha-form
            .hass=${this.hass}
            .data=${{ nav_button_size: button.nav_button_size ?? "normal", visible: button.visible !== false }}
            .schema=${[
              {
                type: "grid",
                name: "",
                schema: [
                  {
                    name: "nav_button_size",
                    selector: {
                      select: {
                        mode: "dropdown",
                        options: [
                          { value: "normal", label: "Normal" },
                          { value: "wide", label: "Wide" },
                        ],
                      },
                    },
                  },
                  { name: "visible", selector: { boolean: {} } },
                ],
              },
            ]}
            .computeLabel=${this._computeLabel}
            @value-changed=${(ev: CustomEvent) => this._onButtonSizeChanged(containerPath, idx, ev)}
          ></ha-form>
          ${entry ? entry.el : html`<div class="loading">Loading…</div>`}
        </div>
      </div>
    `;
  }

  private _renderStatusItemRow(containerPath: number[], idx: number, item: StatusItem): TemplateResult {
    const path = [...containerPath, idx];
    const key = `item-${path.join("-")}`;
    const expanded = this._expanded.has(key);
    const subtitle = statusItemSubtitle(item, this.hass);
    return html`
      <div class="item">
        <div class="item-head" @click=${() => this._toggleExpanded(key)}>
          <div class="drag-handle ${this._handleClass(containerPath)}" @click=${this._stop} title="Drag to reorder">
            <ha-svg-icon .path=${GRIP_ICON_PATH}></ha-svg-icon>
          </div>
          <ha-icon class="row-icon" icon=${STATUS_ITEM_DEFAULT_ICON[item.type]}></ha-icon>
          <span class="row-title">${STATUS_ITEM_LABEL[item.type]}</span>
          ${subtitle ? html`<span class="row-subtitle">${subtitle}</span>` : nothing}
          <ha-icon-button
            class="item-del"
            label="Delete item"
            .path=${DELETE_ICON_PATH}
            @click=${(ev: Event) => this._removeItem(containerPath, idx, ev)}
          ></ha-icon-button>
          <ha-svg-icon class="item-chev" .path=${expanded ? CHEVRON_UP_PATH : CHEVRON_DOWN_PATH}></ha-svg-icon>
        </div>
        <div class="item-body" ?hidden=${!expanded}>
          <ha-form
            .hass=${this.hass}
            .data=${statusItemData(item)}
            .schema=${statusItemSchema(item.type, item)}
            .computeLabel=${(schema: { name: string }) =>
              statusItemFieldLabel(schema.name, item.type) ?? schema.name}
            @value-changed=${(ev: CustomEvent) => this._onStatusItemChanged(containerPath, idx, item.type, ev)}
          ></ha-form>
        </div>
      </div>
    `;
  }

  private _renderAddMenu(containerPath: number[], allowPopup: boolean): TemplateResult {
    return html`
      <button
        type="button"
        class="add-btn"
        @click=${() => (this._addPicker = { path: containerPath, allowPopup })}
      >
        + Add item
      </button>
    `;
  }

  /** Item types the Add popup offers (buttons/popup + all status items), with icons. */
  private _addItemOptions(allowPopup: boolean): { value: string; label: string; icon: string }[] {
    return [
      { value: "button", label: "Button", icon: "mdi:gesture-tap-button" },
      ...(allowPopup ? [{ value: "popup", label: "Popup menu", icon: "mdi:dots-horizontal-circle-outline" }] : []),
      ...NAVBAR_STATUS_ITEM_TYPES.map((type) => ({
        value: type as string,
        label: STATUS_ITEM_LABEL[type],
        icon: STATUS_ITEM_DEFAULT_ICON[type],
      })),
    ];
  }

  private _renderAddPickerModal(): TemplateResult | typeof nothing {
    const p = this._addPicker;
    if (!p) return nothing;
    return html`
      <div class="picker-modal" @click=${() => (this._addPicker = undefined)}>
        <div class="picker-sheet" @click=${this._stop}>
          <div class="picker-head">Add item</div>
          <div class="picker-list">
            ${this._addItemOptions(p.allowPopup).map(
              (o) => html`<button
                type="button"
                class="picker-item"
                @click=${() => this._addItem(p.path, o.value)}
              >
                <ha-icon icon=${o.icon}></ha-icon><span>${o.label}</span>
              </button>`,
            )}
          </div>
        </div>
      </div>
    `;
  }

  // --- Section mutations ----------------------------------------------------

  /** old-index → new-index map for a splice(oldIndex → newIndex) over `length` items. */
  private _reorderMap(length: number, oldIndex: number, newIndex: number): Map<number, number> {
    const order = Array.from({ length }, (_, i) => i);
    order.splice(newIndex, 0, order.splice(oldIndex, 1)[0]);
    const map = new Map<number, number>();
    order.forEach((oldIdx, newPos) => map.set(oldIdx, newPos));
    return map;
  }

  /** Rebuild `_expanded`, remapping the index at part `pos` for keys whose preceding
   *  indices match `prefix`, so a reorder moves the right panels (and their children). */
  private _remapExpanded(prefix: number[], pos: number, oldToNew: Map<number, number>): Set<string> {
    const next = new Set<string>();
    for (const key of this._expanded) {
      const parts = key.split("-");
      const matches = prefix.every((p, i) => Number(parts[i + 1]) === p);
      const idx = Number(parts[pos]);
      if (parts.length > pos && matches && Number.isInteger(idx) && oldToNew.has(idx)) {
        parts[pos] = String(oldToNew.get(idx));
        next.add(parts.join("-"));
      } else {
        next.add(key);
      }
    }
    return next;
  }

  private _toggleSectionVisible(sIdx: number, ev: Event): void {
    ev.stopPropagation();
    const checked = (ev.target as HTMLInputElement).checked;
    const sections = [...this._sectionsPadded()];
    const section = { ...sections[sIdx] };
    if (checked) delete section.visible;
    else section.visible = false;
    sections[sIdx] = section;
    this._emit(sections);
  }

  private _onSectionFieldsChanged(sIdx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value as { align?: NavAlign; overflow?: boolean; priority?: number };
    const sections = [...this._sectionsPadded()];
    const section: NavSection = { ...sections[sIdx] };
    // Locked sections (0/2/4) keep their fixed alignment; store mids only when non-default.
    if (!NAV_SECTION_ALIGN_LOCKED[sIdx] && value.align && value.align !== NAV_SECTION_DEFAULT_ALIGN[sIdx]) {
      section.align = value.align;
    } else {
      delete section.align;
    }
    if (value.overflow === false) section.overflow = false;
    else delete section.overflow;
    if (typeof value.priority === "number" && value.priority !== NAV_SECTION_DEFAULT_PRIORITY[sIdx]) {
      section.priority = value.priority;
    } else {
      delete section.priority;
    }
    sections[sIdx] = section;
    this._emit(sections);
  }

  // --- Item mutations -------------------------------------------------------

  /** Dispatch the add-menu pick: a button, a popup, or a status item. */
  private _addItem(containerPath: number[], value: string): void {
    this._addPicker = undefined;
    if (value === "button") this._addButton(containerPath);
    else if (value === "popup") this._addPopup(containerPath);
    else this._addStatusItem(containerPath, value as StatusItemType);
  }

  private _addButton(containerPath: number[]): void {
    const items: NavItem[] = [...this._itemsAt(containerPath), defaultNavButton()];
    this._expanded = new Set([...this._expanded, `btn-${[...containerPath, items.length - 1].join("-")}`]);
    this._commitItemList(containerPath, items);
  }

  /** "Popup menu" adds an Expandable Button Card nav button — it renders as a normal
   *  button tile and opens its own popover of child buttons. */
  private _addPopup(containerPath: number[]): void {
    const expandable = {
      type: `custom:${EXPANDABLE_BUTTON_CARD_TYPE}`,
      icon: "mdi:chevron-up",
      items: [],
    } as NavButtonConfig;
    const items: NavItem[] = [...this._itemsAt(containerPath), expandable];
    this._expanded = new Set([...this._expanded, `btn-${[...containerPath, items.length - 1].join("-")}`]);
    this._commitItemList(containerPath, items);
  }

  private _addStatusItem(containerPath: number[], type: StatusItemType): void {
    const items: NavItem[] = [...this._itemsAt(containerPath), newStatusItem(type)];
    this._expanded = new Set([...this._expanded, `item-${[...containerPath, items.length - 1].join("-")}`]);
    this._commitItemList(containerPath, items);
  }

  private _removeItem(containerPath: number[], idx: number, ev: Event): void {
    ev.stopPropagation();
    const items = [...this._itemsAt(containerPath)];
    items.splice(idx, 1);
    this._buttonEditors.clear();
    this._commitItemList(containerPath, items);
  }

  private _itemMoved(containerPath: number[], ev: CustomEvent): void {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const items = [...this._itemsAt(containerPath)];
    items.splice(newIndex, 0, items.splice(oldIndex, 1)[0]);
    // Keep each item's (and a popup's children's) expanded panels with the item.
    this._expanded = this._remapExpanded(
      containerPath,
      containerPath.length + 1,
      this._reorderMap(this._itemsAt(containerPath).length, oldIndex, newIndex),
    );
    this._buttonEditors.clear();
    this._commitItemList(containerPath, items);
  }

  private _onButtonSizeChanged(containerPath: number[], idx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value as { nav_button_size?: NavButtonSize; visible?: boolean };
    const items = [...this._itemsAt(containerPath)];
    const button = items[idx];
    if (!button || !this._isButton(button)) return;
    const next = { ...button } as NavButtonConfig;
    if (value.nav_button_size && value.nav_button_size !== "normal") next.nav_button_size = value.nav_button_size;
    else delete next.nav_button_size;
    if (value.visible === false) next.visible = false;
    else delete next.visible;
    items[idx] = next;
    this._commitItemList(containerPath, items);
  }

  private _onStatusItemChanged(containerPath: number[], idx: number, type: StatusItemType, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = (ev.detail?.value ?? {}) as Record<string, unknown>;
    const next = { ...value, type } as StatusItem;
    if (next.display === STATUS_ITEM_DEFAULT_DISPLAY[type]) delete next.display;
    const items = [...this._itemsAt(containerPath)];
    items[idx] = next;
    this._commitItemList(containerPath, items);
  }

  // --- Embedded button editors (controlled child editors) -------------------

  private _syncButtonEditors(): void {
    if (!this.hass) return;
    const wanted = new Set<string>();
    this._sections().forEach((section, sIdx) => {
      this._syncEditorsIn(this._items(section), [sIdx], wanted);
    });
    for (const key of [...this._buttonEditors.keys()]) {
      if (!wanted.has(key)) this._buttonEditors.delete(key);
    }
  }

  /** Sync a controlled editor for each button item. */
  private _syncEditorsIn(items: NavItem[], containerPath: number[], wanted: Set<string>): void {
    items.forEach((item, idx) => {
      if (!this._isButton(item)) return;
      const key = [...containerPath, idx].join(":");
      wanted.add(key);
      const entry = this._buttonEditors.get(key);
      if (entry && entry.type === item.type) {
        // Controlled child: keep hass fresh; never push setConfig here (an async
        // round-trip could revert fast typing). Structural changes clear the map.
        entry.el.hass = this.hass;
      } else {
        if (entry) this._buttonEditors.delete(key);
        void this._createButtonEditor(key, item);
      }
    });
  }

  private async _createButtonEditor(key: string, button: NavButtonConfig): Promise<void> {
    if (this._creatingEditors.has(key)) return;
    const tag = button.type.replace(/^custom:/, "");
    const cardClass = customElements.get(tag) as
      | (CustomElementConstructor & { getConfigElement?: () => Promise<LovelaceCardEditor> })
      | undefined;
    if (!cardClass?.getConfigElement) return;
    this._creatingEditors.add(key);
    try {
      const el = await cardClass.getConfigElement();
      el.hass = this.hass;
      const cardConfig = stripNavSize(button);
      el.setConfig(cardConfig);
      el.addEventListener("config-changed", (ev: Event) => {
        ev.stopPropagation();
        this._onButtonConfigChanged(key, ev as CustomEvent);
      });
      this._buttonEditors.set(key, { el, type: button.type, json: JSON.stringify(cardConfig) });
      this.requestUpdate();
    } finally {
      this._creatingEditors.delete(key);
    }
  }

  private _onButtonConfigChanged(key: string, ev: CustomEvent): void {
    const newCard = ev.detail?.config as NavButtonConfig | undefined;
    if (!newCard) return;
    const path = key.split(":").map((part) => Number(part));
    const containerPath = path.slice(0, -1);
    const idx = path[path.length - 1];
    const items = this._itemsAt(containerPath);
    const oldItem = items[idx];
    const oldSize = oldItem && this._isButton(oldItem) ? oldItem.nav_button_size : undefined;
    const newButton = {
      ...stripNavSize(newCard),
      ...(oldSize ? { nav_button_size: oldSize } : {}),
    } as NavButtonConfig;
    const cardConfig = stripNavSize(newButton);
    const json = JSON.stringify(cardConfig);
    const entry = this._buttonEditors.get(key);
    if (entry && entry.json === json) return;
    if (entry) {
      entry.json = json;
      entry.el.setConfig(cardConfig);
    }
    if (idx >= items.length) return;
    const nextItems = [...items];
    nextItems[idx] = newButton;
    this._commitItemList(containerPath, nextItems);
  }

  static styles = css`
    :host {
      display: block;
    }
    .sec-list,
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
    .row-count {
      flex: none;
      min-width: 1.4em;
      text-align: center;
      color: var(--secondary-text-color);
      font-size: 0.85em;
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
    .launcher-note {
      color: var(--secondary-text-color);
      font-size: 0.9em;
      line-height: 1.4;
    }
    .subgroup-label {
      font-weight: 500;
      color: var(--secondary-text-color);
      margin-top: 4px;
    }
    /* Canonical item rows: drag, icon, name (left); chevron, X-delete (right); 40px tall. */
    .item {
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
      border-radius: 8px;
      overflow: hidden;
    }
    .item-head {
      display: flex;
      align-items: center;
      gap: 4px;
      min-height: 40px;
      box-sizing: border-box;
      padding: 2px 4px;
      cursor: pointer;
      background: var(--secondary-background-color, rgba(120, 120, 120, 0.06));
    }
    .item-chev {
      flex: none;
      color: var(--secondary-text-color);
      --mdc-icon-size: 20px;
    }
    .item-del {
      flex: none;
      --mdc-icon-button-size: 28px;
      --mdc-icon-size: 20px;
      color: var(--secondary-text-color);
    }
    .item-del:hover {
      color: var(--error-color, #db4437);
    }
    .item-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 8px 10px 12px;
    }
    .item-body[hidden] {
      display: none;
    }
    /* Add-item type-picker popup. */
    .picker-modal {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: rgba(0, 0, 0, 0.45);
    }
    .picker-sheet {
      width: min(360px, 100%);
      max-height: min(70vh, 520px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--card-background-color, #1c1c1c);
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
      border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
    }
    .picker-head {
      font-size: 1.1rem;
      font-weight: 600;
      padding: 16px 18px 8px;
    }
    .picker-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow: auto;
      padding: 4px 8px 12px;
    }
    .picker-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      box-sizing: border-box;
      text-align: left;
      font: inherit;
      padding: 10px;
      border-radius: 8px;
      border: 1px solid transparent;
      background: none;
      color: inherit;
      cursor: pointer;
    }
    .picker-item:hover {
      background: var(--secondary-background-color, rgba(120, 120, 120, 0.12));
      border-color: var(--divider-color, rgba(255, 255, 255, 0.12));
    }
    .picker-item ha-icon {
      flex: none;
      color: var(--secondary-text-color);
      --mdc-icon-size: 20px;
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
    .loading {
      color: var(--secondary-text-color);
      padding: 8px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-navbar-sections-editor": TedNavbarSectionsEditor;
  }
}
