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
import { LABEL_BUTTON_CARD_TYPE } from "../label-button-card/const";
import {
  DEFAULT_NAVBAR_MAX_WIDTH,
  DEFAULT_NAVBAR_MIN_WIDTH,
  DEFAULT_NAVBAR_SIZE,
  MAX_NAV_SECTIONS,
  NAVBAR_CARD_EDITOR_TYPE,
} from "./const";
import type {
  NavAlign,
  NavButtonConfig,
  NavButtonSize,
  NavItem,
  NavSection,
  NavZone,
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

/** Strip the nav-only sizing key so the embedded label-button editor stays clean. */
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
    };
  }

  private _appearanceSchema() {
    const isFloat = this._config?.bar_type === "float";
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
                    ],
                  },
                },
              },
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
          transparencyBlurSchema(),
        ],
      },
    ];
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "theme":
        return "Visual styling";
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
      case "placement":
        return "Placement";
      case "align":
        return "Content alignment";
      case "nav_button_size":
        return "Button size";
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

  /** Write an items list to a section, dropping the legacy buttons key. */
  private _commitItems(sIdx: number, items: NavItem[]): void {
    const sections = [...this._sections()];
    const section = sections[sIdx];
    if (!section) return;
    const { buttons, ...rest } = section;
    void buttons;
    sections[sIdx] = { ...rest, items };
    this._commit({ ...this._config, sections } as NavbarCardConfig);
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
    const sections = this._sections();
    const atMax = sections.length >= MAX_NAV_SECTIONS;
    return html`
      <ha-expansion-panel outlined class="group-panel">
        <div slot="header" class="group-header">
          <ha-svg-icon .path=${SECTIONS_ICON_PATH}></ha-svg-icon>
          <span>Sections</span>
        </div>
        <div class="group-body">
          <ha-sortable handle-selector=".section-drag-handle" @item-moved=${this._sectionMoved}>
            <div class="row-list">
              ${sections.map((section, sIdx) => this._renderSectionRow(section, sIdx))}
            </div>
          </ha-sortable>
          <button type="button" class="add-btn" ?disabled=${atMax} @click=${this._addSection}>
            ${atMax ? "Maximum of 5 sections" : "+ Add section"}
          </button>
        </div>
      </ha-expansion-panel>
    `;
  }

  private _renderSectionRow(section: NavSection, sIdx: number): TemplateResult {
    const key = `sec-${sIdx}`;
    const expanded = this._expanded.has(key);
    const visible = section.visible !== false;
    const items = this._items(section);
    return html`
      <ha-expansion-panel
        outlined
        class="row"
        .expanded=${expanded}
        @expanded-changed=${(ev: CustomEvent) => this._onPanelToggle(key, ev)}
      >
        <div slot="header" class="row-header">
          <div class="drag-handle section-drag-handle" @click=${this._stop} title="Drag to reorder">
            <ha-svg-icon .path=${GRIP_ICON_PATH}></ha-svg-icon>
          </div>
          <span class="row-title">Section ${sIdx + 1} · ${section.placement ?? "left"}</span>
          <ha-switch
            .checked=${visible}
            @click=${this._stop}
            @change=${(ev: Event) => this._toggleSectionVisible(sIdx, ev)}
          ></ha-switch>
          <ha-icon-button
            class="warning"
            label="Delete section"
            .path=${DELETE_ICON_PATH}
            @click=${(ev: Event) => this._removeSection(sIdx, ev)}
          ></ha-icon-button>
        </div>
        <div class="row-body">
          <ha-form
            .hass=${this.hass}
            .data=${{ placement: section.placement ?? "left", align: section.align ?? "center" }}
            .schema=${[
              {
                type: "grid",
                name: "",
                column_min_width: "120px",
                schema: [
                  {
                    name: "placement",
                    selector: {
                      select: {
                        mode: "dropdown",
                        options: [
                          { value: "left", label: "Left" },
                          { value: "center", label: "Center" },
                          { value: "right", label: "Right" },
                        ],
                      },
                    },
                  },
                  {
                    name: "align",
                    selector: {
                      select: {
                        mode: "dropdown",
                        options: [
                          { value: "left", label: "Left" },
                          { value: "center", label: "Center" },
                          { value: "right", label: "Right" },
                        ],
                      },
                    },
                  },
                ],
              },
            ]}
            .computeLabel=${this._computeLabel}
            @value-changed=${(ev: CustomEvent) => this._onSectionFieldsChanged(sIdx, ev)}
          ></ha-form>
          <div class="subgroup-label">Items</div>
          <ha-sortable
            handle-selector=".drag-handle"
            @item-moved=${(ev: CustomEvent) => this._itemMoved(sIdx, ev)}
          >
            <div class="row-list">
              ${items.map((item, idx) =>
                this._isButton(item)
                  ? this._renderButtonRow(sIdx, idx, item)
                  : this._renderStatusItemRow(sIdx, idx, item as StatusItem),
              )}
            </div>
          </ha-sortable>
          ${this._renderAddMenu(sIdx)}
        </div>
      </ha-expansion-panel>
    `;
  }

  private _renderButtonRow(sIdx: number, idx: number, button: NavButtonConfig): TemplateResult {
    const key = `btn-${sIdx}-${idx}`;
    const expanded = this._expanded.has(key);
    const entry = this._buttonEditors.get(`${sIdx}:${idx}`);
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
          <ha-icon class="row-icon" icon=${button.icon || "mdi:gesture-tap-button"}></ha-icon>
          <span class="row-title">Button</span>
          ${button.name ? html`<span class="row-subtitle">${button.name}</span>` : nothing}
          <ha-icon-button
            class="warning"
            label="Delete button"
            .path=${DELETE_ICON_PATH}
            @click=${(ev: Event) => this._removeItem(sIdx, idx, ev)}
          ></ha-icon-button>
        </div>
        <div class="row-body">
          <ha-form
            .hass=${this.hass}
            .data=${{ nav_button_size: button.nav_button_size ?? "normal" }}
            .schema=${[
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
            ]}
            .computeLabel=${this._computeLabel}
            @value-changed=${(ev: CustomEvent) => this._onButtonSizeChanged(sIdx, idx, ev)}
          ></ha-form>
          ${entry ? entry.el : html`<div class="loading">Loading…</div>`}
        </div>
      </ha-expansion-panel>
    `;
  }

  private _renderStatusItemRow(sIdx: number, idx: number, item: StatusItem): TemplateResult {
    const key = `item-${sIdx}-${idx}`;
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
          <div class="drag-handle" @click=${this._stop} title="Drag to reorder">
            <ha-svg-icon .path=${GRIP_ICON_PATH}></ha-svg-icon>
          </div>
          <ha-icon class="row-icon" icon=${STATUS_ITEM_DEFAULT_ICON[item.type]}></ha-icon>
          <span class="row-title">${STATUS_ITEM_LABEL[item.type]}</span>
          ${subtitle ? html`<span class="row-subtitle">${subtitle}</span>` : nothing}
          <ha-icon-button
            class="warning"
            label="Delete item"
            .path=${DELETE_ICON_PATH}
            @click=${(ev: Event) => this._removeItem(sIdx, idx, ev)}
          ></ha-icon-button>
        </div>
        <div class="row-body">
          <ha-form
            .hass=${this.hass}
            .data=${statusItemData(item)}
            .schema=${statusItemSchema(item.type)}
            .computeLabel=${this._computeLabel}
            @value-changed=${(ev: CustomEvent) => this._onStatusItemChanged(sIdx, idx, item.type, ev)}
          ></ha-form>
        </div>
      </ha-expansion-panel>
    `;
  }

  private _toggleAddMenu = (key: string, ev: Event): void => {
    ev.stopPropagation();
    this._openMenu = this._openMenu === key ? undefined : key;
  };

  private _renderAddMenu(sIdx: number): TemplateResult {
    const key = `add-${sIdx}`;
    const open = this._openMenu === key;
    const options: Array<{ value: string; label: string }> = [
      { value: "button", label: "Button" },
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
                      @click=${() => this._addItem(sIdx, option.value)}
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

  private _addSection = (ev: Event): void => {
    ev.stopPropagation();
    const sections: NavSection[] = [
      ...this._sections(),
      { placement: "left", align: "center", buttons: [] },
    ];
    if (sections.length > MAX_NAV_SECTIONS) return;
    this._expanded = new Set([...this._expanded, `sec-${sections.length - 1}`]);
    this._buttonEditors.clear();
    this._commit({ ...this._config, sections } as NavbarCardConfig);
  };

  private _removeSection(sIdx: number, ev: Event): void {
    ev.stopPropagation();
    const sections = [...this._sections()];
    sections.splice(sIdx, 1);
    this._buttonEditors.clear();
    this._commit({ ...this._config, sections } as NavbarCardConfig);
  }

  private _sectionMoved = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const sections = [...this._sections()];
    sections.splice(newIndex, 0, sections.splice(oldIndex, 1)[0]);
    this._buttonEditors.clear();
    this._commit({ ...this._config, sections } as NavbarCardConfig);
  };

  private _toggleSectionVisible(sIdx: number, ev: Event): void {
    ev.stopPropagation();
    const checked = (ev.target as HTMLInputElement).checked;
    const sections = [...this._sections()];
    const section = sections[sIdx];
    if (!section) return;
    sections[sIdx] = { ...section, visible: checked };
    this._commit({ ...this._config, sections } as NavbarCardConfig);
  }

  private _onSectionFieldsChanged(sIdx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value as { placement?: NavZone; align?: NavAlign };
    const sections = [...this._sections()];
    const section = sections[sIdx];
    if (!section) return;
    sections[sIdx] = { ...section, placement: value.placement, align: value.align };
    this._commit({ ...this._config, sections } as NavbarCardConfig);
  }

  // --- Section / item mutations ---------------------------------------------

  /** Dispatch the add-menu pick: a button or a status item of the given type. */
  private _addItem(sIdx: number, value: string): void {
    this._openMenu = undefined;
    if (value === "button") this._addButton(sIdx);
    else this._addStatusItem(sIdx, value as StatusItemType);
  }

  private _addButton(sIdx: number): void {
    const section = this._sections()[sIdx];
    if (!section) return;
    const items: NavItem[] = [
      ...this._items(section),
      {
        type: `custom:${LABEL_BUTTON_CARD_TYPE}`,
        icon: "mdi:gesture-tap-button",
        theme: "ha",
        brushed: false,
        neumorphic: false,
        transparency: 100,
        show_name: false,
        show_state: false,
        tap_action: { action: "navigate", navigation_path: "/home" },
      },
    ];
    this._expanded = new Set([...this._expanded, `btn-${sIdx}-${items.length - 1}`]);
    this._commitItems(sIdx, items);
  }

  private _addStatusItem(sIdx: number, type: StatusItemType): void {
    const section = this._sections()[sIdx];
    if (!section) return;
    const items: NavItem[] = [...this._items(section), newStatusItem(type)];
    this._expanded = new Set([...this._expanded, `item-${sIdx}-${items.length - 1}`]);
    this._commitItems(sIdx, items);
  }

  private _removeItem(sIdx: number, idx: number, ev: Event): void {
    ev.stopPropagation();
    const section = this._sections()[sIdx];
    if (!section) return;
    const items = [...this._items(section)];
    items.splice(idx, 1);
    this._buttonEditors.clear();
    this._commitItems(sIdx, items);
  }

  private _itemMoved(sIdx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const section = this._sections()[sIdx];
    if (!section) return;
    const items = [...this._items(section)];
    items.splice(newIndex, 0, items.splice(oldIndex, 1)[0]);
    this._buttonEditors.clear();
    this._commitItems(sIdx, items);
  }

  private _onButtonSizeChanged(sIdx: number, idx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail.value as { nav_button_size?: NavButtonSize };
    const section = this._sections()[sIdx];
    if (!section) return;
    const items = [...this._items(section)];
    const button = items[idx];
    if (!button || !this._isButton(button)) return;
    const next = { ...button } as NavButtonConfig;
    if (value.nav_button_size && value.nav_button_size !== "normal") next.nav_button_size = value.nav_button_size;
    else delete next.nav_button_size;
    items[idx] = next;
    this._commitItems(sIdx, items);
  }

  private _onStatusItemChanged(sIdx: number, idx: number, type: StatusItemType, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = (ev.detail?.value ?? {}) as Record<string, unknown>;
    const next = { ...value, type } as StatusItem;
    if (next.display === STATUS_ITEM_DEFAULT_DISPLAY[type]) delete next.display;
    const section = this._sections()[sIdx];
    if (!section) return;
    const items = [...this._items(section)];
    items[idx] = next;
    this._commitItems(sIdx, items);
  }

  // --- Embedded button editors (controlled child editors) -------------------

  private _syncButtonEditors(): void {
    if (!this.hass || !this._config) return;
    const wanted = new Set<string>();
    (this._config.sections ?? []).forEach((section, sIdx) => {
      this._items(section).forEach((item, idx) => {
        if (!this._isButton(item)) return;
        const key = `${sIdx}:${idx}`;
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
    });
    for (const key of [...this._buttonEditors.keys()]) {
      if (!wanted.has(key)) this._buttonEditors.delete(key);
    }
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
    const [sIdx, idx] = key.split(":").map((part) => Number(part));
    const section = this._config?.sections?.[sIdx];
    const oldItem = section ? this._items(section)[idx] : undefined;
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
    if (!section) return;
    const items = [...this._items(section)];
    items[idx] = newButton;
    this._commitItems(sIdx, items);
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
