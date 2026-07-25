import type { LovelaceCardConfig } from "custom-card-helpers";
import type { TedStyleTheme } from "../../shared/types";

/** Config for the Assist-Response card. Content is pushed from the backend; the
 *  card only styles it and shows a placeholder until the first answer arrives. */
export interface AssistResponseCardConfig extends LovelaceCardConfig {
  type: string;
  /** Fallback title shown before the first answer arrives (and when a pushed
   *  answer carries no title). Defaults to "Assist". */
  title?: string;
  /** Placeholder message shown before the first answer arrives. */
  placeholder?: string;
  /** Default background image URL, used when a pushed answer carries no image. */
  background_image?: string;
  /** Fill the content area (default true). */
  fill?: boolean;

  // Visual — MessageBox-style frosted box
  theme?: TedStyleTheme;
  /** Leading icon (MessageBox-style). Defaults to a message icon; set "" to hide. */
  icon?: string;
  /** Accent color for the left stripe + icon (hex/rgb/hsl/var or a theme color name).
   *  Defaults to the theme accent. */
  accent?: string;
  /** Drop shadow under the box (default true). */
  shadow?: boolean;
  transparency?: number;
  blur?: number;
}

/** A pushed answer (matches the backend `EVENT_ASSIST_RESPONSE` payload). */
export interface AssistResponse {
  id?: string;
  title?: string | null;
  message: string;
  image?: string | null;
  areas?: string[];
  devices?: string[];
  ts?: string;
}
