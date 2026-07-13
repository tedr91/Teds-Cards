import type { LovelaceCardConfig } from "custom-card-helpers";
import type {
  BackgroundAlbum,
  BackgroundAlign,
  BackgroundMode,
  BackgroundRepeat,
  BackgroundSize,
  BackgroundTypePref,
} from "../../shared/background";

export interface BackgroundCardConfig extends LovelaceCardConfig {
  type: string;
  /** Opt into the Teds-Cards-Backend settings store (per-device settings, built-in
   *  wallpapers served locally). Default false = self-contained, card-only. */
  backend_integration?: boolean;
  // Per-card wallpaper overrides (any set field wins over settings / defaults).
  background_mode?: BackgroundMode;
  background_scroll?: boolean;
  background_size?: BackgroundSize;
  background_align?: BackgroundAlign;
  background_repeat?: BackgroundRepeat;
  background_color?: string;
  background_gradient?: boolean;
  background_image?: string | null;
  background_recent_images?: string[];
  background_album?: BackgroundAlbum;
  background_folder?: string | null;
  background_type_pref?: BackgroundTypePref;
  background_shuffle?: boolean;
  background_cycle_minutes?: number;
  background_enhance_readability?: boolean;
  background_readability_strength?: number;
}
