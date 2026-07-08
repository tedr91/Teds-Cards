import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import {
  type HomeAssistant,
  type LovelaceCard,
  type LovelaceCardEditor,
} from "custom-card-helpers";

import { registerCustomCard } from "../../shared/register-card";
import { appearanceStyle } from "../../shared/appearance";
import { brushedOverlay, tedCardThemeClass, tedStyleTheme } from "../../shared/theme";
import {
  CLOCK_WEATHER_CARD_DESCRIPTION,
  CLOCK_WEATHER_CARD_EDITOR_TYPE,
  CLOCK_WEATHER_CARD_NAME,
  CLOCK_WEATHER_CARD_TYPE,
  DEFAULT_WEATHER_ICON,
  WEATHER_ICONS,
} from "./const";
import { fancyWeatherIcon } from "./weather-icons";
import { coolWeatherIcon } from "./cool-icons";
import type { ClockWeatherCardConfig, TimeFormat, DateFormat } from "./types";

/** Reference string used to keep the clock font-size stable across minutes. */
const TICK_MS = 1000;
const CLOCK_WEIGHT = "600";
const DATE_WEIGHT = "500";
/** "12:22" should occupy this fraction of the card width at the default (Large) size. */
const CLOCK_WIDTH_FRACTION = 0.65;
/** "Saturday, June 22" should occupy this fraction of the card width at the default size. */
const DATE_WIDTH_FRACTION = 0.33;
/** The weather block (icon + temperature) should occupy this fraction of the card width at the default size. */
const WEATHER_WIDTH_FRACTION = 0.28;
/** AM/PM suffix font-size as a fraction of the clock font-size. */
const AMPM_SCALE = 1 / 3;

/** Vertical gap (px) between stacked rows — mirrors the `.cwc` `gap`. */
const CWC_ROW_GAP = 4;
/**
 * Vertical nudges (in units of the clock font-size) used to line a small
 * component up with the clock's glyphs when it is overlaid in the clock row.
 * Large fonts leave empty space above/below the digits, so the small date/weather
 * would otherwise sit too low/high. We move the small component, never the clock.
 */
/** Date moves UP by this × clock font so its baseline meets the clock's. */
const DATE_BASELINE_NUDGE = 0.072;
/** Weather moves DOWN by this × clock font so its top meets the clock's cap-top. */
const WEATHER_TOP_NUDGE = 0.128;
/**
 * Fixed reference instant used ONLY for font-size measurement so the clock and
 * date never resize as the real time/date changes. Chosen to be wide:
 * a Wednesday (long weekday) in September (long month), 22:22 (2-digit hour in
 * both 12h and 24h, 2-digit minute).
 */
const REFERENCE_DATE = new Date(2000, 8, 20, 22, 22, 22);

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Replace the longest matching token at each position (no re-replacement of output). */
function replaceTokens(fmt: string, map: Array<[string, string]>): string {
  const tokens = [...map].sort((a, b) => b[0].length - a[0].length);
  let out = "";
  let i = 0;
  while (i < fmt.length) {
    let matched = false;
    for (const [tok, val] of tokens) {
      if (fmt.startsWith(tok, i)) {
        out += val;
        i += tok.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += fmt[i];
      i++;
    }
  }
  return out;
}

function formatTimeTokens(d: Date, fmt: string): string {
  const H = d.getHours();
  const h12 = H % 12 === 0 ? 12 : H % 12;
  const m = d.getMinutes();
  const s = d.getSeconds();
  const ampm = H < 12 ? "AM" : "PM";
  return replaceTokens(fmt, [
    ["HH", pad(H)],
    ["H", String(H)],
    ["hh", pad(h12)],
    ["h", String(h12)],
    ["MM", pad(m)],
    ["mm", pad(m)],
    ["M", String(m)],
    ["m", String(m)],
    ["SS", pad(s)],
    ["ss", pad(s)],
    ["A", ampm],
    ["a", ampm.toLowerCase()],
  ]);
}

/** Derive 12-hour preference from HA's locale time_format ("12"/"am_pm"/"24"). */
function autoHour12(timeFormat: string | undefined): boolean | undefined {
  switch (timeFormat) {
    case "12":
    case "am_pm":
      return true;
    case "24":
      return false;
    default:
      return undefined; // let Intl decide from the locale
  }
}

/** Split the formatted time into its main part and the AM/PM suffix (empty if none). */
function formatTimeParts(
  d: Date,
  fmt: TimeFormat,
  custom: string,
  lang: string,
  localeTimeFormat: string | undefined,
): { main: string; suffix: string } {
  if (fmt === "custom") {
    return { main: formatTimeTokens(d, custom || "H:MM"), suffix: "" };
  }
  let hour12: boolean | undefined;
  if (fmt === "12h") hour12 = true;
  else if (fmt === "24h") hour12 = false;
  else hour12 = autoHour12(localeTimeFormat);
  const parts = new Intl.DateTimeFormat(lang, {
    hour: "numeric",
    minute: "2-digit",
    hour12,
  }).formatToParts(d);
  let main = "";
  let suffix = "";
  for (const p of parts) {
    if (p.type === "dayPeriod") suffix = p.value;
    else main += p.value;
  }
  return { main: main.trim(), suffix };
}

function formatDateTokens(d: Date, fmt: string, lang: string): string {
  const weekdayLong = new Intl.DateTimeFormat(lang, { weekday: "long" }).format(d);
  const weekdayShort = new Intl.DateTimeFormat(lang, { weekday: "short" }).format(d);
  const monthLong = new Intl.DateTimeFormat(lang, { month: "long" }).format(d);
  const monthShort = new Intl.DateTimeFormat(lang, { month: "short" }).format(d);
  const day = d.getDate();
  const year = d.getFullYear();
  return replaceTokens(fmt, [
    ["dddd", weekdayLong],
    ["ddd", weekdayShort],
    ["MMMM", monthLong],
    ["MMM", monthShort],
    ["DD", pad(day)],
    ["D", String(day)],
    ["YYYY", String(year)],
    ["YY", String(year).slice(-2)],
  ]);
}

function formatDate(d: Date, fmt: DateFormat, custom: string, lang: string): string {
  if (fmt === "custom") return formatDateTokens(d, custom || "dddd, MMMM D", lang);
  return new Intl.DateTimeFormat(lang, { weekday: "long", month: "long", day: "numeric" }).format(d);
}

/** Resolve a CSS color from a `ui_color` value (hex/rgb/hsl/var string or theme color name). */
function cssColor(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("#") || value.startsWith("rgb") || value.startsWith("hsl") || value.startsWith("var")) {
    return value;
  }
  return `var(--${value}-color, ${value})`;
}

/** Subset of Home Assistant's LovelaceGridOptions for the Sections grid layout. */
interface GridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  max_columns?: number;
  min_rows?: number;
  max_rows?: number;
}

registerCustomCard({
  type: CLOCK_WEATHER_CARD_TYPE,
  name: CLOCK_WEATHER_CARD_NAME,
  description: CLOCK_WEATHER_CARD_DESCRIPTION,
  preview: true,
  documentationURL: "https://github.com/tedr91/Teds-Cards#clock-weather-card",
  getEntitySuggestion: (_hass, entityId) =>
    entityId.startsWith("weather.")
      ? { config: { type: `custom:${CLOCK_WEATHER_CARD_TYPE}`, weather_entity: entityId } }
      : null,
});

@customElement(CLOCK_WEATHER_CARD_TYPE)
export class TedClockWeatherCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./ted-clock-weather-card-editor");
    return document.createElement(CLOCK_WEATHER_CARD_EDITOR_TYPE) as LovelaceCardEditor;
  }

  public static getStubConfig(hass: HomeAssistant): Omit<ClockWeatherCardConfig, "type"> {
    const weather = Object.keys(hass.states).find((id) => id.startsWith("weather."));
    return weather ? { weather_entity: weather } : {};
  }

  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: ClockWeatherCardConfig;
  @state() private _now = new Date();

  private _timer?: number;
  private _ro?: ResizeObserver;
  private _canvas?: HTMLCanvasElement;
  private _lastWidth = -1;
  private _lastHeight = -1;

  /** True in a Home Assistant Sections grid, where the card hugs its content
   *  (height is auto). Elsewhere it fills its container, so height matters. */
  private _inGrid(): boolean {
    return this.layout === "grid";
  }

  public setConfig(config: ClockWeatherCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    if (config.weather_entity && config.weather_entity.split(".")[0] !== "weather") {
      throw new Error("weather_entity must be a weather.* entity");
    }
    this._config = { ...config };
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): GridOptions {
    return {
      columns: "full",
      rows: "auto",
      min_rows: 1,
    };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._now = new Date();
    this._timer = window.setInterval(() => {
      this._now = new Date();
    }, TICK_MS);
    // Re-attach the width observer when the card is moved back into the DOM
    // (e.g. after leaving the dashboard editor), so font sizes recompute for
    // the restored width instead of staying stuck at the editor's width.
    this._setupObserver();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._timer !== undefined) window.clearInterval(this._timer);
    this._ro?.disconnect();
    this._ro = undefined;
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!this._config) return false;
    if (changed.has("_config") || changed.has("_now") || changed.has("layout")) return true;
    if (!changed.has("hass")) return false;
    const weather = this._weatherEntityId();
    if (!weather) return false;
    const oldHass = changed.get("hass") as HomeAssistant | undefined;
    if (!oldHass) return true;
    return oldHass.states[weather] !== this.hass?.states[weather];
  }

  protected firstUpdated(): void {
    this._setupObserver();
  }

  /** Observe the card so the fonts track its size. Safe to call repeatedly.
   *  Width always matters; height matters too when the card fills a container
   *  (i.e. not a Sections grid, where it hugs its content). */
  private _setupObserver(): void {
    if (this._ro) return;
    const el = this.renderRoot?.querySelector?.(".cwc") as HTMLElement | null;
    if (!el || !("ResizeObserver" in window)) return;
    this._ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      const width = rect?.width ?? 0;
      const height = rect?.height ?? 0;
      const widthChanged = Math.abs(width - this._lastWidth) >= 0.5;
      const heightChanged = Math.abs(height - this._lastHeight) >= 0.5;
      if (!widthChanged && !(heightChanged && !this._inGrid())) return;
      this._lastWidth = width;
      this._lastHeight = height;
      this._recompute(width, height);
    });
    this._ro.observe(el);
  }

  protected willUpdate(): void {
    // Fill the container (and size to its height) everywhere except a Sections
    // grid, where the card must hug its content for the auto-height row.
    this.toggleAttribute("fill", !this._inGrid());
  }

  protected updated(changed: PropertyValues): void {
    // Re-measure when the config or layout changes (sizes/formats/fill mode).
    // Resizes are handled by the ResizeObserver; the per-second clock tick must
    // NOT re-measure, else the font would change with the time/date text.
    if ((changed.has("_config") || changed.has("layout")) && this._lastWidth > 0) {
      this._recompute(this._lastWidth, this._lastHeight);
    }
  }

  private _clockFactor(): number {
    switch (this._config?.clock_size ?? "large") {
      case "small":
        return 0.6;
      case "medium":
        return 0.8;
      case "extra_large":
        return 1.2;
      case "custom":
        return (this._config?.clock_size_custom ?? 100) / 100;
      case "large":
      default:
        return 1;
    }
  }

  private _dateFactor(): number {
    return this._config?.date_size === "custom"
      ? (this._config?.date_size_custom ?? 100) / 100
      : 1;
  }

  private _weatherFactor(): number {
    return this._config?.weather_size === "custom"
      ? (this._config?.weather_size_custom ?? 100) / 100
      : 1;
  }

  private _lang(): string {
    return this.hass?.locale?.language || this.hass?.language || navigator.language || "en";
  }

  private _timeParts(date: Date = this._now): { main: string; suffix: string } {
    return formatTimeParts(
      date,
      this._config?.time_format ?? "auto",
      this._config?.time_format_custom ?? "H:MM",
      this._lang(),
      // hass.locale.time_format isn't in the published type; read it defensively.
      (this.hass?.locale as { time_format?: string } | undefined)?.time_format,
    );
  }

  private _dateText(date: Date = this._now): string {
    return formatDate(
      date,
      this._config?.date_format ?? "standard",
      this._config?.date_format_custom ?? "dddd, MMMM D",
      this._lang(),
    );
  }

  private _tempText(): string | undefined {
    const id = this._weatherEntityId();
    const stateObj = id ? this.hass?.states[id] : undefined;
    const temp = stateObj?.attributes?.temperature;
    if (temp == null || typeof temp !== "number") return undefined;
    const unit =
      (stateObj?.attributes?.temperature_unit as string | undefined) ??
      this.hass?.config?.unit_system?.temperature ??
      "°";
    return `${Math.round(temp)}${unit}`;
  }

  /** A fixed two-digit reference temperature (e.g. "88°F") used only for size
   * measurement so the weather never resizes as the live temperature changes,
   * matching how the clock/date use a reference. */
  private _tempRefText(): string {
    const live = this._tempText();
    if (!live) return "88°";
    return `88${live.replace(/^-?\d+/, "")}`;
  }

  private _weatherIcon(): string {
    const id = this._weatherEntityId();
    const condition = id ? this.hass?.states[id]?.state : undefined;
    return (condition && WEATHER_ICONS[condition]) || DEFAULT_WEATHER_ICON;
  }

  /** Animated ("fancy") weather icon markup for the current condition. */
  private _fancyWeatherIcon(): string {
    const id = this._weatherEntityId();
    const condition = id ? this.hass?.states[id]?.state : undefined;
    return fancyWeatherIcon(condition);
  }

  /** Current weather condition string (entity state), if available. */
  private _weatherCondition(): string | undefined {
    const id = this._weatherEntityId();
    return id ? this.hass?.states[id]?.state : undefined;
  }

  /** Configured weather entity, or the first `weather.*` entity found. */
  private _weatherEntityId(): string | undefined {
    if (this._config?.weather_entity) return this._config.weather_entity;
    return this.hass ? Object.keys(this.hass.states).find((id) => id.startsWith("weather.")) : undefined;
  }

  /** Width (in px) of `text` per 1px of font-size, using the card's resolved font. */
  private _widthPer1px(text: string, weight: string, family: string): number {
    this._canvas ??= document.createElement("canvas");
    const ctx = this._canvas.getContext("2d");
    if (!ctx) return 0;
    ctx.font = `${weight} 100px ${family}`;
    return ctx.measureText(text).width / 100;
  }

  /** Which optional elements sit on their own row (adding stack height). Mirrors
   *  the row placement decided in `render()`. */
  private _stackRows(): { weatherRow: boolean; dateRow: boolean } {
    const c = this._config ?? {};
    const showClock = c.show_clock !== false;
    const showWeather = c.show_weather !== false;
    const showIcon = c.show_weather_icon !== false;
    const showTemp = c.show_current_temp !== false;
    const showDate = c.show_date !== false;
    const weatherVisible = showWeather && (showIcon || (showTemp && this._tempText() != null));
    const clockOff = c.clock_offset ?? 0;
    const canOverlay = (off: number) => Math.abs(off - clockOff) > 50;
    const weatherAbove = c.weather_above_clock === true || !canOverlay(c.weather_offset ?? 100);
    const dateBelow = c.date_below_clock === true || !canOverlay(c.date_offset ?? 100);
    return {
      weatherRow: weatherVisible && (weatherAbove || !showClock),
      dateRow: showDate && (dateBelow || !showClock),
    };
  }

  /** Compute size-relative font sizes and publish them as CSS variables. Outside
   *  a Sections grid the fonts also scale down to fit the container `height`. */
  private _recompute(width: number, height = 0): void {
    const el = this.renderRoot.querySelector(".cwc") as HTMLElement | null;
    if (!el || width <= 0) return;
    const family = getComputedStyle(el).fontFamily || "sans-serif";

    // Measure against a fixed reference date so sizes stay constant over time.
    const { main, suffix } = this._timeParts(REFERENCE_DATE);
    const mainW = this._widthPer1px(main, CLOCK_WEIGHT, family);
    const suffixW = suffix ? this._widthPer1px(` ${suffix}`, CLOCK_WEIGHT, family) * AMPM_SCALE : 0;
    const clockW = mainW + suffixW;
    let clockPx = clockW > 0 ? (width * CLOCK_WIDTH_FRACTION * this._clockFactor()) / clockW : 0;

    const dateW = this._widthPer1px(this._dateText(REFERENCE_DATE), DATE_WEIGHT, family);
    let datePx = dateW > 0 ? (width * DATE_WIDTH_FRACTION * this._dateFactor()) / dateW : 0;

    // Weather (icon + temperature) is sized off the card width like the clock and
    // date, independent of the clock size. Width per 1px of the temp font is the
    // icon box (1em) + the 0.25em gap + the reference temperature text.
    const showIcon = this._config?.show_weather_icon !== false;
    const showTemp = this._config?.show_current_temp !== false;
    const tempTextW = showTemp ? this._widthPer1px(this._tempRefText(), "600", family) : 0;
    const weatherW = (showIcon ? 1 : 0) + (showIcon && showTemp ? 0.25 : 0) + tempTextW;
    let tempPx = weatherW > 0 ? (width * WEATHER_WIDTH_FRACTION * this._weatherFactor()) / weatherW : 0;

    // Outside a Sections grid the card fills a fixed-height container (e.g. the
    // calendar-week "clock" grid area). The width-driven sizes above could be too
    // tall for that height, so scale the whole stack down proportionally to fit.
    if (!this._inGrid() && height > 0) {
      const rows = this._stackRows();
      let stack = clockPx > 0 ? clockPx : Math.max(datePx, tempPx);
      if (rows.weatherRow) stack += tempPx + CWC_ROW_GAP;
      if (rows.dateRow) stack += datePx + CWC_ROW_GAP;
      if (stack > height && stack > 0) {
        const scale = height / stack;
        clockPx *= scale;
        datePx *= scale;
        tempPx *= scale;
      }
    }

    // Vertically recenter the clock. With line-height:1 the font leaves leading
    // above the caps and below the baseline; for many fonts (e.g. Segoe UI /
    // system-ui) the leading above is far larger than below, so the digits look
    // pushed down and the top padding looks bigger — and it scales with the font
    // size. Measure that asymmetry and lift the rows by half of it (--cwc-vshift)
    // so the visible glyphs sit with equal space above and below.
    let vshift = 0;
    const vctx = this._canvas?.getContext("2d");
    if (vctx) {
      vctx.font = `${CLOCK_WEIGHT} 100px ${family}`;
      const m = vctx.measureText(main);
      const fa = m.fontBoundingBoxAscent;
      const fd = m.fontBoundingBoxDescent;
      const aa = m.actualBoundingBoxAscent;
      const ad = m.actualBoundingBoxDescent;
      if ([fa, fd, aa, ad].every((v) => typeof v === "number")) {
        const halfLeading = (100 - fa - fd) / 2;
        const leadAbove = halfLeading + fa - aa;
        const leadBelow = halfLeading + fd - ad;
        vshift = ((leadAbove - leadBelow) / 2) * (clockPx / 100);
      }
    }

    el.style.setProperty("--cwc-clock-size", `${clockPx}px`);
    el.style.setProperty("--cwc-date-size", `${datePx}px`);
    el.style.setProperty("--cwc-temp-size", `${tempPx}px`);
    el.style.setProperty("--cwc-icon-size", `${tempPx}px`);
    el.style.setProperty("--cwc-vshift", `${vshift}px`);
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;

    const theme = this._config.theme === "ha" ? "ha" : "ted-style";
    const brushed = this._config.brushed === true;
    const shadow = this._config.shadow !== false; // default true

    const showClock = this._config.show_clock !== false;
    const showDate = this._config.show_date !== false;
    const showWeather = this._config.show_weather !== false;
    const showTemp = this._config.show_current_temp !== false; // default true

    const cardClasses = {
      "ted-card": true,
      [tedCardThemeClass(theme)]: true,
      "no-shadow": !shadow,
    };

    const cwBg = cssColor(this._config.background);
    const cardStyle: Record<string, string> = appearanceStyle({
      background: cwBg,
      transparency: this._config.transparency ?? (cwBg ? 0 : 100),
      blur: this._config.blur,
    });

    const { main: timeMain, suffix: timeSuffix } = this._timeParts();
    const dateText = this._dateText();
    const temp = this._tempText();
    const iconStyle = this._config.icon_style ?? "fancy";
    const showIcon = this._config.show_weather_icon !== false;
    const icon = this._weatherIcon();
    const weatherVisible = showWeather && (showIcon || (showTemp && temp != null));

    const clockOff = this._config.clock_offset ?? 0;
    const weatherOff = this._config.weather_offset ?? 100;
    const dateOff = this._config.date_offset ?? 100;
    // A component can only stay overlaid in the clock row when it sits far
    // enough to the opposite side of the clock not to overlap it. Otherwise it
    // is forced onto its own row.
    const canOverlay = (off: number): boolean => Math.abs(off - clockOff) > 50;
    const weatherAbove = this._config.weather_above_clock === true || !canOverlay(weatherOff);
    const dateBelow = this._config.date_below_clock === true || !canOverlay(dateOff);

    let iconEl;
    if (showIcon && iconStyle === "basic") {
      iconEl = html`<ha-icon class="wicon" .icon=${icon}></ha-icon>`;
    } else if (showIcon && iconStyle === "cool") {
      iconEl = html`<span class="wicon wicon-cool">${unsafeSVG(coolWeatherIcon(this._weatherCondition()))}</span>`;
    } else if (showIcon) {
      iconEl = html`<span class="wicon wicon-fancy">${unsafeSVG(this._fancyWeatherIcon())}</span>`;
    }
    const weatherInner = html`
      ${showIcon ? iconEl : nothing}
      ${showTemp && temp != null ? html`<span class="temp">${temp}</span>` : nothing}
    `;
    const clockEl = showClock
      ? html`<div class="clock" style=${styleMap({ "--cwc-off": String(clockOff) })}>
          <span class="t-main">${timeMain}</span
          >${timeSuffix ? html`<span class="t-suffix">${timeSuffix}</span>` : nothing}
        </div>`
      : nothing;

    // When overlaid in the clock row, nudge the small component (never the clock)
    // so it lines up with the clock's glyphs. Expressed in clock font-size units.
    const dateNudge = showClock
      ? { "--cwc-nudge-y": `calc(var(--cwc-clock-size, 4rem) * ${-DATE_BASELINE_NUDGE})` }
      : {};
    const weatherNudge = showClock
      ? { "--cwc-nudge-y": `calc(var(--cwc-clock-size, 4rem) * ${WEATHER_TOP_NUDGE})` }
      : {};

    return html`
      <ha-card class=${classMap(cardClasses)} style=${styleMap(cardStyle)}>
        ${brushed ? brushedOverlay : nothing}
        <div class=${classMap({ cwc: true, fill: !this._inGrid() })}>
          ${weatherVisible && weatherAbove
            ? html`<div class="row weather-row">
                <div class="weather" style=${styleMap({ "--cwc-off": String(weatherOff) })}>
                  ${weatherInner}
                </div>
              </div>`
            : nothing}
          <div class="row clock-row">
            ${weatherVisible && !weatherAbove
              ? html`<div
                  class="weather weather-abs"
                  style=${styleMap({ ...weatherNudge, "--cwc-off": String(weatherOff) })}
                >
                  ${weatherInner}
                </div>`
              : nothing}
            ${clockEl}
            ${showDate && !dateBelow
              ? html`<div
                  class="date date-abs"
                  style=${styleMap({ ...dateNudge, "--cwc-off": String(dateOff) })}
                >
                  ${dateText}
                </div>`
              : nothing}
          </div>
          ${showDate && dateBelow
            ? html`<div class="row date-row">
                <div class="date" style=${styleMap({ "--cwc-off": String(dateOff) })}>
                  ${dateText}
                </div>
              </div>`
            : nothing}
        </div>
      </ha-card>
    `;
  }

  static styles = [
    tedStyleTheme,
    css`
      :host {
        display: block;
      }

      /* position/isolation/overflow clip the brushed-metal overlay to the
         rounded corners (same trio the other ted-* cards use). No height:100%
         though: the card hugs its content so Home Assistant's Sections "auto
         height" grid (grid-auto-rows: auto) measures the real clock height.
         With height:100% the card filled the grid row and echoed that height
         back, so once the width-driven clock font changed the auto row stayed
         locked taller than the content (empty space below). */
      ha-card {
        position: relative;
        isolation: isolate;
        overflow: hidden;
      }

      /* Outside a Sections grid the card fills its container so the fonts can be
         sized to the available height (e.g. a grid-layout "clock" area). */
      :host([fill]),
      :host([fill]) ha-card {
        height: 100%;
      }

      .cwc {
        position: relative;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        gap: 4px;
        width: 100%;
        min-height: 56px;
        padding: 14px 18px;
        overflow: hidden;
        color: var(--ted-style-text);
      }
      .cwc.fill {
        height: 100%;
        /* When filling a fixed-height cell, centre any leftover vertical space
           so it isn't all piled above the (bottom-aligned) clock. */
        justify-content: center;
      }

      .row {
        position: relative;
        width: 100%;
        /* Lift the rows by --cwc-vshift (measured per render) so the clock's
           visible glyphs are centered: line-height:1 leaves more leading above
           the caps than below the baseline for many fonts, which would push the
           clock down and make the top padding look larger. */
        transform: translateY(calc(-1 * var(--cwc-vshift, 0px)));
      }

      .clock-row {
        display: flex;
        align-items: flex-end;
      }

      .weather-row,
      .date-row {
        display: flex;
      }

      /* Continuous horizontal positioning driven by --cwc-off (0 = left … 100 =
         right). The left/translateX pair places the element's left edge at off%
         of the container and pulls it back by off% of its own width, so 0 sits
         flush-left, 100 flush-right and 50 perfectly centered. */
      .weather-row > .weather,
      .date-row > .date {
        flex: 0 1 auto;
        position: relative;
        left: calc(var(--cwc-off, 0) * 1%);
        transform: translateX(calc(var(--cwc-off, 0) * -1%));
      }

      /* Same offset when overlaid in the clock row (absolutely positioned). The
         optional --cwc-nudge-y lines the small component up with the clock glyphs. */
      .weather-abs,
      .date-abs {
        left: calc(var(--cwc-off, 0) * 1%);
        right: auto;
        transform: translate(calc(var(--cwc-off, 0) * -1%), var(--cwc-nudge-y, 0));
      }

      /* Subtle drop shadow behind the clock, date and weather glyphs (like the
         icon shadow on the Light and Cover cards) so they lift off the card.
         The shadow's opacity scales with the text lightness (relative-color
         syntax), so it adds depth behind light text but fades out for dark/black
         text, where a dark shadow just looks muddy. Older browsers that don't
         support relative-color from currentColor fall back to the plain dark shadow. */
      .clock,
      .date,
      .weather {
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
        filter: drop-shadow(0 1px 2px hsl(from currentColor 0 0% 0% / max(0, (l - 50) * 0.004)));
      }

      ha-card.no-shadow .clock,
      ha-card.no-shadow .date,
      ha-card.no-shadow .weather {
        filter: none;
      }

      .clock {
        flex: 0 1 auto;
        min-width: 0;
        position: relative;
        left: calc(var(--cwc-off, 0) * 1%);
        transform: translateX(calc(var(--cwc-off, 0) * -1%));
        font-size: var(--cwc-clock-size, 4rem);
        line-height: 1;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
        white-space: nowrap;
        text-align: left;
      }

      .clock .t-suffix {
        font-size: ${AMPM_SCALE}em;
        margin-left: 0.25em;
      }

      .date {
        font-size: var(--cwc-date-size, 1.1rem);
        font-weight: 500;
        line-height: 1;
        white-space: nowrap;
        color: var(--ted-style-muted);
      }

      .date.date-abs {
        position: absolute;
        bottom: 0;
      }

      .weather {
        display: flex;
        align-items: center;
        gap: 0.25em;
        line-height: 1;
        font-size: var(--cwc-temp-size, 1.2rem);
      }

      .weather.weather-abs {
        position: absolute;
        top: 0;
      }

      .weather .temp {
        font-size: var(--cwc-temp-size, 1.2rem);
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
      }

      /* All weather icon styles share one fixed box (= the temperature text
         size) so switching styles never shifts the layout. The padded SVG sets
         (cool/fancy) are scaled inside that box so every style's visible glyph
         reads at the same size as the temperature. */
      .weather .wicon,
      .weather .wicon-cool,
      .weather .wicon-fancy {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--cwc-icon-size, 1.4rem);
        height: var(--cwc-icon-size, 1.4rem);
      }

      .weather .wicon {
        --mdc-icon-size: calc(var(--cwc-icon-size, 1.4rem) * 1.4);
        color: var(--ted-style-text);
      }

      .weather .wicon-cool svg,
      .weather .wicon-fancy svg {
        width: 100%;
        height: 100%;
        display: block;
      }

      /* The Material (basic), HA-frontend (cool) and Meteocons (fancy) glyphs
         each fill a different fraction of their viewBox; these factors bring
         every style's visible glyph to roughly the temperature-text height. */
      .weather .wicon-fancy svg {
        transform: scale(1.4);
      }

      .weather .wicon-cool svg {
        transform: scale(1.35);
      }

      .weather .wicon-cool .rain {
        fill: var(--weather-icon-rain-color, #30b3ff);
      }
      .weather .wicon-cool .sun {
        fill: var(--weather-icon-sun-color, #fdd93c);
      }
      .weather .wicon-cool .moon {
        fill: var(--weather-icon-moon-color, #fcf497);
      }
      .weather .wicon-cool .cloud-back {
        fill: var(--weather-icon-cloud-back-color, #d4d4d4);
      }
      .weather .wicon-cool .cloud-front {
        fill: var(--weather-icon-cloud-front-color, #f9f9f9);
      }
      .weather .wicon-cool .snow {
        fill: var(--weather-icon-snow-color, #f9f9f9);
        stroke: var(--weather-icon-snow-stroke-color, #d4d4d4);
        stroke-width: 1;
        paint-order: stroke;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ted-clock-weather-card": TedClockWeatherCard;
  }
}
