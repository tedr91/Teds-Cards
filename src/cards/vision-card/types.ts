import type { LovelaceCardConfig } from "custom-card-helpers";

import type { TedStyleTheme } from "../../shared/types";
import type { VisionSeverity } from "./const";

/** One analyzed camera event as delivered by the backend. */
export interface VisionEvent {
  id: string;
  camera_id: string;
  camera_name: string;
  area?: string | null;
  area_name?: string | null;
  event_type: string;
  created: string;
  ts_start: string;
  ts_end: string;
  severity: VisionSeverity;
  short_summary: string;
  long_summary: string;
  thumbnail_url?: string | null;
  clip_url?: string | null;
  reviewed?: boolean;
  trigger_entity?: string | null;
  /** The AI flagged this event as a likely false alarm. */
  false_alarm?: boolean;
}

export interface VisionCardConfig extends LovelaceCardConfig {
  type: string;
  theme?: TedStyleTheme;
  /** Only show events from these cameras (unset = all). */
  cameras?: string[];
  /** Max events to display (default 50). */
  max_events?: number;
  /** Settings deep-link target for the onboarding/empty CTA. */
  settings_path?: string;
  empty_title?: string;
  empty_message?: string;
}
