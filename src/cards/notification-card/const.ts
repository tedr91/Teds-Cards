import { NAMESPACE } from "../../shared/const";

export const NOTIFICATION_CARD_TYPE = `${NAMESPACE}-notification-card`;
export const NOTIFICATION_CARD_EDITOR_TYPE = `${NOTIFICATION_CARD_TYPE}-editor`;
export const NOTIFICATION_CARD_NAME = "Ted Notification Center";
export const NOTIFICATION_CARD_DESCRIPTION =
  "A notification center: a bell with an unread badge that opens a list of notifications (requires the Ted's Cards Backend integration).";

export const NOTIFICATIONS_SENSOR = "sensor.teds_notifications";
export const NOTIFICATION_DOMAIN = "teds_cards_backend";
