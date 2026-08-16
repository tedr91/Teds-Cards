/**
 * Cross-room bundled-photo assigner.
 *
 * Seeded from ALL Home Assistant Area names (so it's stable regardless of which Room
 * Cards happen to be mounted), it assigns each area a bundled header photo so that,
 * per category:
 *   - the best-fitting area gets the category's MAIN photo (e.g. "Primary Bedroom"
 *     wins Bedroom.webp over "Steve's Room"),
 *   - remaining areas fall back to the "Alt" photos, distributed deterministically,
 *   - a category with no alternates leaves every area on the main photo.
 *
 * A Room Card looks up its resolved area's key via `keyForArea`; the assignment updates
 * (and notifies subscribers) whenever areas are added/removed/renamed.
 */
import { photoTypeFor, variantKeysForType } from "./const";

interface HassAreas {
  areas?: Record<string, { name?: string } | undefined>;
}

interface AreaEntry {
  id: string;
  name: string;
  type: string;
  weight: number;
}

class RoomPhotoAssigner {
  private areas = new Map<string, AreaEntry>();
  private assignments = new Map<string, string>();
  private listeners = new Set<() => void>();
  /** The `hass.areas` object last seeded from, to skip work when it hasn't changed. */
  private lastAreasRef: unknown;

  /** Re-seed from the current Home Assistant areas. Cheap no-op when the area registry
   *  object is unchanged (its reference changes on any add/remove/rename). */
  syncAreas(hass: unknown): void {
    const areas = (hass as HassAreas | undefined)?.areas;
    if (!areas || areas === this.lastAreasRef) return;
    this.lastAreasRef = areas;

    const next = new Map<string, AreaEntry>();
    for (const [id, info] of Object.entries(areas)) {
      const name = (info?.name ?? id).trim();
      const { type, weight } = photoTypeFor(name);
      next.set(id, { id, name, type, weight });
    }
    if (!this.areasEqual(next)) {
      this.areas = next;
      this.recompute();
    }
  }

  /** The assigned bundled-photo KEY for an area, or undefined if the area is unknown. */
  keyForArea(areaId: string | undefined): string | undefined {
    return areaId ? this.assignments.get(areaId) : undefined;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private areasEqual(next: Map<string, AreaEntry>): boolean {
    if (next.size !== this.areas.size) return false;
    for (const [id, e] of next) {
      const prev = this.areas.get(id);
      if (!prev || prev.name !== e.name || prev.type !== e.type || prev.weight !== e.weight) {
        return false;
      }
    }
    return true;
  }

  private recompute(): void {
    const byType = new Map<string, AreaEntry[]>();
    for (const e of this.areas.values()) {
      const list = byType.get(e.type) ?? [];
      list.push(e);
      byType.set(e.type, list);
    }

    const next = new Map<string, string>();
    for (const [type, entries] of byType) {
      const variants = variantKeysForType(type);
      const alts = variants.slice(1);
      // Best fit first (weight desc), then a stable tiebreak so assignment is deterministic.
      entries.sort(
        (a, b) => b.weight - a.weight || (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1),
      );
      entries.forEach((e, i) => {
        const key = i === 0 || alts.length === 0 ? variants[0] : alts[(i - 1) % alts.length];
        next.set(e.id, key);
      });
    }

    let changed = next.size !== this.assignments.size;
    if (!changed) {
      for (const [id, key] of next) {
        if (this.assignments.get(id) !== key) {
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      this.assignments = next;
      for (const cb of this.listeners) cb();
    }
  }
}

/** Shared singleton — one assignment table for the whole page. */
export const roomPhotoAssigner = new RoomPhotoAssigner();
