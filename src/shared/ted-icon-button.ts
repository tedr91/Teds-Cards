import { LitElement, css, html, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Small, theme-consistent inline icon control shared by the cards (alarm/timer
 * row controls: pause, resume, edit, delete, …). A thin wrapper around HA's
 * `ha-icon-button` that standardises sizing and colour via `--ted-style-*`
 * tokens so every card's inline buttons look and feel the same.
 *
 * - `icon`  — MDI icon name.
 * - `label` — accessible label (also the tooltip).
 * - `tone`  — "muted" (default), "accent" (filled accent), or "danger".
 * - `disabled` — passthrough.
 *
 * Size is controlled by the inherited custom properties `--ted-ib-size` and
 * `--ted-ib-icon`, so a host card can shrink the buttons (e.g. in a container
 * query) without reaching into this element's shadow root.
 */
@customElement("ted-icon-button")
export class TedIconButton extends LitElement {
  @property() public icon = "";
  @property() public label = "";
  @property({ reflect: true }) public tone: "muted" | "accent" | "danger" = "muted";
  @property({ type: Boolean, reflect: true }) public disabled = false;

  protected render(): TemplateResult {
    return html`
      <ha-icon-button .label=${this.label} ?disabled=${this.disabled}>
        <ha-icon icon=${this.icon}></ha-icon>
      </ha-icon-button>
    `;
  }

  static styles = css`
    :host {
      display: inline-flex;
      flex: none;
      --ted-ib-size: 28px;
      --ted-ib-icon: 24px;
    }
    ha-icon-button {
      --mdc-icon-button-size: var(--ted-ib-size);
      --mdc-icon-size: var(--ted-ib-icon);
      border-radius: var(--ted-style-radius-sm, 6px);
      color: var(--ted-style-muted, var(--secondary-text-color, #6f6f6f));
    }
    :host([tone="accent"]) ha-icon-button {
      color: var(--ted-style-on-accent, var(--text-primary-color, #fff));
      background: var(--ted-style-accent, var(--primary-color, #2196f3));
    }
    :host([tone="danger"]) ha-icon-button {
      color: var(--ted-style-danger, var(--error-color, #e5484d));
    }
    :host([disabled]) {
      opacity: 0.4;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-icon-button": TedIconButton;
  }
}
