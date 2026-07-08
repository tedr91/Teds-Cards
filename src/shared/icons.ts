/**
 * Icon-set fallback resolver.
 *
 * A card `icon` may be a plain string (`"mdi:bed"`, `"streamline-ultimate-color:…"`)
 * or a per-set name map. When it's a map, we pick the first set — in priority order —
 * that is actually installed on this client, so a dashboard can prefer fancy icon
 * packs and gracefully degrade to MDI when a pack isn't present.
 *
 * Home Assistant renders a view/card `icon` as a single static string via `ha-icon`,
 * which has NO built-in fallback: an unregistered prefix just renders blank. HACS icon
 * packs register themselves on `window.customIcons[prefix]`, which we read here to
 * decide availability. (Names differ between packs, hence the per-set map.)
 */

/** Either a ready-to-use icon string, or a `{ set-prefix: icon-name }` map. */
export type IconSpec = string | Record<string, string>;

/** Preferred icon sets, most-preferred first. `mdi` is core and always available. */
export const ICON_SET_PRIORITY = [
  "streamline-ultimate-color",
  "streamline-freehand-color",
  "pepicons-print",
  "fluent",
  "mdi",
] as const;

/** Icon prefixes that ship with HA core (always resolvable, no pack needed). */
const CORE_ICON_SETS = new Set(["mdi", "mdil", "hass", "hui"]);

interface CustomIconsWindow {
  customIcons?: Record<string, unknown>;
}

/** True when an icon set (prefix) can be rendered on this client. */
export function isIconSetAvailable(prefix: string): boolean {
  if (CORE_ICON_SETS.has(prefix)) return true;
  const registry = (window as unknown as CustomIconsWindow).customIcons;
  return !!registry && prefix in registry;
}

/** `prefix` + `name` → `"prefix:name"` (names that already include a `:` pass through). */
function buildIcon(prefix: string, name: string): string {
  return name.includes(":") ? name : `${prefix}:${name}`;
}

/**
 * Resolve an {@link IconSpec} to a concrete `prefix:name` string.
 * - A string is returned unchanged.
 * - A map is resolved by {@link ICON_SET_PRIORITY} first (using only sets that are both
 *   present in the map AND installed), then any other installed set in the map, and
 *   finally the first provided entry as a last resort.
 * Returns `undefined` when the spec is empty.
 */
export function resolveIcon(spec: IconSpec | undefined | null): string | undefined {
  if (spec == null) return undefined;
  if (typeof spec === "string") return spec || undefined;

  const entries = Object.entries(spec).filter(([, name]) => !!name);
  if (!entries.length) return undefined;

  for (const prefix of ICON_SET_PRIORITY) {
    const name = spec[prefix];
    if (name && isIconSetAvailable(prefix)) return buildIcon(prefix, name);
  }
  for (const [prefix, name] of entries) {
    if (isIconSetAvailable(prefix)) return buildIcon(prefix, name);
  }
  const [prefix, name] = entries[0];
  return buildIcon(prefix, name);
}
