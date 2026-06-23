import { LovelaceCardConfig } from "custom-card-helpers";

/** A transparent, fixed-size spacer. The only option is its square size in px. */
export interface SpacerCardConfig extends LovelaceCardConfig {
  type: string;
  /** Square size in px. Defaults to a single Room Card button size. */
  size?: number;
}
