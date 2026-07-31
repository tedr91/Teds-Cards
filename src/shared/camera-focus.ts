/**
 * Shared "focus this camera" signal.
 *
 * When Ted's Dashboard System's Vision "Display live feed" action navigates a device
 * to the Cameras view, it also asks the camera card to make the triggering camera the
 * primary feed and switch it to a live stream. The navigation signal calls
 * `requestCameraFocus`; the camera card subscribes (for live updates) and also reads
 * `pendingCameraFocus()` on connect, since the view/card may mount just after the signal.
 */
type FocusListener = (entity: string) => void;

const PENDING_TTL_MS = 10_000;
let _pendingEntity: string | undefined;
let _pendingAt = 0;
const _listeners = new Set<FocusListener>();

/** Request that the camera view focus `entity` (make primary + live). */
export function requestCameraFocus(entity: string): void {
  _pendingEntity = entity;
  _pendingAt = Date.now();
  for (const l of _listeners) l(entity);
}

/** The most recent focus request, if it is still fresh (a card mounting after the signal). */
export function pendingCameraFocus(): string | undefined {
  return _pendingEntity && Date.now() - _pendingAt < PENDING_TTL_MS ? _pendingEntity : undefined;
}

/** Subscribe to focus requests; returns an unsubscribe function. */
export function subscribeCameraFocus(listener: FocusListener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}
