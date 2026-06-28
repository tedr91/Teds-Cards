/**
 * Pure time/date formatting for the `time` and `date` status items. The token
 * logic mirrors the Clock Weather Card so both render identically.
 */
import type { StatusDateFormat, StatusTimeFormat } from "./types";

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
export function formatTimeParts(
  d: Date,
  fmt: StatusTimeFormat,
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

export function formatDate(d: Date, fmt: StatusDateFormat, custom: string, lang: string): string {
  if (fmt === "custom") return formatDateTokens(d, custom || "dddd, MMMM D", lang);
  return new Intl.DateTimeFormat(lang, { weekday: "long", month: "long", day: "numeric" }).format(d);
}
