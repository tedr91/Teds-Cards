import { NAMESPACE } from "../../shared/const";

export const MESSAGEBOX_CARD_TYPE = `${NAMESPACE}-messagebox-card`;
export const MESSAGEBOX_CARD_EDITOR_TYPE = `${MESSAGEBOX_CARD_TYPE}-editor`;
export const MESSAGEBOX_CARD_NAME = "Ted MessageBox Card";
export const MESSAGEBOX_CARD_DESCRIPTION =
  "A dismissible message banner with optional actions — shown inline, pinned, or as a modal.";

export const DEFAULT_SEVERITY = "info";
export const DEFAULT_DISPLAY = "inline";

/** Prefix for dismissal flags written to local/session storage. */
export const DISMISS_STORAGE_PREFIX = "ted-mb:";
