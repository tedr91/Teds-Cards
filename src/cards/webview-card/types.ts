import type { LovelaceCardConfig } from "custom-card-helpers";

export interface WebviewCardConfig extends LovelaceCardConfig {
  type: string;
  /** URL to load. When unset, the card reads it from the `?<url_param>=` query string. */
  url?: string;
  /** Query-string parameter the URL is read from when `url` is unset. Default `url`. */
  url_param?: string;
  /** Fill the parent cell (default true). */
  fill?: boolean;
  /** `allow` attribute for the iframe (feature policy). */
  allow?: string;
}
