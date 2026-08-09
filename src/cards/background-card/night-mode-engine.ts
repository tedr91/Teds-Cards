/**
 * Module-level singleton driving Dynamic Night Mode. It runs on every view via the
 * always-present ted-background-card (which calls attach/setHass/detach), reads the `night_*`
 * settings, and on a nightly schedule applies each independently opt-in effect:
 *
 *   - screen brightness: animated between explicit day/night targets on a brightness entity
 *     (browser_mod screen light by default) when `night_screen_auto`;
 *   - background: dimmed between day/night targets when `night_background_auto`, and/or replaced
 *     by a calm solid gradient when `night_background_hide` (via the background engine);
 *   - font color: switched to the night color dashboard-wide when `night_font_shift`;
 *   - Dark Mode: HA's user-scoped dark theme toggled on at night when `night_dark_mode`
 *     (cascades to every session signed in as this account; the prior preference is restored at dawn).
 *
 * Day/night brightness values are explicit settings (no snapshot). A per-device `night_active`
 * marker mirrors the applied state so a page reload mid-night resumes without re-transitioning.
 */
import { settingsStore } from "../../shared/settings";
import { SETTINGS_DEFAULTS, type SettingsMap, type SettingsValue } from "../../shared/settings-schema";
import {
  brightnessToDim,
  isNight,
  isNightBySun,
  nowMinutes,
  parseTimeToMinutes,
  resolveBrightnessEntity,
} from "../../shared/night-mode";
import { backgroundEngine } from "./background-engine";
import { findHuiRoot } from "./background-dom";
import { cssColor } from "../../shared/appearance";

interface HassLike {
  states?: Record<string, { state?: string; attributes?: Record<string, unknown> } | undefined>;
  callService?(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown> | void;
  entities?: Record<string, { device_id?: string | null } | undefined>;
  devices?: Record<string, { identifiers?: [string, string][] } | undefined>;
  // HA's runtime `selectedTheme` is an object; the custom-card-helpers type still calls it a
  // string, so accept both to stay assignable from HomeAssistant.
  selectedTheme?: { theme?: string; dark?: boolean } | string | null;
}

const NIGHT_FONT_STYLE_ID = "ted-night-mode-font";
/** The `ted-style` theme's default text color — the day-start of the font fade for ted-style cards
 *  (so they fade white → night color directly, without flashing through the HA theme color). */
const TED_STYLE_DAY_TEXT = "#ffffff";
/** Per-device marker mirroring whether night mode is currently applied (survives a reload). */
const NIGHT_ACTIVE_KEY = "night_active";
/** Per-device snapshot of the user's dark-theme preference before night mode forced it on (so the
 *  morning can restore it). Absent = night mode isn't currently overriding dark mode. */
const NIGHT_DARK_PREV_KEY = "night_dark_prev";
/** Switch to Dark mode this long AFTER the night transition finishes. */
const DARK_AFTER_TRANSITION_MS = 5_000;
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
  private brightTimer?: number;
  private fontCleanupTimer?: number;
  private darkTimer?: number;
  /** Whether night mode is currently applied (in-memory; the backend marker mirrors it across reloads). */
  private active = false;
  /** First evaluate after mount — always repaints the page-local look (instant when unchanged). */
  private _first = true;
  /** Signature of the last-applied night settings, so the clock poll doesn't re-apply (and snap
   *  an in-progress transition) unless a relevant setting actually changed. */
  private _appliedSig?: string;
  /** Current applied background-dim fraction (mirror of the background engine's value). */
  private curDim = 0;
  /** Font-color cross-fade state: rAF handle + endpoints + current mix (0=day, 1=night). */
  private fontRaf?: number;
  private _fontDay = "";
  private _fontNight = "";
  private _fontP = 0;

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
      if (this.brightTimer !== undefined) {
        clearInterval(this.brightTimer);
        this.brightTimer = undefined;
      }
      if (this.darkTimer !== undefined) {
        clearTimeout(this.darkTimer);
        this.darkTimer = undefined;
      }
      if (this.fontRaf !== undefined) {
        cancelAnimationFrame(this.fontRaf);
        this.fontRaf = undefined;
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
    // Wait for the backend snapshot: acting on an empty store would misjudge the marker.
    if (!settingsStore.hasLoaded()) return;
    const s = this._settings();
    const want = this._wantNight(s);
    const durMs = Math.max(0, Number(s.night_transition_seconds ?? 30)) * 1_000;

    if (this._first) {
      // Fresh mount: repaint the current look. Instant when it matches the persisted marker
      // (resuming after a reload), else transition (the boundary was crossed while away). Screen
      // brightness is server-side state (already set), so only drive it when the state changed.
      this._first = false;
      const resume = this._marker() === want;
      this._apply(s, want, resume ? 0 : durMs, !resume);
      this.active = want;
      this._setMarker(want);
      return;
    }
    if (want !== this.active) {
      this._apply(s, want, durMs, true);
      this.active = want;
      this._setMarker(want);
    } else if (this._nightSig(s, want) !== this._appliedSig) {
      // Only a setting changed — re-apply instantly (never re-transition on the clock poll).
      this._apply(s, want, 0, true);
    }
  }

  /** Whether the schedule says it's night right now. */
  private _wantNight(s: SettingsMap): boolean {
    const source = String(s.night_schedule_source ?? "manual");
    const bySun =
      source === "sun_setting_rising" || source === "sun_dusk_dawn" ? isNightBySun(this.hass, source) : null;
    const startM = parseTimeToMinutes(s.night_start) ?? DEFAULT_START;
    const endM = parseTimeToMinutes(s.night_end) ?? DEFAULT_END;
    return bySun ?? isNight(nowMinutes(), startM, endM);
  }

  /** Signature of the night settings that affect the applied look. */
  private _nightSig(s: SettingsMap, isNightNow: boolean): string {
    return JSON.stringify({
      night: isNightNow,
      screen: s.night_screen_auto === true,
      screenDay: this._clampPct(Number(s.night_screen_day ?? 100)),
      screenNight: this._clampPct(Number(s.night_dim_brightness ?? 75)),
      entity: this._brightnessEntity(s) ?? "",
      bgAuto: s.night_background_auto === true,
      bgDay: this._clampPct(Number(s.night_background_day ?? 100)),
      bgNight: this._clampPct(Number(s.night_dim_background ?? 25)),
      hide: s.night_background_hide === true,
      fontShift: s.night_font_shift === true,
      font: String(s.night_font_color ?? "red"),
      dark: s.night_dark_mode === true,
    });
  }

  /** Apply every night effect for the current state, each gated by its own toggle. When
   *  `isNightNow` each enabled effect uses its night value, otherwise its day value.
   *  `driveBrightness` is false on a bare reload (the screen entity's state already persisted). */
  private _apply(s: SettingsMap, isNightNow: boolean, durMs: number, driveBrightness: boolean): void {
    this._appliedSig = this._nightSig(s, isNightNow);

    // Screen brightness — only when auto-adjust is on (else leave the screen to the user).
    if (driveBrightness && s.night_screen_auto === true) {
      const entity = this._brightnessEntity(s);
      if (entity) {
        const pct = this._clampPct(Number(isNightNow ? (s.night_dim_brightness ?? 75) : (s.night_screen_day ?? 100)));
        this._animateBrightness(entity, pct, durMs);
      }
    }

    // Background dim.
    if (s.night_background_auto === true) {
      const pct = Number(isNightNow ? (s.night_dim_background ?? 25) : (s.night_background_day ?? 100));
      this._animateDim(brightnessToDim(pct), durMs);
    } else {
      this._animateDim(0, durMs);
    }

    // Background hide → swap to a calm solid gradient at night, restored at dawn.
    backgroundEngine.setNightHide(s.night_background_hide === true && isNightNow);

    // Font-color shift.
    this._applyFont(
      s.night_font_shift === true && isNightNow ? String(s.night_font_color ?? "red") : null,
      durMs,
    );

    // Dark mode.
    this._applyDark(s.night_dark_mode === true && isNightNow, durMs);
  }

  /** Switch HA's user-scoped Dark Mode on (or restore the prior preference). Turning on happens
   *  5s after the transition finishes. Unlike a local override this drives Home Assistant's own
   *  per-user dark setting, so it cascades to every session signed in as this account. */
  private _applyDark(on: boolean, durMs: number): void {
    if (this.darkTimer !== undefined) {
      clearTimeout(this.darkTimer);
      this.darkTimer = undefined;
    }
    if (!on) {
      this._setNativeDark(false);
      return;
    }
    const delay = durMs > 0 ? durMs + DARK_AFTER_TRANSITION_MS : 0;
    this.darkTimer = window.setTimeout(() => {
      this.darkTimer = undefined;
      this._setNativeDark(true);
    }, delay);
  }

  /** The user's current dark-theme preference (true/false, or undefined = auto/system). */
  private _currentDark(): boolean | undefined {
    const sel = this.hass?.selectedTheme;
    return sel && typeof sel === "object" && typeof sel.dark === "boolean" ? sel.dark : undefined;
  }

  /** Toggle HA's user dark mode by firing `settheme` on the <home-assistant> root (which HA persists
   *  user-scoped). Snapshots the prior preference on the way in so the morning can restore it. */
  private _setNativeDark(on: boolean): void {
    const root = document.querySelector("home-assistant") as HTMLElement | null;
    if (!root) return;
    const dev = settingsStore.deviceSettings();
    const applied = NIGHT_DARK_PREV_KEY in dev;
    if (on) {
      if (!applied)
        settingsStore.setValue("device", NIGHT_DARK_PREV_KEY, (this._currentDark() ?? null) as SettingsValue);
      if (this._currentDark() !== true) this._fireSetTheme(root, true);
    } else if (applied) {
      const prev = dev[NIGHT_DARK_PREV_KEY];
      const restore = prev === true ? true : prev === false ? false : undefined;
      settingsStore.clearValue("device", NIGHT_DARK_PREV_KEY);
      if (this._currentDark() !== restore) this._fireSetTheme(root, restore);
    }
  }

  private _fireSetTheme(target: HTMLElement, dark: boolean | undefined): void {
    target.dispatchEvent(new CustomEvent("settheme", { detail: { dark }, bubbles: true, composed: true }));
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

  /** Switch (or restore) the dashboard-wide font color by injecting a style into hui-root.
   *  `color === null` fades back to the theme colors, then removes the style after `durMs`. */
  /** Cross-fade the dashboard-wide font color to `color` (or back to day when null) over `durMs`.
   *  We interpolate in JS via `color-mix` and rewrite the injected style each frame — the clock/
   *  weather cards read `var(--primary-text-color)` live, so this fades smoothly even though we
   *  can't attach a CSS transition to their shadow-DOM text. Only text tokens are recolored, and
   *  `--ted-style-surface-2` is pinned so surfaces don't pick up the red tint. */
  private _applyFont(color: string | null, durMs: number): void {
    const huiRoot = findHuiRoot();
    if (!huiRoot?.shadowRoot) return;
    if (this.fontCleanupTimer !== undefined) {
      clearTimeout(this.fontCleanupTimer);
      this.fontCleanupTimer = undefined;
    }
    const styleEl = huiRoot.shadowRoot.querySelector<HTMLStyleElement>(`#${NIGHT_FONT_STYLE_ID}`);
    if (color === null) {
      // Fade back to day, then remove the style. No-op if it was never applied this session.
      if (styleEl) this._animateFont(0, durMs, styleEl);
      return;
    }
    // Capture endpoints: the current theme text color (resolved) and the night color.
    this._fontDay =
      getComputedStyle(document.documentElement).getPropertyValue("--primary-text-color").trim() || "#e1e1e1";
    this._fontNight = cssColor(color) || color;
    let el = styleEl;
    if (!el) {
      el = document.createElement("style");
      el.id = NIGHT_FONT_STYLE_ID;
      huiRoot.shadowRoot.appendChild(el);
    }
    this._animateFont(1, durMs, el);
  }

  /** Drive the font mix from its current value to `toP` (0=day, 1=night) over `durMs`. */
  private _animateFont(toP: number, durMs: number, styleEl: HTMLStyleElement): void {
    if (this.fontRaf !== undefined) {
      cancelAnimationFrame(this.fontRaf);
      this.fontRaf = undefined;
    }
    const from = this._fontP;
    if (durMs <= 0 || from === toP) {
      this._fontP = toP;
      this._writeFont(styleEl, toP);
      if (toP <= 0) styleEl.remove();
      return;
    }
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / durMs);
      this._fontP = from + (toP - from) * t;
      this._writeFont(styleEl, this._fontP);
      if (t < 1) {
        this.fontRaf = requestAnimationFrame(tick);
      } else {
        this.fontRaf = undefined;
        if (toP <= 0) styleEl.remove();
      }
    };
    this.fontRaf = requestAnimationFrame(tick);
  }

  /** Write the font-color override at mix `p` (0=day … 1=night). */
  private _writeFont(styleEl: HTMLStyleElement, p: number): void {
    const pct = Math.max(0, Math.min(100, Math.round(p * 100)));
    const mix = (day: string): string =>
      pct >= 100
        ? this._fontNight
        : pct <= 0
          ? day
          : `color-mix(in srgb, ${this._fontNight} ${pct}%, ${day} ${100 - pct}%)`;
    const vars =
      // ted-style cards fade from their fixed white; native + `ha`-themed cards fade from the HA
      // theme text color — so each starts at its actual day color (no flash through a wrong color).
      `--ted-night-text: ${mix(TED_STYLE_DAY_TEXT)} !important;` +
      `--primary-text-color: ${mix(this._fontDay)} !important;` +
      `--secondary-text-color: ${mix(this._fontDay)} !important;` +
      // Keep surfaces neutral: Ted's `ha` theme derives --ted-style-surface-2 from the text color,
      // which would otherwise tint card surfaces with the night color.
      `--ted-style-surface-2: var(--ted-style-surface) !important;`;
    const css = `:not(.edit-mode) > hui-view { ${vars} }
    :not(.edit-mode) > hui-view * { ${vars} }`;
    if (styleEl.textContent !== css) styleEl.textContent = css;
  }

  /** Animate a brightness entity from its current value to `toPct` over `durMs`, stepping in
   *  JS. The browser_mod screen light (and many entities) ignore `light.turn_on`'s `transition`,
   *  so we drive the fade ourselves instead of relying on native transitions. */
  private _animateBrightness(entity: string, toPct: number, durMs: number): void {
    if (this.brightTimer !== undefined) {
      clearInterval(this.brightTimer);
      this.brightTimer = undefined;
    }
    const to = this._clampPct(toPct);
    if (durMs <= 0) {
      this._setBrightness(entity, to);
      return;
    }
    const from = this._readPct(entity);
    if (from === to) {
      this._setBrightness(entity, to);
      return;
    }
    // ~1 step/sec (clamped 500ms..2000ms) — smooth without spamming the service.
    const stepMs = Math.min(2000, Math.max(500, Math.round(durMs / 120)));
    const start = performance.now();
    this._setBrightness(entity, from);
    this.brightTimer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / durMs);
      this._setBrightness(entity, Math.round(from + (to - from) * t));
      if (t >= 1 && this.brightTimer !== undefined) {
        clearInterval(this.brightTimer);
        this.brightTimer = undefined;
      }
    }, stepMs);
  }

  /** Set a brightness entity to `pct` (0..100) immediately (no native transition). */
  private _setBrightness(entity: string, pct: number): void {
    if (!this.hass?.callService) return;
    const domain = entity.split(".")[0];
    if (domain === "light") {
      void this.hass.callService("light", "turn_on", { entity_id: entity, brightness_pct: pct });
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

  /** Read an entity's current value as a brightness percent (0..100). */
  private _readPct(entity: string): number {
    const st = this.hass?.states?.[entity];
    const domain = entity.split(".")[0];
    if (domain === "light") {
      const on = st?.state === "on";
      const b = Number(st?.attributes?.brightness);
      return on && !Number.isNaN(b) ? this._clampPct(Math.round((b / 255) * 100)) : 100;
    }
    const v = Number(st?.state);
    const min = Number(st?.attributes?.min ?? 0);
    const max = Number(st?.attributes?.max ?? 100);
    return !Number.isNaN(v) && max > min ? this._clampPct(Math.round(((v - min) / (max - min)) * 100)) : 100;
  }

  /** The brightness entity to drive: the explicit setting, else the resolved browser_mod light. */
  private _brightnessEntity(s: SettingsMap): string | undefined {
    const explicit = s.night_brightness_entity;
    if (typeof explicit === "string" && explicit) return explicit;
    return resolveBrightnessEntity(this.hass);
  }

  private _clampPct(n: number): number {
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  // --- Active marker (backend per-device setting, survives reloads) --------

  /** Whether the persisted marker says night mode was applied on this device. */
  private _marker(): boolean {
    return settingsStore.deviceSettings()[NIGHT_ACTIVE_KEY] === true;
  }

  private _setMarker(on: boolean): void {
    settingsStore.setValue("device", NIGHT_ACTIVE_KEY, on as unknown as SettingsValue);
  }
}

/** The shared night-mode engine instance (one per browser tab). */
export const nightModeEngine = new NightModeEngine();
