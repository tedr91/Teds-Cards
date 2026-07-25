import { NAMESPACE } from "../../shared/const";

export const ASSIST_RESPONSE_CARD_TYPE = `${NAMESPACE}-assist-response-card`;
export const ASSIST_RESPONSE_CARD_EDITOR_TYPE = `${ASSIST_RESPONSE_CARD_TYPE}-editor`;
export const ASSIST_RESPONSE_CARD_NAME = "Ted Assist-Response Card";
export const ASSIST_RESPONSE_CARD_DESCRIPTION =
  "Displays a title + message pushed by a voice intent or automation (requires the Ted's Dashboard System integration).";

export const ASSIST_RESPONSE_DOMAIN = "teds_dashboard_system";
/** Sensor holding the latest answer per target, for reload/late-join restore. */
export const ASSIST_RESPONSES_SENSOR = "sensor.teds_assist_responses";
/** Non-admin WebSocket command that streams pushed answers to the card. */
export const SUBSCRIBE_ASSIST_RESPONSES = `${ASSIST_RESPONSE_DOMAIN}/subscribe_assist_responses`;
