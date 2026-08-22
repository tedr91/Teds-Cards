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
import { keyed } from "lit/directives/keyed.js";

import { assistSurfaceStyles } from "./assist-surface";
import { tedStyleTheme } from "./theme";
import type { HomeAssistant } from "custom-card-helpers";
import type { VoiceRichResult } from "./voice-results";
import "./voice-result-panel";

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
  /** Incremental assistant response while the intent is still running. */
  streamingText?: string;
  /** Current tool activity labels and completion state. */
  tools?: Array<{ id: string; label: string; status: "running" | "complete" | "error" }>;
  /** Smoothed microphone input level normalized to 0..1. */
  audioLevel?: number;
  hass?: HomeAssistant;
  results?: VoiceRichResult[];
}

const OVERLAY_TAG = "ted-voice-overlay";

@customElement(OVERLAY_TAG)
export class TedVoiceOverlay extends LitElement {
  @property({ attribute: false }) public view?: VoiceOverlayView;
  @property({ type: Boolean, reflect: true }) public visible = false;
  @property({ type: Boolean, reflect: true }) public dismissible = false;
  @property({ type: Number, attribute: false }) public autoDismissMs = 0;
  @property({ type: Number, attribute: false }) public countdownKey = 0;
  private _onDismiss?: () => void;

  public setAutoDismiss(duration: number, onDismiss: () => void): void {
    this.dismissible = true;
    this.autoDismissMs = duration;
    this.countdownKey += 1;
    this._onDismiss = onDismiss;
  }

  public clearAutoDismiss(): void {
    this.dismissible = false;
    this.autoDismissMs = 0;
    this._onDismiss = undefined;
  }

  protected render(): TemplateResult | typeof nothing {
    const v = this.view;
    if (!this.visible || !v) return nothing;
    const turns = v.turns ?? [];
    if (!turns.length && !v.status && !v.streamingText) return nothing;
    const boxStyle = `${v.accent ? `--ar-accent:${v.accent};` : ""}--ar-msg-size:clamp(15px,1.8vw,21px);`;
    const dialog = html`
      <div class="vo-position" @click=${(event: MouseEvent) => event.stopPropagation()}>
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
              ${v.streamingText
                ? html`
                    <div class="vo-turn vo-assistant vo-streaming">
                      <span class="vo-role">Assistant</span>
                      <span class="vo-text">${v.streamingText}</span>
                    </div>
                  `
                : nothing}
              ${v.tools?.length
                ? html`<div class="vo-tools">
                    ${v.tools.map(
                      (tool) => html`<div class="vo-tool ${tool.status}">
                        <ha-icon .icon=${tool.status === "running" ? "mdi:progress-wrench" : "mdi:check-circle-outline"}></ha-icon>
                        <span>${tool.label}</span>
                      </div>`,
                    )}
                  </div>`
                : nothing}
              ${v.results?.length
                ? html`<ted-voice-result-panel
                    .hass=${v.hass}
                    .results=${v.results}
                    .compact=${true}
                  ></ted-voice-result-panel>`
                : nothing}
              ${v.audioLevel !== undefined
                ? html`<div class="vo-wave" aria-label="Microphone input level">
                    ${Array.from({ length: 10 }, (_, index) => {
                      const profile = [0.58, 0.72, 0.88, 1, 0.82, 0.94, 0.76, 1, 0.68, 0.54][index];
                      const scale = 0.18 + Math.max(0, Math.min(1, v.audioLevel ?? 0)) * profile * 0.82;
                      return html`<span style=${`--vo-level:${scale}`}></span>`;
                    })}
                  </div>`
                : nothing}
              ${v.status ? html`<div class="vo-status">${v.status}</div>` : nothing}
            </div>
            ${this.autoDismissMs > 0
              ? keyed(
                  this.countdownKey,
                  html`<div
                    class="vo-countdown"
                    style=${`animation-duration:${this.autoDismissMs}ms`}
                    aria-hidden="true"
                  ></div>`,
                )
              : nothing}
          </div>
        </div>
      </div>
    `;
    return this.dismissible
      ? html`<div class="vo-dismiss-layer" @click=${this._dismissOutside}>${dialog}</div>`
      : dialog;
  }

  private _dismissOutside = (): void => this._onDismiss?.();

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
        inset: 0;
        z-index: 100001;
        pointer-events: none;
      }
      .vo-dismiss-layer {
        position: fixed;
        inset: 0;
        pointer-events: auto;
      }
      .vo-position {
        position: absolute;
        left: 50%;
        bottom: calc(var(--ted-navbar-bottom-reserve, 0px) + 24px);
        transform: translateX(-50%);
        width: min(600px, 94vw);
      }
      .vo-root {
        display: flex;
        animation: vo-in 0.28s ease-out both;
      }
      /* Compact variant of the shared assist surface. */
      .ar-box.ar-compact {
        align-items: flex-start;
        gap: 12px;
        overflow: hidden;
        padding: 12px 16px;
      }
      .vo-thread {
        gap: 8px;
        max-height: 42vh;
        overflow-y: auto;
        pointer-events: auto;
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
      .vo-streaming {
        opacity: 0.92;
      }
      .vo-tools {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .vo-tool {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        width: fit-content;
        padding: 4px 8px;
        border: 1px solid color-mix(in srgb, var(--ar-accent) 42%, transparent);
        border-radius: 6px;
        background: color-mix(in srgb, var(--ar-accent) 14%, transparent);
        font-size: 0.76em;
      }
      .vo-tool ha-icon {
        --mdc-icon-size: 16px;
      }
      .vo-tool.complete {
        opacity: 0.72;
      }
      .vo-wave {
        display: grid;
        grid-template-columns: repeat(10, 7px);
        align-items: center;
        justify-content: center;
        gap: 5px;
        height: 44px;
        overflow: visible;
      }
      .vo-wave span {
        width: 7px;
        height: 36px;
        border-radius: 4px;
        transform: scaleY(var(--vo-level));
        transition: transform 80ms linear;
        transform-origin: center;
      }
      .vo-wave span:nth-child(5n + 1) { background: #48cae4; box-shadow: 0 0 12px #48cae499; }
      .vo-wave span:nth-child(5n + 2) { background: #80ed99; box-shadow: 0 0 12px #80ed9999; }
      .vo-wave span:nth-child(5n + 3) { background: #ffd166; box-shadow: 0 0 12px #ffd16699; }
      .vo-wave span:nth-child(5n + 4) { background: #ff7096; box-shadow: 0 0 12px #ff709699; }
      .vo-wave span:nth-child(5n + 5) { background: #b892ff; box-shadow: 0 0 12px #b892ff99; }
      .vo-root.pulsing .ar-icon {
        animation: vo-pulse 1.4s ease-in-out infinite;
      }
      .vo-countdown {
        position: absolute;
        left: 0;
        bottom: 0;
        z-index: 2;
        width: 100%;
        height: 3px;
        transform-origin: left;
        background: var(--ar-accent);
        opacity: 0.85;
        animation-name: vo-countdown;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
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
      @keyframes vo-countdown {
        from {
          transform: scaleX(1);
        }
        to {
          transform: scaleX(0);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .vo-root,
        .vo-root.pulsing .ar-icon {
          animation: none;
        }
        .vo-wave span {
          transition: none;
          box-shadow: none;
        }
        .vo-countdown {
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

  setAutoDismiss(duration: number, onDismiss: () => void): void {
    this._ensure().setAutoDismiss(duration, onDismiss);
  }

  clearAutoDismiss(): void {
    this._el?.clearAutoDismiss();
  }
}

/** Shared singleton overlay manager. */
export const voiceOverlay = new VoiceOverlayManager();

declare global {
  interface HTMLElementTagNameMap {
    [OVERLAY_TAG]: TedVoiceOverlay;
  }
}
