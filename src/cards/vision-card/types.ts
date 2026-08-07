import type { LovelaceCardConfig } from "custom-card-helpers";

import type { TedStyleTheme } from "../../shared/types";
import type { VisionSeverity } from "./const";

/** One AI analysis pass, retained only when "Enable analysis debugging" is on. */
export interface VisionAnalysisPass {
  /** Which pass produced this: the fast first pass, the full second pass, or the
   *  single pass used when two-pass is disabled. The `_ab` variants are the parallel
   *  A/B-comparison runs (never published). */
  pass: "quick" | "detailed" | "single" | "quick_ab" | "detailed_ab" | "single_ab";
  /** The ai_task entity that ran it. */
  entity_id?: string | null;
  /** How many images/videos were attached. */
  attachments?: number;
  /** Whether the model actually received video, or stills standing in for it. */
  input?: "stills" | "video";
  /** Wall-clock time the pass took. */
  duration_ms?: number;
  /** True if this pass's text is what the event ended up showing. */
  published?: boolean;
  /** True if the ai_task call failed outright. */
  failed?: boolean;
  severity?: string | null;
  false_alarm?: boolean | null;
  short_summary?: string | null;
  long_summary?: string | null;
}

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
  /** Two-pass analysis progress; shown as a badge until "complete". */
  status?: "in_progress" | "analyzing" | "complete";
  /** Per-pass debug results (only when vision_debug_passes is enabled). */
  analysis_passes?: VisionAnalysisPass[] | null;
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
