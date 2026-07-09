import { NAMESPACE } from "../../shared/const";

export const STATUS_CARD_TYPE = `${NAMESPACE}-status-card`;
export const STATUS_CARD_NAME = "Ted Status Card";
export const STATUS_CARD_DESCRIPTION =
  "An at-a-glance panel of this device's dependency, backend and browser-registration status.";

/** Requirement ids that are Home Assistant integrations (as opposed to resources/entities). */
export const INTEGRATION_REQUIREMENTS = ["hacs", "browser_mod", "custom_icons"] as const;

/** Attribute keys on sensor.teds_requirements that aren't individual requirements. */
export const REQUIREMENT_META_KEYS = new Set(["missing", "ok", "version"]);
