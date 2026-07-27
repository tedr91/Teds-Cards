/**
 * Idempotent custom-element registration guard.
 *
 * The Ted's Cards bundle can be loaded more than once on a page — e.g. a user
 * has the standalone HACS "Ted's Cards" resource AND the "Ted's Dashboard
 * System" integration also auto-loads its bundled copy from a different URL. A
 * second evaluation of the bundle re-runs every `@customElement` decorator, and
 * `customElements.define()` throws when a tag is already registered, which
 * would break rendering of every card after the collision.
 *
 * This module (imported FIRST by the entry point, before any card module) wraps
 * `customElements.define` so that re-defining one of our own `ted-*` tags
 * becomes a harmless no-op — the first-loaded copy wins. It is scoped to the
 * `ted-` namespace so genuine double-registration bugs in Home Assistant's own
 * elements still surface as errors.
 */
import { NAMESPACE } from "./const";

const GUARD_FLAG = "__tedDefineGuardInstalled__";
const TAG_PREFIX = `${NAMESPACE}-`;

interface GuardedRegistry {
  [GUARD_FLAG]?: boolean;
}

if (
  typeof customElements !== "undefined" &&
  !(customElements as unknown as GuardedRegistry)[GUARD_FLAG]
) {
  const original = customElements.define.bind(customElements);
  customElements.define = function (
    name: string,
    constructor: CustomElementConstructor,
    options?: ElementDefinitionOptions,
  ): void {
    // Skip re-registering one of our own tags if the first copy already did.
    if (name.startsWith(TAG_PREFIX) && customElements.get(name)) return;
    original(name, constructor, options);
  };
  (customElements as unknown as GuardedRegistry)[GUARD_FLAG] = true;
}
