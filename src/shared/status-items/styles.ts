import { css } from "lit";

/**
 * Item-level styles shared by every status-item host. Hosts append this to their
 * own `static styles` (after `tedStyleTheme`, whose CSS variables it relies on)
 * and keep their own strip/container layout styles separate. The icon size is
 * driven by `--ted-status-icon-size` (default 16px), which a host may override.
 */
export const statusItemStyles = css`
  .status-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 19px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ted-style-text);
    white-space: nowrap;
  }
  .status-spacer {
    flex: none;
    align-self: stretch;
    pointer-events: none;
  }
  .status-icon {
    --mdc-icon-size: var(--ted-status-icon-size, 16px);
    color: var(--ted-style-muted);
    flex: none;
  }
  .status-text {
    color: var(--ted-style-text);
  }
  .status-suffix {
    margin-left: 2px;
    font-size: 0.72em;
    font-weight: 600;
    opacity: 0.85;
  }
  .status-led {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .status-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    /* Size the LAYOUT box to the icon (matching .status-icon) so brightness/volume/
       notifications line up exactly with the plain status items in every align mode.
       The 6px padding grows the circular tap/hover target back to 28px, and the matching
       negative vertical margin pulls that extra height back out of layout so the button
       contributes the same height as a bare icon. content-box keeps width/height = icon. */
    box-sizing: content-box;
    width: var(--ted-status-icon-size, 16px);
    height: var(--ted-status-icon-size, 16px);
    padding: 6px;
    margin-block: -6px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--ted-style-muted);
    cursor: pointer;
    transition: color 0.18s ease, background 0.18s ease, transform 0.08s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .status-icon-button ha-icon {
    --mdc-icon-size: var(--ted-status-icon-size, 16px);
  }
  .status-icon-button:hover {
    color: var(--ted-style-text);
  }
  .status-icon-button:active {
    transform: scale(0.9);
  }
  .status-icon-button:focus-visible {
    outline: 2px solid var(--ted-style-accent);
    outline-offset: 2px;
  }
  .status-icon-button:disabled {
    opacity: 0.4;
    pointer-events: none;
  }
  .status-icon-button.is-active {
    color: var(--ted-style-danger);
  }
  .status-icon-button.notif-btn {
    position: relative;
    overflow: visible;
  }
  /* Non-interactive icon + badge (alarms / timers counts). */
  .status-icon-badge {
    position: relative;
    display: inline-flex;
    overflow: visible;
  }
  .status-badge {
    position: absolute;
    top: -5px;
    right: -5px;
    min-width: 13px;
    height: 13px;
    padding: 0 3px;
    box-sizing: border-box;
    border-radius: 999px;
    background: var(--ted-style-accent);
    color: var(--ted-style-on-accent);
    font-size: 8px;
    font-weight: 700;
    line-height: 13px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  /* Notifications popover (bell). Opt into the theme's card frost so on translucent
     themes (Mica/glass) the surface blurs the dashboard behind it instead of showing it
     straight through — a plain [popover] isn't an ha-card, so it doesn't get that blur
     automatically. Falls back to none on opaque/flat themes. */
  .notif-popover {
    position: fixed;
    inset: auto;
    margin: 0;
    box-sizing: border-box;
    width: min(320px, 92vw);
    max-height: 60vh;
    overflow: auto;
    padding: 0;
    background: var(--ted-style-surface);
    -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
    backdrop-filter: var(--ha-card-backdrop-filter, none);
    border: 1px solid var(--ted-style-divider);
    border-radius: var(--ted-style-radius-sm);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
    color: var(--ted-style-text);
  }
  .notif-popover:popover-open {
    display: block;
  }
  .notif-popover::backdrop {
    background: transparent;
  }
  /* Hold-to-open options menu (alarms / timers / notifications DND). */
  .opts-popover {
    width: max-content;
    min-width: 168px;
    max-width: 92vw;
  }
  .opts-menu {
    display: flex;
    flex-direction: column;
    padding: 6px;
    gap: 2px;
  }
  .opts-btn {
    appearance: none;
    border: none;
    background: none;
    color: var(--ted-style-text);
    font: inherit;
    text-align: left;
    padding: 9px 12px;
    border-radius: var(--ted-style-radius-sm);
    cursor: pointer;
  }
  .opts-btn:hover {
    background: var(--ted-style-hover, rgba(127, 127, 127, 0.16));
  }
  .notif-pop-head {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    font-weight: 600;
    background: var(--ted-style-surface);
    border-bottom: 1px solid var(--ted-style-divider);
  }
  .notif-clear {
    appearance: none;
    border: none;
    background: none;
    color: var(--ted-style-muted);
    font: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 2px;
    --mdc-icon-size: 20px;
  }
  .notif-clear:hover {
    color: var(--ted-style-text);
  }
  .notif-pop-list {
    display: flex;
    flex-direction: column;
  }
  .notif-empty {
    padding: 14px 12px;
    color: var(--ted-style-muted);
    font-size: 0.85rem;
  }
  .notif-pop-row {
    --nc-accent: var(--ted-style-accent);
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 8px 10px 8px 12px;
    border-top: 1px solid var(--ted-style-divider);
    border-left: 3px solid var(--nc-accent);
  }
  .notif-pop-row:first-child {
    border-top: none;
  }
  .notif-pop-row.read {
    opacity: 0.62;
  }
  .notif-pop-row.sev-info {
    --nc-accent: #4cc2ff;
  }
  .notif-pop-row.sev-success {
    --nc-accent: #6ccb5f;
  }
  .notif-pop-row.sev-warning {
    --nc-accent: #ffb454;
  }
  .notif-pop-row.sev-danger {
    --nc-accent: #ff99a4;
  }
  .notif-pop-row.sev-tip {
    --nc-accent: #9b6cff;
  }
  .notif-pop-body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    cursor: pointer;
  }
  .notif-pop-icon {
    flex: none;
    --mdc-icon-size: 20px;
    color: var(--nc-accent);
    margin-top: 1px;
  }
  .notif-pop-top {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .notif-unread-dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--nc-accent);
    align-self: center;
  }
  .notif-pop-time {
    margin-left: auto;
    flex: none;
    font-size: 0.7rem;
    color: var(--ted-style-muted);
  }
  .notif-pop-title {
    font-weight: 600;
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .notif-pop-msg {
    font-size: 0.8rem;
    line-height: 1.3;
    color: var(--ted-style-muted);
    overflow-wrap: anywhere;
    word-break: break-word;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    /* Fallback clamp for engines that ignore -webkit-line-clamp: cap at two lines. */
    max-height: calc(2 * 1.3em);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .notif-pop-x {
    flex: none;
    appearance: none;
    border: none;
    background: none;
    color: var(--ted-style-muted);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    padding: 2px 4px;
  }
  .notif-pop-x:hover {
    color: var(--ted-style-text);
  }

  /* Centered full-notification modal (opens when a popover row is tapped, marking it
     read). Native [popover] centered with a transform; opts into the theme card frost
     like the other floating surfaces so translucent themes blur the dashboard behind. */
  .notif-detail-popover {
    position: fixed;
    inset: auto;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    box-sizing: border-box;
    width: min(420px, 92vw);
    max-height: 80vh;
    overflow: auto;
    padding: 0;
    background: var(--ted-style-surface);
    -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
    backdrop-filter: var(--ha-card-backdrop-filter, none);
    border: 1px solid var(--ted-style-divider);
    border-radius: var(--ted-style-radius-sm);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
    color: var(--ted-style-text);
  }
  .notif-detail-popover:popover-open {
    display: block;
  }
  .notif-detail-popover::backdrop {
    background: rgba(0, 0, 0, 0.45);
  }
  .notif-detail {
    --nc-accent: var(--ted-style-accent);
    border-left: 3px solid var(--nc-accent);
  }
  .notif-detail.sev-info {
    --nc-accent: #4cc2ff;
  }
  .notif-detail.sev-success {
    --nc-accent: #6ccb5f;
  }
  .notif-detail.sev-warning {
    --nc-accent: #ffb454;
  }
  .notif-detail.sev-danger {
    --nc-accent: #ff99a4;
  }
  .notif-detail.sev-tip {
    --nc-accent: #9b6cff;
  }
  .notif-detail-head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px 12px 4px 14px;
  }
  .notif-detail-icon {
    flex: none;
    --mdc-icon-size: 22px;
    color: var(--nc-accent);
    margin-top: 1px;
  }
  .notif-detail-title {
    font-weight: 600;
    font-size: 0.95rem;
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .notif-detail-x {
    flex: none;
    appearance: none;
    border: none;
    background: none;
    color: var(--ted-style-muted);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 2px 4px;
  }
  .notif-detail-x:hover {
    color: var(--ted-style-text);
  }
  .notif-detail-time {
    padding: 0 12px 0 14px;
    font-size: 0.7rem;
    color: var(--ted-style-muted);
  }
  .notif-detail-msg {
    padding: 8px 12px 14px 14px;
    font-size: 0.85rem;
    color: var(--ted-style-text);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  /* Slider popover (brightness / volume). Opt into the theme's card frost so on
     translucent themes the surface blurs the dashboard behind it instead of showing it
     straight through; falls back to none on opaque/flat themes. */
  .slider-popover {
    position: fixed;
    inset: auto;
    margin: 0;
    box-sizing: border-box;
    padding: 14px 12px;
    background: var(--ted-style-surface);
    -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
    backdrop-filter: var(--ha-card-backdrop-filter, none);
    border: 1px solid var(--ted-style-divider);
    border-radius: var(--ted-style-radius-sm);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
  }
  .slider-popover:popover-open {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .slider-popover::backdrop {
    background: transparent;
  }
  .slider-popover-value {
    color: var(--ted-style-text);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .slider-popover-icon {
    --mdc-icon-size: 18px;
    color: var(--ted-style-muted);
  }
  .si-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 28px;
    height: 150px;
    margin: 0;
    background: transparent;
    direction: rtl;
    writing-mode: vertical-lr;
  }
  .si-slider::-webkit-slider-runnable-track {
    width: 6px;
    border-radius: var(--ted-style-pill);
    background: linear-gradient(
      to top,
      var(--ted-style-accent) 0%,
      var(--ted-style-accent) var(--ted-style-fill, 50%),
      color-mix(in srgb, var(--ted-style-text) 18%, transparent) var(--ted-style-fill, 50%),
      color-mix(in srgb, var(--ted-style-text) 18%, transparent) 100%
    );
  }
  .si-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 22px;
    height: 22px;
    margin-left: -8px;
    border-radius: 50%;
    background: var(--ted-style-surface);
    border: 1px solid color-mix(in srgb, var(--ted-style-text) 20%, transparent);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  }
  .si-slider::-moz-range-track {
    width: 6px;
    border-radius: var(--ted-style-pill);
    background: color-mix(in srgb, var(--ted-style-text) 18%, transparent);
  }
  .si-slider::-moz-range-progress {
    width: 6px;
    border-radius: var(--ted-style-pill);
    background: var(--ted-style-accent);
  }
  .si-slider::-moz-range-thumb {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--ted-style-surface);
    border: 1px solid color-mix(in srgb, var(--ted-style-text) 20%, transparent);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  }
  .si-slider:disabled {
    opacity: 0.4;
    pointer-events: none;
  }
  .si-slider.is-muted {
    opacity: 0.55;
  }
`;
