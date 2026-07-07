import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  type HomeAssistant,
  type LovelaceCardConfig,
  type LovelaceCardEditor,
  fireEvent,
} from "custom-card-helpers";

import {
  BUNDLED_PHOTO_OPTIONS,
  defaultEdgeGradient,
  type PhotoEdge,
  type PhotoPlacement,
  ROOM_BUTTON_CARD_TYPES,
  ROOM_CARD_EDITOR_TYPE,
  STATUS_ITEM_DEFAULT_ICON,
  STATUS_ITEM_DEFAULT_DISPLAY,
  STATUS_ITEM_LABEL,
} from "./const";
import type {
  ButtonSize,
  RoomButtonConfig,
  RoomButtonSection,
  RoomCardConfig,
  RoomStatusItem,
  RoomStatusItemType,
} from "./types";
import { transparencyBlurSchema } from "../../shared/appearance";
import { ROOM_STATUS_ITEM_TYPES } from "../../shared/status-items/const";
import { newStatusItem, statusItemData, statusItemSchema } from "../../shared/status-items/editor";

// mdi:texture-box — Room section
const AREA_ICON_PATH =
  "M20,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M4,11H6V13H4V11M4,15H10V17H4V15M20,17H12V15H20V17M20,13H8V11H20V13M20,9H4V6H20V9Z";

// mdi:palette — Appearance section
const APPEARANCE_ICON_PATH =
  "M12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2C17.5,2 22,6 22,11A6,6 0 0,1 16,17H14.2C13.9,17 13.7,17.2 13.7,17.5C13.7,17.6 13.8,17.7 13.8,17.8C14.2,18.3 14.4,18.9 14.4,19.5C14.5,20.9 13.4,22 12,22M7,11A1,1 0 0,0 6,12A1,1 0 0,0 7,13A1,1 0 0,0 8,12A1,1 0 0,0 7,11M10,7A1,1 0 0,0 9,8A1,1 0 0,0 10,9A1,1 0 0,0 11,8A1,1 0 0,0 10,7M14,7A1,1 0 0,0 13,8A1,1 0 0,0 14,9A1,1 0 0,0 15,8A1,1 0 0,0 14,7M17,11A1,1 0 0,0 16,12A1,1 0 0,0 17,13A1,1 0 0,0 18,12A1,1 0 0,0 17,11Z";

// mdi:page-layout-header — Header section
const HEADER_ICON_PATH =
  "M21,5V19H3V5H21M21,3H3A2,2 0 0,0 1,5V19A2,2 0 0,0 3,21H21A2,2 0 0,0 23,19V5A2,2 0 0,0 21,3M5,7H19V9H5V7Z";

// mdi:image — Room Photo section
const PHOTO_ICON_PATH =
  "M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z";

/** Order shown in the "Add item" menu. */
const STATUS_ITEM_TYPES = ROOM_STATUS_ITEM_TYPES;

/** Per-button-type metadata for headers and the "Add button" menu. */
const BUTTON_TYPE_META: Record<string, { label: string; icon: string }> = {
  [ROOM_BUTTON_CARD_TYPES.label]: { label: "Button", icon: "mdi:gesture-tap-button" },
  [ROOM_BUTTON_CARD_TYPES.cover]: { label: "Cover", icon: "mdi:window-shutter" },
  [ROOM_BUTTON_CARD_TYPES.light]: { label: "Light", icon: "mdi:lightbulb" },
  [ROOM_BUTTON_CARD_TYPES.camera]: { label: "Camera", icon: "mdi:cctv" },
  [ROOM_BUTTON_CARD_TYPES.spacer]: { label: "Spacer", icon: "mdi:arrow-expand-horizontal" },
};

/** Shared width / height footprint options for a section button. */
const BUTTON_SIZE_BASE = [
  { value: "half", label: "Half" },
  { value: "normal", label: "Normal (default)" },
  { value: "2x", label: "2x" },
  { value: "3x", label: "3x" },
  { value: "4x", label: "4x" },
];
const BUTTON_WIDTH_OPTIONS = [...BUTTON_SIZE_BASE, { value: "full", label: "Full width" }];
const BUTTON_HEIGHT_OPTIONS = [...BUTTON_SIZE_BASE, { value: "full", label: "Full height" }];

/** Remove the room-only sizing keys so the embedded sub-card editor stays clean. */
function stripButtonSize(button: RoomButtonConfig): LovelaceCardConfig {
  const { ted_button_width, ted_button_height, ...cardConfig } = button;
  void ted_button_width;
  void ted_button_height;
  return cardConfig as LovelaceCardConfig;
}

const FIELD_LABELS: Record<string, string> = {
  area: "Area",
  name: "Name (override)",
  icon: "Icon (override)",
  display: "Display",
  theme: "Visual styling",
  background: "Background color",
  brushed: "Brushed effect",
  transparency: "Transparency",
  blur: "Background blur",
  show_header_icon: "Display icon in header",
  header_icon: "Header icon",
  header_icon_size: "Icon size override",
  icon_transparency: "Icon transparency",
  icon_bg_transparency: "Icon background transparency",
  icon_color: "Icon color",
  icon_bg_color: "Icon background color",
  show_header_name: "Display name in header",
  header_name_size: "Name size override",
  header_divider: "Display header divider line",
  header_align: "Vertical alignment",
  header_h_align: "Horizontal alignment",
  status_align: "Vertical alignment",
  status_icon_size: "Status icon size",
  show_photo: "Show photo",
  photo_source: "Photo source",
  photo: "Select photo",
  photo_url: "Photo",
  photo_camera_entity: "Camera entity",
  photo_camera_view: "Camera view",
  photo_camera_fit: "Fit mode",
  photo_placement: "Photo placement",
  photo_height: "Photo height (px)",
  photo_align: "Photo vertical alignment",
  shift_buttons_down: "Shift buttons down",
  photo_edge_gradient: "Edge Gradient (Scrim)",
  photo_opacity: "Photo opacity",
  photo_state_entity: "State entities (dims photo when all are off)",
  photo_off_grayscale: "Greyscale when off",
  photo_off_opacity: "Opacity when off (%)",
  entity: "Entity",
  on_color: "On color",
  off_color: "Off color",
  colors: "State colors (advanced)",
  title: "Section title",
  show_title: "Show title in card",
  title_align: "Title alignment",
  max_rows: "Max rows (0 = unlimited)",
  size: "Size (px)",
  ted_button_width: "Width",
  ted_button_height: "Height",
  section_layout: "Section layout",
};

/** Order-independent equality for two edge-gradient sets. */
function sameEdges(a: PhotoEdge[], b: PhotoEdge[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((edge) => set.has(edge));
}

/** True when the photo state-entity config holds at least one entity. */
function hasPhotoStateEntity(value: string | string[] | undefined): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

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
      const cardConfig = stripButtonSize(button);
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
    const newCard = ev.detail?.config as RoomButtonConfig | undefined;
    if (!newCard) return;
    const [sIdx, bIdx] = key.split(":").map((part) => Number(part));
    const section = this._config?.sections?.[sIdx];
    const oldButton = section?.buttons?.[bIdx];
    // The sub-editor never sees the room-only size keys, so re-attach them.
    const newButton = {
      ...stripButtonSize(newCard),
      ...(oldButton?.ted_button_width ? { ted_button_width: oldButton.ted_button_width } : {}),
      ...(oldButton?.ted_button_height ? { ted_button_height: oldButton.ted_button_height } : {}),
    } as RoomButtonConfig;
    const cardConfig = stripButtonSize(newButton);
    const json = JSON.stringify(cardConfig);
    const entry = this._buttonEditors.get(key);
    if (entry && entry.json === json) return;
    if (entry) {
      entry.json = json;
      // The child editor is controlled: its rendered fields come from its own
      // setConfig, and it does not self-update on input. Echo the value it just
      // emitted straight back so a later re-render (e.g. when hass updates)
      // shows the current value instead of reverting to a stale one.
      entry.el.setConfig(cardConfig);
    }
    if (!section) return;
    const sections = [...(this._config?.sections ?? [])];
    const buttons = [...(section.buttons ?? [])];
    buttons[bIdx] = newButton;
    sections[sIdx] = { ...section, buttons };
    this._commit({ ...this._config, type: this._type(), sections });
  }

  private _onButtonSizeChanged(sIdx: number, bIdx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = ev.detail?.value as
      | { ted_button_width?: ButtonSize; ted_button_height?: ButtonSize }
      | undefined;
    if (!value) return;
    const sections = [...(this._config?.sections ?? [])];
    const section = sections[sIdx];
    if (!section) return;
    const buttons = [...(section.buttons ?? [])];
    const button = buttons[bIdx];
    if (!button) return;
    const next = { ...button } as RoomButtonConfig;
    // Strip values equal to the "normal" default so the saved YAML stays minimal.
    if (value.ted_button_width && value.ted_button_width !== "normal") next.ted_button_width = value.ted_button_width;
    else delete next.ted_button_width;
    if (value.ted_button_height && value.ted_button_height !== "normal") next.ted_button_height = value.ted_button_height;
    else delete next.ted_button_height;
    buttons[bIdx] = next;
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

  private _renderRowMenu(onDelete: () => void): TemplateResult {
    return html`
      <div class="row-actions" @click=${this._stop}>
        <ha-icon-button label="Delete" class="warning" @click=${onDelete}>
          <ha-icon icon="mdi:delete"></ha-icon>
        </ha-icon-button>
      </div>
    `;
  }

  // --- Status items ---------------------------------------------------------

  /** Form data for a status item, with the per-type default display filled in. */
  private _statusItemData(item: RoomStatusItem): Record<string, unknown> {
    return statusItemData(item);
  }

  private _statusItemSchema(type: RoomStatusItemType): unknown[] {
    return statusItemSchema(type);
  }

  private _newStatusItem(type: RoomStatusItemType): RoomStatusItem {
    return newStatusItem(type, (kind) => resolveAreaEntity(this.hass, this._config?.area, kind)) as RoomStatusItem;
  }

  private _renderStatusItemRow(item: RoomStatusItem, idx: number): TemplateResult {
    const key = `status-${idx}`;
    // Header subtitle: an explicit name override, else the entity's friendly name,
    // and only fall back to the raw entity_id when neither is available.
    const entityId = "entity" in item ? item.entity : undefined;
    const friendlyName = entityId
      ? (this.hass?.states[entityId]?.attributes?.friendly_name as string | undefined)
      : undefined;
    const subtitle = item.name || friendlyName || entityId || "";
    return html`
      <ha-expansion-panel
        outlined
        .expanded=${this._isExpanded(key, false)}
        @expanded-changed=${(ev: Event) => this._onPanelToggle(key, ev)}
      >
        <div slot="header" class="row-header">
          <div class="drag-handle" @click=${this._stop} title="Drag to reorder">
            <ha-icon icon="mdi:drag"></ha-icon>
          </div>
          <ha-icon icon=${STATUS_ITEM_DEFAULT_ICON[item.type]}></ha-icon>
          <span class="row-title">${STATUS_ITEM_LABEL[item.type]}</span>
          ${subtitle ? html`<span class="row-subtitle">${subtitle}</span>` : nothing}
          ${this._renderRowMenu(() => this._deleteStatusItem(idx))}
        </div>
        <div class="panel-content">
          <ha-form
            .hass=${this.hass}
            .data=${this._statusItemData(item)}
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

  private _renderButtonRow(sIdx: number, bIdx: number, button: RoomButtonConfig): TemplateResult {
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
          <div class="drag-handle" @click=${this._stop} title="Drag to reorder">
            <ha-icon icon="mdi:drag"></ha-icon>
          </div>
          <ha-icon icon=${meta.icon}></ha-icon>
          <span class="row-title">${meta.label}</span>
          ${button.name ? html`<span class="row-subtitle">${button.name}</span>` : nothing}
          ${this._renderRowMenu(() => this._deleteButton(sIdx, bIdx))}
        </div>
        <div class="panel-content">
          <ha-form
            .hass=${this.hass}
            .data=${{
              ted_button_width: button.ted_button_width ?? "normal",
              ted_button_height: button.ted_button_height ?? "normal",
            }}
            .schema=${[
              {
                type: "grid",
                name: "",
                column_min_width: "100px",
                schema: [
                  { name: "ted_button_width", selector: { select: { mode: "dropdown", options: BUTTON_WIDTH_OPTIONS } } },
                  { name: "ted_button_height", selector: { select: { mode: "dropdown", options: BUTTON_HEIGHT_OPTIONS } } },
                ],
              },
            ]}
            .computeLabel=${this._computeLabel}
            @value-changed=${(ev: CustomEvent) => this._onButtonSizeChanged(sIdx, bIdx, ev)}
          ></ha-form>
          ${editor ? editor.el : html`<div class="loading">Loading editor…</div>`}
        </div>
      </ha-expansion-panel>
    `;
  }

  private _renderSectionRow(section: RoomButtonSection, sIdx: number): TemplateResult {
    const key = `section-${sIdx}`;
    const buttons = section.buttons ?? [];
    return html`
      <ha-expansion-panel
        outlined
        .expanded=${this._isExpanded(key, false)}
        @expanded-changed=${(ev: Event) => this._onPanelToggle(key, ev)}
      >
        <div slot="header" class="row-header">
          <div class="drag-handle section-drag-handle" @click=${this._stop} title="Drag to reorder">
            <ha-icon icon="mdi:drag"></ha-icon>
          </div>
          <ha-icon icon="mdi:view-grid-outline"></ha-icon>
          <span class="row-title">${section.title || `Section ${sIdx + 1}`}</span>
          ${this._renderRowMenu(() => this._deleteSection(sIdx))}
        </div>
        <div class="panel-content">
          <ha-form
            .hass=${this.hass}
            .data=${{ title: section.title ?? "", icon: section.icon ?? "", show_title: section.show_title === true, title_align: section.title_align ?? "left", max_rows: section.max_rows ?? 0 }}
            .schema=${[
              {
                type: "grid",
                name: "",
                column_min_width: "140px",
                schema: [
                  { name: "title", selector: { text: {} } },
                  { name: "icon", label: "Tab icon", selector: { icon: {} } },
                ],
              },
              ...(this._config?.section_layout === "tabbed"
                ? []
                : [
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
                  ]),
              { name: "max_rows", selector: { number: { min: 0, max: 20, step: 1, mode: "box" } } },
            ]}
            .computeLabel=${this._computeLabel}
            @value-changed=${(ev: CustomEvent) => this._onSectionFieldChanged(sIdx, ev)}
          ></ha-form>
          <div class="subgroup-label">Buttons</div>
          <ha-sortable handle-selector=".drag-handle" @item-moved=${(ev: CustomEvent) => this._buttonMoved(sIdx, ev)}>
            <div class="row-list">
              ${buttons.map((button, bIdx) => this._renderButtonRow(sIdx, bIdx, button))}
            </div>
          </ha-sortable>
          ${this._renderAddMenu(
            `add-button-${sIdx}`,
            "Add button",
            [
              { value: ROOM_BUTTON_CARD_TYPES.label, label: "Button" },
              { value: ROOM_BUTTON_CARD_TYPES.cover, label: "Cover" },
              { value: ROOM_BUTTON_CARD_TYPES.light, label: "Light" },
              { value: ROOM_BUTTON_CARD_TYPES.camera, label: "Camera" },
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

    const placement = (this._config.photo_placement as PhotoPlacement) ?? "top";
    const headerIconMode = !this._config.show_header_icon
      ? "none"
      : this._config.header_icon_style === "watermark"
        ? "watermark"
        : "standard";
    const data = {
      theme: "ted-style",
      brushed: false,
      transparency: undefined,
      blur: undefined,
      show_header_icon: false,
      show_header_name: true,
      header_divider: false,
      header_align: "top",
      header_h_align: "left",
      icon_transparency: 30,
      icon_bg_transparency: 70,
      show_photo: true,
      photo_source: "bundled",
      photo: "auto",
      photo_placement: "top",
      photo_align: "center",
      shift_buttons_down: true,
      photo_opacity: 100,
      photo_off_grayscale: false,
      photo_off_opacity: 25,
      ...this._config,
      header_icon: headerIconMode,
      photo_edge_gradient: this._config.photo_edge_gradient ?? defaultEdgeGradient(placement),
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
          .expanded=${this._isExpanded("g-status", false)}
          @expanded-changed=${(ev: Event) => this._onPanelToggle("g-status", ev)}
        >
          <div slot="header" class="panel-header">
            <ha-icon icon="mdi:gauge"></ha-icon><span>Status items</span>
          </div>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${{
                status_align: this._config.status_align ?? "top",
                status_icon_size: this._config.status_icon_size ?? 100,
              }}
              .schema=${[
                {
                  type: "grid",
                  name: "",
                  column_min_width: "100px",
                  schema: [
                    {
                      name: "status_align",
                      selector: {
                        select: {
                          mode: "dropdown",
                          options: [
                            { value: "top", label: "Top (default)" },
                            { value: "middle", label: "Middle" },
                            { value: "bottom", label: "Bottom" },
                          ],
                        },
                      },
                    },
                    {
                      name: "status_icon_size",
                      selector: { number: { min: 10, max: 400, step: 5, mode: "box", unit_of_measurement: "%" } },
                    },
                  ],
                },
              ]}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._onStatusSettingsChanged}
            ></ha-form>
            <ha-sortable handle-selector=".drag-handle" @item-moved=${this._statusItemMoved}>
              <div class="row-list">
                ${statusItems.map((item, idx) => this._renderStatusItemRow(item, idx))}
              </div>
            </ha-sortable>
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
            <ha-form
              .hass=${this.hass}
              .data=${{ section_layout: this._config?.section_layout ?? "stacked" }}
              .schema=${[
                {
                  name: "section_layout",
                  selector: {
                    select: {
                      mode: "dropdown",
                      options: [
                        { value: "stacked", label: "Stacked (default)" },
                        { value: "tabbed", label: "Tabbed" },
                      ],
                    },
                  },
                },
              ]}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._onSectionLayoutChanged}
            ></ha-form>
            <ha-sortable handle-selector=".section-drag-handle" @item-moved=${this._sectionMoved}>
              <div class="row-list">
                ${sections.map((section, sIdx) => this._renderSectionRow(section, sIdx))}
              </div>
            </ha-sortable>
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
        flatten: true,
        schema: [
          { name: "area", selector: { area: {} } },
          {
            type: "grid",
            name: "",
            column_min_width: "100px",
            schema: [
              { name: "name", selector: { text: {} } },
              { name: "icon", selector: { icon: {} } },
            ],
          },
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
          { name: "background", selector: { ui_color: {} } },
          { name: "brushed", selector: { boolean: {} } },
          transparencyBlurSchema(this._config?.transparency),
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
            name: "header_icon",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "none", label: "None (default)" },
                  { value: "standard", label: "Standard Icon" },
                  { value: "watermark", label: "Watermark" },
                ],
              },
            },
          },
          ...(this._config?.show_header_icon === true
            ? [
                {
                  name: "header_icon_size",
                  selector: { number: { min: 10, max: 400, step: 5, mode: "box", unit_of_measurement: "%" } },
                },
              ]
            : []),
          ...(this._config?.show_header_icon === true && this._config?.header_icon_style === "watermark"
            ? [
                {
                  type: "grid",
                  name: "",
                  column_min_width: "100px",
                  schema: [
                    {
                      name: "icon_transparency",
                      selector: { number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } },
                    },
                    {
                      name: "icon_bg_transparency",
                      selector: { number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } },
                    },
                  ],
                },
                {
                  type: "grid",
                  name: "",
                  column_min_width: "100px",
                  schema: [
                    { name: "icon_color", selector: { ui_color: {} } },
                    { name: "icon_bg_color", selector: { ui_color: {} } },
                  ],
                },
              ]
            : []),
          {
            type: "grid",
            name: "",
            column_min_width: "100px",
            schema: [
              { name: "show_header_name", selector: { boolean: {} } },
              {
                name: "header_name_size",
                disabled: this._config?.show_header_name === false,
                selector: { number: { min: 10, max: 400, step: 5, mode: "box", unit_of_measurement: "%" } },
              },
            ],
          },
          {
            type: "grid",
            name: "",
            column_min_width: "120px",
            schema: [
              {
                name: "header_align",
                selector: {
                  select: {
                    mode: "dropdown",
                    options: [
                      { value: "top", label: "Top (default)" },
                      { value: "middle", label: "Middle" },
                      { value: "bottom", label: "Bottom" },
                    ],
                  },
                },
              },
              {
                name: "header_h_align",
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
          { name: "header_divider", selector: { boolean: {} } },
        ],
      },
      {
        name: "",
        type: "expandable",
        title: "Room Photo",
        iconPath: PHOTO_ICON_PATH,
        flatten: true,
        schema: this._photoSchema(),
      },
    ];
  }

  private _photoSchema(): unknown[] {
    const placement = (this._config?.photo_placement as PhotoPlacement) ?? "top";
    const schema: unknown[] = [
      { name: "show_photo", selector: { boolean: {} } },
      {
        name: "photo_source",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "bundled", label: "Bundled photos" },
              { value: "custom", label: "Custom photo" },
              { value: "camera", label: "Camera feed" },
            ],
          },
        },
      },
    ];
    if (this._config?.photo_source === "custom") {
      schema.push({ name: "photo_url", selector: { image: {} } });
    } else if (this._config?.photo_source === "camera") {
      schema.push({ name: "photo_camera_entity", selector: { entity: { domain: "camera" } } });
      schema.push({
        type: "grid",
        name: "",
        column_min_width: "100px",
        schema: [
          {
            name: "photo_camera_view",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "auto", label: "Auto thumbnail (default)" },
                  { value: "live", label: "Live stream" },
                ],
              },
            },
          },
          {
            name: "photo_camera_fit",
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "cover", label: "Cover (default)" },
                  { value: "contain", label: "Contain" },
                  { value: "fill", label: "Fill" },
                ],
              },
            },
          },
        ],
      });
    } else {
      schema.push({
        name: "photo",
        selector: { select: { mode: "dropdown", options: BUNDLED_PHOTO_OPTIONS } },
      });
    }
    schema.push({
      type: "grid",
      name: "",
      column_min_width: "100px",
      schema: [
        {
          name: "photo_placement",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "top", label: "Top of card (default)" },
                { value: "below_header", label: "Below header" },
                { value: "fill", label: "Fill card" },
              ],
            },
          },
        },
        {
          name: "photo_align",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "top", label: "Top" },
                { value: "center", label: "Center (default)" },
                { value: "bottom", label: "Bottom" },
              ],
            },
          },
        },
      ],
    });
    if (placement === "top" || placement === "below_header") {
      schema.push({
        type: "grid",
        name: "",
        column_min_width: "100px",
        schema: [
          {
            name: "photo_height",
            selector: { number: { min: 0, max: 1000, step: 10, mode: "box", unit_of_measurement: "px" } },
          },
          { name: "shift_buttons_down", selector: { boolean: {} } },
        ],
      });
    }
    schema.push({
      name: "photo_edge_gradient",
      selector: {
        select: {
          mode: "dropdown",
          multiple: true,
          options: [
            { value: "top", label: "Top" },
            { value: "left", label: "Left" },
            { value: "right", label: "Right" },
            { value: "bottom", label: "Bottom" },
          ],
        },
      },
    });
    schema.push({
      name: "photo_opacity",
      selector: { number: { min: 0, max: 100, step: 1, mode: "slider" } },
    });
    schema.push({ name: "photo_state_entity", selector: { entity: { multiple: true } } });
    if (hasPhotoStateEntity(this._config?.photo_state_entity)) {
      schema.push({
        type: "grid",
        name: "",
        column_min_width: "100px",
        schema: [
          { name: "photo_off_grayscale", selector: { boolean: {} } },
          {
            name: "photo_off_opacity",
            selector: { number: { min: 0, max: 100, step: 1, mode: "slider" } },
          },
        ],
      });
    }
    return schema;
  }

  private _computeLabel = (schema: { name: string; label?: string }): string =>
    schema.label ?? FIELD_LABELS[schema.name] ?? schema.name;

  // --- Mutations ------------------------------------------------------------

  private _type(): string {
    return this._config?.type ?? `custom:${ROOM_CARD_EDITOR_TYPE.replace("-editor", "")}`;
  }

  private _onBaseChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const value = ev.detail.value as Partial<RoomCardConfig> & { header_icon?: "none" | "standard" | "watermark" };
    // The synthetic "header_icon" select maps to show_header_icon + header_icon_style.
    const mode = value.header_icon ?? "none";
    const prevMode = !this._config?.show_header_icon
      ? "none"
      : this._config?.header_icon_style === "watermark"
        ? "watermark"
        : "standard";
    const showHeaderIcon = mode !== "none";
    const headerIconStyle = mode === "watermark" ? "watermark" : undefined;
    // Entering watermark seeds the 300% size called for by that mode.
    let headerIconSize = value.header_icon_size;
    if (mode === "watermark" && prevMode !== "watermark") {
      headerIconSize = 300;
    }
    this._commit({
      ...this._config,
      type: this._type(),
      area: value.area,
      name: value.name,
      icon: value.icon,
      theme: value.theme,
      brushed: value.brushed,
      background: value.background,
      transparency: value.transparency,
      blur: value.blur,
      show_header_icon: showHeaderIcon,
      header_icon_style: headerIconStyle,
      header_icon_size: headerIconSize,
      icon_transparency: value.icon_transparency,
      icon_bg_transparency: value.icon_bg_transparency,
      icon_color: value.icon_color,
      icon_bg_color: value.icon_bg_color,
      show_header_name: value.show_header_name,
      header_name_size: value.header_name_size,
      header_divider: value.header_divider,
      header_align: value.header_align,
      header_h_align: value.header_h_align,
      show_photo: value.show_photo,
      photo_source: value.photo_source,
      photo: value.photo,
      photo_url: value.photo_url,
      photo_camera_entity: value.photo_camera_entity,
      photo_camera_view: value.photo_camera_view,
      photo_camera_fit: value.photo_camera_fit,
      photo_placement: value.photo_placement,
      photo_height: value.photo_height,
      photo_align: value.photo_align,
      shift_buttons_down: value.shift_buttons_down,
      photo_edge_gradient: value.photo_edge_gradient,
      photo_opacity: value.photo_opacity,
      photo_state_entity: value.photo_state_entity,
      photo_off_grayscale: value.photo_off_grayscale,
      photo_off_opacity: value.photo_off_opacity,
      status_items: this._config?.status_items,
      sections: this._config?.sections,
    });
  };

  private _onSectionLayoutChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const value = ev.detail.value as { section_layout?: "stacked" | "tabbed" };
    this._commit({
      ...this._config,
      type: this._type(),
      section_layout: value.section_layout === "tabbed" ? "tabbed" : undefined,
    });
  };

  private _onStatusSettingsChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const value = ev.detail.value as {
      status_align?: "top" | "middle" | "bottom";
      status_icon_size?: number;
    };
    this._commit({
      ...this._config,
      type: this._type(),
      status_align: value.status_align,
      status_icon_size: value.status_icon_size,
    });
  };

  private _onStatusItemChanged(idx: number, type: RoomStatusItemType, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = (ev.detail?.value ?? {}) as Record<string, unknown>;
    const next = { ...value, type } as RoomStatusItem;
    if (next.display === STATUS_ITEM_DEFAULT_DISPLAY[type]) delete next.display;
    const items = [...(this._config?.status_items ?? [])];
    items[idx] = next;
    this._commit({ ...this._config, type: this._type(), status_items: items });
  }

  private _addStatusItem(type: RoomStatusItemType): void {
    const items = [...(this._config?.status_items ?? []), this._newStatusItem(type)];
    this._expanded = { ...this._expanded, [`status-${items.length - 1}`]: true };
    this._commit({ ...this._config, type: this._type(), status_items: items });
  }

  private _statusItemMoved = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const items = [...(this._config?.status_items ?? [])];
    if (oldIndex < 0 || oldIndex >= items.length) return;
    items.splice(newIndex, 0, items.splice(oldIndex, 1)[0]);
    this._buttonEditors.clear();
    this._commit({ ...this._config, type: this._type(), status_items: items });
  };

  private _deleteStatusItem(idx: number): void {
    const items = [...(this._config?.status_items ?? [])];
    items.splice(idx, 1);
    this._commit({ ...this._config, type: this._type(), status_items: items });
  }

  private _onSectionFieldChanged(sIdx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const value = (ev.detail?.value ?? {}) as {
      title?: string;
      icon?: string;
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
      icon: value.icon || undefined,
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

  private _sectionMoved = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const sections = [...(this._config?.sections ?? [])];
    if (oldIndex < 0 || oldIndex >= sections.length) return;
    sections.splice(newIndex, 0, sections.splice(oldIndex, 1)[0]);
    this._buttonEditors.clear();
    this._commit({ ...this._config, type: this._type(), sections });
  };

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

  private _buttonMoved(sIdx: number, ev: CustomEvent): void {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const sections = [...(this._config?.sections ?? [])];
    const section = sections[sIdx];
    if (!section) return;
    const buttons = [...(section.buttons ?? [])];
    if (oldIndex < 0 || oldIndex >= buttons.length) return;
    buttons.splice(newIndex, 0, buttons.splice(oldIndex, 1)[0]);
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
    if (!next.background) delete next.background;
    if (typeof next.transparency !== "number") delete next.transparency;
    if (typeof next.blur !== "number") delete next.blur;
    if (!next.area) delete next.area;
    if (!next.name) delete next.name;
    if (!next.icon) delete next.icon;
    if (!next.show_header_icon) delete next.show_header_icon;
    if (next.header_icon_style !== "watermark") delete next.header_icon_style;
    if (typeof next.header_icon_size !== "number" || !next.show_header_icon) delete next.header_icon_size;
    if (next.header_icon_style !== "watermark" || next.icon_transparency === 30 || typeof next.icon_transparency !== "number") {
      delete next.icon_transparency;
    }
    if (next.header_icon_style !== "watermark" || next.icon_bg_transparency === 70 || typeof next.icon_bg_transparency !== "number") {
      delete next.icon_bg_transparency;
    }
    if (next.header_icon_style !== "watermark" || !next.icon_color) delete next.icon_color;
    if (next.header_icon_style !== "watermark" || !next.icon_bg_color) delete next.icon_bg_color;
    if (next.show_header_name !== false) delete next.show_header_name;
    if (typeof next.header_name_size !== "number") delete next.header_name_size;
    if (next.header_divider !== true) delete next.header_divider;
    if (!next.header_align || next.header_align === "top") delete next.header_align;
    if (!next.header_h_align || next.header_h_align === "left") delete next.header_h_align;
    if (!next.status_align || next.status_align === "top") delete next.status_align;
    if (typeof next.status_icon_size !== "number" || next.status_icon_size === 100) delete next.status_icon_size;
    // Room photo defaults.
    if (next.show_photo !== false) delete next.show_photo;
    if (next.photo_source !== "custom" && next.photo_source !== "camera") delete next.photo_source;
    if (next.photo_source !== "custom" || !next.photo_url) delete next.photo_url;
    // Camera photo fields only persist for the camera source.
    if (next.photo_source !== "camera" || !next.photo_camera_entity) delete next.photo_camera_entity;
    if (next.photo_source !== "camera" || !next.photo_camera_view || next.photo_camera_view === "auto") {
      delete next.photo_camera_view;
    }
    if (next.photo_source !== "camera" || !next.photo_camera_fit || next.photo_camera_fit === "cover") {
      delete next.photo_camera_fit;
    }
    if (!next.photo || next.photo === "auto") delete next.photo;
    if (!next.photo_placement || next.photo_placement === "top") delete next.photo_placement;
    if (typeof next.photo_height !== "number") delete next.photo_height;
    if (!next.photo_align || next.photo_align === "center") delete next.photo_align;
    if (next.shift_buttons_down !== false) delete next.shift_buttons_down;
    if (typeof next.photo_opacity !== "number" || next.photo_opacity === 100) delete next.photo_opacity;
    if (!hasPhotoStateEntity(next.photo_state_entity)) {
      delete next.photo_state_entity;
      delete next.photo_off_grayscale;
      delete next.photo_off_opacity;
    } else {
      if (next.photo_off_grayscale !== true) delete next.photo_off_grayscale;
      if (typeof next.photo_off_opacity !== "number" || next.photo_off_opacity === 25) delete next.photo_off_opacity;
    }
    const placement = (next.photo_placement as PhotoPlacement) ?? "top";
    if (
      !Array.isArray(next.photo_edge_gradient) ||
      sameEdges(next.photo_edge_gradient, defaultEdgeGradient(placement))
    ) {
      delete next.photo_edge_gradient;
    }
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
      /* The panel renders its chevron as a flex sibling AFTER this slot inside an
         overflow:hidden summary. flex:1 + min-width:0 lets the header (and its
         clipping subtitle) shrink so the chevron always keeps its space; a plain
         width:100% here could let long header content push the chevron out. */
      flex: 1;
      min-width: 0;
    }
    .row-header ha-icon {
      color: var(--secondary-text-color);
      flex: none;
    }
    .row-header .drag-handle {
      display: flex;
      align-items: center;
      flex: none;
      margin: -6px 2px -6px -6px;
      padding: 6px 2px;
      cursor: grab;
      touch-action: none;
      color: var(--secondary-text-color);
    }
    .row-header .drag-handle ha-icon {
      pointer-events: none;
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
      flex: 1 1 0;
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
