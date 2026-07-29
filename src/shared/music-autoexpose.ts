/**
 * Current-device-first music: proactively make a *registered* device a Music Assistant
 * player so it can play music, without the user doing anything.
 *
 * When this device has no resolved Music Assistant player yet, we ask the backend to
 * expose the device's own `media_player` as an MA player (via the
 * `teds_dashboard_system/create_ma_player` command, which auto-adds MA's Home Assistant
 * provider when MA runs as the HA add-on). On success we PIN the device's `music_player`
 * setting to the new MA entity so resolution is deterministic from then on.
 *
 * Guardrails:
 * - Runs only for a **registered** browser_mod device (a named, real device — not a
 *   transient browser), gated by the per-device `music_auto_expose_device` setting
 *   (default on) and the Ted's Dashboard System integration being present.
 * - Runs **once per device** — persists `music_autoexpose_state: "done"` on success and
 *   only attempts once per page load (so a failure backs off to the next load, and a
 *   crash never leaves a sticky "pending").
 * - Only the current admin can change MA's config, so non-admin (kiosk) sessions no-op
 *   silently rather than spamming failed calls.
 * - Silent + a brief progress toast then a one-time success toast.
 */
import type { HomeAssistant } from "custom-card-helpers";
import type { ReactiveController, ReactiveControllerHost } from "lit";

import { resolveDeviceId, resolveDeviceMediaPlayer } from "./device-id";
import { isMassIntegrationLoaded, isMassPlayer, resolveMusicPlayer } from "./music-player";
import { settingsStore } from "./settings";

const DOMAIN = "teds_dashboard_system";

/** Guard so the attempt runs at most once per page load, even across host re-attach. */
let attemptedThisLoad = false;

type AutoExposeHost = ReactiveControllerHost & { hass?: HomeAssistant };

export class MusicAutoExposeController implements ReactiveController {
  private _unsub?: () => void;
  private _running = false;

  /** @param enabled Optional gate; when it returns false the controller is dormant. */
  constructor(
    private _host: AutoExposeHost,
    private _enabled?: () => boolean,
  ) {
    _host.addController(this);
  }

  hostConnected(): void {
    if (this._enabled && !this._enabled()) return;
    this._maybeRun();
    this._unsub = settingsStore.subscribe(() => {
      if (this._enabled && !this._enabled()) return;
      this._maybeRun();
    });
  }

  hostDisconnected(): void {
    this._unsub?.();
    this._unsub = undefined;
  }

  private _maybeRun(): void {
    if (attemptedThisLoad || this._running) return;
    const hass = this._host.hass;
    if (!hass || !settingsStore.hasLoaded()) return;
    // Only an admin can change Music Assistant's configuration.
    if (!(hass.user as { is_admin?: boolean } | undefined)?.is_admin) return;
    // Needs the HA Music Assistant integration (that's what exposes MA players + backs
    // the create command). Without it, the welcome/music guidance handles onboarding.
    if (!isMassIntegrationLoaded(hass)) return;
    // Registered device only — never litter MA with players for transient browsers.
    if (!settingsStore.registry()[resolveDeviceId()]) return;
    // Per-device opt-out (default on).
    if (settingsStore.effective().music_auto_expose_device === false) return;
    // Run once per device — terminal states block auto-retry (manual "Try again" recovers).
    const state = settingsStore.deviceSettings().music_autoexpose_state;
    if (state === "done" || state === "failed" || state === "needs_token") return;

    const res = resolveMusicPlayer(hass);
    if (res.state === "ok") {
      // Already resolves to an MA player — record it so we never re-check.
      settingsStore.setValue("device", "music_autoexpose_state", "done");
      return;
    }
    // The player to expose is this device's own media_player (fallback: the unmatched
    // base, e.g. the system-sound player).
    const base =
      resolveDeviceMediaPlayer(hass) ?? (res.state === "unmatched" ? res.base : undefined);
    if (!base || isMassPlayer(hass, base)) return;
    void this._run(hass, base);
  }

  private async _run(hass: HomeAssistant, base: string): Promise<void> {
    this._running = true;
    attemptedThisLoad = true;
    // Persist "pending" so the status card can show an in-progress badge (both cards read
    // the shared settings store).
    settingsStore.setValue("device", "music_autoexpose_state", "pending");
    this._log(`starting auto-expose for ${base}`);
    this._toast("Setting up music on this device…");
    try {
      await hass.callWS({ type: `${DOMAIN}/create_ma_player`, entity_id: base });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const message = (err as { message?: string })?.message ?? "Unknown error";
      this._log(`auto-expose failed (${code ?? "no-code"}): ${message}`, true);
      if (code === "needs_admin_token") {
        // No MA admin token configured — record it (so we don't retry every load) and post
        // a persistent, reviewable notification with the two ways to fix it.
        settingsStore.setValue("device", "music_autoexpose_state", "needs_token");
        this._notify(
          hass,
          "warning",
          "Set up music on this device",
          "Music Assistant only lets an admin add players. To make this device a Music " +
            "Assistant speaker automatically, paste a Music Assistant admin token in " +
            "Settings → Devices & Services → Ted's Dashboard System → Configure. Or add it " +
            "yourself in Music Assistant → Settings → Providers → Home Assistant Players.",
        );
      } else if (code === "needs_hass_setup") {
        settingsStore.setValue("device", "music_autoexpose_state", "needs_token");
        this._notify(hass, "warning", "Set up music on this device", message);
      } else {
        settingsStore.setValue("device", "music_autoexpose_state", "failed");
        this._notify(hass, "danger", "Music setup didn't finish", message);
      }
      this._running = false;
      this._host.requestUpdate();
      return;
    }
    // Success: find the new MA player and pin it as this device's music_player.
    const entity = await this._pollForMatch(hass);
    if (entity) {
      settingsStore.setValue("device", "music_player", entity);
      this._log(`pinned music_player to ${entity}`);
    } else {
      this._log("created player but couldn't resolve the exposed MA entity to pin", true);
    }
    settingsStore.setValue("device", "music_autoexpose_state", "done");
    this._toast("This device is now a Music Assistant speaker.");
    this._running = false;
    this._host.requestUpdate();
  }

  /** Wait briefly for the exposed MA `media_player` entity to appear, then return it. */
  private async _pollForMatch(hass: HomeAssistant): Promise<string | undefined> {
    for (let i = 0; i < 20; i++) {
      const res = resolveMusicPlayer(hass);
      if (res.state === "ok") return res.entity;
      await new Promise((r) => setTimeout(r, 500));
    }
    return undefined;
  }

  private _log(message: string, isError = false): void {
    const line = `[teds MA auto-expose] ${message}`;
    if (isError) console.warn(line);
    else console.info(line);
  }

  /** Post a persistent, reviewable notification via the Ted notification engine. */
  private _notify(
    hass: HomeAssistant,
    severity: "info" | "success" | "warning" | "danger" | "tip",
    title: string,
    message: string,
  ): void {
    const area = (
      settingsStore.registry()[resolveDeviceId()] as { area?: string } | undefined
    )?.area;
    const data: Record<string, unknown> = { title, message, severity, persistence: "normal" };
    if (area) data.area = area;
    void hass.callService?.("teds_dashboard_system", "notify", data);
  }

  private _toast(message: string): void {
    // HA's built-in bottom toast; dispatched directly (not in the typed fireEvent map).
    (this._host as unknown as HTMLElement).dispatchEvent(
      new CustomEvent("hass-notification", {
        detail: { message },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
