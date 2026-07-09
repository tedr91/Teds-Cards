import { NAMESPACE } from "../../shared/const";

export const STATUS_CARD_TYPE = `${NAMESPACE}-status-card`;
export const STATUS_CARD_NAME = "Ted Status Card";
export const STATUS_CARD_DESCRIPTION =
  "An at-a-glance panel of this device's dependency, backend and browser-registration status.";

/** The status values an individual requirement attribute can hold. Used to tell
 *  real requirement attributes apart from HA's auto-added attributes
 *  (friendly_name, icon, …) and the sensor's meta keys (missing, ok, version). */
export const REQUIREMENT_STATUS_VALUES = new Set(["ok", "missing", "unknown"]);

/** Friendly, human-readable labels for each requirement id (falls back to the id). */
export const REQUIREMENT_LABELS: Record<string, string> = {
  hacs: "HACS",
  ted_cards: "Ted's Cards",
  browser_mod: "Browser Mod",
  layout_card: "Layout Card",
  card_mod: "Card-mod / UIX",
  custom_icons: "Custom Icons",
  daylight_calendar: "Daylight Calendar Card",
  kiosk_mode: "Kiosk Mode",
  weather: "Weather entity",
};
