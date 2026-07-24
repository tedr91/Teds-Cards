import { NAMESPACE } from "../../shared/const";

export const FULLSCREEN_CARD_TYPE = `${NAMESPACE}-fullscreen-card`;
export const FULLSCREEN_CARD_EDITOR_TYPE = `${FULLSCREEN_CARD_TYPE}-editor`;
export const FULLSCREEN_CARD_NAME = "Ted Fullscreen Card";
export const FULLSCREEN_CARD_DESCRIPTION =
  "A container that houses a single card (Music, Camera, Calendar, …) and toggles between a normal card and a full-screen overlay via a corner icon.";

/** Expand ("maximize") corner icon — Fluent preferred, MDI fallback. */
export const EXPAND_ICON = { fluent: "arrow-maximize-20-regular", mdi: "fullscreen" };

/** Minimize ("restore") corner icon — Fluent preferred, MDI fallback. */
export const MINIMIZE_ICON = { fluent: "arrow-minimize-20-regular", mdi: "fullscreen-exit" };

/**
 * Per-device settings key holding the saved normal/maximized state of every
 * Fullscreen card, keyed by the card's `state_key`. Internal (no Settings field);
 * value shape is `{ [state_key]: boolean }`. Must exist in the backend + frontend
 * `SETTINGS_DEFAULTS` (whitelisted for writes).
 */
export const FULLSCREEN_STATES_KEY = "fullscreen_states";
