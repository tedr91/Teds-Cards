/**
 * Shared "assist surface" — the frosted, accent-striped box that renders an Assist
 * answer (icon + title + optional inline image + message).
 *
 * Extracted from the Assist-Response card so the same look is reused by both the
 * full-screen Assist-Response view and the compact voice overlay toast. Callers own
 * the outer container (fill height, background image, toast sizing) and pass in the
 * resolved icon / theme class / CSS box vars.
 */
import { css, html, nothing, type TemplateResult } from "lit";
import { styleMap } from "lit/directives/style-map.js";

export interface AssistSurfaceOptions {
  /** Main body text (or a placeholder while waiting). */
  message: string;
  /** Optional heading above the message. */
  title?: string;
  /** Optional inline image (rendered beside/above the message). */
  image?: string;
  /** Resolved icon string (e.g. "mdi:message-reply-text"); omit for no icon. */
  icon?: string;
  /** Landscape (wide) → image beside the text; otherwise stacked above. */
  wide?: boolean;
  /** Render the message in muted placeholder styling. */
  placeholder?: boolean;
  /** Theme class from `tedCardThemeClass(...)` applied to the box. */
  themeClass?: string;
  /** Drop shadow (default true). */
  shadow?: boolean;
  /** CSS custom props for the box (e.g. `--ar-accent`, `--ar-bg-alpha`, `--ar-blur`). */
  boxVars?: Record<string, string>;
  /** Extra class(es) appended to `.ar-box` (e.g. compact sizing for the toast). */
  boxClass?: string;
}

/** Render the `.ar-box` assist surface. The caller wraps it in its own container. */
export function renderAssistSurface(opts: AssistSurfaceOptions): TemplateResult {
  const {
    message,
    title,
    image,
    icon,
    wide = true,
    placeholder = false,
    themeClass = "",
    shadow = true,
    boxVars = {},
    boxClass = "",
  } = opts;
  const bodyClass = image ? (wide ? " has-image row" : " has-image col") : "";
  return html`
    <div
      class="ar-box ${themeClass}${shadow ? " ar-shadow" : ""}${boxClass ? ` ${boxClass}` : ""}"
      style=${styleMap(boxVars)}
      role="status"
      aria-live="polite"
    >
      ${icon ? html`<ha-icon class="ar-icon" .icon=${icon}></ha-icon>` : nothing}
      <div class="ar-content">
        ${title ? html`<div class="ar-title">${title}</div>` : nothing}
        <div class="ar-body${bodyClass}">
          ${image ? html`<img class="ar-image" src=${image} alt="" />` : nothing}
          <div class="ar-message ${placeholder ? "placeholder" : ""}">${message}</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Styles for the assist surface. Include this in a component's `static styles`
 * alongside `tedStyleTheme`. The outer container styles (`.ar-root`, background,
 * fill height, toast sizing) belong to the consuming component.
 */
export const assistSurfaceStyles = css`
  /* MessageBox-style frosted box with a left accent stripe. The icon sits next to
     the title and the content is top-aligned. */
  .ar-box {
    --ar-surface: 28, 32, 44;
    --ar-accent: var(--ted-style-accent, #4cc2ff);
    --ar-msg-size: clamp(20px, 3vw, 44px);
    position: relative;
    z-index: 1;
    box-sizing: border-box;
    flex: 1 1 auto;
    display: flex;
    gap: 18px;
    align-items: flex-start;
    width: 100%;
    overflow: auto;
    padding: clamp(18px, 3vw, 40px) clamp(20px, 3.5vw, 44px);
    border-radius: var(--ted-style-radius);
    color: var(--ted-style-text, #fff);
    background: rgba(var(--ar-surface), var(--ar-bg-alpha, 0.62));
    backdrop-filter: blur(var(--ar-blur, 22px)) saturate(150%);
    -webkit-backdrop-filter: blur(var(--ar-blur, 22px)) saturate(150%);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-left: 5px solid var(--ar-accent);
  }
  .ar-box.ar-shadow {
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.16);
  }
  /* Follow the active HA theme for the surface/text when theme: ha. */
  .ar-box.ted-card--theme-ha {
    color: var(--primary-text-color, #1c1c1c);
    background: var(--ha-card-background, var(--card-background-color, #fff));
    border: 1px solid var(--divider-color, rgba(120, 120, 120, 0.22));
    border-left: 5px solid var(--ar-accent);
    backdrop-filter: var(--ha-card-backdrop-filter, none);
    -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
  }
  .ar-icon {
    color: var(--ar-accent);
    --mdc-icon-size: var(--ar-msg-size);
    flex: 0 0 auto;
  }
  .ar-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    flex: 1 1 auto;
  }
  /* Body holds the (optional) inline image + the message. Landscape = image beside
     the text (row); portrait/narrow = image above it (column). */
  .ar-body {
    display: flex;
    min-width: 0;
    flex: 1 1 auto;
  }
  .ar-body.row {
    flex-direction: row;
    align-items: flex-start;
    gap: clamp(16px, 2.4vw, 28px);
  }
  .ar-body.col {
    flex-direction: column;
    align-items: flex-start;
    gap: clamp(12px, 2vw, 20px);
  }
  .ar-body .ar-message {
    flex: 1 1 auto;
  }
  .ar-image {
    flex: 0 0 auto;
    object-fit: contain;
    border-radius: var(--ted-style-radius);
    background: rgba(0, 0, 0, 0.18);
  }
  .ar-body.row .ar-image {
    max-width: 42%;
    max-height: 100%;
  }
  .ar-body.col .ar-image {
    max-width: 100%;
    max-height: 55%;
  }
  .ar-title {
    font-size: var(--ar-msg-size);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    line-height: 1.15;
    color: var(--ted-style-text);
  }
  .ar-message {
    font-size: var(--ar-msg-size);
    line-height: 1.3;
    font-weight: 500;
    text-wrap: balance;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    color: var(--ted-style-text);
  }
  .ar-message.placeholder {
    color: var(--ted-style-muted);
    font-weight: 400;
  }
`;
