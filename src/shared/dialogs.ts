import { fireEvent } from "custom-card-helpers";
import { css } from "lit";

/** Params accepted by Home Assistant's generic `dialog-box` confirmation dialog. */
export interface ConfirmationParams {
  title?: string;
  text?: string;
  confirmText?: string;
  dismissText?: string;
  /** Renders the confirm button in the warning/destructive style. */
  destructive?: boolean;
}

/**
 * Show Home Assistant's standard confirmation dialog and resolve to the user's
 * choice. Mirrors the frontend's `showConfirmationDialog` by firing the same
 * `show-dialog` event that `<home-assistant>`'s dialog manager listens for.
 * `dialog-box` is part of the frontend; `whenDefined` resolves once HA has it.
 */
export function showConfirmation(element: HTMLElement, params: ConfirmationParams): Promise<boolean> {
  return new Promise((resolve) => {
    fireEvent(element, "show-dialog", {
      dialogTag: "dialog-box",
      dialogImport: () => customElements.whenDefined("dialog-box"),
      dialogParams: {
        ...params,
        confirmation: true,
        confirm: () => resolve(true),
        cancel: () => resolve(false),
      },
    } as unknown as Record<string, unknown>);
  });
}

/**
 * Styles for a self-contained modal overlay (`.ted-modal` > `.ted-sheet`).
 * Used instead of `ha-dialog`, which is lazy-loaded and often undefined when a
 * dashboard card first renders. Uses Home Assistant theme tokens so it looks
 * native in any theme. Render the overlay as a sibling of `<ha-card>` (not
 * inside it) so it is not clipped by the card's `overflow: hidden`.
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
    background: var(--ha-card-background, var(--card-background-color, #fff));
    color: var(--primary-text-color, #111);
    border-radius: 16px;
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
  .ted-sheet-body ha-textfield {
    width: 100%;
    --mdc-theme-primary: var(--primary-color);
    --mdc-text-field-fill-color: var(--secondary-background-color, rgba(0, 0, 0, 0.04));
    --mdc-text-field-ink-color: var(--primary-text-color);
    --mdc-text-field-label-ink-color: var(--secondary-text-color);
  }
  .ted-hms {
    display: flex;
    gap: 10px;
  }
  .ted-hms ha-textfield {
    flex: 1 1 0;
    min-width: 0;
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
    border-radius: 10px;
    cursor: pointer;
    color: var(--primary-color, #2196f3);
  }
  .ted-btn:hover {
    background: color-mix(in srgb, var(--primary-color, #2196f3) 12%, transparent);
  }
  .ted-btn.primary {
    background: var(--primary-color, #2196f3);
    color: var(--text-primary-color, #fff);
  }
  .ted-btn.primary:hover {
    filter: brightness(1.06);
    background: var(--primary-color, #2196f3);
  }
  .ted-btn.danger {
    color: var(--error-color, #db4437);
  }
  .ted-btn.danger:hover {
    background: color-mix(in srgb, var(--error-color, #db4437) 12%, transparent);
  }
  .ted-btn[disabled] {
    opacity: 0.4;
    cursor: default;
    background: none;
    filter: none;
  }
`;

