import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  type HomeAssistant,
  type LovelaceCardConfig,
  type LovelaceCardEditor,
  fireEvent,
} from "custom-card-helpers";

import { transparencyBlurSchema } from "../../shared/appearance";
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
import {
  DEFAULT_NAVBAR_AUTOHIDE_DELAY,
  DEFAULT_NAVBAR_MAX_WIDTH,
  DEFAULT_NAVBAR_MIN_WIDTH,
  DEFAULT_NAVBAR_SIZE,
  NAV_SECTION_ALIGN_LOCKED,
  NAV_SECTION_DEFAULT_ALIGN,
  NAV_SECTION_DEFAULT_PRIORITY,
  NAV_SECTION_NAMES,
  NAVBAR_CARD_EDITOR_TYPE,
  defaultNavButton,
} from "./const";
import { EXPANDABLE_BUTTON_CARD_TYPE } from "../expandable-button-card/const";
import type {
  NavAlign,
  NavButtonConfig,
  NavButtonSize,
  NavItem,
  NavSection,
  NavbarCardConfig,
} from "./types";

// mdi:palette — Appearance section
const APPEARANCE_ICON_PATH =
  "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";
// mdi:view-grid — Sections section
const SECTIONS_ICON_PATH = "M3,11H11V3H3M3,21H11V13H3M13,21H21V13H13M13,3V11H21V3";
// mdi:drag — reorder handle
const GRIP_ICON_PATH =
  "M7,19V17H9V19H7M11,19V17H13V19H11M15,19V17H17V19H15M7,15V13H9V15H7M11,15V13H13V15H11M15,15V13H17V15H15M7,11V9H9V11H7M11,11V9H13V11H11M15,11V9H17V11H15M7,7V5H9V7H7M11,7V5H13V7H11M15,7V5H17V7H15Z";
// mdi:delete
const DELETE_ICON_PATH = "M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z";

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

@customElement(NAVBAR_CARD_EDITOR_TYPE)
export class TedNavbarCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: NavbarCardConfig;
  /** Keys (`sec-<i>` / `btn-<s>-<b>` / `item-<s>-<i>`) of currently expanded panels. */
  @state() private _expanded = new Set<string>();
  /** Key of the currently open "add item" menu, if any. */
  @state() private _openMenu?: string;

  private _buttonEditors = new Map<string, ButtonEditorEntry>();
  private _creatingEditors = new Set<string>();

  public setConfig(config: NavbarCardConfig): void {
    this._config = config;
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config") || changed.has("hass")) {
      this._syncButtonEditors();
    }
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const data = { ...this._defaults(), ...this._config };
    return html`
      <div class="editor">
        <ha-form
          .hass=${this.hass}
          .data=${data}
          .schema=${this._appearanceSchema()}
          .computeLabel=${this._computeLabel}
          @value-changed=${this._appearanceChanged}
        ></ha-form>
        ${this._renderSections()}
      </div>
    `;
  }

  private _defaults(): Partial<NavbarCardConfig> {
    return {
      theme: "ha",
      alignment: "bottom",
      bar_type: "snap",
      size: DEFAULT_NAVBAR_SIZE,
      min_width: DEFAULT_NAVBAR_MIN_WIDTH,
      max_width: DEFAULT_NAVBAR_MAX_WIDTH,
      transparency: undefined,
      blur: undefined,
      auto_hide: false,
      auto_hide_delay: DEFAULT_NAVBAR_AUTOHIDE_DELAY,
    };
  }

  /** Left/right bars are vertical, so alignment reads up/down instead of left/right. */
  private _vertical(): boolean {
    const a = this._config?.alignment;
    return a === "left" || a === "right";
  }

  private _appearanceSchema() {
    const a = this._config?.alignment;
    const isVertical = a === "left" || a === "right";
    const isFloat = !isVertical && this._config?.bar_type === "float";
    return [
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
          {
            type: "grid",
            name: "",
            column_min_width: "120px",
            schema: [
              {
                name: "alignment",
                selector: {
                  select: {
                    mode: "dropdown",
                    options: [
                      { value: "bottom", label: "Bottom" },
                      { value: "top", label: "Top" },
                      { value: "left", label: "Left" },
                      { value: "right", label: "Right" },
                    ],
                  },
                },
              },
              // Float is horizontal-only; a left/right (vertical) bar is always snap.
              ...(isVertical
                ? []
                : [
                    {
                      name: "bar_type",
                      selector: {
                        select: {
                          mode: "dropdown",
                          options: [
                            { value: "snap", label: "Snap (edge-to-edge)" },
                            { value: "float", label: "Float (centered)" },
                          ],
                        },
                      },
                    },
                  ]),
            ],
          },
          ...(isFloat
            ? [
                {
                  type: "grid",
                  name: "",
                  column_min_width: "120px",
                  schema: [
                    {
                      name: "min_width",
                      selector: { number: { min: 0, max: 2000, step: 1, mode: "box", unit_of_measurement: "px" } },
                    },
                    {
                      name: "max_width",
                      selector: { number: { min: 0, max: 2000, step: 1, mode: "box", unit_of_measurement: "px" } },
                    },
                  ],
                },
              ]
            : []),
          {
            name: "size",
            selector: { number: { min: 40, max: 120, step: 2, mode: "slider", unit_of_measurement: "px" } },
          },
          transparencyBlurSchema(this._config?.transparency),
          {
            type: "grid",
            name: "",
            column_min_width: "120px",
            schema: [
              { name: "auto_hide", selector: { boolean: {} } },
              {
                name: "auto_hide_delay",
                disabled: this._config?.auto_hide !== true,
                selector: { number: { min: 1, max: 60, step: 1, mode: "box", unit_of_measurement: "s" } },
              },
            ],
          },
        ],
      },
    ];
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "theme":
        return "Visual styling";
      case "background":
        return "Background color";
      case "alignment":
        return "Navbar alignment";
      case "bar_type":
        return "Navbar type";
      case "size":
        return "Size (bar thickness)";
      case "min_width":
        return "Minimum width";
      case "max_width":
        return "Maximum width";
      case "transparency":
        return "Transparency";
      case "blur":
        return "Background blur";
      case "auto_hide":
        return "Auto-hide";
      case "auto_hide_delay":
        return "Auto-hide delay";
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

  private _appearanceChanged = (ev: CustomEvent): void => {
    this._commit({ ...this._config, ...ev.detail.value } as NavbarCardConfig);
  };

  private _clean(config: NavbarCardConfig): NavbarCardConfig {
    const next = { ...config };
    const defaults = this._defaults();
    for (const key of Object.keys(defaults) as Array<keyof NavbarCardConfig>) {
      if (next[key] === defaults[key]) delete next[key];
    }
    if (!next.background) delete next.background;
    return next;
  }

  private _commit(next: NavbarCardConfig): void {
    const cleaned = this._clean(next);
    this._config = cleaned;
    fireEvent(this, "config-changed", { config: cleaned });
  }

  private _sections(): NavSection[] {
    return Array.isArray(this._config?.sections) ? this._config!.sections! : [];
  }

  /** A section's ordered items, falling back to the legacy buttons-only list. */
  private _items(section: NavSection): NavItem[] {
    return section.items ?? section.buttons ?? [];
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

  /** Write an item list back to its section, dropping the legacy buttons key. */
  private _commitItemList(containerPath: number[], items: NavItem[]): void {
    const sections = [...this._sections()];
    const section = sections[containerPath[0]];
    if (!section) return;
    const { buttons, ...rest } = section;
    void buttons;
    sections[containerPath[0]] = { ...rest, items };
    this._commit({ ...this._config, sections } as NavbarCardConfig);
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

  // --- Sections + buttons ---------------------------------------------------

  private _renderSections(): TemplateResult {
    const sections = this._sectionsPadded();
    return html`
      <ha-expansion-panel outlined class="group-panel">
        <div slot="header" class="group-header">
          <ha-svg-icon .path=${SECTIONS_ICON_PATH}></ha-svg-icon>
          <span>Sections</span>
        </div>
        <div class="group-body">
          <div class="row-list">
            ${sections.map((section, sIdx) => this._renderSectionRow(section, sIdx))}
          </div>
        </div>
      </ha-expansion-panel>
    `;
  }

  /** The five fixed sections, padded so every slot has a row. */
  private _sectionsPadded(): NavSection[] {
    const cfg = this._sections();
    return NAV_SECTION_NAMES.map((_n, i) => cfg[i] ?? {});
  }

  /** Content-alignment dropdown options for a section (up/down on a vertical bar). */
  private _alignOptions(sIdx: number) {
    const v = this._vertical();
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
    return html`
      <ha-expansion-panel
        outlined
        class="row"
        .expanded=${expanded}
        @expanded-changed=${(ev: CustomEvent) => this._onPanelToggle(key, ev)}
      >
        <div slot="header" class="row-header">
          <span class="row-title">${NAV_SECTION_NAMES[sIdx]}</span>
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
          <div class="subgroup-label">Items</div>
          ${this._renderItemList([sIdx], items, true)}
        </div>
      </ha-expansion-panel>
    `;
  }

  /** Render a container's sortable rows + add-menu (shared by sections and popups). */
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
      <ha-expansion-panel
        outlined
        class="row"
        .expanded=${expanded}
        @expanded-changed=${(ev: CustomEvent) => this._onPanelToggle(key, ev)}
      >
        <div slot="header" class="row-header">
          <div class="drag-handle ${this._handleClass(containerPath)}" @click=${this._stop} title="Drag to reorder">
            <ha-svg-icon .path=${GRIP_ICON_PATH}></ha-svg-icon>
          </div>
          <ha-icon class="row-icon" icon=${button.icon || "mdi:gesture-tap-button"}></ha-icon>
          <span class="row-title">${isPopupMenu ? "Popup menu" : "Button"}</span>
          ${button.name ? html`<span class="row-subtitle">${button.name}</span>` : nothing}
          <ha-icon-button
            class="warning"
            label="Delete button"
            .path=${DELETE_ICON_PATH}
            @click=${(ev: Event) => this._removeItem(containerPath, idx, ev)}
          ></ha-icon-button>
        </div>
        <div class="row-body">
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
      </ha-expansion-panel>
    `;
  }

  private _renderStatusItemRow(containerPath: number[], idx: number, item: StatusItem): TemplateResult {
    const path = [...containerPath, idx];
    const key = `item-${path.join("-")}`;
    const expanded = this._expanded.has(key);
    const subtitle = statusItemSubtitle(item, this.hass);
    return html`
      <ha-expansion-panel
        outlined
        class="row"
        .expanded=${expanded}
        @expanded-changed=${(ev: CustomEvent) => this._onPanelToggle(key, ev)}
      >
        <div slot="header" class="row-header">
          <div class="drag-handle ${this._handleClass(containerPath)}" @click=${this._stop} title="Drag to reorder">
            <ha-svg-icon .path=${GRIP_ICON_PATH}></ha-svg-icon>
          </div>
          <ha-icon class="row-icon" icon=${STATUS_ITEM_DEFAULT_ICON[item.type]}></ha-icon>
          <span class="row-title">${STATUS_ITEM_LABEL[item.type]}</span>
          ${subtitle ? html`<span class="row-subtitle">${subtitle}</span>` : nothing}
          <ha-icon-button
            class="warning"
            label="Delete item"
            .path=${DELETE_ICON_PATH}
            @click=${(ev: Event) => this._removeItem(containerPath, idx, ev)}
          ></ha-icon-button>
        </div>
        <div class="row-body">
          <ha-form
            .hass=${this.hass}
            .data=${statusItemData(item)}
            .schema=${statusItemSchema(item.type, item)}
            .computeLabel=${(schema: { name: string }) =>
              statusItemFieldLabel(schema.name, item.type) ?? schema.name}
            @value-changed=${(ev: CustomEvent) => this._onStatusItemChanged(containerPath, idx, item.type, ev)}
          ></ha-form>
        </div>
      </ha-expansion-panel>
    `;
  }

  private _toggleAddMenu = (key: string, ev: Event): void => {
    ev.stopPropagation();
    this._openMenu = this._openMenu === key ? undefined : key;
  };

  private _renderAddMenu(containerPath: number[], allowPopup: boolean): TemplateResult {
    const key = `add-${containerPath.join("-")}`;
    const open = this._openMenu === key;
    const options: Array<{ value: string; label: string }> = [
      { value: "button", label: "Button" },
      ...(allowPopup ? [{ value: "popup", label: "Popup menu" }] : []),
      ...NAVBAR_STATUS_ITEM_TYPES.map((type) => ({ value: type, label: STATUS_ITEM_LABEL[type] })),
    ];
    return html`
      <div class="add-menu">
        <button
          type="button"
          class="add-btn ${open ? "open" : ""}"
          aria-expanded=${open ? "true" : "false"}
          @click=${(ev: Event) => this._toggleAddMenu(key, ev)}
        >
          + Add item
        </button>
        ${open
          ? html`
              <div class="add-menu-list" @click=${this._stop}>
                ${options.map(
                  (option) => html`
                    <button
                      type="button"
                      class="add-menu-item"
                      @click=${() => this._addItem(containerPath, option.value)}
                    >
                      ${option.label}
                    </button>
                  `,
                )}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  // --- Section / button mutations -------------------------------------------

  /** old-index → new-index map for a splice(oldIndex → newIndex) over `length` items. */
  private _reorderMap(length: number, oldIndex: number, newIndex: number): Map<number, number> {
    const order = Array.from({ length }, (_, i) => i);
    order.splice(newIndex, 0, order.splice(oldIndex, 1)[0]);
    const map = new Map<number, number>();
    order.forEach((oldIdx, newPos) => map.set(oldIdx, newPos));
    return map;
  }

  /** Rebuild `_expanded`, remapping the index at part `pos` for keys whose preceding
   *  indices match `prefix`, so a reorder moves the right panels (and their children).
   *  Keys: `sec-<s>`, `btn-/item-/popup-<s>-<i>[-<sub>]`, and `add-<s>[-<i>]`. */
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
    const sections = this._sectionsPadded();
    const section = { ...sections[sIdx] };
    if (checked) delete section.visible;
    else section.visible = false;
    sections[sIdx] = section;
    this._commit({ ...this._config, sections } as NavbarCardConfig);
  }

  private _onSectionFieldsChanged(sIdx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value as { align?: NavAlign; overflow?: boolean; priority?: number };
    const sections = this._sectionsPadded();
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
    this._commit({ ...this._config, sections } as NavbarCardConfig);
  }

  // --- Section / item mutations ---------------------------------------------

  /** Dispatch the add-menu pick: a button, a popup, or a status item. */
  private _addItem(containerPath: number[], value: string): void {
    this._openMenu = undefined;
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
   *  button tile and opens its own popover of child buttons (replacing the old bare
   *  popup trigger). Edited inline via the embedded expandable-button editor. */
  private _addPopup(containerPath: number[]): void {
    const icon = this._config?.alignment === "top" ? "mdi:chevron-down" : "mdi:chevron-up";
    const expandable = { type: `custom:${EXPANDABLE_BUTTON_CARD_TYPE}`, icon, items: [] } as NavButtonConfig;
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
    if (!this.hass || !this._config) return;
    const wanted = new Set<string>();
    (this._config.sections ?? []).forEach((section, sIdx) => {
      this._syncEditorsIn(this._items(section), [sIdx], wanted);
    });
    for (const key of [...this._buttonEditors.keys()]) {
      if (!wanted.has(key)) this._buttonEditors.delete(key);
    }
  }

  /** Recurse into items + popup sub-items, syncing a controlled editor for each button. */
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
    .drag-handle,
    .subitem-drag-handle {
      display: flex;
      align-items: center;
      padding: 4px;
      color: var(--secondary-text-color);
      cursor: grab;
      touch-action: none;
    }
    .drag-handle > *,
    .subitem-drag-handle > * {
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
    .subgroup-label {
      font-weight: 500;
      color: var(--secondary-text-color);
      margin-top: 4px;
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
    .add-btn[disabled] {
      opacity: 0.5;
      cursor: default;
    }
    .add-menu {
      position: relative;
      align-self: flex-start;
    }
    .add-menu-list {
      position: absolute;
      z-index: 10;
      top: calc(100% + 4px);
      left: 0;
      display: flex;
      flex-direction: column;
      min-width: 160px;
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
    "ted-navbar-card-editor": TedNavbarCardEditor;
  }
}
