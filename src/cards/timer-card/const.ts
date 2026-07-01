import { NAMESPACE } from "../../shared/const";

export const TIMER_CARD_TYPE = `${NAMESPACE}-timer-card`;
export const TIMER_CARD_EDITOR_TYPE = `${TIMER_CARD_TYPE}-editor`;
export const TIMER_CARD_NAME = "Ted Timer Card";
export const TIMER_CARD_DESCRIPTION =
  "Start, view, and cancel countdown timers (requires the Ted's Cards Backend integration).";

export const TIMERS_SENSOR = "sensor.teds_timers";
export const TIMER_DOMAIN = "teds_cards_backend";

/** The reorderable / toggleable sections of the Timer card. */
export type TimerSection = "active" | "recent";

/** Default section order, matching the card's top-to-bottom layout. */
export const TIMER_SECTION_ORDER: TimerSection[] = ["active", "recent"];

/** Per-section metadata: editor label and the config key that toggles it. */
export const TIMER_SECTION_META: Record<
  TimerSection,
  { label: string; showKey: "show_active" | "show_recent" }
> = {
  active: { label: "Active", showKey: "show_active" },
  recent: { label: "Recent", showKey: "show_recent" },
};

/**
 * Normalize a stored `section_order` into a complete, valid ordering: drops
 * unknown keys and appends any missing sections in their default position.
 */
export function resolveTimerSectionOrder(order?: string[]): TimerSection[] {
  if (!Array.isArray(order)) return [...TIMER_SECTION_ORDER];
  const result = order.filter((s): s is TimerSection =>
    (TIMER_SECTION_ORDER as string[]).includes(s),
  );
  for (const s of TIMER_SECTION_ORDER) if (!result.includes(s)) result.push(s);
  return result;
}
