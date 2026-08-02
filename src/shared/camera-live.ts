/**
 * Shared "open a live camera view" signal.
 *
 * Ted's Dashboard System's Vision "Display live feed" action asks the targeted device
 * to pop open a muted, full-screen live stream of the triggering camera (auto-closing
 * after a short window, or on tap). The navigation signal calls `requestCameraLive`;
 * the navbar card subscribes and also reads `pendingCameraLive()` on connect.
 */
type LiveListener = (entity: string) => void;

const PENDING_TTL_MS = 8_000;
let _pendingEntity: string | undefined;
let _pendingAt = 0;
const _listeners = new Set<LiveListener>();

/** Request that this device open a live view of `entity`. */
export function requestCameraLive(entity: string): void {
  _pendingEntity = entity;
  _pendingAt = Date.now();
  for (const l of _listeners) l(entity);
}

/** The most recent request, if still fresh (a host mounting just after the signal). */
export function pendingCameraLive(): string | undefined {
  return _pendingEntity && Date.now() - _pendingAt < PENDING_TTL_MS ? _pendingEntity : undefined;
}

/** Subscribe to live-view requests; returns an unsubscribe function. */
export function subscribeCameraLive(listener: LiveListener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}
