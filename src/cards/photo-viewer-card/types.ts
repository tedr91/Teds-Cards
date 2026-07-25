import type { LovelaceCardConfig } from "custom-card-helpers";

import type { TedStyleTheme } from "../../shared/types";

export type PhotoSource = "single" | "album";
export type PhotoFit = "contain" | "cover";

/** Album backends. Only `folder` (a Home Assistant media folder) ships today;
 *  the rest are placeholders for future phases. */
export type PhotoAlbumSource = "folder";

export interface PhotoViewerCardConfig extends LovelaceCardConfig {
  type: string;
  /** Show a single image, or browse a folder album. Default "single". */
  source?: PhotoSource;
  /** Single mode: a URL, `media-source://` URI, or local HA path. */
  image?: string;
  /** Album mode backend. Default "folder". */
  album_source?: PhotoAlbumSource;
  /** Album mode: a `media-source://` folder URI. When omitted and
   *  `backend_integration` is on, the `photos_folder` setting is used. */
  folder?: string;
  /** How the image sits in the frame. Default "contain" (letterboxed). */
  fit?: PhotoFit;
  /** Fill the card's container (used by the content-only Photos view). */
  fill?: boolean;
  /** When the card loads, re-open this device's last-viewed photo (else stay
   *  empty). The Photos view sets this true; embedded cards open immediately. */
  open_last_on_load?: boolean;
  /** URL query param used for deep-linking a photo. Default "photo". */
  url_param?: string;
  /** Opt into the backend (settings-driven folder, favorite, set-as-background). */
  backend_integration?: boolean;
  /** Deep link for the empty-state "Settings" button. */
  settings_path?: string;

  // Appearance
  theme?: TedStyleTheme;
  background?: string;
  transparency?: number;
  blur?: number;

  // Empty state
  empty_title?: string;
  empty_message?: string;
}
