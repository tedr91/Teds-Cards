/**
 * Module-level singleton driving the Automatic Night Mode. It runs on every view via the
 * always-present ted-background-card (which calls attach/setHass/detach), reads the `night_*`
 * settings, and on a nightly schedule transitions:
 *
 *   - the background: darkened by {@link NIGHT_BACKGROUND_DIM} (via the background engine);
 *   - screen brightness: the target dim % on a brightness entity (browser_mod screen light by
 *     default) — a `light` transitions natively over the duration;
 *   - font color: switched to the night color dashboard-wide (injected into hui-root).
 *
 * The "day" brightness value is snapshotted (persisted to localStorage) on the first entry into
 * night so it survives a page reload during the night, and restored in the morning. Background-dim
 * and font color have trivial day values (no dim / theme color) so only brightness is captured.
 */
import { settingsStore } from "../../shared/settings";
import { SETTINGS_DEFAULTS, type SettingsMap, type SettingsValue } from "../../shared/settings-schema";
import {
  brightnessToDim,
  isNight,
  nowMinutes,
  parseTimeToMinutes,
  resolveBrightnessEntity,
} from "../../shared/night-mode";
import { backgroundEngine } from "./background-engine";
import { findHuiRoot } from "./background-dom";
import { browserModId } from "../../shared/device-id";
import { cssColor } from "../../shared/appearance";

type ThemeMode = "auto" | "dark" | "light";

interface HassLike {
  states?: Record<string, { state?: string; attributes?: Record<string, unknown> } | undefined>;
  callService?(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown> | void;
  entities?: Record<string, { device_id?: string | null } | undefined>;
  devices?: Record<string, { identifiers?: [string, string][] } | undefined>;
}

/** Persisted "day" snapshot (per device, in the backend settings store) so we can restore the
 *  screen-brightness entity when night ends — even across a page reload. `entity: null` marks the
 *  device "night active" when no brightness entity is in play. */
interface DaySnapshot {
  entity: string | null;
  pct: number;
  /** Light entities only: whether the light was on, and its color temperature. */
  on?: boolean;
  kelvin?: number;
  mired?: number;
  /** The device's Auto/Light/Dark theme setting + theme name, restored when night ends. */
  themeMode?: ThemeMode;
  themeName?: string | null;
}

const NIGHT_FONT_STYLE_ID = "ted-night-mode-font";
/** The `ted-style` theme's default text color — the day-start of the font fade for ted-style cards
 *  (so they fade white → night color directly, without flashing through the HA theme color). */
const TED_STYLE_DAY_TEXT = "#ffffff";
/** Per-device settings key holding the day snapshot; its presence also = "night active". */
const NIGHT_DAY_SNAPSHOT_KEY = "night_day_snapshot";
/** Fixed restore duration (ms) when night mode is toggled OFF via the Enabled switch. */
const DISABLE_RESTORE_MS = 10_000;
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
  /** Whether night mode is currently applied (in-memory; the backend snapshot mirrors it across reloads). */
  private active = false;
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
    // Wait for the backend snapshot: acting on an empty store would miss a persisted day
    // snapshot and re-capture the already-dimmed brightness as the "day" value.
    if (!settingsStore.hasLoaded()) return;
    const s = this._settings();
    const enabled = s.night_enabled !== false;
    const startM = parseTimeToMinutes(s.night_start) ?? DEFAULT_START;
    const endM = parseTimeToMinutes(s.night_end) ?? DEFAULT_END;
    const wantNight = enabled && isNight(nowMinutes(), startM, endM);
    const wasActive = this._getDay() !== null;
    const durMs = Math.max(0, Number(s.night_transition_seconds ?? 30)) * 1_000;

    if (wantNight && !this.active) {
      // Fresh entry transitions; resuming after a reload (wasActive) snaps instantly + keeps day value.
      this._applyNight(s, wasActive ? 0 : durMs, !wasActive);
    } else if (!wantNight && (this.active || wasActive)) {
      // Toggling Enabled off restores over a fixed 10s; a natural morning end uses the transition.
      this._exitNight(enabled ? durMs : DISABLE_RESTORE_MS);
    } else if (wantNight && this.active) {
      // Already night: re-apply instantly only if a relevant setting changed (not on the
      // clock poll — that would snap an in-progress transition to its target).
      if (this._nightSig(s) !== this._appliedSig) this._applyNight(s, 0, false);
    }
  }

  /** Signature of the night settings that affect the applied look. */
  private _nightSig(s: SettingsMap): string {
    return JSON.stringify({
      font: String(s.night_font_color ?? "red"),
      dim: this._clampPct(Number(s.night_dim_brightness ?? 75)),
      bgDim: this._clampPct(Number(s.night_dim_background ?? 25)),
      dark: s.night_dark_mode !== false,
      entity: this._brightnessEntity(s) ?? "",
    });
  }

  private _applyNight(s: SettingsMap, durMs: number, snapshot: boolean): void {
    // Set active + signature BEFORE writing the snapshot: _setDay emits synchronously and
    // re-enters _evaluate, which must see us as already-night to skip re-applying.
    this.active = true;
    this._appliedSig = this._nightSig(s);

    const entity = this._brightnessEntity(s);
    if (snapshot && !this._getDay()) this._setDay(this._snapshotDay(entity));
    if (entity) this._animateBrightness(entity, this._clampPct(Number(s.night_dim_brightness ?? 75)), durMs);
    this._animateDim(brightnessToDim(Number(s.night_dim_background ?? 25)), durMs);
    this._applyFont(String(s.night_font_color ?? "red"), durMs);
    this._applyDarkMode(s, durMs);
  }

  /** Switch to Dark mode 5s after the transition finishes (needs browser_mod). Toggling the
   *  setting off while night restores the stored Auto/Light/Dark value. */
  private _applyDarkMode(s: SettingsMap, durMs: number): void {
    if (!browserModId()) return;
    if (this.darkTimer !== undefined) {
      clearTimeout(this.darkTimer);
      this.darkTimer = undefined;
    }
    if (s.night_dark_mode === false) {
      const day = this._getDay();
      if (day?.themeMode) this._setTheme(day.themeName ?? null, day.themeMode);
      return;
    }
    const day = this._getDay();
    const themeName = day?.themeName ?? null;
    const delay = durMs > 0 ? durMs + DARK_AFTER_TRANSITION_MS : 0;
    this.darkTimer = window.setTimeout(() => {
      this.darkTimer = undefined;
      this._setTheme(themeName, "dark");
    }, delay);
  }

  private _exitNight(durMs: number): void {
    this.active = false;
    this._appliedSig = undefined;

    if (this.darkTimer !== undefined) {
      clearTimeout(this.darkTimer);
      this.darkTimer = undefined;
    }
    const day = this._getDay();
    if (day) this._restoreDay(day, durMs);
    // Restore the Auto/Light/Dark setting immediately at night's end.
    if (day?.themeMode && browserModId()) this._setTheme(day.themeName ?? null, day.themeMode);
    this._animateDim(0, durMs);
    this._applyFont(null, durMs);
    this._clearDay();
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

  /** Capture the entity's current value as a day snapshot (brightness %, and for lights also
   *  the on/off state and color temperature) for later restore. Also captures the device's
   *  Auto/Light/Dark theme setting. */
  private _snapshotDay(entity: string | undefined): DaySnapshot {
    const snap: DaySnapshot = entity ? { entity, pct: this._readPct(entity) } : { entity: null, pct: 100 };
    if (entity && entity.split(".")[0] === "light") {
      const st = this.hass?.states?.[entity];
      snap.on = st?.state === "on";
      const k = Number(st?.attributes?.color_temp_kelvin);
      const m = Number(st?.attributes?.color_temp);
      if (!Number.isNaN(k) && k > 0) snap.kelvin = k;
      else if (!Number.isNaN(m) && m > 0) snap.mired = m;
    }
    const theme = (this.hass as unknown as { selectedTheme?: { theme?: string; dark?: boolean } | null } | undefined)
      ?.selectedTheme;
    snap.themeMode = theme?.dark === true ? "dark" : theme?.dark === false ? "light" : "auto";
    snap.themeName = typeof theme?.theme === "string" ? theme.theme : null;
    return snap;
  }

  /** Apply a theme mode (Auto/Light/Dark) to THIS browser via browser_mod, keeping the theme name. */
  private _setTheme(themeName: string | null, mode: ThemeMode): void {
    const bid = browserModId();
    if (!bid || !this.hass?.callService) return;
    void this.hass.callService("browser_mod", "set_theme", {
      theme: themeName ?? "auto",
      dark: mode,
      browser_id: [bid],
    });
  }

  /** Restore an entity to its captured day snapshot, fading brightness over `durMs`. For a light we
   *  also restore color temperature (set once — kelvin can't be JS-stepped). We NEVER restore to 0 or
   *  turn the light off: for a screen-brightness light that would black out the display, and a
   *  snapshot taken while the entity was momentarily off/unavailable can hold pct 0 / on:false — so
   *  in that case we fall back to full brightness. */
  private _restoreDay(day: DaySnapshot, durMs: number): void {
    const entity = day.entity;
    if (!entity) return;
    const restorePct = day.pct > 0 ? this._clampPct(day.pct) : 100;
    if (entity.split(".")[0] === "light") {
      const data: Record<string, unknown> = { entity_id: entity };
      if (typeof day.kelvin === "number") data.color_temp_kelvin = day.kelvin;
      else if (typeof day.mired === "number") data.color_temp = day.mired;
      if (Object.keys(data).length > 1) void this.hass?.callService?.("light", "turn_on", data);
    }
    this._animateBrightness(entity, restorePct, durMs);
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

  // --- Day-snapshot persistence (backend per-device setting) ---------------

  /** The stored day snapshot for this device, or null when night isn't active. */
  private _getDay(): DaySnapshot | null {
    const raw = settingsStore.deviceSettings()[NIGHT_DAY_SNAPSHOT_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const v = raw as Record<string, unknown>;
    const snap: DaySnapshot = {
      entity: typeof v.entity === "string" ? v.entity : null,
      pct: typeof v.pct === "number" ? v.pct : 100,
    };
    if (typeof v.on === "boolean") snap.on = v.on;
    if (typeof v.kelvin === "number") snap.kelvin = v.kelvin;
    if (typeof v.mired === "number") snap.mired = v.mired;
    if (v.themeMode === "auto" || v.themeMode === "dark" || v.themeMode === "light") snap.themeMode = v.themeMode;
    if (typeof v.themeName === "string" || v.themeName === null) snap.themeName = v.themeName as string | null;
    return snap;
  }

  private _setDay(day: DaySnapshot): void {
    settingsStore.setValue("device", NIGHT_DAY_SNAPSHOT_KEY, day as unknown as SettingsValue);
  }

  private _clearDay(): void {
    settingsStore.clearValue("device", NIGHT_DAY_SNAPSHOT_KEY);
  }
}

/** The shared night-mode engine instance (one per browser tab). */
export const nightModeEngine = new NightModeEngine();
