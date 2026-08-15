/**
 * go2rtc WebRTC live player, reached through Frigate's HA WebSocket proxy — the same
 * `/api/ws` endpoint the MSE player signs (go2rtc multiplexes every mode over it).
 *
 * WebRTC is preferred over MSE for Frigate cameras because go2rtc transcodes the
 * camera's AAC audio to **Opus** for WebRTC (so audio actually plays), and Chrome
 * decodes H.265 through its WebRTC receiver. Signalling (SDP offer/answer + trickle
 * ICE) is exchanged as JSON frames over the socket. Mirrors go2rtc's `video-rtc.js`.
 */

/** Minimal Home Assistant surface this module needs (WebSocket command sender). */
interface HassLike {
  callWS<T>(msg: { type: string; [key: string]: unknown }): Promise<T>;
}

export type WebRtcPlayerState = "idle" | "connecting" | "playing" | "failed";

/** Why the player gave up. `startup` = never connected; `network` = the peer
 *  connection dropped after playing. */
export type WebRtcPlayerErrorKind = "network" | "startup";

export interface WebRtcPlayerHandle {
  attach(video: HTMLVideoElement): void;
  destroy(): void;
  readonly state: WebRtcPlayerState;
}

export interface WebRtcPlayerOptions {
  hass: HassLike;
  /** Frigate instance id (MQTT client_id); empty uses the no-instance proxy path. */
  instanceId: string;
  /** go2rtc stream name, e.g. `front_door` / `front_door_med` / `front_door_high`. */
  stream: string;
  /** Start muted (non-primary tiles in multi-camera layouts get no audio). */
  muted?: boolean;
  onError: (kind: WebRtcPlayerErrorKind, detail: string) => void;
  onPlaying?: () => void;
}

/** Matches go2rtc's VideoRTC peer configuration (public STUN, bundled transport). */
const PC_CONFIG: RTCConfiguration = {
  bundlePolicy: "max-bundle",
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

/** ICE/SDP can take a few seconds; declare `startup` failure past this. */
const STARTUP_TIMEOUT_MS = 8000;

/** Whether WebRTC is usable in this browser. */
export function isWebRtcSupported(): boolean {
  return typeof RTCPeerConnection === "function";
}

class WebRtcPlayer implements WebRtcPlayerHandle {
  public state: WebRtcPlayerState = "idle";

  private _video?: HTMLVideoElement;
  private _ws?: WebSocket;
  private _pc?: RTCPeerConnection;
  private _stream?: MediaStream;
  private _startupTimer?: number;
  private _destroyed = false;
  private _reachedPlaying = false;

  public constructor(private readonly _opts: WebRtcPlayerOptions) {}

  public attach(video: HTMLVideoElement): void {
    this._video = video;
    video.autoplay = true;
    video.playsInline = true;
    video.addEventListener("playing", this._onPlaying);
    void this._connect();
  }

  public destroy(): void {
    this._destroyed = true;
    this._teardown();
    if (this._video) this._video.removeEventListener("playing", this._onPlaying);
    this._video = undefined;
    if (this.state !== "failed") this.state = "idle";
  }

  private _fail(kind: WebRtcPlayerErrorKind, detail: string): void {
    if (this._destroyed || this.state === "failed") return;
    this.state = "failed";
    this._teardown();
    this._opts.onError(kind, detail);
  }

  private async _connect(): Promise<void> {
    if (this._destroyed) return;
    this.state = "connecting";
    this._clearStartupTimer();
    this._startupTimer = window.setTimeout(() => {
      if (this.state !== "playing") this._fail("startup", "no WebRTC connection within 8s");
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
    void this._startNegotiation();
  };

  private async _startNegotiation(): Promise<void> {
    if (this._destroyed || !this._video) return;
    try {
      const pc = new RTCPeerConnection(PC_CONFIG);
      this._pc = pc;
      this._stream = new MediaStream();
      pc.addEventListener("track", this._onTrack);
      pc.addEventListener("icecandidate", this._onIceCandidate);
      pc.addEventListener("connectionstatechange", this._onConnectionStateChange);
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this._send({ type: "webrtc/offer", value: offer.sdp });
    } catch (err) {
      this._fail("startup", `offer failed: ${String(err)}`);
    }
  }

  private readonly _onTrack = (ev: RTCTrackEvent): void => {
    if (!this._stream || !this._video) return;
    this._stream.addTrack(ev.track);
    if (this._video.srcObject !== this._stream) this._video.srcObject = this._stream;
    this._play();
  };

  private readonly _onIceCandidate = (ev: RTCPeerConnectionIceEvent): void => {
    // go2rtc expects the raw candidate string (empty string signals end-of-candidates).
    this._send({ type: "webrtc/candidate", value: ev.candidate ? ev.candidate.candidate : "" });
  };

  private readonly _onConnectionStateChange = (): void => {
    const s = this._pc?.connectionState;
    if (s === "failed" || s === "disconnected") {
      this._fail(this._reachedPlaying ? "network" : "startup", `connection ${s}`);
    }
  };

  private readonly _onWsMessage = (ev: MessageEvent): void => {
    if (typeof ev.data !== "string") return;
    let msg: { type?: string; value?: string };
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    const pc = this._pc;
    if (!pc) return;
    if (msg.type === "webrtc/answer" && msg.value) {
      pc.setRemoteDescription({ type: "answer", sdp: msg.value }).catch((err) =>
        this._fail("startup", `setRemoteDescription failed: ${String(err)}`),
      );
    } else if (msg.type === "webrtc/candidate" && msg.value) {
      pc.addIceCandidate({ candidate: msg.value, sdpMid: "0" }).catch(() => {
        // A rejected remote candidate is non-fatal; ICE continues with the rest.
      });
    } else if (msg.type === "error" && typeof msg.value === "string" && msg.value.includes("webrtc")) {
      this._fail("startup", msg.value);
    }
  };

  /** Try to play with audio; if the browser blocks unmuted autoplay, retry muted so
   *  the video still shows (audio then needs a user gesture). Non-primary tiles are
   *  requested muted and stay muted. */
  private _play(): void {
    const video = this._video;
    if (!video) return;
    if (this._opts.muted) {
      video.muted = true;
      video.play().catch(() => {
        /* Muted playback can still be deferred until the element is interactable. */
      });
      return;
    }
    video.muted = false;
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => {
        /* Even muted playback can be deferred until the element is interactable. */
      });
    });
  }

  private readonly _onPlaying = (): void => {
    this._reachedPlaying = true;
    this._clearStartupTimer();
    if (this.state !== "failed") this.state = "playing";
    this._opts.onPlaying?.();
  };

  private readonly _onWsError = (): void => {
    // The signalling socket can close once negotiation completes; only fail if we
    // never reached a live connection.
    if (!this._reachedPlaying && this.state !== "playing") this._fail("startup", "socket error");
  };

  private readonly _onWsClose = (): void => {
    if (this._destroyed || this.state === "playing" || this._reachedPlaying) return;
    this._fail("startup", "socket closed before connection");
  };

  private _send(msg: { type: string; value: string | undefined }): void {
    const ws = this._ws;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  private _teardown(): void {
    this._clearStartupTimer();
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
    const pc = this._pc;
    if (pc) {
      pc.removeEventListener("track", this._onTrack);
      pc.removeEventListener("icecandidate", this._onIceCandidate);
      pc.removeEventListener("connectionstatechange", this._onConnectionStateChange);
      try {
        pc.getSenders().forEach((s) => s.track?.stop());
        pc.close();
      } catch {
        /* already closed */
      }
    }
    this._pc = undefined;
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = undefined;
    }
    if (this._video) this._video.srcObject = null;
  }

  private _clearStartupTimer(): void {
    if (this._startupTimer !== undefined) {
      window.clearTimeout(this._startupTimer);
      this._startupTimer = undefined;
    }
  }
}

export function createWebRtcPlayer(opts: WebRtcPlayerOptions): WebRtcPlayerHandle {
  return new WebRtcPlayer(opts);
}
