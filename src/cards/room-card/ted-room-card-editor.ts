import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  type HomeAssistant,
  type LovelaceCardConfig,
  type LovelaceCardEditor,
  fireEvent,
} from "custom-card-helpers";

import {
  ROOM_BUTTON_CARD_TYPES,
  ROOM_CARD_EDITOR_TYPE,
  STATUS_ITEM_DEFAULT_ICON,
  STATUS_ITEM_LABEL,
} from "./const";
import type {
  RoomButtonConfig,
  RoomButtonSection,
  RoomCardConfig,
  RoomStatusItem,
  RoomStatusItemType,
} from "./types";

// mdi:texture-box — Room section
const AREA_ICON_PATH =
  "M20,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M4,11H6V13H4V11M4,15H10V17H4V15M20,17H12V15H20V17M20,13H8V11H20V13M20,9H4V6H20V9Z";

// mdi:palette — Appearance section
const APPEARANCE_ICON_PATH =
  "M12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2C17.5,2 22,6 22,11A6,6 0 0,1 16,17H14.2C13.9,17 13.7,17.2 13.7,17.5C13.7,17.6 13.8,17.7 13.8,17.8C14.2,18.3 14.4,18.9 14.4,19.5C14.5,20.9 13.4,22 12,22M7,11A1,1 0 0,0 6,12A1,1 0 0,0 7,13A1,1 0 0,0 8,12A1,1 0 0,0 7,11M10,7A1,1 0 0,0 9,8A1,1 0 0,0 10,9A1,1 0 0,0 11,8A1,1 0 0,0 10,7M14,7A1,1 0 0,0 13,8A1,1 0 0,0 14,9A1,1 0 0,0 15,8A1,1 0 0,0 14,7M17,11A1,1 0 0,0 16,12A1,1 0 0,0 17,13A1,1 0 0,0 18,12A1,1 0 0,0 17,11Z";

// mdi:page-layout-header — Header section
const HEADER_ICON_PATH =
  "M21,5V19H3V5H21M21,3H3A2,2 0 0,0 1,5V19A2,2 0 0,0 3,21H21A2,2 0 0,0 23,19V5A2,2 0 0,0 21,3M5,7H19V9H5V7Z";

/** Order shown in the "Add item" menu. */
const STATUS_ITEM_TYPES: RoomStatusItemType[] = [
  "temperature",
  "occupancy",
  "brightness",
  "volume",
  "led",
  "spacer",
];

/** Per-button-type metadata for headers and the "Add button" menu. */
const BUTTON_TYPE_META: Record<string, { label: string; icon: string }> = {
  [ROOM_BUTTON_CARD_TYPES.label]: { label: "Button", icon: "mdi:gesture-tap-button" },
  [ROOM_BUTTON_CARD_TYPES.cover]: { label: "Cover", icon: "mdi:window-shutter" },
  [ROOM_BUTTON_CARD_TYPES.light]: { label: "Light", icon: "mdi:lightbulb" },
  [ROOM_BUTTON_CARD_TYPES.spacer]: { label: "Spacer", icon: "mdi:arrow-expand-horizontal" },
};

const FIELD_LABELS: Record<string, string> = {
  area: "Area",
  name: "Name",
  icon: "Icon",
  theme: "Visual styling",
  brushed: "Brushed effect",
  show_header_icon: "Display icon in header",
  header_icon_size: "Icon size override (px)",
  show_header_name: "Display name in header",
  header_name_size: "Name size override (px)",
  header_divider: "Display header divider line",
  entity: "Entity",
  on_color: "On color",
  off_color: "Off color",
  colors: "State colors (advanced)",
  title: "Section title",
  show_title: "Show title in card",
  title_align: "Title alignment",
  max_rows: "Max rows (0 = unlimited)",
  size: "Size (px)",
};

/** Minimal entity/device registry shapes used to auto-pull an area's sensors. */
interface EntityRegistryEntry {
  area_id?: string | null;
  device_id?: string | null;
}
type HassWithRegistries = HomeAssistant & {
  entities?: Record<string, EntityRegistryEntry>;
  devices?: Record<string, { area_id?: string | null }>;
};

/** Find the first entity in an area matching the wanted device class(es). */
function resolveAreaEntity(
  hass: HomeAssistant | undefined,
  area: string | undefined,
  kind: "temperature" | "occupancy",
): string | undefined {
  if (!hass || !area) return undefined;
  const registries = hass as HassWithRegistries;
  const entities = registries.entities;
  if (!entities) return undefined;
  const want = kind === "temperature" ? ["temperature"] : ["occupancy", "motion", "presence"];
  for (const [entityId, entry] of Object.entries(entities)) {
    const areaId =
      entry.area_id ?? (entry.device_id ? registries.devices?.[entry.device_id]?.area_id : undefined);
    if (areaId !== area) continue;
    const deviceClass = hass.states[entityId]?.attributes?.device_class;
    if (typeof deviceClass === "string" && want.includes(deviceClass)) {
      return entityId;
    }
  }
  return undefined;
}

/** A cached embedded button-card editor element plus the config it was last given. */
interface ButtonEditorEntry {
  el: LovelaceCardEditor;
  type: string;
  json: string;
}

@customElement(ROOM_CARD_EDITOR_TYPE)
export class TedRoomCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: RoomCardConfig;

  /** Open/closed state per expandable panel, keyed by a stable id. */
  private _expanded: Record<string, boolean> = {};
  /** Embedded button editors keyed by `${sectionIndex}:${buttonIndex}`. */
  private _buttonEditors = new Map<string, ButtonEditorEntry>();
  private _creatingEditors = new Set<string>();
  /** Key of the currently open "add" dropdown, if any. */
  @state() private _openMenu?: string;

  public setConfig(config: RoomCardConfig): void {
    this._config = config;
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("_config") || changed.has("hass")) {
      this._syncButtonEditors();
    }
  }

  // --- Embedded button editors ---------------------------------------------

  private _syncButtonEditors(): void {
    if (!this.hass || !this._config) return;
    const wanted = new Set<string>();
    (this._config.sections ?? []).forEach((section, sIdx) => {
      (section.buttons ?? []).forEach((button, bIdx) => {
        const key = `${sIdx}:${bIdx}`;
        wanted.add(key);
        const entry = this._buttonEditors.get(key);
        if (entry && entry.type === button.type) {
          // The child editors are "controlled": they render from their own
          // setConfig and never self-update on input. We echo their emitted
          // value back synchronously in _onButtonConfigChanged, so here we must
          // NOT push setConfig again — HA's async config round-trip can lag
          // behind fast typing and would revert the field to a stale value.
          // Just keep hass fresh. Structural changes (add/move/delete/type
          // change) clear the map and recreate editors from scratch.
          entry.el.hass = this.hass;
        } else {
          if (entry) this._buttonEditors.delete(key);
          void this._createButtonEditor(key, button);
        }
      });
    });
    for (const key of [...this._buttonEditors.keys()]) {
      if (!wanted.has(key)) this._buttonEditors.delete(key);
    }
  }

  private async _createButtonEditor(key: string, button: RoomButtonConfig): Promise<void> {
    if (this._creatingEditors.has(key)) return;
    const tag = button.type.replace(/^custom:/, "");
    const cardClass = customElements.get(tag) as
      | (CustomElementConstructor & { getConfigElement?: () => Promise<LovelaceCardEditor> })
      | undefined;
    if (!cardClass?.getConfigElement) return;
    this._creatingEditors.add(key);
    try {
      const el = await cardClass.getConfigElement();
      // Tell our card editors they are embedded as a fixed-size room button so
      // they default and lock their width/height fields.
      (el as unknown as { embedded?: boolean }).embedded = true;
      el.hass = this.hass;
      el.setConfig(button as LovelaceCardConfig);
      el.addEventListener("config-changed", (ev: Event) => {
        ev.stopPropagation();
        this._onButtonConfigChanged(key, ev as CustomEvent);
      });
      this._buttonEditors.set(key, { el, type: button.type, json: JSON.stringify(button) });
      this.requestUpdate();
    } finally {
      this._creatingEditors.delete(key);
    }
  }

  private _onButtonConfigChanged(key: string, ev: CustomEvent): void {
    const newButton = ev.detail?.config as RoomButtonConfig | undefined;
    if (!newButton) return;
    const json = JSON.stringify(newButton);
    const entry = this._buttonEditors.get(key);
    if (entry && entry.json === json) return;
    if (entry) {
      entry.json = json;
      // The child editor is controlled: its rendered fields come from its own
      // setConfig, and it does not self-update on input. Echo the value it just
      // emitted straight back so a later re-render (e.g. when hass updates)
      // shows the current value instead of reverting to a stale one.
      entry.el.setConfig(newButton as LovelaceCardConfig);
    }
    const [sIdx, bIdx] = key.split(":").map((part) => Number(part));
    const sections = [...(this._config?.sections ?? [])];
    const section = sections[sIdx];
    if (!section) return;
    const buttons = [...(section.buttons ?? [])];
    buttons[bIdx] = newButton;
    sections[sIdx] = { ...section, buttons };
    this._commit({ ...this._config, type: this._type(), sections });
  }

  // --- Panel helpers --------------------------------------------------------

  private _isExpanded(key: string, fallback: boolean): boolean {
    return key in this._expanded ? this._expanded[key] : fallback;
  }

  private _onPanelToggle(key: string, ev: Event): void {
    // ha-expansion-panel's expanded-changed event bubbles and is composed, so a
    // nested panel's toggle also reaches ancestor panels' handlers. Only act on
    // the event when it originates from the panel that owns this handler;
    // otherwise collapsing an item would also collapse its parent group.
    if (ev.target !== ev.currentTarget) return;
    const expanded = (ev.target as { expanded?: boolean } | null)?.expanded;
    if (typeof expanded === "boolean") {
      this._expanded = { ...this._expanded, [key]: expanded };
    }
  }

  private _stop = (ev: Event): void => {
    ev.stopPropagation();
  };

  private _renderRowMenu(
    onUp: () => void,
    onDown: () => void,
    onDelete: () => void,
    upDisabled: boolean,
    downDisabled: boolean,
  ): TemplateResult {
    return html`
      <div class="row-actions" @click=${this._stop}>
        <ha-icon-button label="Move up" ?disabled=${upDisabled} @click=${onUp}>
          <ha-icon icon="mdi:arrow-up"></ha-icon>
        </ha-icon-button>
        <ha-icon-button label="Move down" ?disabled=${downDisabled} @click=${onDown}>
          <ha-icon icon="mdi:arrow-down"></ha-icon>
        </ha-icon-button>
        <ha-icon-button label="Delete" class="warning" @click=${onDelete}>
          <ha-icon icon="mdi:delete"></ha-icon>
        </ha-icon-button>
      </div>
    `;
  }

  // --- Status items ---------------------------------------------------------

  private _statusItemSchema(type: RoomStatusItemType): unknown[] {
    const icon = { name: "icon", selector: { icon: {} } };
    const name = { name: "name", selector: { text: {} } };
    switch (type) {
      case "temperature":
      case "occupancy":
        return [{ name: "entity", selector: { entity: {} } }, icon, name];
      case "brightness":
        return [
          {
            name: "entity",
            required: true,
            selector: {
              entity: { filter: [{ domain: "light" }, { domain: "number" }, { domain: "input_number" }] },
            },
          },
          icon,
          name,
        ];
      case "volume":
        return [
          { name: "entity", required: true, selector: { entity: { filter: { domain: "media_player" } } } },
          icon,
          name,
        ];
      case "led":
        return [
          { name: "entity", required: true, selector: { entity: {} } },
          { name: "on_color", selector: { ui_color: {} } },
          { name: "off_color", selector: { ui_color: {} } },
          name,
          { name: "colors", selector: { object: {} } },
        ];
      case "spacer":
        return [
          {
            name: "size",
            selector: { number: { min: 0, max: 600, step: 1, mode: "box", unit_of_measurement: "px" } },
          },
        ];
    }
  }

  private _newStatusItem(type: RoomStatusItemType): RoomStatusItem {
    switch (type) {
      case "temperature":
        return { type, entity: resolveAreaEntity(this.hass, this._config?.area, "temperature") ?? "" };
      case "occupancy":
        return { type, entity: resolveAreaEntity(this.hass, this._config?.area, "occupancy") ?? "" };
      case "brightness":
      case "volume":
        return { type, entity: "" };
      case "led":
        return { type, entity: "" };
      case "spacer":
        return { type, size: 24 };
    }
  }

  private _renderStatusItemRow(item: RoomStatusItem, idx: number, total: number): TemplateResult {
    const key = `status-${idx}`;
    const subtitle = item.name ?? ("entity" in item ? item.entity : "") ?? "";
    return html`
      <ha-expansion-panel
        outlined
        .expanded=${this._isExpanded(key, false)}
        @expanded-changed=${(ev: Event) => this._onPanelToggle(key, ev)}
      >
        <div slot="header" class="row-header">
          <ha-icon icon=${STATUS_ITEM_DEFAULT_ICON[item.type]}></ha-icon>
          <span class="row-title">${STATUS_ITEM_LABEL[item.type]}</span>
          ${subtitle ? html`<span class="row-subtitle">${subtitle}</span>` : nothing}
          ${this._renderRowMenu(
            () => this._moveStatusItem(idx, -1),
            () => this._moveStatusItem(idx, 1),
            () => this._deleteStatusItem(idx),
            idx === 0,
            idx === total - 1,
          )}
        </div>
        <div class="panel-content">
          <ha-form
            .hass=${this.hass}
            .data=${item}
            .schema=${this._statusItemSchema(item.type)}
            .computeLabel=${this._computeLabel}
            @value-changed=${(ev: CustomEvent) => this._onStatusItemChanged(idx, item.type, ev)}
          ></ha-form>
        </div>
      </ha-expansion-panel>
    `;
  }

  private _toggleAddMenu = (key: string, ev: Event): void => {
    ev.stopPropagation();
    this._openMenu = this._openMenu === key ? undefined : key;
  };

  private _renderAddMenu(
    key: string,
    label: string,
    options: Array<{ value: string; label: string }>,
    onPick: (value: string) => void,
  ): TemplateResult {
    const open = this._openMenu === key;
    return html`
      <div class="add-menu">
        <button
          type="button"
          class="add-button ${open ? "open" : ""}"
          aria-expanded=${open ? "true" : "false"}
          @click=${(ev: Event) => this._toggleAddMenu(key, ev)}
        >
          <ha-icon icon="mdi:plus"></ha-icon><span>${label}</span>
        </button>
        ${open
          ? html`
              <div class="add-menu-list" @click=${this._stop}>
                ${options.map(
                  (option) => html`
                    <button
                      type="button"
                      class="add-menu-item"
                      @click=${() => {
                        this._openMenu = undefined;
                        onPick(option.value);
                      }}
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

  // --- Button sections ------------------------------------------------------

  private _renderButtonRow(
    sIdx: number,
    bIdx: number,
    button: RoomButtonConfig,
    total: number,
  ): TemplateResult {
    const key = `button-${sIdx}-${bIdx}`;
    const meta = BUTTON_TYPE_META[button.type] ?? { label: button.type, icon: "mdi:card-outline" };
    const editor = this._buttonEditors.get(`${sIdx}:${bIdx}`);
    return html`
      <ha-expansion-panel
        outlined
        .expanded=${this._isExpanded(key, false)}
        @expanded-changed=${(ev: Event) => this._onPanelToggle(key, ev)}
      >
        <div slot="header" class="row-header">
          <ha-icon icon=${meta.icon}></ha-icon>
          <span class="row-title">${meta.label}</span>
          ${button.name ? html`<span class="row-subtitle">${button.name}</span>` : nothing}
          ${this._renderRowMenu(
            () => this._moveButton(sIdx, bIdx, -1),
            () => this._moveButton(sIdx, bIdx, 1),
            () => this._deleteButton(sIdx, bIdx),
            bIdx === 0,
            bIdx === total - 1,
          )}
        </div>
        <div class="panel-content">
          ${editor ? editor.el : html`<div class="loading">Loading editor…</div>`}
        </div>
      </ha-expansion-panel>
    `;
  }

  private _renderSectionRow(section: RoomButtonSection, sIdx: number, total: number): TemplateResult {
    const key = `section-${sIdx}`;
    const buttons = section.buttons ?? [];
    return html`
      <ha-expansion-panel
        outlined
        .expanded=${this._isExpanded(key, false)}
        @expanded-changed=${(ev: Event) => this._onPanelToggle(key, ev)}
      >
        <div slot="header" class="row-header">
          <ha-icon icon="mdi:view-grid-outline"></ha-icon>
          <span class="row-title">${section.title || `Section ${sIdx + 1}`}</span>
          ${this._renderRowMenu(
            () => this._moveSection(sIdx, -1),
            () => this._moveSection(sIdx, 1),
            () => this._deleteSection(sIdx),
            sIdx === 0,
            sIdx === total - 1,
          )}
        </div>
        <div class="panel-content">
          <ha-form
            .hass=${this.hass}
            .data=${{ title: section.title ?? "", show_title: section.show_title === true, title_align: section.title_align ?? "left", max_rows: section.max_rows ?? 0 }}
            .schema=${[
              { name: "title", selector: { text: {} } },
              {
                type: "grid",
                name: "",
                column_min_width: "100px",
                schema: [
                  { name: "show_title", selector: { boolean: {} } },
                  {
                    name: "title_align",
                    disabled: section.show_title !== true,
                    selector: {
                      select: {
                        mode: "dropdown",
                        options: [
                          { value: "left", label: "Left (default)" },
                          { value: "center", label: "Center" },
                          { value: "right", label: "Right" },
                        ],
                      },
                    },
                  },
                ],
              },
              { name: "max_rows", selector: { number: { min: 0, max: 20, step: 1, mode: "box" } } },
            ]}
            .computeLabel=${this._computeLabel}
            @value-changed=${(ev: CustomEvent) => this._onSectionFieldChanged(sIdx, ev)}
          ></ha-form>
          <div class="subgroup-label">Buttons</div>
          <div class="row-list">
            ${buttons.map((button, bIdx) => this._renderButtonRow(sIdx, bIdx, button, buttons.length))}
          </div>
          ${this._renderAddMenu(
            `add-button-${sIdx}`,
            "Add button",
            [
              { value: ROOM_BUTTON_CARD_TYPES.label, label: "Button" },
              { value: ROOM_BUTTON_CARD_TYPES.cover, label: "Cover" },
              { value: ROOM_BUTTON_CARD_TYPES.light, label: "Light" },
              { value: ROOM_BUTTON_CARD_TYPES.spacer, label: "Spacer" },
            ],
            (value) => this._addButton(sIdx, value),
          )}
        </div>
      </ha-expansion-panel>
    `;
  }

  // --- Render ---------------------------------------------------------------

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;

    const data = {
      theme: "ted-style",
      brushed: false,
      show_header_icon: false,
      show_header_name: true,
      header_divider: true,
      ...this._config,
    };
    const statusItems = this._config.status_items ?? [];
    const sections = this._config.sections ?? [];

    return html`
      <div class="editor">
        <ha-form
          .hass=${this.hass}
          .data=${data}
          .schema=${this._baseSchema()}
          .computeLabel=${this._computeLabel}
          @value-changed=${this._onBaseChanged}
        ></ha-form>

        <ha-expansion-panel
          outlined
          .expanded=${this._isExpanded("g-status", true)}
          @expanded-changed=${(ev: Event) => this._onPanelToggle("g-status", ev)}
        >
          <div slot="header" class="panel-header">
            <ha-icon icon="mdi:gauge"></ha-icon><span>Status items</span>
          </div>
          <div class="panel-content">
            <div class="row-list">
              ${statusItems.map((item, idx) => this._renderStatusItemRow(item, idx, statusItems.length))}
            </div>
            ${this._renderAddMenu(
              "add-status",
              "Add item",
              STATUS_ITEM_TYPES.map((type) => ({ value: type, label: STATUS_ITEM_LABEL[type] })),
              (value) => this._addStatusItem(value as RoomStatusItemType),
            )}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel
          outlined
          .expanded=${this._isExpanded("g-sections", true)}
          @expanded-changed=${(ev: Event) => this._onPanelToggle("g-sections", ev)}
        >
          <div slot="header" class="panel-header">
            <ha-icon icon="mdi:view-dashboard-outline"></ha-icon><span>Button sections</span>
          </div>
          <div class="panel-content">
            <div class="row-list">
              ${sections.map((section, sIdx) => this._renderSectionRow(section, sIdx, sections.length))}
            </div>
            <button type="button" class="add-button" @click=${this._addSection}>
              <ha-icon icon="mdi:plus"></ha-icon><span>Add section</span>
            </button>
          </div>
        </ha-expansion-panel>
      </div>
    `;
  }

  private _baseSchema(): unknown[] {
    return [
      {
        name: "",
        type: "expandable",
        title: "Room",
        iconPath: AREA_ICON_PATH,
        expanded: true,
        flatten: true,
        schema: [
          { name: "area", selector: { area: {} } },
          { name: "name", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
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
                  { value: "ted-style", label: "Ted's Style (default)" },
                  { value: "ha", label: "Home Assistant theme" },
                ],
              },
            },
          },
          { name: "brushed", selector: { boolean: {} } },
        ],
      },
      {
        name: "",
        type: "expandable",
        title: "Header",
        iconPath: HEADER_ICON_PATH,
        flatten: true,
        schema: [
          {
            type: "grid",
            name: "",
            column_min_width: "100px",
            schema: [
              { name: "show_header_icon", selector: { boolean: {} } },
              {
                name: "header_icon_size",
                disabled: this._config?.show_header_icon !== true,
                selector: { number: { min: 0, max: 200, step: 1, mode: "box", unit_of_measurement: "px" } },
              },
            ],
          },
          {
            type: "grid",
            name: "",
            column_min_width: "100px",
            schema: [
              { name: "show_header_name", selector: { boolean: {} } },
              {
                name: "header_name_size",
                disabled: this._config?.show_header_name === false,
                selector: { number: { min: 0, max: 200, step: 1, mode: "box", unit_of_measurement: "px" } },
              },
            ],
          },
          { name: "header_divider", selector: { boolean: {} } },
        ],
      },
    ];
  }

  private _computeLabel = (schema: { name: string }): string =>
    FIELD_LABELS[schema.name] ?? schema.name;

  // --- Mutations ------------------------------------------------------------

  private _type(): string {
    return this._config?.type ?? `custom:${ROOM_CARD_EDITOR_TYPE.replace("-editor", "")}`;
  }

  private _onBaseChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const value = ev.detail.value as Partial<RoomCardConfig>;
    this._commit({
      ...this._config,
      type: this._type(),
      area: value.area,
      name: value.name,
      icon: value.icon,
      theme: value.theme,
      brushed: value.brushed,
      show_header_icon: value.show_header_icon,
      header_icon_size: value.header_icon_size,
      show_header_name: value.show_header_name,
      header_name_size: value.header_name_size,
      header_divider: value.header_divider,
      status_items: this._config?.status_items,
      sections: this._config?.sections,
    });
  };

  private _onStatusItemChanged(idx: number, type: RoomStatusItemType, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = (ev.detail?.value ?? {}) as Record<string, unknown>;
    const items = [...(this._config?.status_items ?? [])];
    items[idx] = { ...value, type } as RoomStatusItem;
    this._commit({ ...this._config, type: this._type(), status_items: items });
  }

  private _addStatusItem(type: RoomStatusItemType): void {
    const items = [...(this._config?.status_items ?? []), this._newStatusItem(type)];
    this._expanded = { ...this._expanded, [`status-${items.length - 1}`]: true };
    this._commit({ ...this._config, type: this._type(), status_items: items });
  }

  private _moveStatusItem(idx: number, dir: -1 | 1): void {
    const items = [...(this._config?.status_items ?? [])];
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    [items[idx], items[target]] = [items[target], items[idx]];
    this._buttonEditors.clear();
    this._commit({ ...this._config, type: this._type(), status_items: items });
  }

  private _deleteStatusItem(idx: number): void {
    const items = [...(this._config?.status_items ?? [])];
    items.splice(idx, 1);
    this._commit({ ...this._config, type: this._type(), status_items: items });
  }

  private _onSectionFieldChanged(sIdx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = (ev.detail?.value ?? {}) as {
      title?: string;
      show_title?: boolean;
      title_align?: "left" | "center" | "right";
      max_rows?: number;
    };
    const sections = [...(this._config?.sections ?? [])];
    const section = sections[sIdx];
    if (!section) return;
    sections[sIdx] = {
      ...section,
      title: value.title,
      show_title: value.show_title,
      title_align: value.title_align,
      max_rows: value.max_rows,
    };
    this._commit({ ...this._config, type: this._type(), sections });
  }

  private _addSection = (): void => {
    const sections = [...(this._config?.sections ?? []), { buttons: [] } as RoomButtonSection];
    this._expanded = { ...this._expanded, [`section-${sections.length - 1}`]: true };
    this._commit({ ...this._config, type: this._type(), sections });
  };

  private _moveSection(sIdx: number, dir: -1 | 1): void {
    const sections = [...(this._config?.sections ?? [])];
    const target = sIdx + dir;
    if (target < 0 || target >= sections.length) return;
    [sections[sIdx], sections[target]] = [sections[target], sections[sIdx]];
    this._buttonEditors.clear();
    this._commit({ ...this._config, type: this._type(), sections });
  }

  private _deleteSection(sIdx: number): void {
    const sections = [...(this._config?.sections ?? [])];
    sections.splice(sIdx, 1);
    this._buttonEditors.clear();
    this._commit({ ...this._config, type: this._type(), sections });
  }

  private _addButton(sIdx: number, type: string): void {
    const tag = type.replace(/^custom:/, "");
    const cardClass = customElements.get(tag) as
      | (CustomElementConstructor & { getStubConfig?: (hass: HomeAssistant) => Record<string, unknown> })
      | undefined;
    let stub: Record<string, unknown> = {};
    try {
      stub = cardClass?.getStubConfig ? cardClass.getStubConfig(this.hass as HomeAssistant) ?? {} : {};
    } catch {
      stub = {};
    }
    const button = { type, ...stub } as RoomButtonConfig;
    const sections = [...(this._config?.sections ?? [])];
    const section = sections[sIdx];
    if (!section) return;
    const buttons = [...(section.buttons ?? []), button];
    sections[sIdx] = { ...section, buttons };
    this._expanded = { ...this._expanded, [`button-${sIdx}-${buttons.length - 1}`]: true };
    this._commit({ ...this._config, type: this._type(), sections });
  }

  private _moveButton(sIdx: number, bIdx: number, dir: -1 | 1): void {
    const sections = [...(this._config?.sections ?? [])];
    const section = sections[sIdx];
    if (!section) return;
    const buttons = [...(section.buttons ?? [])];
    const target = bIdx + dir;
    if (target < 0 || target >= buttons.length) return;
    [buttons[bIdx], buttons[target]] = [buttons[target], buttons[bIdx]];
    sections[sIdx] = { ...section, buttons };
    this._buttonEditors.clear();
    this._commit({ ...this._config, type: this._type(), sections });
  }

  private _deleteButton(sIdx: number, bIdx: number): void {
    const sections = [...(this._config?.sections ?? [])];
    const section = sections[sIdx];
    if (!section) return;
    const buttons = [...(section.buttons ?? [])];
    buttons.splice(bIdx, 1);
    sections[sIdx] = { ...section, buttons };
    this._buttonEditors.clear();
    this._commit({ ...this._config, type: this._type(), sections });
  }

  /** Store the working config and emit a cleaned copy to Home Assistant. */
  private _commit(next: RoomCardConfig): void {
    this._config = next;
    fireEvent(this, "config-changed", { config: this._clean(next) });
  }

  private _clean(config: RoomCardConfig): RoomCardConfig {
    const next: RoomCardConfig = { ...config };
    if (next.theme === "ted-style") delete next.theme;
    if (!next.brushed) delete next.brushed;
    if (!next.area) delete next.area;
    if (!next.name) delete next.name;
    if (!next.icon) delete next.icon;
    if (!next.show_header_icon) delete next.show_header_icon;
    if (typeof next.header_icon_size !== "number") delete next.header_icon_size;
    if (next.show_header_name !== false) delete next.show_header_name;
    if (typeof next.header_name_size !== "number") delete next.header_name_size;
    if (next.header_divider !== false) delete next.header_divider;
    if (!next.status_items || next.status_items.length === 0) {
      delete next.status_items;
    }
    if (!next.sections || next.sections.length === 0) {
      delete next.sections;
    } else {
      next.sections = next.sections.map((section) => {
        const clean: RoomButtonSection = { ...section, buttons: section.buttons ?? [] };
        if (!clean.title) delete clean.title;
        if (!clean.show_title) delete clean.show_title;
        if (!clean.title_align || clean.title_align === "left") delete clean.title_align;
        if (!clean.max_rows) delete clean.max_rows;
        return clean;
      });
    }
    return next;
  }

  static styles = css`
    :host {
      display: block;
    }
    .editor {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    ha-form {
      display: block;
    }
    ha-expansion-panel {
      --expansion-panel-content-padding: 0;
      border-radius: 6px;
    }
    .panel-header {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 500;
    }
    .panel-header ha-icon {
      color: var(--secondary-text-color);
    }
    .panel-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px 16px 16px;
    }
    .row-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .row-header {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
    }
    .row-header ha-icon {
      color: var(--secondary-text-color);
      flex: none;
    }
    .row-title {
      font-weight: 500;
      flex: none;
    }
    .row-subtitle {
      color: var(--secondary-text-color);
      font-size: 0.85em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1 1 auto;
      min-width: 0;
    }
    .row-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      flex: none;
      margin-left: auto;
    }
    .row-actions ha-icon-button {
      --mdc-icon-button-size: 36px;
      --mdc-icon-size: 20px;
      color: var(--secondary-text-color);
    }
    .row-actions ha-icon-button.warning {
      color: var(--error-color, #db4437);
    }
    .subgroup-label {
      color: var(--secondary-text-color);
      font-size: 0.9em;
      font-weight: 500;
      margin-top: 4px;
    }
    .add-button {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border: 1px dashed var(--divider-color, rgba(127, 127, 127, 0.4));
      border-radius: 6px;
      background: none;
      color: var(--primary-color);
      cursor: pointer;
      font: inherit;
    }
    .add-button:hover {
      background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    }
    .loading {
      color: var(--secondary-text-color);
      font-size: 0.9em;
      padding: 8px 0;
    }
    .add-menu {
      position: relative;
      align-self: flex-start;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .add-button.open {
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
    .add-menu-list {
      display: flex;
      flex-direction: column;
      min-width: 200px;
      padding: 4px;
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4));
      border-radius: 8px;
      background: var(--card-background-color, var(--ha-card-background, #1c1c1c));
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }
    .add-menu-item {
      text-align: left;
      padding: 10px 12px;
      border: none;
      border-radius: 6px;
      background: none;
      color: var(--primary-text-color);
      cursor: pointer;
      font: inherit;
    }
    .add-menu-item:hover {
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.12));
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-room-card-editor": TedRoomCardEditor;
  }
}
