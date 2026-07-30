/**
 * Voice overlay — the compact wake-word UI TDS renders itself (replacing the Companion
 * app's native Assist dialog). It shows the running conversation as a single box that
 * accumulates turns (You → Assistant), plus a live status line ("Listening…"), and
 * auto-dismisses a little after the spoken answer finishes.
 *
 * On devices that prefer full-screen (nightstand / handheld), the controller routes the
 * final answer to the Assist-Response view instead — see voice-controller.ts.
 */
import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

import { assistSurfaceStyles } from "./assist-surface";
import { tedStyleTheme } from "./theme";

export interface VoiceTurn {
  role: "user" | "assistant";
  text: string;
}

export interface VoiceOverlayView {
  /** The conversation so far (rendered top-to-bottom in one box). */
  turns?: VoiceTurn[];
  /** Live status under the transcript (e.g. "Listening…", "Thinking…"). */
  status?: string;
  /** Resolved icon string. */
  icon?: string;
  /** Accent color for the stripe/icon (state-dependent). */
  accent?: string;
  /** True while the mic is actively listening (drives the pulse animation). */
  pulsing?: boolean;
}

const OVERLAY_TAG = "ted-voice-overlay";

@customElement(OVERLAY_TAG)
export class TedVoiceOverlay extends LitElement {
  @property({ attribute: false }) public view?: VoiceOverlayView;
  @property({ type: Boolean, reflect: true }) public visible = false;

  protected render(): TemplateResult | typeof nothing {
    const v = this.view;
    if (!this.visible || !v) return nothing;
    const turns = v.turns ?? [];
    if (!turns.length && !v.status) return nothing;
    const boxStyle = `${v.accent ? `--ar-accent:${v.accent};` : ""}--ar-msg-size:clamp(15px,1.8vw,21px);`;
    return html`
      <div class="vo-root${v.pulsing ? " pulsing" : ""}">
        <div class="ar-box ar-shadow ar-compact" style=${boxStyle} role="log" aria-live="polite">
          ${v.icon ? html`<ha-icon class="ar-icon" .icon=${v.icon}></ha-icon>` : nothing}
          <div class="ar-content vo-thread">
            ${turns.map(
              (t) => html`
                <div class="vo-turn vo-${t.role}">
                  <span class="vo-role">${t.role === "user" ? "You" : "Assistant"}</span>
                  <span class="vo-text">${t.text}</span>
                </div>
              `,
            )}
            ${v.status ? html`<div class="vo-status">${v.status}</div>` : nothing}
          </div>
        </div>
      </div>
    `;
  }

  protected updated(): void {
    // Keep the newest turn in view as the conversation grows.
    const thread = this.renderRoot?.querySelector?.(".vo-thread") as HTMLElement | null;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }

  static styles = [
    tedStyleTheme,
    assistSurfaceStyles,
    css`
      :host {
        position: fixed;
        left: 50%;
        bottom: calc(var(--ted-navbar-bottom-reserve, 0px) + 24px);
        transform: translateX(-50%);
        z-index: 100001;
        width: min(600px, 94vw);
        pointer-events: none;
      }
      .vo-root {
        display: flex;
        animation: vo-in 0.28s ease-out both;
      }
      /* Compact variant of the shared assist surface. */
      .ar-box.ar-compact {
        align-items: flex-start;
        gap: 12px;
        padding: 12px 16px;
      }
      .vo-thread {
        gap: 8px;
        max-height: 42vh;
        overflow-y: auto;
      }
      .vo-turn {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .vo-role {
        font-size: 0.72em;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        opacity: 0.72;
      }
      .vo-user .vo-role {
        color: var(--ar-accent);
      }
      .vo-text {
        font-size: var(--ar-msg-size);
        line-height: 1.3;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }
      .vo-status {
        font-size: 0.82em;
        font-style: italic;
        opacity: 0.7;
      }
      .vo-root.pulsing .ar-icon {
        animation: vo-pulse 1.4s ease-in-out infinite;
      }
      @keyframes vo-in {
        from {
          opacity: 0;
          transform: translateY(12px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes vo-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.45;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .vo-root,
        .vo-root.pulsing .ar-icon {
          animation: none;
        }
      }
    `,
  ];
}

/** Body-level singleton manager for the voice overlay toast. */
class VoiceOverlayManager {
  private _el?: TedVoiceOverlay;

  private _ensure(): TedVoiceOverlay {
    if (!this._el) {
      this._el = document.createElement(OVERLAY_TAG) as TedVoiceOverlay;
      document.body.appendChild(this._el);
    }
    return this._el;
  }

  show(view: VoiceOverlayView): void {
    const el = this._ensure();
    el.view = view;
    el.visible = true;
  }

  hide(): void {
    if (this._el) this._el.visible = false;
  }
}

/** Shared singleton overlay manager. */
export const voiceOverlay = new VoiceOverlayManager();

declare global {
  interface HTMLElementTagNameMap {
    [OVERLAY_TAG]: TedVoiceOverlay;
  }
}
