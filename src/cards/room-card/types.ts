import { LovelaceCardConfig } from "custom-card-helpers";

import type { TedStyleTheme } from "../../shared/types";

/** Visual styling mode. `ted-style` = self-contained look; `ha` = follow HA theme. */
export type RoomCardTheme = TedStyleTheme;

export interface RoomCardConfig extends LovelaceCardConfig {
  type: string;
  /** The Home Assistant area this card represents. */
  area?: string;
  /** Optional title override (defaults to the area's name). */
  name?: string;
  theme?: RoomCardTheme;
  brushed?: boolean;
}
