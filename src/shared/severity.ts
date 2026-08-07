/**
 * Single source of truth for notification / MessageBox severity colors and ordering.
 * The same accent drives the toast/notification stripe and the auto-hide navbar pill.
 */

import { unsafeCSS, type CSSResult } from "lit";

import type { MessagePopupSeverity } from "./messagebox-popup";

export type Severity = MessagePopupSeverity;

export const SEVERITY_COLORS: Record<Severity, string> = {
  info: "#4cc2ff",
  success: "#6ccb5f",
  warning: "#ffb454",
  danger: "#ff7a7a",
  tip: "#9b6cff",
};

/** Ascending severity (least -> most severe). Index doubles as the rank. */
export const SEVERITY_ORDER: Severity[] = ["tip", "info", "success", "warning", "danger"];

/** Rank of a severity (higher = more severe); -1 for unknown values. */
export function severityRank(severity: string | undefined): number {
  return severity ? SEVERITY_ORDER.indexOf(severity as Severity) : -1;
}

/** The most severe value among the inputs, or null when none are recognized. */
export function highestSeverity(severities: Iterable<string | undefined>): Severity | null {
  let best: Severity | null = null;
  let bestRank = -1;
  for (const s of severities) {
    const rank = severityRank(s);
    if (rank > bestRank) {
      bestRank = rank;
      best = s as Severity;
    }
  }
  return best;
}

/** CSS rules mapping each `${selectorPrefix}${severity}` to `${prop}: <color>`. */
export function severityAccentCss(selectorPrefix: string, prop: string): CSSResult {
  const rules = SEVERITY_ORDER.map((sev) => `${selectorPrefix}${sev}{${prop}:${SEVERITY_COLORS[sev]};}`).join("");
  return unsafeCSS(rules);
}
