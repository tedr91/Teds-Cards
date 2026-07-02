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
    width: 28px;
    height: 28px;
    padding: 0;
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
  .status-badge {
    position: absolute;
    top: -3px;
    right: -3px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    box-sizing: border-box;
    border-radius: 999px;
    background: var(--ted-style-accent);
    color: var(--ted-style-on-accent);
    font-size: 9px;
    font-weight: 700;
    line-height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  /* Notifications popover (bell). */
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
    font-size: 0.8rem;
    cursor: pointer;
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
  }
  .notif-pop-title {
    font-weight: 600;
    font-size: 0.85rem;
  }
  .notif-pop-msg {
    font-size: 0.8rem;
    color: var(--ted-style-muted);
    overflow-wrap: anywhere;
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

  /* Slider popover (brightness / volume). */
  .slider-popover {
    position: fixed;
    inset: auto;
    margin: 0;
    box-sizing: border-box;
    padding: 14px 12px;
    background: var(--ted-style-surface);
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
