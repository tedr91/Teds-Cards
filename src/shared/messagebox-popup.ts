import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";

/** Severity looks mirror the MessageBox card's accent stripe. */
export type MessagePopupSeverity = "info" | "success" | "warning" | "danger" | "tip";

const SEVERITY_ICON: Record<MessagePopupSeverity, string> = {
  info: "mdi:information-outline",
  success: "mdi:check-circle-outline",
  warning: "mdi:alert-outline",
  danger: "mdi:alert-circle-outline",
  tip: "mdi:lightbulb-on-outline",
};

/** A button rendered on a toast; `handler` runs, then the toast is dismissed. */
export interface ToastAction {
  label: string;
  handler: () => void;
  primary?: boolean;
}

export interface MessagePopupOptions {
  /** Bold heading line. */
  title?: string;
  /** Accent-coloured lead phrase shown before the message (e.g. the timer name). */
  emphasis?: string;
  /** The message body. */
  message: string;
  severity?: MessagePopupSeverity;
  /** MDI icon; defaults to a severity-appropriate icon. */
  icon?: string;
  /** Action buttons. */
  actions?: ToastAction[];
  /** Auto-dismiss after this many ms (default 10000). 0 = stay until dismissed. */
  duration?: number;
  /** De-dupe key: a second call with the same key while one is showing is ignored. */
  key?: string;
}

interface ActiveMessage extends MessagePopupOptions {
  id: number;
}

/**
 * A body-level toast layer that renders dismissable messages styled like Ted's
 * MessageBox card (translucent surface, left accent stripe, accent icon). Cards
 * push messages through `showMessageBox(...)`; a single shared layer is created
 * lazily and stacks toasts bottom-centre.
 */
@customElement("ted-message-popup-layer")
export class TedMessagePopupLayer extends LitElement {
  @state() private _msgs: ActiveMessage[] = [];
  private _seq = 0;

  public push(opts: MessagePopupOptions): void {
    if (opts.key && this._msgs.some((m) => m.key === opts.key)) return;
    const id = ++this._seq;
    const msg: ActiveMessage = { severity: "info", duration: 10000, ...opts, id };
    this._msgs = [...this._msgs, msg];
    if (msg.duration && msg.duration > 0) {
      window.setTimeout(() => this._dismiss(id), msg.duration);
    }
  }

  private _dismiss(id: number): void {
    this._msgs = this._msgs.filter((m) => m.id !== id);
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._msgs.length) return nothing;
    return html`
      <div class="stack">
        ${this._msgs.map(
          (m) => html`
            <div class="mb-box mb-sev-${m.severity ?? "info"}" role="status">
              <ha-icon class="mb-icon" .icon=${m.icon ?? SEVERITY_ICON[m.severity ?? "info"]}></ha-icon>
              <div class="mb-content">
                ${m.title ? html`<div class="mb-title">${m.title}</div>` : nothing}
                <div class="mb-message">
                  ${m.emphasis ? html`<b class="mb-em">${m.emphasis}</b> ` : nothing}${m.message}
                </div>
                ${m.actions?.length
                  ? html`<div class="mb-actions">
                      ${m.actions.map(
                        (a) => html`<button
                          class="mb-abtn ${a.primary ? "primary" : ""}"
                          @click=${() => {
                            a.handler();
                            this._dismiss(m.id);
                          }}
                        >
                          ${a.label}
                        </button>`,
                      )}
                    </div>`
                  : nothing}
              </div>
              <button class="mb-close" aria-label="Dismiss" @click=${() => this._dismiss(m.id)}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z" />
                </svg>
              </button>
              ${m.duration && m.duration > 0
                ? html`<div class="mb-bar" style="animation-duration:${m.duration}ms"></div>`
                : nothing}
            </div>
          `,
        )}
      </div>
    `;
  }

  static styles = css`
    :host {
      position: fixed;
      left: 0;
      right: 0;
      bottom: var(--ted-navbar-bottom-reserve, 0px);
      z-index: 10000;
      display: flex;
      justify-content: center;
      pointer-events: none;
      font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif;
    }
    .stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
      width: min(440px, 96vw);
    }
    .mb-box {
      --mb-accent: #4cc2ff;
      position: relative;
      overflow: hidden;
      pointer-events: auto;
      display: flex;
      gap: 14px;
      align-items: flex-start;
      padding: 16px 18px;
      border-radius: 14px;
      color: var(--primary-text-color, #fff);
      background: var(--ha-card-background, var(--card-background-color, rgba(28, 32, 44, 0.92)));
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.22));
      border-left: 4px solid var(--mb-accent);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
      animation: mb-in 0.22s ease-out both;
    }
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
      flex: 0 0 auto;
      --mdc-icon-size: 24px;
      color: var(--mb-accent);
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
    .mb-em {
      color: var(--mb-accent);
      font-weight: 600;
    }
    .mb-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }
    .mb-abtn {
      appearance: none;
      font: inherit;
      font-size: 0.85em;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 8px;
      cursor: pointer;
      color: inherit;
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.4));
      background: rgba(127, 127, 127, 0.14);
    }
    .mb-abtn:hover {
      background: rgba(127, 127, 127, 0.26);
    }
    .mb-abtn.primary {
      color: #fff;
      background: var(--mb-accent);
      border-color: var(--mb-accent);
    }
    .mb-close {
      flex: 0 0 auto;
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.22));
      background: rgba(127, 127, 127, 0.14);
      color: inherit;
      cursor: pointer;
    }
    .mb-close:hover {
      background: rgba(127, 127, 127, 0.26);
    }
    .mb-close svg {
      width: 16px;
      height: 16px;
    }
    .mb-bar {
      position: absolute;
      left: 0;
      bottom: 0;
      height: 3px;
      width: 100%;
      transform-origin: left;
      background: var(--mb-accent);
      opacity: 0.85;
      animation-name: mb-count;
      animation-timing-function: linear;
      animation-fill-mode: forwards;
    }
    @keyframes mb-in {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @keyframes mb-count {
      from {
        transform: scaleX(1);
      }
      to {
        transform: scaleX(0);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-message-popup-layer": TedMessagePopupLayer;
  }
}

let layer: TedMessagePopupLayer | undefined;

/** Show a dismissable, MessageBox-styled toast. Safe to call from any card. */
export function showMessageBox(opts: MessagePopupOptions): void {
  if (!layer || !layer.isConnected) {
    layer = document.createElement("ted-message-popup-layer");
    document.body.appendChild(layer);
  }
  layer.push(opts);
}
