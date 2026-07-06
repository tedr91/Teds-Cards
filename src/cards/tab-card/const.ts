import { NAMESPACE } from "../../shared/const";

export const TAB_CARD_TYPE = `${NAMESPACE}-tab-card`;
export const TAB_CARD_EDITOR_TYPE = `${TAB_CARD_TYPE}-editor`;
export const TAB_CARD_NAME = "Ted Tab Card";
export const TAB_CARD_DESCRIPTION =
  "A tabbed container that holds any cards, one per tab. The active tab can be deep-linked with a URL query parameter.";

/** Default URL query parameter used to deep-link the active tab. */
export const DEFAULT_TAB_PARAM = "tab";
