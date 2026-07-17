import { css } from "lit";

/** Params accepted by the confirmation dialog. */
export interface ConfirmationParams {
  title?: string;
  text?: string;
  confirmText?: string;
  dismissText?: string;
  /** Renders the confirm button in the warning/destructive style. */
  destructive?: boolean;
}

/**
 * Show a confirmation dialog and resolve to the user's choice.
 *
 * This is a SELF-CONTAINED overlay (built from plain DOM + inline styles and
 * appended to `document.body`) rather than Home Assistant's `dialog-box`. HA's
 * `dialog-box` is lazy-loaded, and firing `show-dialog` with
 * `whenDefined("dialog-box")` only *resolves* once HA has already loaded that
 * chunk — on a kiosk dashboard that never opened one, the confirmation never
 * appears (so e.g. an alarm "Delete" button looks dead). The overlay uses a very
 * high z-index so it sits above our own `.ted-modal` edit sheets, and theme
 * fallbacks (`--ha-card-background`, `--primary-text-color`, …) that resolve at
 * document level. The `element` argument is unused (kept for call-site symmetry).
 */
export function showConfirmation(_element: HTMLElement, params: ConfirmationParams): Promise<boolean> {
  return new Promise((resolve) => {
    const {
      title = "",
      text = "",
      confirmText = "OK",
      dismissText = "Cancel",
      destructive = false,
    } = params;

    const layer = document.createElement("div");
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");
    layer.style.cssText =
      "position:fixed;inset:0;z-index:100000;display:flex;align-items:center;" +
      "justify-content:center;padding:16px;background:rgba(0,0,0,.45);";

    const sheet = document.createElement("div");
    sheet.style.cssText =
      "width:min(360px,100%);box-sizing:border-box;overflow:hidden;" +
      "background:var(--ha-card-background,var(--card-background-color,#fff));" +
      "backdrop-filter:var(--ha-dialog-surface-backdrop-filter,var(--ha-card-backdrop-filter));" +
      "-webkit-backdrop-filter:var(--ha-dialog-surface-backdrop-filter,var(--ha-card-backdrop-filter));" +
      "color:var(--primary-text-color,#111);" +
      "border:1px solid var(--divider-color,rgba(120,120,120,.22));" +
      "border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.4);";

    if (title) {
      const titleEl = document.createElement("div");
      titleEl.textContent = title;
      titleEl.style.cssText = "font-size:1.15rem;font-weight:600;padding:20px 20px 4px;";
      sheet.append(titleEl);
    }
    if (text) {
      const textEl = document.createElement("div");
      textEl.textContent = text;
      textEl.style.cssText = "padding:10px 20px 4px;color:var(--secondary-text-color,#555);";
      sheet.append(textEl);
    }

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;padding:14px 20px 18px;";

    const btnBase =
      "font:inherit;font-weight:600;cursor:pointer;border-radius:8px;padding:9px 16px;border:none;";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = dismissText;
    cancelBtn.style.cssText =
      btnBase + "background:transparent;color:var(--primary-text-color,#111);";
    const okBtn = document.createElement("button");
    okBtn.textContent = confirmText;
    okBtn.style.cssText =
      btnBase +
      `color:#fff;background:${destructive ? "var(--error-color,#db4437)" : "var(--primary-color,#2196f3)"};`;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(false);
      } else if (e.key === "Enter") {
        e.stopPropagation();
        close(true);
      }
    };
    const close = (result: boolean) => {
      window.removeEventListener("keydown", onKey, true);
      layer.remove();
      resolve(result);
    };

    layer.addEventListener("click", (e) => {
      if (e.target === layer) close(false);
    });
    cancelBtn.addEventListener("click", () => close(false));
    okBtn.addEventListener("click", () => close(true));
    window.addEventListener("keydown", onKey, true);

    actions.append(cancelBtn, okBtn);
    sheet.append(actions);
    layer.append(sheet);
    document.body.append(layer);
    okBtn.focus();
  });
}

/**
 * Styles for a self-contained modal overlay (`.ted-modal` > `.ted-sheet`).
 * Used instead of `ha-dialog`, which is lazy-loaded and often undefined when a
 * dashboard card first renders. Fields are native `<input>`s (not `ha-textfield`,
 * which is also lazy-loaded and renders blank until HA registers it) styled with
 * the card's own `--ted-style-*` theme tokens so radii/colors follow the card's
 * theme. Give `.ted-modal` the same `tedCardThemeClass(...)` as the card so those
 * tokens resolve. Render the overlay as a sibling of `<ha-card>` (not inside it)
 * so it is not clipped by the card's `overflow: hidden`.
 */
export const modalStyles = css`
  .ted-modal {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.45);
  }
  .ted-sheet {
    width: min(360px, 100%);
    max-height: calc(100vh - 32px);
    overflow: auto;
    box-sizing: border-box;
    background: var(--ted-style-surface, var(--ha-card-background, var(--card-background-color, #fff)));
    /* Translucent themes (e.g. Windows 11 Mica) expose their surface fill as a
       semi-transparent color and rely on a backdrop blur; apply it so the sheet
       isn't see-through. Opaque themes leave the var unset -> no-op. */
    backdrop-filter: var(--ha-dialog-surface-backdrop-filter, var(--ha-card-backdrop-filter));
    -webkit-backdrop-filter: var(--ha-dialog-surface-backdrop-filter, var(--ha-card-backdrop-filter));
    color: var(--ted-style-text, var(--primary-text-color, #111));
    border: 1px solid var(--ted-style-divider, rgba(120, 120, 120, 0.22));
    border-radius: var(--ted-style-radius, 12px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  }
  .ted-sheet-head {
    font-size: 1.15rem;
    font-weight: 600;
    padding: 20px 20px 4px;
  }
  .ted-sheet-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px 20px;
  }
  .ted-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .ted-field-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--ted-style-muted, var(--secondary-text-color, #6f6f6f));
  }
  .ted-input {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    color: var(--ted-style-text, var(--primary-text-color, #111));
    background: var(--ted-style-surface-2, var(--secondary-background-color, rgba(0, 0, 0, 0.04)));
    border: 1px solid var(--ted-style-divider, rgba(120, 120, 120, 0.22));
    border-radius: var(--ted-style-radius-sm, 6px);
    padding: 10px 12px;
    outline: none;
    accent-color: var(--ted-style-accent, var(--primary-color, #2196f3));
  }
  .ted-input:focus {
    border-color: var(--ted-style-accent, var(--primary-color, #2196f3));
  }
  .ted-input::-webkit-inner-spin-button,
  .ted-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .ted-input[type="number"] {
    -moz-appearance: textfield;
  }
  .ted-hms {
    display: flex;
    gap: 10px;
  }
  .ted-hms .ted-field {
    flex: 1 1 0;
  }
  .ted-days {
    display: flex;
    gap: 6px;
  }
  .ted-daybtn {
    flex: 1 1 0;
    min-width: 0;
    appearance: none;
    font: inherit;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 8px 0;
    cursor: pointer;
    color: var(--ted-style-muted, var(--secondary-text-color, #6f6f6f));
    background: var(--ted-style-surface-2, var(--secondary-background-color, rgba(0, 0, 0, 0.04)));
    border: 1px solid var(--ted-style-divider, rgba(120, 120, 120, 0.22));
    border-radius: var(--ted-style-radius-sm, 6px);
  }
  .ted-daybtn.on {
    color: var(--ted-style-on-accent, var(--text-primary-color, #fff));
    background: var(--ted-style-accent, var(--primary-color, #2196f3));
    border-color: var(--ted-style-accent, var(--primary-color, #2196f3));
  }
  .ted-scope {
    display: flex;
    gap: 6px;
  }
  .ted-scopebtn {
    flex: 1 1 0;
    min-width: 0;
    appearance: none;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    padding: 9px 8px;
    cursor: pointer;
    color: var(--ted-style-muted, var(--secondary-text-color, #6f6f6f));
    background: var(--ted-style-surface-2, var(--secondary-background-color, rgba(0, 0, 0, 0.04)));
    border: 1px solid var(--ted-style-divider, rgba(120, 120, 120, 0.22));
    border-radius: var(--ted-style-radius-sm, 6px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ted-scopebtn.on {
    color: var(--ted-style-on-accent, var(--text-primary-color, #fff));
    background: var(--ted-style-accent, var(--primary-color, #2196f3));
    border-color: var(--ted-style-accent, var(--primary-color, #2196f3));
  }
  .ted-scopebtn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .area-banner {
    margin: 6px 12px 10px;
    padding: 10px 12px;
    border: 1px solid var(--ted-style-divider, rgba(120, 120, 120, 0.22));
    border-radius: var(--ted-style-radius-sm, 6px);
    background: var(--ted-style-surface-2, var(--secondary-background-color, rgba(0, 0, 0, 0.04)));
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .area-banner-text {
    font-size: 0.8rem;
    color: var(--ted-style-muted, var(--secondary-text-color, #6f6f6f));
  }
  .area-banner-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .area-banner-row .ted-input {
    flex: 1 1 auto;
  }
  .ted-sheet-foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 4px 14px 16px;
  }
  .ted-sheet-foot .ted-btn.danger {
    margin-right: auto;
  }
  .ted-btn {
    appearance: none;
    border: none;
    background: none;
    font: inherit;
    font-weight: 600;
    padding: 10px 16px;
    border-radius: var(--ted-style-radius-sm, 10px);
    cursor: pointer;
    color: var(--ted-style-accent, var(--primary-color, #2196f3));
  }
  .ted-btn:hover {
    background: color-mix(in srgb, var(--ted-style-accent, var(--primary-color, #2196f3)) 12%, transparent);
  }
  .ted-btn.primary {
    background: var(--ted-style-accent, var(--primary-color, #2196f3));
    color: var(--ted-style-on-accent, var(--text-primary-color, #fff));
  }
  .ted-btn.primary:hover {
    filter: brightness(1.06);
    background: var(--ted-style-accent, var(--primary-color, #2196f3));
  }
  .ted-btn.danger {
    color: var(--ted-style-danger, var(--error-color, #db4437));
  }
  .ted-btn.danger:hover {
    background: color-mix(in srgb, var(--ted-style-danger, var(--error-color, #db4437)) 12%, transparent);
  }
  .ted-btn[disabled] {
    opacity: 0.4;
    cursor: default;
    background: none;
    filter: none;
  }
`;

