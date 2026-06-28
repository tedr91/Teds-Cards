import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type HomeAssistant, type LovelaceCardEditor, fireEvent } from "custom-card-helpers";

import { transparencyBlurSchema } from "../../shared/appearance";
import {
  APP_LAUNCH_SLOTS,
  KALEIDESCAPE_HOME_OPTIONS,
  REMOTE_CARD_EDITOR_TYPE,
  REMOTE_INTEGRATIONS,
  entityFamily,
} from "./const";
import type { DeviceFamily, RemoteCardConfig } from "./types";

// mdi:remote — App Launchers section
const APPS_ICON_PATH =
  "M20,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M4,18V6H20V18H4M6,8H8V10H6V8M6,11H8V13H6V11M6,14H8V16H6V14M9,14H15V16H9V14M16,14H18V16H16V14M9,11H15V13H9V11M16,11H18V13H16V11M9,8H18V10H9V8Z";

// mdi:cog — Behaviors section
const BEHAVIORS_ICON_PATH =
  "M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z";

@customElement(REMOTE_CARD_EDITOR_TYPE)
export class TedRemoteCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: RemoteCardConfig;

  public setConfig(config: RemoteCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;

    const data = { ...this._defaults(), ...this._config };

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${this._schema()}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _family(): DeviceFamily {
    return (
      this._config?.device_family ??
      entityFamily(this.hass, this._config?.remote_entity) ??
      "apple-tv"
    );
  }

  private _defaults(): Partial<RemoteCardConfig> {
    return {
      theme: "manufacturer",
      brushed: false,
      transparency: undefined,
      blur: undefined,
      show_icon: true,
      icon_scale: 100,
      show_name: false,
      name_scale: 100,
      scale: 100,
      show_status_indicator: false,
      kaleidescape_home: "home",
    };
  }

  /** Source names exposed by the configured media_player (used for app-launch dropdowns). */
  private _sourceList(): string[] {
    const mp = this._config?.media_player_entity;
    const list = mp ? this.hass?.states[mp]?.attributes?.source_list : undefined;
    return Array.isArray(list) ? (list as string[]) : [];
  }

  private _appLaunchSelector() {
    const sources = this._sourceList();
    if (sources.length) {
      return {
        select: {
          mode: "dropdown" as const,
          custom_value: true,
          options: sources.map((s) => ({ value: s, label: s })),
        },
      };
    }
    return { text: {} };
  }

  private _schema() {
    // Entities are limited to the two supported integrations; the device family
    // is auto-detected from whichever entity the user selects (no dropdown).
    const remoteFilter = [
      { domain: "remote", integration: REMOTE_INTEGRATIONS["apple-tv"] },
      { domain: "remote", integration: REMOTE_INTEGRATIONS.kaleidescape },
    ];
    const mediaFilter = [
      { domain: "media_player", integration: REMOTE_INTEGRATIONS["apple-tv"] },
      { domain: "media_player", integration: REMOTE_INTEGRATIONS.kaleidescape },
    ];

    const sections: Array<Record<string, unknown>> = [
      {
        type: "grid",
        name: "",
        schema: [
          {
            name: "remote_entity",
            required: true,
            selector: { entity: { filter: remoteFilter } },
          },
          {
            name: "media_player_entity",
            selector: { entity: { filter: mediaFilter } },
          },
        ],
      },
      { name: "name", selector: { text: {} } },
    ];

    const visual: Array<Record<string, unknown>> = [
      {
        name: "theme",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "manufacturer", label: "Manufacturer's Style (default)" },
              { value: "ted-style", label: "Ted's Style" },
              { value: "ha", label: "Home Assistant theme" },
            ],
          },
        },
      },
      { name: "background", selector: { ui_color: {} } },
      transparencyBlurSchema(this._config?.transparency),
      { name: "brushed", selector: { boolean: {} } },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "show_icon", selector: { boolean: {} } },
          {
            name: "icon_scale",
            disabled: this._config?.show_icon === false,
            selector: { number: { min: 10, max: 300, step: 5, mode: "box", unit_of_measurement: "%" } },
          },
        ],
      },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "show_name", selector: { boolean: {} } },
          {
            name: "name_scale",
            disabled: this._config?.show_name !== true,
            selector: { number: { min: 10, max: 300, step: 5, mode: "box", unit_of_measurement: "%" } },
          },
        ],
      },
      {
        name: "scale",
        selector: { number: { min: 50, max: 200, step: 5, mode: "box", unit_of_measurement: "%" } },
      },
      { name: "show_status_indicator", selector: { boolean: {} } },
    ];

    sections.push({
      name: "",
      type: "expandable",
      title: "Appearance (general)",
      iconPath:
        "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z",
      flatten: true,
      schema: visual,
    });

    // Behaviors — device-family-specific button behavior (Kaleidescape Home target).
    if (this._family() === "kaleidescape") {
      sections.push({
        name: "",
        type: "expandable",
        title: "Behaviors",
        iconPath: BEHAVIORS_ICON_PATH,
        flatten: true,
        schema: [
          {
            name: "kaleidescape_home",
            selector: {
              select: { mode: "dropdown", options: KALEIDESCAPE_HOME_OPTIONS },
            },
          },
        ],
      });
    }

    // App launchers — Apple TV only (Kaleidescape has no app launching).
    if (this._family() === "apple-tv") {
      const selector = this._appLaunchSelector();
      const launcherSchema: Array<Record<string, unknown>> = [];
      for (let i = 1; i <= APP_LAUNCH_SLOTS; i++) {
        launcherSchema.push({ name: `app_launch_${i}`, selector });
      }
      sections.push({
        name: "",
        type: "expandable",
        title: "App Launchers",
        iconPath: APPS_ICON_PATH,
        flatten: true,
        schema: launcherSchema,
      });
    }

    return sections;
  }

  private _computeLabel = (schema: { name: string }): string => {
    if (schema.name.startsWith("app_launch_")) {
      return `App launch ${schema.name.slice("app_launch_".length)}`;
    }
    switch (schema.name) {
      case "device_family":
        return "Device family";
      case "remote_entity":
        return "Remote entity";
      case "media_player_entity":
        return "Media player entity (recommended)";
      case "name":
        return "Name (optional)";
      case "kaleidescape_home":
        return "Home button target";
      case "theme":
        return "Visual styling";
      case "background":
        return "Background color";
      case "transparency":
        return "Transparency";
      case "blur":
        return "Background blur";
      case "brushed":
        return "Brushed effect";
      case "show_icon":
        return "Show icon";
      case "icon_scale":
        return "Icon size";
      case "show_name":
        return "Show name";
      case "name_scale":
        return "Name size";
      case "scale":
        return "Card scale";
      case "show_status_indicator":
        return "Show status indicator";
      default:
        return schema.name;
    }
  };

  private _valueChanged = (ev: CustomEvent): void => {
    const previousFamily = this._family();
    const previousRemote = this._config?.remote_entity;
    const config = { ...ev.detail.value } as RemoteCardConfig;
    const mutable = config as Partial<RemoteCardConfig>;

    // Auto-detect the device family from the selected remote entity's integration.
    const family = entityFamily(this.hass, config.remote_entity) ?? previousFamily;
    config.device_family = family;

    // Picking an entity from the other integration switches families: drop the
    // media player + launchers that belonged to the previous family.
    if (family !== previousFamily) {
      delete mutable.media_player_entity;
      for (let i = 1; i <= APP_LAUNCH_SLOTS; i++) {
        delete mutable[`app_launch_${i}` as keyof RemoteCardConfig];
      }
    }

    // When the remote entity is (re)selected and no media player is set yet, try
    // to auto-fill the matching media_player (same device first, then by name).
    if (
      config.remote_entity &&
      config.remote_entity !== previousRemote &&
      !config.media_player_entity
    ) {
      const match = this._matchMediaPlayer(config.remote_entity, family);
      if (match) config.media_player_entity = match;
    }

    // Kaleidescape has no app launchers — never persist them.
    if (family === "kaleidescape") {
      for (let i = 1; i <= APP_LAUNCH_SLOTS; i++) {
        delete mutable[`app_launch_${i}` as keyof RemoteCardConfig];
      }
    } else {
      // Home-target selection only applies to Kaleidescape.
      delete mutable.kaleidescape_home;
    }

    // Strip values equal to their default so the saved YAML stays minimal.
    const defaults = this._defaults();
    for (const key of Object.keys(defaults) as Array<keyof RemoteCardConfig>) {
      if (config[key] === defaults[key]) {
        delete mutable[key];
      }
    }
    if (!config.media_player_entity) delete mutable.media_player_entity;
    if (!config.name || !config.name.trim()) delete mutable.name;
    if (!config.background) delete mutable.background;

    fireEvent(this, "config-changed", { config });
  };

  /**
   * Find the media_player that best matches a remote entity: first an entity on
   * the same device, then one whose name (object_id) matches, restricted to the
   * family's integration.
   */
  private _matchMediaPlayer(remoteId: string, family: DeviceFamily): string | undefined {
    const hass = this.hass;
    if (!hass) return undefined;
    const registry = (hass as unknown as {
      entities?: Record<string, { device_id?: string; platform?: string }>;
    }).entities;
    const integration = REMOTE_INTEGRATIONS[family];
    const candidates = Object.keys(hass.states).filter((id) => id.startsWith("media_player."));

    // 1) Same device as the remote.
    const deviceId = registry?.[remoteId]?.device_id;
    if (deviceId) {
      const byDevice = candidates.find((id) => registry?.[id]?.device_id === deviceId);
      if (byDevice) return byDevice;
    }

    // 2) Same integration + matching name (object_id), exact then fuzzy.
    const sameIntegration = candidates.filter(
      (id) => !registry || registry[id]?.platform === integration,
    );
    const remoteObj = remoteId.split(".")[1] ?? "";
    const exact = sameIntegration.find((id) => (id.split(".")[1] ?? "") === remoteObj);
    if (exact) return exact;
    return sameIntegration.find((id) => {
      const obj = id.split(".")[1] ?? "";
      return obj.includes(remoteObj) || remoteObj.includes(obj);
    });
  }

  static styles = css`
    :host {
      display: block;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-remote-card-editor": TedRemoteCardEditor;
  }
}
