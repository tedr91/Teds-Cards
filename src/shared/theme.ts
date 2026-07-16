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
    --ted-style-text: var(--ted-night-text, #ffffff);
    --ted-style-muted: var(--ted-night-text, rgba(255, 255, 255, 0.786));
    --ted-style-icon-dim: rgba(255, 255, 255, 0.5);
    --ted-style-divider: rgba(255, 255, 255, 0.0931);
    --ted-style-surface: #2b2b2b;
    --ted-style-surface-2: #383838;
    --ted-style-success: #6ccb5f;
    --ted-style-warning: #fcb043;
    --ted-style-danger: #ff99a4;
    --ted-style-radius: 8px;
    --ted-style-radius-sm: 4px;
    --ted-style-pill: 999px;
    --ted-style-gap: 14px;
    --ted-style-touch: 44px;
    display: block;
    /* DEBUG: outline every Ted card when the "Debug mode" setting is on (it publishes
       --ted-debug: solid on the document root; unset otherwise -> no outline). */
    outline: 1px var(--ted-debug, none) red;
    font-family: "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", system-ui,
      -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  }

  .ted-card--theme-ha {
    /* Follow the active Home Assistant theme. */
    --ted-style-accent: var(--primary-color, #2196f3);
    --ted-style-on-accent: var(--text-primary-color, #ffffff);
    --ted-style-text: var(--primary-text-color, #1c1c1c);
    --ted-style-muted: var(--secondary-text-color, #6f6f6f);
    --ted-style-icon-dim: var(--state-icon-color, var(--ted-style-muted));
    --ted-style-divider: var(--divider-color, rgba(120, 120, 120, 0.22));
    --ted-style-surface: var(--ha-card-background, var(--card-background-color, #ffffff));
    --ted-style-surface-2: color-mix(in srgb, var(--ted-style-surface) 84%, var(--ted-style-text) 16%);
    --ted-style-success: var(--success-color, #43a047);
    --ted-style-warning: var(--warning-color, #ffa600);
    --ted-style-danger: var(--error-color, #e5484d);
    --ted-style-radius: var(--ha-card-border-radius, 12px);
    --ted-style-radius-sm: var(--ha-border-radius-sm, min(var(--ha-card-border-radius, 12px), 14px));
    font-family: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, inherit));
  }

  ha-card.ted-card--theme-ted-style {
    /* Brushed dark body matching the Kaleidescape manufacturer remote. The
       --ted-card-bg-alpha (default 100%) lets the per-card Transparency override
       fade the surface; at 100% color-mix(X 100%, transparent) === X (opaque). */
    background: linear-gradient(
      145deg,
      color-mix(in srgb, #2e2e32 var(--ted-card-bg-alpha, 100%), transparent) 0%,
      color-mix(in srgb, #222226 var(--ted-card-bg-alpha, 100%), transparent) 45%,
      color-mix(in srgb, #16161a var(--ted-card-bg-alpha, 100%), transparent) 100%
    );
    border: 1px solid
      color-mix(in srgb, var(--ted-style-divider) var(--ted-card-bg-alpha, 100%), transparent);
    color: var(--ted-style-text);
    --ha-card-border-radius: var(--ted-style-radius);
  }

  /* HA theme: paint the surface explicitly so the per-card Transparency override
     can fade it. At 100% it equals the normal ha-card background. */
  ha-card.ted-card--theme-ha {
    background: color-mix(
      in srgb,
      var(--ha-card-background, var(--card-background-color, #ffffff)) var(--ted-card-bg-alpha, 100%),
      transparent
    );
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

  /* Neumorphic effect: a lit "raised" tile and a recessed "pressed" tile.
     Rocker style splits the card into two paddles (top/bottom, or left/right
     when horizontal); button style uses one full tile. Tints are translucent so
     they sit over any card background (color, brushed, photo). */
  .ted-neu {
    position: absolute;
    /* Inset by the indicator/hint bar widths (0 when a bar is hidden) so the
       neumorphic tile fills the space those bars would otherwise occupy. */
    left: var(--ted-neu-left, 0);
    right: var(--ted-neu-right, 0);
    z-index: -1;
    pointer-events: none;
    transition: background-color 180ms ease, box-shadow 180ms ease;
  }
  .ted-neu.full {
    inset: var(--ted-neu-top, 0) var(--ted-neu-right, 0) var(--ted-neu-bottom, 0) var(--ted-neu-left, 0);
    border-radius: var(--ted-style-radius);
  }
  .ted-neu.top {
    top: var(--ted-neu-top, 0);
    height: calc(50% - 1px);
    border-radius: var(--ted-style-radius) var(--ted-style-radius) 3px 3px;
  }
  .ted-neu.bottom {
    bottom: var(--ted-neu-bottom, 0);
    height: calc(50% - 1px);
    border-radius: 3px 3px var(--ted-style-radius) var(--ted-style-radius);
  }
  .ted-neu.raised {
    background-color: rgba(255, 255, 255, 0.05);
    box-shadow:
      4px 5px 11px rgba(0, 0, 0, 0.42),
      -2px -2px 7px rgba(255, 255, 255, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.13);
  }
  .ted-neu.pressed {
    background-color: rgba(0, 0, 0, 0.22);
    box-shadow:
      inset 4px 4px 10px rgba(0, 0, 0, 0.5),
      inset -2px -2px 7px rgba(255, 255, 255, 0.04);
  }
  /* Horizontal orientation: split the rocker paddles left/right instead. */
  .horizontal .ted-neu.top {
    top: var(--ted-neu-top, 0);
    bottom: var(--ted-neu-bottom, 0);
    left: 0;
    right: auto;
    width: calc(50% - 1px);
    height: auto;
    border-radius: var(--ted-style-radius) 3px 3px var(--ted-style-radius);
  }
  .horizontal .ted-neu.bottom {
    top: var(--ted-neu-top, 0);
    bottom: var(--ted-neu-bottom, 0);
    left: auto;
    right: 0;
    width: calc(50% - 1px);
    height: auto;
    border-radius: 3px var(--ted-style-radius) var(--ted-style-radius) 3px;
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
