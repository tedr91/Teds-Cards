import { NAMESPACE } from "../../shared/const";

export const ANNOUNCE_CARD_TYPE = `${NAMESPACE}-announce-card`;
export const ANNOUNCE_CARD_EDITOR_TYPE = `${ANNOUNCE_CARD_TYPE}-editor`;
export const ANNOUNCE_CARD_NAME = "Ted Announce Card";
export const ANNOUNCE_CARD_DESCRIPTION =
  "Send spoken announcements to Ted's Dashboard devices/areas (requires the Ted's Cards Backend integration).";

export const ANNOUNCEMENTS_SENSOR = "sensor.teds_announcements";
export const ANNOUNCE_DOMAIN = "teds_cards_backend";
