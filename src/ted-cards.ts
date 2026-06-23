/**
 * Ted's Cards — main entry point.
 *
 * This file is the single bundled JavaScript module that Home Assistant loads
 * as a Lovelace resource. It imports every card in the collection so they all
 * register their custom elements when the module is evaluated.
 */
import { printVersionBanner } from "./shared/version-banner";

// Cards
import "./cards/light-card/ted-light-card";
import "./cards/cover-card/ted-cover-card";
import "./cards/remote-card/ted-remote-card";
import "./cards/clock-weather-card/ted-clock-weather-card";
import "./cards/label-button-card/ted-label-button-card";
import "./cards/room-card/ted-room-card";
import "./cards/spacer-card/ted-spacer-card";

printVersionBanner();
