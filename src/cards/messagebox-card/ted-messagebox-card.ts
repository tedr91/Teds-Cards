import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardEditor,
  fireEvent,
} from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import { tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import { viewAssistNavigate } from "../../shared/view-assist";
import { isVisible } from "../../shared/conditions";
import {
  DISMISS_STORAGE_PREFIX,
  MESSAGEBOX_CARD_DESCRIPTION,
  MESSAGEBOX_CARD_EDITOR_TYPE,
  MESSAGEBOX_CARD_NAME,
  MESSAGEBOX_CARD_TYPE,
} from "./const";
import type { MessageBoxAction, MessageBoxCardConfig } from "./types";

/**
 * A dismissible message banner with optional action buttons. Think of it as a
 * Lovelace MessageBox: a title, message, icon and buttons that can be shown
 * inline, pinned to a screen edge, or as a centered modal.
 *
 * Dismissal is CSS-safe (no inline scripts): `dismiss` writes a persistent
 * flag, `dismiss-session` a per-session flag, both keyed by `dismiss_key`.
 * Optional `visibility` conditions (the shared engine: `screen`, `view-assist`,
 * `card`, `state`, …) gate whether the card is shown.
 */
@customElement(MESSAGEBOX_CARD_TYPE)
export class TedMessageBoxCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-messagebox-card-editor");
    return document.createElement(MESSAGEBOX_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(): Omit<MessageBoxCardConfig, "type"> {
    return {
      severity: "info",
      icon: "mdi:information-outline",
      title: "Heads up",
      message: "This is a dismissible message. Add actions and a dismiss_key as needed.",
      dismiss_key: "ted-mb-example",
      actions: [{ label: "Got it", action: "dismiss", variant: "primary" }],
    };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: MessageBoxCardConfig;
  @state() private _dismissed = false;

  public setConfig(config: MessageBoxCardConfig): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = { ...config };
    this._dismissed = false;
  }

  public getCardSize(): number {
    return this._hidden ? 0 : 2;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("resize", this._onViewportChange);
    window.addEventListener("view-assist-responsive-change", this._onViewportChange);
  }

  public disconnectedCallback(): void {
    window.removeEventListener("resize", this._onViewportChange);
    window.removeEventListener("view-assist-responsive-change", this._onViewportChange);
    super.disconnectedCallback();
  }

  private _onViewportChange = (): void => {
    this.requestUpdate();
  };

  // --- Visibility ------------------------------------------------------------

  private get _hidden(): boolean {
    return (
      !this._config ||
      this._dismissed ||
      this._isDismissed() ||
      !isVisible(undefined, this._config.visibility, this.hass)
    );
  }

  private _isDismissed(): boolean {
    const key = this._config?.dismiss_key;
    if (!key) return false;
    const k = `${DISMISS_STORAGE_PREFIX}${key}`;
    try {
      return window.localStorage.getItem(k) === "1" || window.sessionStorage.getItem(k) === "1";
    } catch {
      return false;
    }
  }

  // --- Actions ---------------------------------------------------------------

  private _runAction(a: MessageBoxAction): void {
    switch (a.action) {
      case "dismiss":
        this._applyDismiss(true);
        break;
      case "dismiss-session":
        this._applyDismiss(false);
        break;
      case "view-assist-navigate":
        viewAssistNavigate(this.hass, a.view || "home");
        break;
      case "navigate":
        if (a.navigation_path) {
          window.history.pushState(null, "", a.navigation_path);
          window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
        }
        break;
      case "url":
        if (a.url_path) window.open(a.url_path, "_blank", "noopener");
        break;
      case "perform-action":
      case "call-service": {
        const svc = a.perform_action || a.service;
        if (svc && this.hass && svc.includes(".")) {
          const [domain, ...rest] = svc.split(".");
          this.hass.callService(
            domain,
            rest.join("."),
            a.data || {},
            a.target as never,
          );
        }
        break;
      }
      case "more-info":
        if (a.entity) fireEvent(this, "hass-more-info", { entityId: a.entity });
        break;
      default:
        break;
    }
  }

  private _applyDismiss(persistent: boolean): void {
    const key = this._config?.dismiss_key;
    if (key) {
      try {
        const store = persistent ? window.localStorage : window.sessionStorage;
        store.setItem(`${DISMISS_STORAGE_PREFIX}${key}`, "1");
      } catch {
        /* storage may be unavailable (private mode) — fall back to in-memory hide */
      }
    }
    this._dismissed = true;
  }

  // --- Render ----------------------------------------------------------------

  protected updated(): void {
    // Collapse layout when not shown (so an inactive banner takes no space).
    this.toggleAttribute("hidden", this._hidden);
  }

  protected render(): TemplateResult | typeof nothing {
    const cfg = this._config;
    if (!cfg || this._hidden) return nothing;

    const severity = cfg.severity ?? "info";
    const display = cfg.display ?? "inline";
    const themeClass = tedCardThemeClass(cfg.theme ?? "ha");
    const actions = cfg.actions ?? [];
    const displayClass =
      display === "pinned"
        ? `mb-pinned mb-pinned--${cfg.pinned_side ?? "top"}`
        : display === "modal"
          ? "mb-modal"
          : "mb-inline";

    const box = html`
      <div
        class="mb-box mb-sev-${severity} ${themeClass} ${displayClass} ${cfg.shadow === false
          ? ""
          : "mb-shadow"}"
        style=${styleMap(this._boxVars())}
        role=${display === "modal" ? "alertdialog" : "status"}
        aria-live="polite"
      >
        ${cfg.icon ? html`<ha-icon class="mb-icon" .icon=${cfg.icon}></ha-icon>` : nothing}
        <div class="mb-content">
          ${cfg.title ? html`<div class="mb-title">${cfg.title}</div>` : nothing}
          ${cfg.message ? html`<div class="mb-message">${cfg.message}</div>` : nothing}
          ${cfg.docs_url
            ? html`<a
                class="mb-docs"
                href=${cfg.docs_url}
                target="_blank"
                rel="noopener noreferrer"
                >${cfg.docs_label ?? "Learn more"} ›</a
              >`
            : nothing}
          ${actions.length
            ? html`<div class="mb-actions">
                ${actions.map(
                  (a) => html`<button
                    class="mb-btn ${a.variant === "primary" ? "mb-btn--primary" : "mb-btn--secondary"}"
                    @click=${() => this._runAction(a)}
                  >
                    ${a.icon ? html`<ha-icon class="mb-btn-icon" .icon=${a.icon}></ha-icon>` : nothing}
                    <span>${a.label ?? ""}</span>
                  </button>`,
                )}
              </div>`
            : nothing}
        </div>
      </div>
    `;

    if (display === "modal") {
      return html`<div class="mb-backdrop">${box}</div>`;
    }
    return box;
  }

  private _boxVars(): Record<string, string> {
    const cfg = this._config;
    const v: Record<string, string> = {};
    if (cfg && typeof cfg.transparency === "number") {
      const alpha = Math.max(0, Math.min(100, 100 - cfg.transparency));
      v["--mb-bg-alpha"] = `${alpha}%`;
    }
    if (cfg && typeof cfg.blur === "number") v["--mb-blur"] = `${cfg.blur}px`;
    return v;
  }

  static styles = [
    tedStyleTheme,
    css`
      :host {
        display: block;
      }
      :host([hidden]) {
        display: none !important;
      }

      .mb-box {
        /* surface + accent defaults (overridden per theme/severity below) */
        --mb-surface: 28, 32, 44;
        --mb-accent: var(--ted-style-accent, #4cc2ff);
        box-sizing: border-box;
        display: flex;
        gap: 14px;
        align-items: flex-start;
        padding: 16px 18px;
        border-radius: var(--ted-style-radius);
        color: var(--ted-style-text, #fff);
        background: rgba(var(--mb-surface), var(--mb-bg-alpha, 0.62));
        backdrop-filter: blur(var(--mb-blur, 22px)) saturate(150%);
        -webkit-backdrop-filter: blur(var(--mb-blur, 22px)) saturate(150%);
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-left: 4px solid var(--mb-accent);
        font-family: inherit;
        animation: mb-in 0.22s ease-out both;
      }
      .mb-box.mb-shadow {
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.16);
      }

      /* Follow the active HA theme for the surface/text when theme: ha. */
      .mb-box.ted-card--theme-ha {
        color: var(--primary-text-color, #1c1c1c);
        background: var(--ha-card-background, var(--card-background-color, #fff));
        border: 1px solid var(--divider-color, rgba(120, 120, 120, 0.22));
        border-left: 4px solid var(--mb-accent);
        /* Use the theme's own card frost: translucent HA themes (Win11 Mica) blur the
           backdrop; opaque themes leave it unset -> no blur. */
        backdrop-filter: var(--ha-card-backdrop-filter, none);
        -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
      }

      /* Severity accents */
      .mb-sev-info {
        --mb-accent: #4cc2ff;
      }
      .mb-sev-success {
        --mb-accent: #6ccb5f;
      }
      .mb-sev-warning {
        --mb-accent: #ffb454;
      }
      .mb-sev-danger {
        --mb-accent: #ff99a4;
      }
      .mb-sev-tip {
        --mb-accent: #9b6cff;
      }

      .mb-icon {
        color: var(--mb-accent);
        --mdc-icon-size: 26px;
        flex: 0 0 auto;
        margin-top: 1px;
      }
      .mb-content {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
        flex: 1 1 auto;
      }
      .mb-title {
        font-size: 1.1em;
        font-weight: 600;
        letter-spacing: 0.01em;
      }
      .mb-message {
        font-size: 0.92em;
        line-height: 1.35;
        opacity: 0.92;
      }
      .mb-docs {
        font-size: 0.9em;
        color: var(--mb-accent);
        text-decoration: none;
        width: max-content;
      }
      .mb-docs:hover {
        text-decoration: underline;
      }

      .mb-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 6px;
      }
      .mb-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border-radius: var(--ted-style-radius-sm);
        font: inherit;
        font-size: 0.9em;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.22);
        color: inherit;
        background: rgba(255, 255, 255, 0.08);
        transition: background 0.15s ease, transform 0.05s ease;
      }
      .mb-btn:hover {
        background: rgba(255, 255, 255, 0.16);
      }
      .mb-btn:active {
        transform: translateY(1px);
      }
      .mb-btn--primary {
        background: var(--mb-accent);
        border-color: transparent;
        color: var(--ted-style-on-accent, #000);
      }
      .mb-btn--primary:hover {
        filter: brightness(1.08);
        background: var(--mb-accent);
      }
      .mb-btn-icon {
        --mdc-icon-size: 18px;
      }

      /* Pinned */
      .mb-pinned {
        position: fixed;
        left: 50%;
        transform: translateX(-50%);
        width: min(92vw, 720px);
        z-index: 10000;
      }
      .mb-pinned--top {
        top: 12px;
      }
      .mb-pinned--center {
        top: 50%;
        transform: translate(-50%, -50%);
      }
      .mb-pinned--bottom {
        bottom: 12px;
      }

      /* Modal */
      .mb-backdrop {
        position: fixed;
        inset: 0;
        z-index: 10001;
        display: grid;
        place-items: center;
        padding: 16px;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
        animation: mb-fade 0.2s ease-out both;
      }
      .mb-modal {
        width: min(92vw, 460px);
        flex-direction: column;
        align-items: stretch;
      }
      .mb-modal .mb-actions {
        justify-content: flex-end;
      }

      @keyframes mb-in {
        from {
          opacity: 0;
          transform: translateY(-6px) scale(0.985);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      .mb-pinned.mb-box {
        animation-name: mb-in;
      }
      @keyframes mb-fade {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
    `,
  ];
}

registerCustomCard({
  type: MESSAGEBOX_CARD_TYPE,
  name: MESSAGEBOX_CARD_NAME,
  description: MESSAGEBOX_CARD_DESCRIPTION,
});

declare global {
  interface HTMLElementTagNameMap {
    "ted-messagebox-card": TedMessageBoxCard;
  }
}
