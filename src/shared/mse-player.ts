/**
 * Framework-agnostic MSE (Media Source Extensions) live player for go2rtc streams,
 * reached through Frigate's built-in HA WebSocket proxy. It carries H.265 natively
 * over a plain WebSocket at ~0.5-2 s latency — the transports HA's `<ha-camera-stream>`
 * exposes (HLS/WebRTC) can't do here (WebRTC won't carry H.265 to Chrome; HLS lags).
 *
 * Mirrors go2rtc v1.9.10 / Frigate 0.17's `MsePlayer`: offer the browser's playable
 * codecs, receive a `video/mp4` codec answer, then append fragmented-MP4 segments to
 * a SourceBuffer. Network drops are retried a few times internally; any unrecoverable
 * condition is reported once via `onError` so the caller can fall back to `<hui-image>`.
 */

/** Minimal Home Assistant surface this module needs (WebSocket command sender). */
interface HassLike {
  callWS<T>(msg: { type: string; [key: string]: unknown }): Promise<T>;
}

export type MsePlayerState = "idle" | "connecting" | "playing" | "failed";

/** Why the player gave up. `startup` = never connected; `mse-decode` = the browser
 *  rejected the codec/segments; `network` = the socket dropped after playing and
 *  reconnects were exhausted. */
export type MsePlayerErrorKind = "mse-decode" | "network" | "startup";

export interface MsePlayerHandle {
  attach(video: HTMLVideoElement): void;
  destroy(): void;
  readonly state: MsePlayerState;
}

export interface MsePlayerOptions {
  hass: HassLike;
  /** Frigate instance id (MQTT client_id) for `/api/frigate/{id}/mse/...`; when empty,
   *  the no-instance proxy path is used (serves the single configured instance). */
  instanceId: string;
  /** go2rtc stream name, e.g. `front_yard` / `front_yard_med` / `front_yard_high`. */
  stream: string;
  onError: (kind: MsePlayerErrorKind, detail: string) => void;
  onPlaying?: () => void;
}

/** Codecs offered to the server, filtered to what this browser can actually play.
 *  Video codecs contain `vc1` (avc1/hvc1); the rest are audio (mirrors go2rtc). */
const CODECS = [
  "avc1.640029", // H.264 high 4.1
  "avc1.64002A", // H.264 high 4.2
  "avc1.640033", // H.264 high 5.1
  "hvc1.1.6.L153.B0", // H.265 main 5.1 — the one these cameras need
  "mp4a.40.2", // AAC LC
  "mp4a.40.5", // AAC HE
  "flac",
  "opus",
];

/** How long to wait for the socket + first codec answer before declaring `startup`. */
const STARTUP_TIMEOUT_MS = 5000;
/** Network reconnect backoff (ms) — three attempts, then give up. */
const RECONNECT_BACKOFF_MS = [1000, 2000, 4000];
/** Keep roughly this many seconds buffered behind the live edge. */
const LIVE_WINDOW_SECONDS = 5;

interface MediaSourceLike extends EventTarget {
  readyState: string;
  addSourceBuffer(type: string): SourceBuffer;
  endOfStream(reason?: string): void;
  setLiveSeekableRange?(start: number, end: number): void;
}

type MediaSourceConstructor = new () => MediaSourceLike;

function mediaSourceCtor(): MediaSourceConstructor | undefined {
  const w = window as unknown as {
    ManagedMediaSource?: MediaSourceConstructor;
    MediaSource?: MediaSourceConstructor;
  };
  return w.ManagedMediaSource ?? w.MediaSource;
}

/** Whether MSE (either flavour) is usable in this browser. */
export function isMseSupported(): boolean {
  const ctor = mediaSourceCtor();
  if (!ctor) return false;
  const isTypeSupported = (
    ctor as unknown as { isTypeSupported?: (t: string) => boolean }
  ).isTypeSupported;
  return typeof isTypeSupported === "function";
}

function supportedCodecs(ctor: MediaSourceConstructor, videoOnly: boolean): string {
  const isTypeSupported = (
    ctor as unknown as { isTypeSupported: (t: string) => boolean }
  ).isTypeSupported;
  return CODECS.filter((c) => !videoOnly || c.includes("vc1"))
    .filter((c) => isTypeSupported(`video/mp4; codecs="${c}"`))
    .join(",");
}

class MsePlayer implements MsePlayerHandle {
  public state: MsePlayerState = "idle";

  private _video?: HTMLVideoElement;
  private _ws?: WebSocket;
  private _mediaSource?: MediaSourceLike;
  private _sourceBuffer?: SourceBuffer;
  private _objectUrl?: string;
  private readonly _queue: ArrayBuffer[] = [];
  private _startupTimer?: number;
  private _reconnectTimer?: number;
  private _reconnects = 0;
  private _destroyed = false;
  private _reachedPlaying = false;
  /** Chrome MSE can't decode HEVC muxed with audio; when set we re-offer video-only. */
  private _videoOnly = false;
  /** True while (re)connecting, to ignore transient media errors from swapping src. */
  private _swapping = false;

  public constructor(private readonly _opts: MsePlayerOptions) {}

  public attach(video: HTMLVideoElement): void {
    this._video = video;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    if ("ManagedMediaSource" in window) {
      // ManagedMediaSource wants remote playback disabled and uses srcObject/src.
      (video as unknown as { disableRemotePlayback?: boolean }).disableRemotePlayback = true;
    }
    video.addEventListener("playing", this._onPlaying);
    video.addEventListener("error", this._onVideoError);
    this._connect();
  }

  public destroy(): void {
    this._destroyed = true;
    this._teardownConnection();
    if (this._video) {
      this._video.removeEventListener("playing", this._onPlaying);
      this._video.removeEventListener("error", this._onVideoError);
    }
    this._video = undefined;
    if (this.state !== "failed") this.state = "idle";
  }

  private _fail(kind: MsePlayerErrorKind, detail: string): void {
    if (this._destroyed || this.state === "failed") return;
    this.state = "failed";
    this._teardownConnection();
    this._opts.onError(kind, detail);
  }

  private async _connect(): Promise<void> {
    if (this._destroyed) return;
    this.state = "connecting";
    this._swapping = true;
    this._clearTimer("_startupTimer");
    this._startupTimer = window.setTimeout(() => {
      if (this.state !== "playing") this._fail("startup", "no codec answer within 5s");
    }, STARTUP_TIMEOUT_MS);

    let url: string;
    try {
      url = await this._signedWsUrl();
    } catch (err) {
      this._fail("startup", `sign_path failed: ${String(err)}`);
      return;
    }
    if (this._destroyed) return;

    try {
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      this._ws = ws;
      ws.addEventListener("open", this._onWsOpen);
      ws.addEventListener("message", this._onWsMessage);
      ws.addEventListener("close", this._onWsClose);
      ws.addEventListener("error", this._onWsError);
    } catch (err) {
      this._fail("startup", `socket open failed: ${String(err)}`);
    }
  }

  private async _signedWsUrl(): Promise<string> {
    // Frigate's proxy matches its own instance id (MQTT client_id); when we don't
    // have it, the no-instance form serves the single configured instance.
    const base = this._opts.instanceId
      ? `/api/frigate/${this._opts.instanceId}/mse/api/ws`
      : `/api/frigate/mse/api/ws`;
    const path = `${base}?src=${encodeURIComponent(this._opts.stream)}`;
    const signed = await this._opts.hass.callWS<{ path: string }>({
      type: "auth/sign_path",
      path,
      expires: 60,
    });
    const abs = new URL(signed.path, window.location.href);
    abs.protocol = abs.protocol.replace("http", "ws"); // http->ws, https->wss
    return abs.toString();
  }

  private readonly _onWsOpen = (): void => {
    // A fresh MediaSource per connection — reusing one yields stale sourceopen events.
    const ctor = mediaSourceCtor();
    if (!ctor || !this._video) {
      this._fail("mse-decode", "MediaSource unavailable");
      return;
    }
    const mediaSource = new ctor();
    this._mediaSource = mediaSource;
    mediaSource.addEventListener("sourceopen", this._onSourceOpen, { once: true });
    this._objectUrl = URL.createObjectURL(mediaSource as unknown as MediaSource);
    this._video.src = this._objectUrl;
  };

  private readonly _onSourceOpen = (): void => {
    const ctor = mediaSourceCtor();
    if (!ctor || !this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    const supported = supportedCodecs(ctor, this._videoOnly);
    this._ws.send(JSON.stringify({ type: "mse", value: supported }));
  };

  private readonly _onWsMessage = (ev: MessageEvent): void => {
    if (typeof ev.data === "string") {
      let msg: { type?: string; value?: string };
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "mse" && msg.value) {
        // Chrome-family MSE can't decode HEVC muxed with audio (MEDIA_ERR_SRC_NOT_
        // SUPPORTED). Safari's ManagedMediaSource can, so only downgrade elsewhere.
        if (
          !this._videoOnly &&
          !("ManagedMediaSource" in window) &&
          /hvc1|hev1/i.test(msg.value) &&
          /mp4a|opus|flac|ac-3|ec-3/i.test(msg.value)
        ) {
          this._videoOnly = true;
          this._reconnectVideoOnly();
          return;
        }
        this._startSourceBuffer(msg.value);
      }
      return;
    }
    if (ev.data instanceof ArrayBuffer) this._appendSegment(ev.data);
  };

  private _startSourceBuffer(mimeType: string): void {
    const mediaSource = this._mediaSource;
    if (!mediaSource || this._sourceBuffer) return;
    try {
      const sb = mediaSource.addSourceBuffer(mimeType);
      if (sb.mode) sb.mode = "segments";
      sb.addEventListener("updateend", this._onUpdateEnd);
      sb.addEventListener("error", this._onSourceBufferError);
      this._sourceBuffer = sb;
      this._swapping = false;
    } catch (err) {
      // Safari can throw InvalidStateError here; treat as an unplayable stream.
      this._fail("mse-decode", `addSourceBuffer failed: ${String(err)}`);
    }
  }

  private _appendSegment(data: ArrayBuffer): void {
    const sb = this._sourceBuffer;
    if (!sb) return;
    if (sb.updating || this._queue.length > 0) {
      this._queue.push(data);
      return;
    }
    try {
      sb.appendBuffer(data);
    } catch (err) {
      this._fail("mse-decode", `appendBuffer failed: ${String(err)}`);
    }
  }

  private readonly _onUpdateEnd = (): void => {
    const sb = this._sourceBuffer;
    if (!sb) return;
    if (this._queue.length > 0 && !sb.updating) {
      const next = this._queue.shift();
      if (next) {
        try {
          sb.appendBuffer(next);
        } catch (err) {
          this._fail("mse-decode", `appendBuffer failed: ${String(err)}`);
        }
        return;
      }
    }
    this._trackLiveEdge();
  };

  /** Trim to a short live window and glide playback to the live edge. Runs on
   *  `updateend` (not `timeupdate`) so it also unsticks a stream whose segments
   *  start at a large timestamp — there `currentTime` is 0, outside the buffer,
   *  and the element never fires `timeupdate` to seek itself. Mirrors go2rtc. */
  private _trackLiveEdge(): void {
    const sb = this._sourceBuffer;
    const video = this._video;
    if (!sb || !video || sb.updating || sb.buffered.length === 0) return;
    const end = sb.buffered.end(sb.buffered.length - 1);
    const start = end - LIVE_WINDOW_SECONDS;
    const start0 = sb.buffered.start(0);
    if (start > start0) {
      try {
        sb.remove(start0, start);
        this._mediaSource?.setLiveSeekableRange?.(start, end);
      } catch {
        // Non-fatal: retried on the next updateend.
      }
    }
    // Recover toward the live edge without fast-forwarding: scaling playbackRate up to
    // the gap overloads a weak HEVC decoder, which then drops frames and drifts further
    // behind (a runaway toward 5x). If we've fallen outside the window (or never started,
    // currentTime 0), jump to just behind live; otherwise a gentle nudge, else play at 1x.
    const gap = end - video.currentTime;
    if (video.currentTime < start || gap > LIVE_WINDOW_SECONDS) {
      video.currentTime = end - 0.5;
      video.playbackRate = 1;
    } else {
      video.playbackRate = gap > 1.5 ? 1.1 : 1;
    }
  }

  private readonly _onPlaying = (): void => {
    this._reachedPlaying = true;
    this._reconnects = 0;
    this._clearTimer("_startupTimer");
    if (this.state !== "failed") this.state = "playing";
    this._opts.onPlaying?.();
  };

  private readonly _onSourceBufferError = (): void => {
    this._fail("mse-decode", "SourceBuffer error");
  };

  /** A media decode/support error: retry once video-only (fixes muxed HEVC+audio on
   *  Chrome), otherwise give up so the tile falls back to `<hui-image>`. */
  private readonly _onVideoError = (): void => {
    if (this._swapping) return;
    const code = this._video?.error?.code;
    if ((code === 3 || code === 4) && !this._videoOnly) {
      this._videoOnly = true;
      this._reconnectVideoOnly();
      return;
    }
    this._fail("mse-decode", `video error code=${code ?? "?"}`);
  };

  /** Reconnect immediately to re-offer a video-only codec set (not a network retry). */
  private _reconnectVideoOnly(): void {
    if (this._destroyed) return;
    this._teardownConnection();
    void this._connect();
  }

  private readonly _onWsError = (): void => {
    if (this.state === "playing" || this._reachedPlaying) {
      this._scheduleReconnect("socket error");
    } else {
      this._fail("startup", "socket error before playback");
    }
  };

  private readonly _onWsClose = (): void => {
    if (this._destroyed || this.state === "failed") return;
    if (this.state === "playing" || this._reachedPlaying) {
      this._scheduleReconnect("socket closed");
    } else {
      this._fail("startup", "socket closed before playback");
    }
  };

  private _scheduleReconnect(reason: string): void {
    if (this._destroyed) return;
    const delay = RECONNECT_BACKOFF_MS[this._reconnects];
    if (delay === undefined) {
      this._fail("network", `reconnects exhausted: ${reason}`);
      return;
    }
    this._reconnects += 1;
    this._teardownConnection();
    this.state = "connecting";
    this._reconnectTimer = window.setTimeout(() => {
      if (!this._destroyed) void this._connect();
    }, delay);
  }

  /** Tear down socket + MediaSource but keep the video element + player alive. */
  private _teardownConnection(): void {
    this._clearTimer("_startupTimer");
    this._clearTimer("_reconnectTimer");
    this._queue.length = 0;
    const ws = this._ws;
    if (ws) {
      ws.removeEventListener("open", this._onWsOpen);
      ws.removeEventListener("message", this._onWsMessage);
      ws.removeEventListener("close", this._onWsClose);
      ws.removeEventListener("error", this._onWsError);
      try {
        ws.close();
      } catch {
        /* already closing */
      }
    }
    this._ws = undefined;
    const sb = this._sourceBuffer;
    if (sb) {
      sb.removeEventListener("updateend", this._onUpdateEnd);
      sb.removeEventListener("error", this._onSourceBufferError);
    }
    this._sourceBuffer = undefined;
    this._mediaSource = undefined;
    if (this._objectUrl) {
      URL.revokeObjectURL(this._objectUrl);
      this._objectUrl = undefined;
    }
    if (this._video) this._video.removeAttribute("src");
  }

  private _clearTimer(key: "_startupTimer" | "_reconnectTimer"): void {
    const id = this[key];
    if (id !== undefined) {
      window.clearTimeout(id);
      this[key] = undefined;
    }
  }
}

export function createMsePlayer(opts: MsePlayerOptions): MsePlayerHandle {
  return new MsePlayer(opts);
}
