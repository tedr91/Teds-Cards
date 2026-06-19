import { css, html, type CSSResult, type TemplateResult } from "lit";

import type { TedStyleTheme } from "./types";

/**
 * The shared "Ted's Home Theater" theme — a single source of truth for the
 * `--ted-style-*` design tokens used by every card in this collection.
 *
 * Token values mirror tedr91/ha-windows11-theme's dark set (Windows 11 Fluent /
 * Mica-dark) and match the Denon Marantz card. Two modes are provided:
 *   - `ted-style` (default): self-contained, theme-independent tokens on `:host`.
 *   - `ha`: follow the active Home Assistant theme via `.ted-card--theme-ha`.
 *
 * Usage in a card:
 *   static styles = [tedStyleTheme, css`… card-specific styles …`];
 *   render() { html`<ha-card class="ted-card ${tedCardThemeClass(theme)}">…`; }
 */
export const tedStyleTheme: CSSResult = css`
  :host {
    /* Default "Ted's Home Theater" theme — Windows 11 Fluent (Mica dark). */
    --ted-style-accent: #4cc2ff;
    --ted-style-on-accent: #000000;
    --ted-style-text: #ffffff;
    --ted-style-muted: rgba(255, 255, 255, 0.786);
    --ted-style-divider: rgba(255, 255, 255, 0.0931);
    --ted-style-surface: #2b2b2b;
    --ted-style-surface-2: #383838;
    --ted-style-success: #6ccb5f;
    --ted-style-danger: #ff99a4;
    --ted-style-radius: 8px;
    --ted-style-radius-sm: 4px;
    --ted-style-pill: 999px;
    --ted-style-gap: 14px;
    --ted-style-touch: 44px;
    display: block;
    font-family: "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", system-ui,
      -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  }

  .ted-card--theme-ha {
    /* Follow the active Home Assistant theme. */
    --ted-style-accent: var(--primary-color, #2196f3);
    --ted-style-on-accent: var(--text-primary-color, #ffffff);
    --ted-style-text: var(--primary-text-color, #1c1c1c);
    --ted-style-muted: var(--secondary-text-color, #6f6f6f);
    --ted-style-divider: var(--divider-color, rgba(120, 120, 120, 0.22));
    --ted-style-surface: var(--ha-card-background, var(--card-background-color, #ffffff));
    --ted-style-surface-2: color-mix(in srgb, var(--ted-style-surface) 84%, var(--ted-style-text) 16%);
    --ted-style-success: var(--success-color, #43a047);
    --ted-style-danger: var(--error-color, #e5484d);
    --ted-style-radius: var(--ha-card-border-radius, 12px);
    --ted-style-radius-sm: var(--ha-border-radius-sm, min(var(--ha-card-border-radius, 12px), 14px));
    font-family: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, inherit));
  }

  ha-card.ted-card--theme-ted-style {
    /* Brushed dark body matching the Kaleidescape manufacturer remote. */
    background: linear-gradient(145deg, #2e2e32 0%, #222226 45%, #16161a 100%);
    border: 1px solid var(--ted-style-divider);
    color: var(--ted-style-text);
    --ha-card-border-radius: var(--ted-style-radius);
  }

  /* Brushed-metal sheen overlay (sits just above the card background). */
  .ted-brushed {
    position: absolute;
    inset: 0;
    z-index: -3;
    pointer-events: none;
    opacity: 0.5;
    mix-blend-mode: overlay;
    border-radius: inherit;
    overflow: hidden;
  }
  .ted-brushed-svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* Decora-style rocker bevel: makes one half appear raised, pivoting at the
     center. Default = top half raised; add \`is-bottom\` to raise the bottom. */
  .ted-rocker {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background: linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0.1) 0%,
      rgba(255, 255, 255, 0.03) 22%,
      rgba(255, 255, 255, 0) 44%,
      rgba(0, 0, 0, 0.05) 48%,
      rgba(0, 0, 0, 0.2) 50%,
      rgba(0, 0, 0, 0.1) 55%,
      rgba(0, 0, 0, 0.03) 64%,
      rgba(0, 0, 0, 0) 75%
    );
  }
  .ted-rocker.is-bottom {
    background: linear-gradient(
      to top,
      rgba(255, 255, 255, 0.1) 0%,
      rgba(255, 255, 255, 0.03) 22%,
      rgba(255, 255, 255, 0) 44%,
      rgba(0, 0, 0, 0.05) 48%,
      rgba(0, 0, 0, 0.2) 50%,
      rgba(0, 0, 0, 0.1) 55%,
      rgba(0, 0, 0, 0.03) 64%,
      rgba(0, 0, 0, 0) 75%
    );
  }
`;

/**
 * Brushed-metal sheen: a desaturated, horizontally-stretched noise layer meant
 * to sit just above the card background, where `mix-blend-mode: overlay` lets it
 * modulate whatever background color is set (e.g. silver → brushed aluminum).
 * Render it as the first child of the card's `ha-card`.
 */
export const brushedOverlay: TemplateResult = html`
  <div class="ted-brushed" aria-hidden="true">
    <svg class="ted-brushed-svg" preserveAspectRatio="none">
      <filter id="ted-brushed-filter" x="0" y="0" width="100%" height="100%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.012 0.74"
          numOctaves="2"
          stitchTiles="stitch"
          result="n"
        ></feTurbulence>
        <feColorMatrix in="n" type="saturate" values="0"></feColorMatrix>
      </filter>
      <rect width="100%" height="100%" filter="url(#ted-brushed-filter)"></rect>
    </svg>
  </div>
`;

/** Resolve the theme class to apply to a card's `ha-card`. */
export function tedCardThemeClass(theme: TedStyleTheme | undefined): string {
  return theme === "ha" ? "ted-card--theme-ha" : "ted-card--theme-ted-style";
}
