import { useCallback, useEffect, useRef, useState } from "react";
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
 * the soft cap below, later joiners stay visible and audible to the people
 * already connected but aren't auto-connected themselves.
 *
 * Costs are kept down deliberately:
 * - capture resolution and frame rate are constrained at the source, and
 *   each outgoing video track gets a bitrate cap;
 * - connections exist only while someone actually has media on;
 * - remote video is decoded only while something on screen is showing it
 *   (see VideoPanel), so an idle share costs nothing to a viewer looking
 *   the other way.
 */
const VOICE_MESH_SOFT_CAP = 12;
const VOICE_FALLOFF_DISTANCE = 12;

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

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
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
  streams: Map<string, MediaStream>;
  audio: Map<string, RemoteAudio>;
}

export interface RealtimeMediaState {
  micEnabled: boolean;
  connecting: boolean;
  muted: boolean;
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  speakingLevels: Record<string, number>;
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

const hasAnyMedia = (media: PlayerMedia | undefined) => !!(media && (media.mic || media.camera || media.screen));

export function useRealtimeMedia({ selfId, players, sendSignal }: UseRealtimeMediaArgs): RealtimeMediaState {
  const [micEnabled, setMicEnabled] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [speakingLevels, setSpeakingLevels] = useState<Record<string, number>>({});
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

  const bumpStreams = useCallback(() => setStreamsVersion((version) => version + 1), []);

  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    return audioContextRef.current;
  }, []);

  const publishLocalMedia = useCallback(() => {
    setLocalMedia({
      mic: micStreamRef.current?.id ?? null,
      camera: cameraStreamRef.current?.id ?? null,
      screen: screenStreamRef.current?.id ?? null,
    });
  }, []);

  const localStreams = useCallback(
    () => [micStreamRef.current, cameraStreamRef.current, screenStreamRef.current].filter((s): s is MediaStream => !!s),
    []
  );

  /** Bitrate caps, applied once a sender exists for each video track. */
  const applySendCaps = useCallback((peer: Peer) => {
    for (const sender of peer.connection.getSenders()) {
      if (!sender.track || sender.track.kind !== "video") continue;
      const isScreen = screenStreamRef.current?.getTracks().includes(sender.track) ?? false;
      const parameters = sender.getParameters();
      if (!parameters.encodings || parameters.encodings.length === 0) parameters.encodings = [{}];
      parameters.encodings[0].maxBitrate = isScreen ? SCREEN_MAX_BITRATE : CAMERA_MAX_BITRATE;
      sender.setParameters(parameters).catch(() => {
        // Not fatal: some browsers refuse mid-negotiation, and the stream
        // still works, just without our ceiling.
      });
    }
  }, []);

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
      const connection = new RTCPeerConnection({ iceServers: buildIceServers() });
      const peer: Peer = {
        connection,
        // Deterministic and opposite on the two sides, which is all the
        // perfect-negotiation pattern needs to break an offer collision.
        polite: (selfIdRef.current ?? "") > peerId,
        makingOffer: false,
        ignoreOffer: false,
        streams: new Map(),
        audio: new Map(),
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
          await connection.setLocalDescription();
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
        if (connection.connectionState === "connected") applySendCaps(peer);
        if (connection.connectionState === "failed") closePeer(peerId);
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
        bumpStreams();
      };

      for (const stream of localStreams()) {
        for (const track of stream.getTracks()) connection.addTrack(track, stream);
      }
      return peer;
    },
    [applySendCaps, attachAudio, closePeer, detachAudio, localStreams, bumpStreams]
  );

  /** Sends a newly started local stream to everyone already connected. */
  const publishStream = useCallback((stream: MediaStream) => {
    for (const peer of peersRef.current.values()) {
      for (const track of stream.getTracks()) peer.connection.addTrack(track, stream);
    }
  }, []);

  const unpublishStream = useCallback((stream: MediaStream) => {
    const tracks = new Set(stream.getTracks());
    for (const peer of peersRef.current.values()) {
      for (const sender of peer.connection.getSenders()) {
        if (sender.track && tracks.has(sender.track)) {
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
      const data = raw as { kind: "sdp" | "ice"; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
      // An offer can arrive before we know the sender has media, so accept
      // the connection and let the roster effect tidy up if it's unwanted.
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
            if (description.type === "offer") {
              await connection.setLocalDescription();
              if (connection.localDescription) {
                sendSignalRef.current(from, { kind: "sdp", description: connection.localDescription.toJSON() });
              }
            }
            applySendCaps(peer);
          } else if (data.kind === "ice" && data.candidate) {
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
    [applySendCaps, createPeer]
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
    setMuted((previous) => {
      const next = !previous;
      micStreamRef.current?.getAudioTracks().forEach((track) => (track.enabled = !next));
      return next;
    });
  }, []);

  const selectDevice = useCallback(
    async (deviceId: string) => {
      if (!micStreamRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
      const track = stream.getAudioTracks()[0];
      if (!track) return;
      track.enabled = !mutedRef.current;
      // replaceTrack swaps the microphone without renegotiating.
      const previous = micStreamRef.current;
      for (const peer of peersRef.current.values()) {
        const sender = peer.connection.getSenders().find((candidate) => candidate.track?.kind === "audio");
        void sender?.replaceTrack(track);
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
      const stream = await navigator.mediaDevices.getDisplayMedia(SCREEN_CONSTRAINTS);
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
  useEffect(() => {
    if (!selfId) return;
    const remoteIds = Object.keys(players).filter((id) => id !== selfId);
    let slots = VOICE_MESH_SOFT_CAP - peersRef.current.size;

    for (const id of remoteIds) {
      const wanted = localActive || hasAnyMedia(players[id]?.media);
      if (!wanted || peersRef.current.has(id)) continue;
      if (slots <= 0) break;
      createPeer(id);
      slots -= 1;
    }

    for (const id of Array.from(peersRef.current.keys())) {
      const gone = !players[id];
      const idle = !localActive && !hasAnyMedia(players[id]?.media);
      if (gone || idle) closePeer(id);
    }
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
      if (peersRef.current.size === 0 && !localAnalyserRef.current) return;
      if (localAnalyserRef.current) setLocalSpeaking(rmsLevel(localAnalyserRef.current) > 0.05);

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
    cameraOn,
    screenOn,
    error,
    localMedia,
    localCameraStream,
    localScreenStream,
    enableMic,
    disableMic,
    toggleMute,
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
