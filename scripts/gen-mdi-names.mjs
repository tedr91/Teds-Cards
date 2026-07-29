/**
 * Generate `mdi-names.txt` — the newline-delimited list of every Material Design
 * Icons name (e.g. `party-popper`). The Calendar card fetches this once at runtime
 * to validate whether a non-MDI icon's slug has an exact `mdi:<name>` match before
 * using it (see src/shared/mdi-names.ts + src/cards/calendar-card/const.ts).
 *
 * Source of truth = @mdi/svg's meta.json (fetched from jsDelivr, no dependency).
 * Re-run when bumping the MDI version:  node scripts/gen-mdi-names.mjs
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const META_URL = "https://cdn.jsdelivr.net/npm/@mdi/svg/meta.json";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "mdi-names.txt");

const res = await fetch(META_URL);
if (!res.ok) throw new Error(`Failed to fetch ${META_URL}: ${res.status}`);
const meta = await res.json();

const names = Array.from(
  new Set(
    meta
      .map((icon) => (typeof icon?.name === "string" ? icon.name.trim().toLowerCase() : ""))
      .filter(Boolean),
  ),
).sort();

await writeFile(OUT, names.join("\n") + "\n", "utf8");
console.log(`Wrote ${names.length} MDI names to ${OUT}`);
