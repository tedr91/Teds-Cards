import { fireEvent } from "custom-card-helpers";

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
