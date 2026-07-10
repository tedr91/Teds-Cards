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
import "./cards/button-card/ted-button-card";
import "./cards/expandable-button-card/ted-expandable-button-card";
import "./cards/messagebox-card/ted-messagebox-card";
import "./cards/room-card/ted-room-card";
import "./cards/spacer-card/ted-spacer-card";
import "./cards/camera-card/ted-camera-card";
import "./cards/climate-card/ted-climate-card";
import "./cards/navbar-card/ted-navbar-card";
import "./cards/alarm-card/ted-alarm-card";
import "./cards/timer-card/ted-timer-card";
import "./cards/notification-card/ted-notification-card";
import "./cards/tab-card/ted-tab-card";
import "./cards/settings-card/ted-settings-card";
// Client-side status panel — intentionally NOT in the "Add card" picker (no
// registerCustomCard call); used by reference in YAML (custom:ted-status-card).
import "./cards/status-card/ted-status-card";

printVersionBanner();
