import { NAMESPACE } from "../../shared/const";

export const MUSIC_CARD_TYPE = `${NAMESPACE}-music-card`;
export const MUSIC_CARD_EDITOR_TYPE = `${MUSIC_CARD_TYPE}-editor`;
export const MUSIC_CARD_NAME = "Ted Music Card";
export const MUSIC_CARD_DESCRIPTION =
  "Drive a Music Assistant player UI (mass-player-card or yet-another-media-player) from this device's Settings music player.";

/** The third-party cards this wrapper can render (chosen via config `engine`). */
export const MASS_PLAYER_CARD_TYPE = "custom:mass-player-card";
export const YAMP_CARD_TYPE = "custom:yet-another-media-player";

/** Entity-registry platform of Music Assistant media_player entities. */
export const MASS_PLAYER_PLATFORM = "music_assistant";
