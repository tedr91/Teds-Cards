/**
 * Runtime validation of MDI icon names — WITHOUT bundling the ~7.4k-name list into
 * `ted-cards.js` and WITHOUT hitting the internet.
 *
 * The list ships with Ted's Dashboard System and is served LOCALLY from the same
 * folder as the bundle (`/teds_dashboard_system/frontend/mdi-names.txt`). It's read
 * once (same-origin) and cached in `localStorage`, so every subsequent load is
 * instant and fully offline. Card-only installs without the backend simply skip the
 * feature (the set stays empty → callers fall back to their own default icon).
 *
 * Used by the Calendar card to decide whether a non-MDI icon's slug (e.g.
 * `fluent-emoji:party-popper` → `party-popper`) has an exact `mdi:<name>` match.
 */

const LS_KEY = "ted-mdi-names-v1";
const NAMES_URL = "/teds_dashboard_system/frontend/mdi-names.txt";

const names = new Set<string>();
let attempted = false;
let inflight: Promise<void> | undefined;

// Populate synchronously from localStorage at import, so repeat loads never re-fetch
// and validation is available before the first render.
try {
  const cached = window.localStorage.getItem(LS_KEY);
  if (cached) {
    for (const n of cached.split("\n")) if (n) names.add(n);
    if (names.size) attempted = true;
  }
} catch {
  /* localStorage unavailable — fall through to a one-time fetch */
}

/** True when `name` is a known MDI icon slug (false until the list has loaded). */
export function mdiNameKnown(name: string): boolean {
  return names.has(name);
}

/** Load the MDI name list once — from cache, else the locally-served file. Resolves
 *  when the in-memory set is ready (or the single attempt has failed). Safe to call
 *  repeatedly; only one fetch is ever made per page load. */
export function ensureMdiNames(): Promise<void> {
  if (attempted) return Promise.resolve();
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(NAMES_URL);
      if (res.ok) {
        const text = await res.text();
        for (const n of text.split("\n")) {
          const t = n.trim();
          if (t) names.add(t);
        }
        try {
          window.localStorage.setItem(LS_KEY, [...names].join("\n"));
        } catch {
          /* storage full / unavailable — keep the set in memory only */
        }
      }
    } catch {
      /* offline / no backend serving the list — leave the set empty */
    } finally {
      attempted = true;
    }
  })();
  return inflight;
}
