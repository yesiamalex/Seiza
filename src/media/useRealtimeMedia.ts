import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUSY_BACKOFF_MS,
  hasAnyMedia,
  planPeers,
  tuneOpus,
  VOICE_MAX_BITRATE,
} from "./meshPolicy";
import type { PlayerMedia, PlayerState } from "../multiplayer/types";

// On unless a deployer explicitly turns it off. The per-world switch is
// `voiceEnabled` in world.json (see App.tsx); this env var is the
// build-level override.
export const VOICE_ENABLED = import.meta.env.VITE_SEIZA_VOICE_ENABLED !== "false";

/**
 * Peer-to-peer media mesh: microphone, camera, and screen sharing over one
 * connection per peer, signalled through the room server (worker/room.ts's
 * "voiceSignal" relay). No media server — audio and video flow directly
 * between browsers, with an optional TURN relay if the deployer sets one.
 *
 * Every participant connects to every other (O(n²)), which is the right
 * trade for classroom-sized rooms and needs no extra infrastructure. Past
 * the soft cap (see meshPolicy.ts), each client keeps its nearest peers (anyone who can
 * be heard first), so in a big room you hear the people around you, as
 * you would in a hall.
 *
 * Costs are kept down deliberately:
 * - capture resolution and frame rate are constrained at the source, and
 *   each outgoing video track gets a bitrate cap;
 * - connections exist only while someone actually has media on;
 * - remote video is decoded only while something on screen is showing it
 *   (see VideoPanel), so an idle share costs nothing to a viewer looking
 *   the other way;
 * - a muted mic sends nothing at all, and voice is capped at 24 kbps with
 *   discontinuous transmission, so silence is nearly free.
 */
const VOICE_FALLOFF_DISTANCE = 12;

/** setLocalDescription(), with this app's voice preferences written in. */
async function setTunedLocalDescription(connection: RTCPeerConnection) {
  const description = connection.signalingState === "have-remote-offer" ? await connection.createAnswer() : await connection.createOffer();
  await connection.setLocalDescription({ type: description.type, sdp: tuneOpus(description.sdp ?? "") });
}

// A webcam thumbnail beside an avatar is small on screen, so capture it
// small: a 320x240 stream at 15fps is a fraction of the bandwidth and the
// encode cost of the 720p default most cameras hand out.
const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 20 } },
};
// Shared screens are mostly still text, so trade frame rate for sharpness.
const SCREEN_CONSTRAINTS = {
  audio: true,
  video: { width: { max: 1280 }, height: { max: 720 }, frameRate: { ideal: 8, max: 15 } },
} as MediaStreamConstraints;
const CAMERA_MAX_BITRATE = 250_000;
const SCREEN_MAX_BITRATE = 1_200_000;
/**
 * Tighter ceilings for a connection that turned out to need a TURN relay.
 *
 * A direct peer-to-peer stream costs the deployer nothing — the bytes go
 * between the two browsers. A relayed one is billed: Cloudflare Realtime
 * TURN includes 1,000 GB/month and charges $0.05/GB beyond it, and it is
 * metered on relayed traffic in both directions. Screen share is by far
 * the biggest lever there, at roughly half a gigabyte per hour per
 * receiving peer at the direct cap.
 *
 * So relayed senders are throttled rather than cut off. The picture is
 * worse, and a legible screen share at 600 kbps is a far better outcome
 * than an unexpected bill or a policy of refusing to relay at all.
 * Nothing changes for the direct connections, which are the majority.
 */
const RELAYED_CAMERA_MAX_BITRATE = 120_000;
const RELAYED_SCREEN_MAX_BITRATE = 600_000;

/**
 * ICE servers, in order of preference.
 *
 * STUN alone only discovers your public address; it cannot get packets
 * through a symmetric NAT or CGNAT, which is what most mobile networks
 * and plenty of campus/corporate ones use. That is the whole explanation
 * for the long-standing "video works when we're on the same Wi-Fi and
 * fails when we're not" report: both peers behind permissive NATs
 * connect directly, and one restrictive NAT on either side kills it.
 * A TURN server relays the media in exactly that case.
 *
 * Three sources, tried in order:
 *  1. /api/turn-credentials — short-lived credentials minted by this
 *     deployment's own Worker (worker/index.ts). Preferred, because the
 *     Cloudflare API token stays server-side and the credential expires.
 *  2. VITE_SEIZA_TURN_* — a static TURN server baked in at build time.
 *     Kept for deployments already using it, but note it is compiled
 *     into the client bundle, so the credential is public.
 *  3. STUN only — the default, and fine for most pairs.
 */
const STUN_ONLY: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];

function buildStaticIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [...STUN_ONLY];
  const turnUrls = import.meta.env.VITE_SEIZA_TURN_URLS as string | undefined;
  if (turnUrls) {
    servers.push({
      urls: turnUrls.split(",").map((u) => u.trim()),
      username: import.meta.env.VITE_SEIZA_TURN_USERNAME as string | undefined,
      credential: import.meta.env.VITE_SEIZA_TURN_CREDENTIAL as string | undefined,
    });
  }
  return servers;
}

/** Shape of the Worker's /api/turn-credentials response. */
interface IceServerResponse {
  iceServers?: RTCIceServer | RTCIceServer[];
}

async function fetchIceServers(signal: AbortSignal): Promise<RTCIceServer[] | null> {
  try {
    const response = await fetch("/api/turn-credentials", { signal });
    // 404 is the documented "this deployment has no TURN key" answer,
    // not a failure worth logging.
    if (!response.ok) return null;
    const body = (await response.json()) as IceServerResponse;
    // Cloudflare returns a single object; the spec-shaped answer is an
    // array. Accept either.
    const list = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
    if (list.length === 0) return null;
    // Keep STUN in the list: TURN relaying costs bandwidth, so a direct
    // path should still win when one exists.
    return [...STUN_ONLY, ...list];
  } catch {
    return null;
  }
}

interface RemoteAudio {
  element: HTMLAudioElement;
  gain: GainNode;
  analyser: AnalyserNode;
}

interface Peer {
  connection: RTCPeerConnection;
  /** Perfect-negotiation role: the polite peer yields when offers collide. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  /** True once this connection has already been given one ICE restart
   *  after failing, so a permanently unreachable peer is torn down
   *  instead of retried forever. */
  restartedIce: boolean;
  /** True once getStats() has shown this connection going through a TURN
   *  relay, which is the case the deployer pays for — see the relayed
   *  bitrate ceilings above. */
  relayed: boolean;
  streams: Map<string, MediaStream>;
  audio: Map<string, RemoteAudio>;
  /** Candidates that arrived before the remote description did. Adding one
   *  early throws, and a dropped candidate can be the one route that would
   *  have connected — which shows up as a stream that never paints. */
  pendingCandidates: RTCIceCandidateInit[];
  /** The sender carrying our microphone. Muting swaps its track for null
   *  (nothing is sent) rather than sending silence. */
  micSender: RTCRtpSender | null;
  createdAt: number;
}

export interface RealtimeMediaState {
  micEnabled: boolean;
  connecting: boolean;
  muted: boolean;
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  speakingLevels: Record<string, number>;
  /** This client's own mic RMS, for driving your own avatar's lip sync. */
  localSpeakingLevel: number;
  localSpeaking: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  /** Last thing that went wrong, for the UI to show. */
  error: string | null;
  /** Which local stream is which, to publish over the room protocol. */
  localMedia: PlayerMedia;
  localCameraStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  enableMic: () => Promise<void>;
  disableMic: () => void;
  toggleMute: () => void;
  /** See forceMute's implementation comment above for what this does and
   *  why it exists alongside toggleMute. */
  forceMute: (muted: boolean) => void;
  selectDevice: (deviceId: string) => Promise<void>;
  /** Resolves true once capture actually started. */
  startCamera: () => Promise<boolean>;
  stopCamera: () => void;
  /** Resolves false if the picker was dismissed or capture failed. */
  startScreen: () => Promise<boolean>;
  stopScreen: () => void;
  /** A remote stream by peer and stream id, or null if it isn't here yet. */
  getStream: (peerId: string, streamId: string | null | undefined) => MediaStream | null;
  /** Changes whenever remote streams appear or disappear. */
  streamsVersion: number;
  handleSignal: (from: string, data: unknown) => void;
  /** Call periodically (the existing position-sync loop does) to update
   *  per-peer volume from distance and refresh speaking levels. */
  updateSpatial: (localPosition: [number, number, number]) => void;
}

interface UseRealtimeMediaArgs {
  selfId: string | null;
  players: Record<string, PlayerState>;
  sendSignal: (to: string, data: unknown) => void;
}

export function useRealtimeMedia({ selfId, players, sendSignal }: UseRealtimeMediaArgs): RealtimeMediaState {
  // Read synchronously by createPeer, so it has to be a ref rather than
  // state: a peer connection is built the instant someone joins, which
  // can easily be before the credential fetch resolves. It starts as
  // STUN-only (always usable) and is upgraded in place when the answer
  // arrives; peers created before that keep working, and the ICE restart
  // in onconnectionstatechange picks the new list up if one of them
  // actually fails.
  const iceServersRef = useRef<RTCIceServer[]>(buildStaticIceServers());

  useEffect(() => {
    const controller = new AbortController();
    void fetchIceServers(controller.signal).then((servers) => {
      if (servers) iceServersRef.current = servers;
    });
    return () => controller.abort();
  }, []);

  const [micEnabled, setMicEnabled] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [speakingLevels, setSpeakingLevels] = useState<Record<string, number>>({});
  const [localSpeakingLevel, setLocalSpeakingLevel] = useState(0);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localMedia, setLocalMedia] = useState<PlayerMedia>({});
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [streamsVersion, setStreamsVersion] = useState(0);

  const micStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;
  const sendSignalRef = useRef(sendSignal);
  sendSignalRef.current = sendSignal;
  const playersRef = useRef(players);
  playersRef.current = players;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  /** Where we are, as of the last updateSpatial call (for peer ranking). */
  const localPositionRef = useRef<[number, number, number] | null>(null);
  /** Peers that answered "busy", and until when to leave them be. */
  const busyUntilRef = useRef(new Map<string, number>());
  /** When the room has more peers than the budget, the ones we'd accept
   *  a connection from; null while everyone fits. */
  const acceptableRef = useRef<Set<string> | null>(null);

  const bumpStreams = useCallback(() => setStreamsVersion((version) => version + 1), []);

  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    return audioContextRef.current;
  }, []);

  // Lets people who never turn their own mic on still hear everyone else.
  // Browsers start audio suspended until a user gesture resumes it, and the
  // only resume() used to be in the mic button's handler. Chrome tolerated
  // that after the Join click; Safari on iPhone and iPad didn't, so a
  // listener there heard nothing. Any tap, click, or key now resumes it, and
  // keeps doing so after iOS suspends audio for a call or an app switch.
  useEffect(() => {
    const unlock = () => {
      const context = ensureAudioContext();
      if (context.state !== "running") void context.resume().catch(() => {});
    };
    const events = ["pointerdown", "keydown", "touchend"] as const;
    for (const name of events) window.addEventListener(name, unlock, { capture: true, passive: true });
    return () => {
      for (const name of events) window.removeEventListener(name, unlock, { capture: true });
    };
  }, [ensureAudioContext]);

  const publishLocalMedia = useCallback(() => {
    setLocalMedia({
      mic: micStreamRef.current?.id ?? null,
      camera: cameraStreamRef.current?.id ?? null,
      screen: screenStreamRef.current?.id ?? null,
      ...(micStreamRef.current && mutedRef.current ? { micMuted: true } : {}),
    });
  }, []);

  /** Adds our tracks to a connection, holding the mic back while muted. */
  const addLocalTracks = useCallback((peer: Peer, stream: MediaStream) => {
    for (const track of stream.getTracks()) {
      const sender = peer.connection.addTrack(track, stream);
      if (stream === micStreamRef.current && track.kind === "audio") {
        peer.micSender = sender;
        if (mutedRef.current) void sender.replaceTrack(null);
      }
    }
  }, []);

  /** Starts or stops actually sending the mic on every connection. */
  const syncMicSending = useCallback((isMuted: boolean) => {
    const track = micStreamRef.current?.getAudioTracks()[0] ?? null;
    for (const peer of peersRef.current.values()) {
      peer.micSender?.replaceTrack(isMuted ? null : track).catch(() => {
        // A closing connection refuses; nothing to fix.
      });
    }
  }, []);

  const localStreams = useCallback(
    () => [micStreamRef.current, cameraStreamRef.current, screenStreamRef.current].filter((s): s is MediaStream => !!s),
    []
  );

  /** Bitrate caps, applied once a sender exists for each video track. */
  const applySendCaps = useCallback((peer: Peer) => {
    const relayed = peer.relayed;
    if (peer.micSender) {
      const parameters = peer.micSender.getParameters();
      if (!parameters.encodings || parameters.encodings.length === 0) parameters.encodings = [{}];
      parameters.encodings[0].maxBitrate = VOICE_MAX_BITRATE;
      peer.micSender.setParameters(parameters).catch(() => {
        // Same as below: not fatal, and the SDP preference still applies.
      });
    }
    for (const sender of peer.connection.getSenders()) {
      if (!sender.track || sender.track.kind !== "video") continue;
      const isScreen = screenStreamRef.current?.getTracks().includes(sender.track) ?? false;
      const parameters = sender.getParameters();
      if (!parameters.encodings || parameters.encodings.length === 0) parameters.encodings = [{}];
      parameters.encodings[0].maxBitrate = isScreen
        ? (relayed ? RELAYED_SCREEN_MAX_BITRATE : SCREEN_MAX_BITRATE)
        : (relayed ? RELAYED_CAMERA_MAX_BITRATE : CAMERA_MAX_BITRATE);
      sender.setParameters(parameters).catch(() => {
        // Not fatal: some browsers refuse mid-negotiation, and the stream
        // still works, just without our ceiling.
      });
    }
  }, []);

  /**
   * Asks the connection whether it ended up going through a TURN relay,
   * and re-applies the send caps if so.
   *
   * There is no event for this and no way to know in advance: ICE picks
   * the candidate pair itself, and only the selected pair says whether
   * the local side is a relay candidate. So it is read once from
   * getStats() on connect. A failure to read it leaves the direct caps
   * in place, which is the right way to be wrong — it degrades the bill,
   * never the call.
   */
  const checkRelayed = useCallback(
    async (peer: Peer) => {
      try {
        const stats = await peer.connection.getStats();
        let selectedPairId: string | undefined;
        stats.forEach((report) => {
          if (report.type === "transport" && report.selectedCandidatePairId) {
            selectedPairId = report.selectedCandidatePairId as string;
          }
          // Firefox reports no transport.selectedCandidatePairId; it
          // flags the pair itself instead.
          if (report.type === "candidate-pair" && report.selected) selectedPairId = report.id;
        });
        if (!selectedPairId) return;
        const pair = stats.get(selectedPairId) as { localCandidateId?: string } | undefined;
        if (!pair?.localCandidateId) return;
        const local = stats.get(pair.localCandidateId) as { candidateType?: string } | undefined;
        const relayed = local?.candidateType === "relay";
        if (relayed === peer.relayed) return;
        peer.relayed = relayed;
        applySendCaps(peer);
      } catch {
        // Stats are best-effort; keeping the direct caps is the safe miss.
      }
    },
    [applySendCaps]
  );

  const detachAudio = useCallback((peer: Peer, streamId: string) => {
    const audio = peer.audio.get(streamId);
    if (!audio) return;
    audio.element.pause();
    audio.element.srcObject = null;
    try {
      audio.gain.disconnect();
      audio.analyser.disconnect();
    } catch {
      // Already torn down.
    }
    peer.audio.delete(streamId);
  }, []);

  const attachAudio = useCallback(
    (peer: Peer, stream: MediaStream) => {
      if (peer.audio.has(stream.id)) return;
      const context = ensureAudioContext();
      // Allowed once the page has had a user gesture (joining counts in most
      // browsers); otherwise the gesture listener above resumes it.
      if (context.state !== "running") void context.resume().catch(() => {});
      const gain = context.createGain();
      gain.gain.value = 0;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(gain).connect(analyser).connect(context.destination);
      // The element is what keeps the stream flowing in Chrome, but it must
      // stay muted or the audio plays twice: once flat through the element
      // and once spatialised through the graph above.
      const element = new Audio();
      element.srcObject = stream;
      element.muted = true;
      element.autoplay = true;
      void element.play().catch(() => {});
      peer.audio.set(stream.id, { element, gain, analyser });
    },
    [ensureAudioContext]
  );

  const closePeer = useCallback(
    (peerId: string) => {
      const peer = peersRef.current.get(peerId);
      if (!peer) return;
      for (const streamId of Array.from(peer.audio.keys())) detachAudio(peer, streamId);
      peer.connection.close();
      peersRef.current.delete(peerId);
      setSpeakingLevels((previous) => {
        if (!(peerId in previous)) return previous;
        const next = { ...previous };
        delete next[peerId];
        return next;
      });
      bumpStreams();
    },
    [detachAudio, bumpStreams]
  );

  const createPeer = useCallback(
    (peerId: string) => {
      if (peersRef.current.has(peerId)) return peersRef.current.get(peerId)!;
      const connection = new RTCPeerConnection({ iceServers: iceServersRef.current });
      const peer: Peer = {
        connection,
        // Deterministic and opposite on the two sides, which is all the
        // perfect-negotiation pattern needs to break an offer collision.
        polite: (selfIdRef.current ?? "") > peerId,
        makingOffer: false,
        ignoreOffer: false,
        restartedIce: false,
        relayed: false,
        streams: new Map(),
        audio: new Map(),
        pendingCandidates: [],
        micSender: null,
        createdAt: Date.now(),
      };
      peersRef.current.set(peerId, peer);

      connection.onicecandidate = (event) => {
        if (event.candidate) sendSignalRef.current(peerId, { kind: "ice", candidate: event.candidate.toJSON() });
      };

      // Fires whenever tracks are added or removed on either side, which is
      // what makes starting a camera mid-call work.
      connection.onnegotiationneeded = async () => {
        try {
          peer.makingOffer = true;
          await setTunedLocalDescription(connection);
          if (connection.localDescription) {
            sendSignalRef.current(peerId, { kind: "sdp", description: connection.localDescription.toJSON() });
          }
        } catch (err) {
          console.warn("Media negotiation failed:", err);
        } finally {
          peer.makingOffer = false;
        }
      };

      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "connected") {
          applySendCaps(peer);
          void checkRelayed(peer);
          peer.restartedIce = false;
          return;
        }
        if (connection.connectionState !== "failed") return;
        // One ICE restart before giving up. By the time a connection
        // fails the TURN credentials fetched on mount have almost
        // certainly arrived, so the retry gathers candidates from a
        // better list than the original attempt had — which is exactly
        // the cross-network case. Only once: a restart loop against a
        // genuinely unreachable peer just burns battery.
        if (!peer.restartedIce) {
          peer.restartedIce = true;
          try {
            connection.setConfiguration({ iceServers: iceServersRef.current });
            connection.restartIce();
            return;
          } catch (err) {
            console.warn("ICE restart failed:", err);
          }
        }
        closePeer(peerId);
      };

      connection.ontrack = (event) => {
        const stream = event.streams[0];
        if (!stream) return;
        peer.streams.set(stream.id, stream);
        if (event.track.kind === "audio") attachAudio(peer, stream);
        const forget = () => {
          if (stream.getTracks().some((track) => track.readyState === "live")) return;
          peer.streams.delete(stream.id);
          detachAudio(peer, stream.id);
          bumpStreams();
        };
        event.track.addEventListener("ended", forget);
        stream.addEventListener("removetrack", forget);
        // A received track arrives `muted` and only unmutes when its first
        // frame does. Anything that resolved this stream in between saw a
        // track carrying no picture yet, so nudge the consumers again —
        // the other half of the black-screen fix in VideoPanel.tsx.
        event.track.addEventListener("unmute", bumpStreams);
        bumpStreams();
      };

      for (const stream of localStreams()) addLocalTracks(peer, stream);
      return peer;
    },
    [applySendCaps, attachAudio, closePeer, detachAudio, localStreams, bumpStreams, addLocalTracks]
  );

  /** Sends a newly started local stream to everyone already connected. */
  const publishStream = useCallback(
    (stream: MediaStream) => {
      for (const peer of peersRef.current.values()) addLocalTracks(peer, stream);
    },
    [addLocalTracks]
  );

  const unpublishStream = useCallback((stream: MediaStream) => {
    const tracks = new Set(stream.getTracks());
    const isMic = stream === micStreamRef.current;
    for (const peer of peersRef.current.values()) {
      for (const sender of peer.connection.getSenders()) {
        // A muted mic's sender has no track, so it's found by identity.
        if ((sender.track && tracks.has(sender.track)) || (isMic && sender === peer.micSender)) {
          if (sender === peer.micSender) peer.micSender = null;
          try {
            peer.connection.removeTrack(sender);
          } catch {
            // The connection may already be closing.
          }
        }
      }
    }
  }, []);

  const handleSignal = useCallback(
    (from: string, raw: unknown) => {
      const data = raw as { kind: "sdp" | "ice" | "busy"; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
      if (data.kind === "busy") {
        // They're over budget and we didn't make their cut: leave it a
        // while rather than retrying at once.
        busyUntilRef.current.set(from, Date.now() + BUSY_BACKOFF_MS);
        closePeer(from);
        return;
      }
      // An offer can arrive before we know the sender has media, so accept
      // the connection and let the roster effect tidy up if it's unwanted,
      // unless the room is over budget and they aren't among the peers
      // this side would choose.
      const acceptable = acceptableRef.current;
      if (!peersRef.current.has(from) && acceptable && !acceptable.has(from)) {
        sendSignalRef.current(from, { kind: "busy" });
        return;
      }
      const peer = peersRef.current.get(from) ?? createPeer(from);
      const { connection } = peer;

      void (async () => {
        try {
          if (data.kind === "sdp" && data.description) {
            const description = data.description;
            const collision = description.type === "offer" && (peer.makingOffer || connection.signalingState !== "stable");
            peer.ignoreOffer = !peer.polite && collision;
            if (peer.ignoreOffer) return;
            await connection.setRemoteDescription(description);
            // Anything that arrived early can go in now that there's a
            // remote description to attach it to.
            for (const candidate of peer.pendingCandidates.splice(0)) {
              await connection.addIceCandidate(candidate).catch(() => {});
            }
            if (description.type === "offer") {
              await setTunedLocalDescription(connection);
              if (connection.localDescription) {
                sendSignalRef.current(from, { kind: "sdp", description: connection.localDescription.toJSON() });
              }
            }
            applySendCaps(peer);
          } else if (data.kind === "ice" && data.candidate) {
            if (!connection.remoteDescription) {
              peer.pendingCandidates.push(data.candidate);
              return;
            }
            try {
              await connection.addIceCandidate(data.candidate);
            } catch (err) {
              if (!peer.ignoreOffer) throw err;
            }
          }
        } catch (err) {
          console.warn("Media signalling failed:", err);
        }
      })();
    },
    [applySendCaps, createPeer, closePeer]
  );

  const enableMic = useCallback(async () => {
    if (micStreamRef.current) return;
    setConnecting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const context = ensureAudioContext();
      await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      localAnalyserRef.current = analyser;
      for (const track of stream.getAudioTracks()) track.enabled = !mutedRef.current;

      const deviceList = await navigator.mediaDevices.enumerateDevices();
      setDevices(deviceList.filter((device) => device.kind === "audioinput"));
      setSelectedDeviceId(stream.getAudioTracks()[0]?.getSettings().deviceId ?? null);
      publishStream(stream);
      setMicEnabled(true);
      publishLocalMedia();
    } catch (err) {
      console.error("Could not enable the microphone:", err);
      setError("Could not use the microphone. Check the browser's permission for this site.");
    } finally {
      setConnecting(false);
    }
  }, [ensureAudioContext, publishLocalMedia, publishStream]);

  const disableMic = useCallback(() => {
    const stream = micStreamRef.current;
    if (stream) {
      unpublishStream(stream);
      stream.getTracks().forEach((track) => track.stop());
    }
    micStreamRef.current = null;
    localAnalyserRef.current = null;
    setMicEnabled(false);
    setLocalSpeaking(false);
    publishLocalMedia();
  }, [publishLocalMedia, unpublishStream]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    micStreamRef.current?.getAudioTracks().forEach((track) => (track.enabled = !next));
    syncMicSending(next);
    publishLocalMedia();
  }, [syncMicSending, publishLocalMedia]);

  /** Sets mute to an explicit value rather than flipping it — used when
   *  an admin's adminSetMute arrives (see App.tsx): the target's own
   *  client is what actually has to act on it, since media is
   *  peer-to-peer and the server never has access to anyone's audio to
   *  mute directly. A no-op if the mic isn't on — nothing to mute yet. */
  const forceMute = useCallback((next: boolean) => {
    if (!micStreamRef.current) return;
    mutedRef.current = next;
    setMuted(next);
    micStreamRef.current.getAudioTracks().forEach((track) => (track.enabled = !next));
    syncMicSending(next);
    publishLocalMedia();
  }, [syncMicSending, publishLocalMedia]);

  const selectDevice = useCallback(
    async (deviceId: string) => {
      if (!micStreamRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
      const track = stream.getAudioTracks()[0];
      if (!track) return;
      track.enabled = !mutedRef.current;
      // replaceTrack swaps the microphone without renegotiating.
      const previous = micStreamRef.current;
      // The mic's own sender, not whichever audio sender comes first: a
      // shared tab's audio is an audio sender too. While muted it stays
      // empty and picks the new track up on unmute.
      if (!mutedRef.current) {
        for (const peer of peersRef.current.values()) void peer.micSender?.replaceTrack(track);
      }
      previous.getAudioTracks().forEach((old) => old.stop());
      micStreamRef.current = stream;
      const context = ensureAudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      localAnalyserRef.current = analyser;
      setSelectedDeviceId(deviceId);
      publishLocalMedia();
    },
    [ensureAudioContext, publishLocalMedia]
  );

  const stopCamera = useCallback(() => {
    const stream = cameraStreamRef.current;
    if (stream) {
      unpublishStream(stream);
      stream.getTracks().forEach((track) => track.stop());
    }
    cameraStreamRef.current = null;
    setLocalCameraStream(null);
    setCameraOn(false);
    publishLocalMedia();
  }, [publishLocalMedia, unpublishStream]);

  const startCamera = useCallback(async (): Promise<boolean> => {
    if (cameraStreamRef.current) return true;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      cameraStreamRef.current = stream;
      for (const track of stream.getVideoTracks()) {
        track.contentHint = "motion";
        track.addEventListener("ended", () => stopCamera());
      }
      publishStream(stream);
      setLocalCameraStream(stream);
      setCameraOn(true);
      publishLocalMedia();
      return true;
    } catch (err) {
      console.error("Could not start the camera:", err);
      setError("Could not use the camera. Check the browser's permission for this site.");
      return false;
    }
  }, [publishLocalMedia, publishStream, stopCamera]);

  const stopScreen = useCallback(() => {
    const stream = screenStreamRef.current;
    if (stream) {
      unpublishStream(stream);
      stream.getTracks().forEach((track) => track.stop());
    }
    screenStreamRef.current = null;
    setLocalScreenStream(null);
    setScreenOn(false);
    publishLocalMedia();
  }, [publishLocalMedia, unpublishStream]);

  const startScreen = useCallback(async (): Promise<boolean> => {
    if (screenStreamRef.current) return true;
    setError(null);
    try {
      // Keep Seiza in front after the picker closes. By default Chrome
      // switches to the tab or window you chose to share, which hid the
      // world and paused its rendering, so the presenter couldn't see their
      // own share in it while everyone else could. Where the browser
      // supports Conditional Focus, ask it not to switch; elsewhere this
      // is skipped and sharing works as before.
      type FocusController = { setFocusBehavior?: (behavior: string) => void };
      const Controller = (window as unknown as { CaptureController?: new () => FocusController }).CaptureController;
      const controller = Controller ? new Controller() : undefined;
      const stream = await navigator.mediaDevices.getDisplayMedia(
        controller ? ({ ...SCREEN_CONSTRAINTS, controller } as DisplayMediaStreamOptions) : SCREEN_CONSTRAINTS
      );
      try {
        // Must be called straight after getDisplayMedia resolves; it
        // throws for a whole-screen share, where there is nothing to focus.
        controller?.setFocusBehavior?.("no-focus-change");
      } catch {
        // Fine: focus behaviour is a nicety, not a requirement.
      }
      screenStreamRef.current = stream;
      for (const track of stream.getVideoTracks()) {
        // Tells the encoder to favour sharpness over frame rate, which is
        // what a shared document or slide needs.
        track.contentHint = "detail";
        // The browser's own "Stop sharing" button ends the track, and the
        // app has to notice that rather than pretend it's still sharing.
        track.addEventListener("ended", () => stopScreen());
      }
      publishStream(stream);
      setLocalScreenStream(stream);
      setScreenOn(true);
      publishLocalMedia();
      return true;
    } catch (err) {
      // Cancelling the picker lands here too, which isn't an error worth showing.
      if ((err as DOMException)?.name !== "NotAllowedError") {
        console.error("Could not start screen sharing:", err);
        setError("Could not start screen sharing.");
      }
      return false;
    }
  }, [publishLocalMedia, publishStream, stopScreen]);

  // Connect to and disconnect from peers as the roster and everyone's media
  // change. A connection exists only when at least one side has something to
  // send, so a quiet room costs nothing.
  const localActive = micEnabled || cameraOn || screenOn;
  // While everyone fits in the budget this connects to all of them, as it
  // always has. Past it, the nearest win (see rankPeers) instead of
  // whoever happened to be first in the roster, which used to leave a
  // late arrival standing beside you unheard.
  useEffect(() => {
    if (!selfId) return;
    const plan = planPeers({
      selfId,
      players,
      localActive,
      here: localPositionRef.current,
      existing: peersRef.current,
      busyUntil: busyUntilRef.current,
      now: Date.now(),
    });
    acceptableRef.current = plan.acceptable;
    for (const id of plan.close) closePeer(id);
    for (const id of plan.closeBusy) {
      // Tell them, so they back off instead of reconnecting straight away.
      sendSignalRef.current(id, { kind: "busy" });
      closePeer(id);
    }
    for (const id of plan.create) createPeer(id);
  }, [players, selfId, localActive, createPeer, closePeer]);

  useEffect(
    () => () => {
      for (const id of Array.from(peersRef.current.keys())) closePeer(id);
      for (const stream of [micStreamRef.current, cameraStreamRef.current, screenStreamRef.current]) {
        stream?.getTracks().forEach((track) => track.stop());
      }
      void audioContextRef.current?.close();
      audioContextRef.current = null;
    },
    [closePeer]
  );

  const getStream = useCallback((peerId: string, streamId: string | null | undefined) => {
    if (!streamId) return null;
    return peersRef.current.get(peerId)?.streams.get(streamId) ?? null;
  }, []);

  const updateSpatial = useCallback(
    (localPosition: [number, number, number]) => {
      localPositionRef.current = localPosition;
      if (peersRef.current.size === 0 && !localAnalyserRef.current) return;
      if (localAnalyserRef.current) {
        // Kept as a raw level as well as a boolean: the boolean drives
        // the "you are talking" chrome, the level drives your own
        // avatar's lip sync, and rounding it here rather than in the
        // consumer keeps React from re-rendering on every imperceptible
        // flicker of room tone.
        const level = rmsLevel(localAnalyserRef.current);
        setLocalSpeaking(level > 0.05);
        setLocalSpeakingLevel((previous) => (Math.abs(previous - level) > 0.01 ? level : previous));
      }

      const levels: Record<string, number> = {};
      for (const [peerId, peer] of peersRef.current.entries()) {
        const player = playersRef.current[peerId];
        if (player) {
          const dx = player.position[0] - localPosition[0];
          const dy = player.position[1] - localPosition[1];
          const dz = player.position[2] - localPosition[2];
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const volume = Math.max(0, 1 - distance / VOICE_FALLOFF_DISTANCE);
          for (const audio of peer.audio.values()) {
            audio.gain.gain.setTargetAtTime(volume, audio.gain.context.currentTime, 0.1);
          }
        }
        // Speaking means their microphone, not the audio from a shared tab.
        const micId = player?.media?.mic;
        const mic = micId ? peer.audio.get(micId) : undefined;
        const analysers = mic ? [mic] : Array.from(peer.audio.values());
        levels[peerId] = analysers.reduce((loudest, audio) => Math.max(loudest, rmsLevel(audio.analyser)), 0);
      }
      setSpeakingLevels(levels);
    },
    []
  );

  return {
    micEnabled,
    connecting,
    muted,
    devices,
    selectedDeviceId,
    speakingLevels,
    localSpeaking,
    localSpeakingLevel,
    cameraOn,
    screenOn,
    error,
    localMedia,
    localCameraStream,
    localScreenStream,
    enableMic,
    disableMic,
    toggleMute,
    forceMute,
    selectDevice,
    startCamera,
    stopCamera,
    startScreen,
    stopScreen,
    getStream,
    streamsVersion,
    handleSignal,
    updateSpatial,
  };
}

function rmsLevel(analyser: AnalyserNode): number {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(data);
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    const normalized = (data[i] - 128) / 128;
    sumSquares += normalized * normalized;
  }
  return Math.sqrt(sumSquares / data.length);
}
