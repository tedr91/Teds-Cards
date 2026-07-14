import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { CALENDAR_CARD_EDITOR_TYPE } from "./const";
import type { CalendarCardConfig, CalendarSource } from "./types";

const SOURCE_OPTIONS = [
  { value: "settings", label: "This device's Settings calendars" },
  { value: "config", label: "This card (choose below)" },
];

const VIEW_OPTIONS = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "schedule", label: "Schedule" },
  { value: "agenda", label: "Agenda" },
];

@customElement(CALENDAR_CARD_EDITOR_TYPE)
export class TedCalendarCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: CalendarCardConfig;

  public setConfig(config: CalendarCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const source: CalendarSource = this._config.calendar_source ?? "settings";
    const topData = {
      calendar_source: source,
      default_view: this._config.default_view ?? "month",
      fill: this._config.fill ?? false,
    };
    const topSchema = [
      { name: "calendar_source", selector: { select: { mode: "dropdown", options: SOURCE_OPTIONS } } },
      { name: "default_view", selector: { select: { mode: "dropdown", options: VIEW_OPTIONS } } },
      { name: "fill", selector: { boolean: {} } },
    ];

    const entitiesSchema = [
      {
        name: "entities",
        selector: { entity: { domain: "calendar", multiple: true } },
      },
    ];

    return html`
      <div class="editor">
        <ha-form
          .hass=${this.hass}
          .data=${topData}
          .schema=${topSchema}
          .computeLabel=${this._computeLabel}
          .computeHelper=${this._computeHelper}
          @value-changed=${this._valueChanged}
        ></ha-form>
        ${source === "settings"
          ? html`<div class="settings-note">
              Calendars are chosen per-device in <b>Settings → Calendars</b>. Global lists the
              available calendars; each device curates its own subset. Ted's default calendars are
              used when none are set.
            </div>`
          : html`<ha-form
              .hass=${this.hass}
              .data=${{ entities: this._config.entities ?? [] }}
              .schema=${entitiesSchema}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._entitiesChanged}
            ></ha-form>`}
      </div>
    `;
  }

  private _computeHelper = (schema: { name: string }): string | undefined => {
    if (schema.name === "calendar_source") {
      return "\"This device's Settings calendars\" uses the per-device Calendars list from Ted's Cards Settings.";
    }
    if (schema.name === "default_view") {
      return "The Daylight Calendar view the card opens on.";
    }
    if (schema.name === "fill") {
      return "Fill the parent container (e.g. a dashboard view area) instead of sizing to content.";
    }
    return undefined;
  };

  private _computeLabel = (schema: { name: string }): string => {
    switch (schema.name) {
      case "calendar_source":
        return "Calendar source";
      case "default_view":
        return "Default view";
      case "fill":
        return "Fill available space";
      case "entities":
        return "Calendars";
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    this._commit({ ...this._config, ...ev.detail.value } as CalendarCardConfig);
  };

  private _entitiesChanged = (ev: CustomEvent): void => {
    ev.stopPropagation();
    const entities = (ev.detail.value?.entities ?? []) as string[];
    this._commit({ ...this._config, entities } as CalendarCardConfig);
  };

  private _commit(config: CalendarCardConfig): void {
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  static styles = css`
    .editor {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .settings-note {
      font-size: 0.9rem;
      line-height: 1.4;
      color: var(--secondary-text-color);
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.12));
      border-radius: 8px;
      padding: 10px 12px;
    }
  `;
}
