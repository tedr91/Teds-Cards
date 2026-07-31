import { NAMESPACE } from "../../shared/const";

export const VISION_CARD_TYPE = `${NAMESPACE}-vision-card`;
export const VISION_CARD_EDITOR_TYPE = `${VISION_CARD_TYPE}-editor`;
export const VISION_CARD_NAME = "Ted's Vision Card";
export const VISION_CARD_DESCRIPTION =
  "AI-analyzed camera event timeline (severity, summaries, thumbnail + clip).";

export const VISION_SEVERITIES = ["critical", "suspicious", "harmless", "unknown"] as const;
export type VisionSeverity = (typeof VISION_SEVERITIES)[number];

// Accent color per severity (falls back to theme tokens where possible).
export const SEVERITY_COLOR: Record<VisionSeverity, string> = {
  critical: "var(--error-color, #db4437)",
  suspicious: "var(--warning-color, #ffa600)",
  harmless: "var(--success-color, #43a047)",
  unknown: "var(--disabled-text-color, #9e9e9e)",
};

export const SEVERITY_LABEL: Record<VisionSeverity, string> = {
  critical: "Critical",
  suspicious: "Suspicious",
  harmless: "Harmless",
  unknown: "Unknown",
};

// "False alarm" tag/filter styling (the AI flagged the event as a likely false positive).
export const FALSE_ALARM_LABEL = "False alarm";
export const FALSE_ALARM_COLOR = "var(--info-color, #4285f4)";
