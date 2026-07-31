import { CustomCardEntry, NAMESPACE } from "./const";

/** Cards configured via YAML / the TDS UI rather than hand-added — kept out of the picker. */
const HIDDEN_FROM_PICKER = new Set<string>([
  `${NAMESPACE}-settings-card`,
  `${NAMESPACE}-announce-card`,
  `${NAMESPACE}-notification-card`,
]);

/**
 * Register a card with Home Assistant's UI card picker by appending it to the
 * global `window.customCards` array. Safe to call multiple times — duplicate
 * entries (matched by `type`) are skipped.
 */
export function registerCustomCard(entry: CustomCardEntry): void {
  if (HIDDEN_FROM_PICKER.has(entry.type)) return;
  window.customCards = window.customCards || [];
  if (window.customCards.some((c) => c.type === entry.type)) return;
  window.customCards.push(entry);
}
