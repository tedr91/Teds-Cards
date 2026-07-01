import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { transparencyBlurSchema } from "../../shared/appearance";
import {
  TIMER_CARD_EDITOR_TYPE,
  TIMER_SECTION_META,
  TIMER_SECTION_ORDER,
  resolveTimerSectionOrder,
  type TimerSection,
} from "./const";
import type { TimerCardConfig } from "./types";

// mdi:palette — Appearance section
const APPEARANCE_ICON_PATH =
  "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";
// mdi:view-agenda-outline — Sections group
const SECTIONS_ICON_PATH =
  "M20,3H4C2.89,3 2,3.89 2,5V9C2,10.11 2.89,11 4,11H20C21.11,11 22,10.11 22,9V5C22,3.89 21.11,3 20,3M20,9H4V5H20V9M20,13H4C2.89,13 2,13.89 2,15V19C2,20.11 2.89,21 4,21H20C21.11,21 22,20.11 22,19V15C22,13.89 21.11,13 20,13M20,19H4V15H20V19Z";
// mdi:drag — reorder handle
const GRIP_ICON_PATH =
  "M7,19V17H9V19H7M11,19V17H13V19H11M15,19V17H17V19H15M7,15V13H9V15H7M11,15V13H13V15H11M15,15V13H17V15H15M7,11V9H9V11H7M11,11V9H13V11H11M15,11V9H17V11H15M7,7V5H9V7H7M11,7V5H13V7H11M15,7V5H17V7H15Z";

@customElement(TIMER_CARD_EDITOR_TYPE)
export class TedTimerCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: TimerCardConfig;

  public setConfig(config: TimerCardConfig): void {
    this._config = config;
  }

  private _defaults(): Partial<TimerCardConfig> {
    return {
      theme: "ha",
      brushed: false,
      shadow: true,
      show_active: true,
      show_add: true,
      show_recent: true,
      transparency: undefined,
      blur: undefined,
    };
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const data = { ...this._defaults(), ...this._config };
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${this._topSchema()}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
      ${this._renderSections()}
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${this._appearanceSchema()}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _topSchema() {
    return [
      { name: "title", selector: { text: {} } },
      { name: "entity", selector: { entity: { domain: "sensor" } } },
      { name: "show_add", selector: { boolean: {} } },
    ];
  }

  private _appearanceSchema() {
    return [
      {
        name: "",
        type: "expandable",
        title: "Appearance",
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
          transparencyBlurSchema(this._config?.transparency),
          {
            type: "grid",
            name: "",
            column_min_width: "100px",
            schema: [
              { name: "brushed", selector: { boolean: {} } },
              { name: "shadow", selector: { boolean: {} } },
            ],
          },
        ],
      },
    ];
  }

  // --- Sections (drag-to-reorder + show toggle) -----------------------------

  private _sectionOrder(): TimerSection[] {
    return resolveTimerSectionOrder(this._config?.section_order);
  }

  private _sectionMoved = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail as { oldIndex: number; newIndex: number };
    const order = this._sectionOrder();
    order.splice(newIndex, 0, order.splice(oldIndex, 1)[0]);
    this._commit({ ...this._config, section_order: order } as TimerCardConfig);
  };

  private _toggleShow(showKey: keyof TimerCardConfig, ev: Event): void {
    ev.stopPropagation();
    const checked = (ev.target as HTMLInputElement).checked;
    this._commit({ ...this._config, [showKey]: checked } as TimerCardConfig);
  }

  private _renderSections(): TemplateResult {
    const order = this._sectionOrder();
    return html`
      <div class="sections-block">
        <div class="sections-label">
          <ha-svg-icon .path=${SECTIONS_ICON_PATH}></ha-svg-icon>
          <span>Sections</span>
        </div>
        <ha-sortable handle-selector=".drag-handle" @item-moved=${this._sectionMoved}>
          <div class="sections">
            ${repeat(
              order,
              (s) => s,
              (s) => {
                const meta = TIMER_SECTION_META[s];
                const show = this._config?.[meta.showKey] ?? true;
                return html`
                  <div class="section-chip">
                    <div class="drag-handle" title="Drag to reorder">
                      <ha-svg-icon .path=${GRIP_ICON_PATH}></ha-svg-icon>
                    </div>
                    <span class="section-title">${meta.label}</span>
                    <ha-switch
                      .checked=${show}
                      @change=${(ev: Event) => this._toggleShow(meta.showKey, ev)}
                    ></ha-switch>
                  </div>
                `;
              },
            )}
          </div>
        </ha-sortable>
      </div>
    `;
  }

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "title":
        return "Title";
      case "entity":
        return "Timers sensor (optional)";
      case "show_add":
        return "Show add button";
      case "theme":
        return "Visual styling";
      case "transparency":
        return "Transparency";
      case "blur":
        return "Background blur";
      case "brushed":
        return "Brushed effect";
      case "shadow":
        return "Subtle shadow for improved contrast";
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    this._commit({ ...this._config, ...ev.detail.value } as TimerCardConfig);
  };

  private _commit(config: TimerCardConfig): void {
    const next = { ...config };
    const defaults = this._defaults();
    for (const key of Object.keys(defaults) as Array<keyof TimerCardConfig>) {
      if (next[key] === defaults[key]) delete next[key];
    }
    if (!next.title) delete next.title;
    if (!next.entity) delete next.entity;
    if (Array.isArray(next.section_order) && this._isDefaultSectionOrder(next.section_order)) {
      delete next.section_order;
    }
    fireEvent(this, "config-changed", { config: next });
  }

  private _isDefaultSectionOrder(order: string[]): boolean {
    return (
      order.length === TIMER_SECTION_ORDER.length &&
      order.every((s, i) => s === TIMER_SECTION_ORDER[i])
    );
  }

  static styles = css`
    :host {
      display: block;
    }
    .sections-block {
      margin: 4px 0 8px;
    }
    .sections-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
      color: var(--secondary-text-color);
      margin: 12px 0 8px;
    }
    .sections {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .section-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      padding-right: 8px;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
      border-radius: 8px;
      background: var(--secondary-background-color, rgba(255, 255, 255, 0.03));
    }
    .drag-handle {
      display: flex;
      align-items: center;
      padding: 10px 4px 10px 10px;
      color: var(--secondary-text-color);
      cursor: grab;
      touch-action: none;
    }
    .drag-handle > * {
      pointer-events: none;
    }
    .section-title {
      flex: 1 1 auto;
      font-weight: 500;
      padding: 10px 4px;
    }
    .section-chip ha-switch {
      flex: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-timer-card-editor": TedTimerCardEditor;
  }
}
