/**
 * Module-level singleton driving the Automatic Night Mode. It runs on every view via the
 * always-present ted-background-card (which calls attach/setHass/detach), reads the `night_*`
 * settings, and on a nightly schedule transitions:
 *
 *   - the background: darkened by {@link NIGHT_BACKGROUND_DIM} (via the background engine);
 *   - screen brightness: the target dim % on a brightness entity (browser_mod screen light by
 *     default) — a `light` transitions natively over the duration;
 *   - font colour: switched to the night colour dashboard-wide (injected into hui-root).
 *
 * The "day" brightness value is snapshotted (persisted to localStorage) on the first entry into
 * night so it survives a page reload during the night, and restored in the morning. Background-dim
 * and font colour have trivial day values (no dim / theme colour) so only brightness is captured.
 */
import { settingsStore } from "../../shared/settings";
import { SETTINGS_DEFAULTS, type SettingsMap } from "../../shared/settings-schema";
import {
  isNight,
  NIGHT_BACKGROUND_DIM,
  nowMinutes,
  parseTimeToMinutes,
  resolveBrightnessEntity,
} from "../../shared/night-mode";
import { backgroundEngine } from "./background-engine";
import { findHuiRoot } from "./background-dom";

interface HassLike {
  states?: Record<string, { state?: string; attributes?: Record<string, unknown> } | undefined>;
  callService?(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown> | void;
  entities?: Record<string, { device_id?: string | null } | undefined>;
  devices?: Record<string, { identifiers?: [string, string][] } | undefined>;
}

/** Persisted "day" brightness snapshot so a reload during night keeps the true day value. */
interface DaySnapshot {
  entity: string;
  pct: number;
}

const NIGHT_FONT_STYLE_ID = "ted-night-mode-font";
const LS_ACTIVE = "ted_night_active";
const LS_DAY = "ted_night_day";
/** How often to re-check the clock for a night-window boundary crossing. */
const POLL_MS = 30_000;

const DEFAULT_START = 21 * 60; // 21:00
const DEFAULT_END = 7 * 60; //   07:00

class NightModeEngine {
  private refCount = 0;
  private hass?: HassLike;
  private backendInt = false;
  private unsub?: () => void;
  private poll?: number;
  private dimRaf?: number;
  private fontCleanupTimer?: number;
  /** Whether night mode is currently applied (in-memory; localStorage mirrors it across reloads). */
  private active = false;
  /** Current applied background-dim fraction (mirror of the background engine's value). */
  private curDim = 0;

  /** A card connected: keep the engine live, subscribe to settings, start the clock poll. */
  attach(hass: HassLike | undefined, backendInt = false): void {
    this.refCount++;
    this.hass = hass;
    this.backendInt = backendInt;
    if (backendInt && !this.unsub) this.unsub = settingsStore.subscribe(() => this._evaluate());
    if (this.poll === undefined) this.poll = window.setInterval(() => this._evaluate(), POLL_MS);
    this._evaluate();
  }

  /** Latest hass from the mounted card. Re-evaluate when hass first arrives. */
  setHass(hass: HassLike | undefined): void {
    const had = !!this.hass;
    this.hass = hass;
    if (!had && hass) this._evaluate();
  }

  /** A card disconnected. Keep the applied look (no flash on navigation); pause ticking at 0. */
  detach(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) {
      this.unsub?.();
      this.unsub = undefined;
      if (this.poll !== undefined) {
        clearInterval(this.poll);
        this.poll = undefined;
      }
      if (this.dimRaf !== undefined) {
        cancelAnimationFrame(this.dimRaf);
        this.dimRaf = undefined;
      }
    }
  }

  /** Effective night settings (backend store when integrated, else plain defaults). */
  private _settings(): SettingsMap {
    return this.backendInt ? settingsStore.effective() : { ...SETTINGS_DEFAULTS };
  }

  /** Decide whether it should be night now and apply/restore accordingly. */
  private _evaluate(): void {
    if (!this.backendInt || !this.hass) return;
    const s = this._settings();
    const enabled = s.night_enabled !== false;
    const startM = parseTimeToMinutes(s.night_start) ?? DEFAULT_START;
    const endM = parseTimeToMinutes(s.night_end) ?? DEFAULT_END;
    const wantNight = enabled && isNight(nowMinutes(), startM, endM);
    const wasActive = this._lsActive();
    const durMs = Math.max(0, Number(s.night_transition_minutes ?? 5)) * 60_000;

    if (wantNight && !this.active) {
      // Fresh entry transitions; resuming after a reload (wasActive) snaps instantly + keeps day value.
      this._applyNight(s, wasActive ? 0 : durMs, !wasActive);
    } else if (!wantNight && (this.active || wasActive)) {
      this._exitNight(durMs);
    } else if (wantNight && this.active) {
      // Already night: a settings change (e.g. font colour) — re-apply instantly.
      this._applyNight(s, 0, false);
    }
  }

  private _applyNight(s: SettingsMap, durMs: number, snapshot: boolean): void {
    this.active = true;
    this._lsSetActive(true);

    const entity = this._brightnessEntity(s);
    if (entity) {
      if (snapshot && !this._lsDay()) this._lsSetDay(this._snapshotDay(entity));
      this._setBrightness(entity, this._clampPct(Number(s.night_dim_brightness ?? 10)), durMs);
    }
    this._animateDim(NIGHT_BACKGROUND_DIM, durMs);
    this._applyFont(String(s.night_font_color ?? "red"), durMs);
  }

  private _exitNight(durMs: number): void {
    this.active = false;
    this._lsSetActive(false);

    const day = this._lsDay();
    if (day?.entity) this._setBrightness(day.entity, this._clampPct(day.pct), durMs);
    this._animateDim(0, durMs);
    this._applyFont(null, durMs);
    this._lsClearDay();
  }

  // --- Effects ------------------------------------------------------------

  /** Animate the background dim from its current value to `to` over `durMs` (JS-stepped —
   *  CSS can't transition a gradient background). */
  private _animateDim(to: number, durMs: number): void {
    if (this.dimRaf !== undefined) {
      cancelAnimationFrame(this.dimRaf);
      this.dimRaf = undefined;
    }
    const from = this.curDim;
    if (durMs <= 0 || from === to) {
      this.curDim = to;
      backgroundEngine.setNightDim(to);
      return;
    }
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / durMs);
      const v = from + (to - from) * t;
      this.curDim = v;
      backgroundEngine.setNightDim(v);
      if (t < 1) this.dimRaf = requestAnimationFrame(tick);
      else this.dimRaf = undefined;
    };
    this.dimRaf = requestAnimationFrame(tick);
  }

  /** Switch (or restore) the dashboard-wide font colour by injecting a style into hui-root.
   *  `color === null` fades back to the theme colours, then removes the style after `durMs`. */
  private _applyFont(color: string | null, durMs: number): void {
    const huiRoot = findHuiRoot();
    if (!huiRoot?.shadowRoot) return;
    if (this.fontCleanupTimer !== undefined) {
      clearTimeout(this.fontCleanupTimer);
      this.fontCleanupTimer = undefined;
    }
    let styleEl = huiRoot.shadowRoot.querySelector<HTMLStyleElement>(`#${NIGHT_FONT_STYLE_ID}`);
    const transition = `:not(.edit-mode) > hui-view, :not(.edit-mode) > hui-view * { transition: color ${Math.max(0, durMs)}ms ease !important; }`;
    if (color === null) {
      // Keep the transition rule so text fades back, then remove the style entirely.
      if (styleEl) {
        styleEl.textContent = transition;
        this.fontCleanupTimer = window.setTimeout(() => {
          findHuiRoot()?.shadowRoot?.querySelector(`#${NIGHT_FONT_STYLE_ID}`)?.remove();
        }, Math.max(0, durMs) + 100);
      }
      return;
    }
    const css = `:not(.edit-mode) > hui-view {
      --primary-text-color: ${color} !important;
      --secondary-text-color: ${color} !important;
      --ted-style-text: ${color} !important;
    }
    ${transition}`;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = NIGHT_FONT_STYLE_ID;
      huiRoot.shadowRoot.appendChild(styleEl);
    }
    if (styleEl.textContent !== css) styleEl.textContent = css;
  }

  /** Set a brightness entity to `pct` (0..100). Lights transition natively over `durMs`. */
  private _setBrightness(entity: string, pct: number, durMs: number): void {
    if (!this.hass?.callService) return;
    const domain = entity.split(".")[0];
    if (domain === "light") {
      const transition = Math.round(durMs / 1000);
      const data: Record<string, unknown> = { entity_id: entity, brightness_pct: pct };
      if (transition > 0) data.transition = transition;
      void this.hass.callService("light", "turn_on", data);
      return;
    }
    if (domain === "number" || domain === "input_number") {
      const st = this.hass.states?.[entity];
      const min = Number(st?.attributes?.min ?? 0);
      const max = Number(st?.attributes?.max ?? 100);
      const value = min + (max - min) * (pct / 100);
      void this.hass.callService(domain, "set_value", { entity_id: entity, value: Math.round(value) });
    }
  }

  /** Capture the entity's current value as a day-brightness percent (0..100). */
  private _snapshotDay(entity: string): DaySnapshot {
    const st = this.hass?.states?.[entity];
    const domain = entity.split(".")[0];
    let pct = 100;
    if (domain === "light") {
      const on = st?.state === "on";
      const b = Number(st?.attributes?.brightness);
      pct = on && !Number.isNaN(b) ? Math.round((b / 255) * 100) : 100;
    } else {
      const v = Number(st?.state);
      const min = Number(st?.attributes?.min ?? 0);
      const max = Number(st?.attributes?.max ?? 100);
      pct = !Number.isNaN(v) && max > min ? Math.round(((v - min) / (max - min)) * 100) : 100;
    }
    return { entity, pct: this._clampPct(pct) };
  }

  private _brightnessEntity(s: SettingsMap): string | undefined {
    const explicit = s.night_brightness_entity;
    if (typeof explicit === "string" && explicit) return explicit;
    return resolveBrightnessEntity(this.hass);
  }

  private _clampPct(n: number): number {
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  // --- localStorage helpers (guarded so blocked storage never throws) ------

  private _lsActive(): boolean {
    try {
      return localStorage.getItem(LS_ACTIVE) === "1";
    } catch {
      return false;
    }
  }

  private _lsSetActive(on: boolean): void {
    try {
      if (on) localStorage.setItem(LS_ACTIVE, "1");
      else localStorage.removeItem(LS_ACTIVE);
    } catch {
      // ignore
    }
  }

  private _lsDay(): DaySnapshot | null {
    try {
      const raw = localStorage.getItem(LS_DAY);
      if (!raw) return null;
      const v = JSON.parse(raw) as DaySnapshot;
      return typeof v?.entity === "string" && typeof v?.pct === "number" ? v : null;
    } catch {
      return null;
    }
  }

  private _lsSetDay(day: DaySnapshot): void {
    try {
      localStorage.setItem(LS_DAY, JSON.stringify(day));
    } catch {
      // ignore
    }
  }

  private _lsClearDay(): void {
    try {
      localStorage.removeItem(LS_DAY);
    } catch {
      // ignore
    }
  }
}

/** The shared night-mode engine instance (one per browser tab). */
export const nightModeEngine = new NightModeEngine();
