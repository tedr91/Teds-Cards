/**
 * Pure token-based time/date formatting for the `datetime` status item. The
 * token logic mirrors the Clock Weather Card so both render identically.
 */

/** Default token formats for the datetime status item. */
export const DEFAULT_DATE_FORMAT = "ddd, MMMM D";
export const DEFAULT_TIME_FORMAT = "h:MM a";

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

/** Format the time part of `d` using token string `fmt` (e.g. "h:MM"). */
export function formatTime(d: Date, fmt: string): string {
  const H = d.getHours();
  const h12 = H % 12 === 0 ? 12 : H % 12;
  const m = d.getMinutes();
  const s = d.getSeconds();
  const ampm = H < 12 ? "AM" : "PM";
  return replaceTokens(fmt || DEFAULT_TIME_FORMAT, [
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

/** Format the date part of `d` using token string `fmt` (e.g. "ddd, MMMM D"). */
export function formatDate(d: Date, fmt: string, lang: string): string {
  const weekdayLong = new Intl.DateTimeFormat(lang, { weekday: "long" }).format(d);
  const weekdayShort = new Intl.DateTimeFormat(lang, { weekday: "short" }).format(d);
  const monthLong = new Intl.DateTimeFormat(lang, { month: "long" }).format(d);
  const monthShort = new Intl.DateTimeFormat(lang, { month: "short" }).format(d);
  const day = d.getDate();
  const year = d.getFullYear();
  return replaceTokens(fmt || DEFAULT_DATE_FORMAT, [
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
