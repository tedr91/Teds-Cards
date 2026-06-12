/**
 * Global constants shared across all cards in this collection.
 *
 * NAMESPACE is the prefix for every custom element registered by this package
 * (e.g. NAMESPACE = "ted" produces `ted-light-card`, `ted-light-card-editor`).
 */
export const NAMESPACE = "ted";

// Replaced at build time by @rollup/plugin-replace from package.json#version.
declare const __TED_CARDS_VERSION__: string;
export const VERSION: string = __TED_CARDS_VERSION__;

/** Entry on `window.customCards` — surfaces a card in the UI card picker. */
export interface CustomCardEntry {
  type: string;
  name: string;
  description: string;
  preview?: boolean;
  documentationURL?: string;
}

declare global {
  interface Window {
    customCards?: CustomCardEntry[];
  }
}
