/**
 * Voice overlay toast — the compact wake-word UI TDS renders itself (replacing the
 * Companion app's native Assist dialog). It shows the pipeline's live state
 * ("Listening…" → recognized speech → the spoken answer) using the same frosted
 * assist surface as the full-screen Assist-Response view, and auto-dismisses when the
 * run ends.
 *
 * On devices that prefer full-screen (nightstand / handheld), the controller routes
 * the final answer to the Assist-Response view instead of this toast — see
 * voice-controller.ts.
 */
import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

import { renderAssistSurface, assistSurfaceStyles } from "./assist-surface";
import { tedStyleTheme } from "./theme";

export interface VoiceOverlayView {
  message: string;
  title?: string;
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
    const boxVars: Record<string, string> = { "--ar-msg-size": "clamp(15px, 1.8vw, 22px)" };
    if (v.accent) boxVars["--ar-accent"] = v.accent;
    return html`
      <div class="vo-root${v.pulsing ? " pulsing" : ""}">
        ${renderAssistSurface({
          message: v.message,
          title: v.title,
          icon: v.icon,
          wide: true,
          boxVars,
          boxClass: "ar-compact",
        })}
      </div>
    `;
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
        width: min(560px, 92vw);
        pointer-events: none;
      }
      .vo-root {
        display: flex;
        animation: vo-in 0.28s ease-out both;
      }
      /* Compact variant of the shared assist surface: vertically centered, tighter. */
      .ar-box.ar-compact {
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        max-height: 32vh;
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
