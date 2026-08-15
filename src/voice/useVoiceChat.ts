import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerState } from "../multiplayer/types";

export const VOICE_ENABLED = import.meta.env.VITE_SEIZA_VOICE_ENABLED === "true";

// WebRTC mesh: every participant connects directly to every other
// participant (O(n^2) connections/bandwidth). That's the right tradeoff
// for the classroom-sized rooms this project targets and needs zero extra
// infrastructure beyond the room server we already have for signaling —
// see the paper's Section 7 for the honest scaling discussion. Past this
// many simultaneously-connected peers, new joiners stay visible/movable
// but are not auto-connected to voice.
const VOICE_MESH_SOFT_CAP = 12;

// Distance (world units) at which a remote peer's voice fades to silence.
const VOICE_FALLOFF_DISTANCE = 12;

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

interface Peer {
  connection: RTCPeerConnection;
  gain: GainNode;
  analyser: AnalyserNode;
  audioEl: HTMLAudioElement;
}

export interface VoiceChatState {
  enabled: boolean;
  connecting: boolean;
  muted: boolean;
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  speakingLevels: Record<string, number>;
  localSpeaking: boolean;
  enable: () => Promise<void>;
  disable: () => void;
  toggleMute: () => void;
  selectDevice: (deviceId: string) => Promise<void>;
  /** Wire this into usePartySocket's onVoiceSignal callback. */
  handleSignal: (from: string, data: unknown) => void;
  /** Call periodically (e.g. from the existing position-sync loop) to
   *  update per-peer volume based on distance and refresh speaking levels. */
  updateSpatial: (localPosition: [number, number, number]) => void;
}

interface UseVoiceChatArgs {
  selfId: string | null;
  players: Record<string, PlayerState>;
  sendSignal: (to: string, data: unknown) => void;
}

/**
 * Peer-to-peer WebRTC voice mesh. Signaling is relayed through the
 * existing PartyKit room (see party/room.ts's "voiceSignal" case) — no
 * separate media server, everything stays on the deployer's own
 * Cloudflare account for signaling; actual audio flows directly between
 * browsers (plus an optional TURN relay if the deployer configures one
 * via VITE_SEIZA_TURN_URLS).
 */
export function useVoiceChat({ selfId, players, sendSignal }: UseVoiceChatArgs): VoiceChatState {
  const [enabled, setEnabled] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [speakingLevels, setSpeakingLevels] = useState<Record<string, number>>({});
  const [localSpeaking, setLocalSpeaking] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;
  const sendSignalRef = useRef(sendSignal);
  sendSignalRef.current = sendSignal;

  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  const closePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer) return;
    peer.connection.close();
    peer.audioEl.pause();
    peer.audioEl.srcObject = null;
    peersRef.current.delete(peerId);
    setSpeakingLevels((prev) => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const createPeer = useCallback(
    (peerId: string, initiator: boolean) => {
      if (peersRef.current.has(peerId) || !localStreamRef.current) return;
      const ctx = ensureAudioContext();
      const connection = new RTCPeerConnection({ iceServers: buildIceServers() });

      for (const track of localStreamRef.current.getTracks()) {
        connection.addTrack(track, localStreamRef.current);
      }

      connection.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignalRef.current(peerId, { kind: "ice", candidate: event.candidate.toJSON() });
        }
      };

      const gain = ctx.createGain();
      gain.gain.value = 0;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const audioEl = new Audio();
      audioEl.autoplay = true;

      connection.ontrack = (event) => {
        const [stream] = event.streams;
        audioEl.srcObject = stream;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(gain).connect(analyser).connect(ctx.destination);
      };

      peersRef.current.set(peerId, { connection, gain, analyser, audioEl });

      if (initiator) {
        connection
          .createOffer()
          .then((offer) => connection.setLocalDescription(offer))
          .then(() => {
            if (connection.localDescription) {
              sendSignalRef.current(peerId, { kind: "sdp", description: connection.localDescription.toJSON() });
            }
          })
          .catch((err) => console.error("voice offer failed:", err));
      }
    },
    [ensureAudioContext]
  );

  const handleSignal = useCallback(
    (from: string, raw: unknown) => {
      if (!enabled || !localStreamRef.current) return;
      const data = raw as { kind: "sdp" | "ice"; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

      if (!peersRef.current.has(from)) {
        createPeer(from, false);
      }
      const peer = peersRef.current.get(from);
      if (!peer) return;

      if (data.kind === "sdp" && data.description) {
        const description = data.description;
        peer.connection
          .setRemoteDescription(description)
          .then(async () => {
            if (description.type === "offer") {
              const answer = await peer.connection.createAnswer();
              await peer.connection.setLocalDescription(answer);
              if (peer.connection.localDescription) {
                sendSignalRef.current(from, { kind: "sdp", description: peer.connection.localDescription.toJSON() });
              }
            }
          })
          .catch((err) => console.error("voice sdp handling failed:", err));
      } else if (data.kind === "ice" && data.candidate) {
        peer.connection.addIceCandidate(data.candidate).catch((err) => console.error("voice ICE add failed:", err));
      }
    },
    [enabled, createPeer]
  );

  const enable = useCallback(async () => {
    if (localStreamRef.current) return;
    setConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const ctx = ensureAudioContext();
      await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      localAnalyserRef.current = analyser;

      const deviceList = await navigator.mediaDevices.enumerateDevices();
      setDevices(deviceList.filter((d) => d.kind === "audioinput"));
      setSelectedDeviceId(stream.getAudioTracks()[0]?.getSettings().deviceId ?? null);

      setEnabled(true);
    } catch (err) {
      console.error("Could not enable microphone:", err);
    } finally {
      setConnecting(false);
    }
  }, [ensureAudioContext]);

  const disable = useCallback(() => {
    for (const peerId of Array.from(peersRef.current.keys())) closePeer(peerId);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    localAnalyserRef.current = null;
    setEnabled(false);
    setSpeakingLevels({});
    setLocalSpeaking(false);
  }, [closePeer]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  }, []);

  const selectDevice = useCallback(
    async (deviceId: string) => {
      if (!localStreamRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
      const newTrack = stream.getAudioTracks()[0];
      if (!newTrack) return;
      newTrack.enabled = !muted;

      for (const peer of peersRef.current.values()) {
        const sender = peer.connection.getSenders().find((s) => s.track?.kind === "audio");
        sender?.replaceTrack(newTrack);
      }

      localStreamRef.current.getAudioTracks().forEach((t) => t.stop());
      localStreamRef.current = stream;
      const ctx = ensureAudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      localAnalyserRef.current = analyser;
      setSelectedDeviceId(deviceId);
    },
    [ensureAudioContext, muted]
  );

  // Connect to / disconnect from remote peers as the room roster changes.
  useEffect(() => {
    if (!enabled || !selfId) return;
    const remoteIds = Object.keys(players).filter((id) => id !== selfId);
    const connectedCount = peersRef.current.size;
    let slotsLeft = VOICE_MESH_SOFT_CAP - connectedCount;

    for (const id of remoteIds) {
      if (peersRef.current.has(id)) continue;
      if (slotsLeft <= 0) break;
      // Lower id initiates the offer so both sides don't race each other.
      createPeer(id, selfId < id);
      slotsLeft -= 1;
    }

    for (const id of Array.from(peersRef.current.keys())) {
      if (!players[id]) closePeer(id);
    }
  }, [enabled, selfId, players, createPeer, closePeer]);

  useEffect(() => disable, [disable]);

  const updateSpatial = useCallback(
    (localPosition: [number, number, number]) => {
      if (!enabled) return;

      if (localAnalyserRef.current) {
        setLocalSpeaking(rmsLevel(localAnalyserRef.current) > 0.05);
      }

      const nextLevels: Record<string, number> = {};
      for (const [peerId, peer] of peersRef.current.entries()) {
        const playerPos = players[peerId]?.position;
        if (playerPos) {
          const dx = playerPos[0] - localPosition[0];
          const dy = playerPos[1] - localPosition[1];
          const dz = playerPos[2] - localPosition[2];
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const volume = Math.max(0, 1 - distance / VOICE_FALLOFF_DISTANCE);
          peer.gain.gain.setTargetAtTime(volume, peer.gain.context.currentTime, 0.1);
        }
        nextLevels[peerId] = rmsLevel(peer.analyser);
      }
      setSpeakingLevels(nextLevels);
    },
    [enabled, players]
  );

  return {
    enabled,
    connecting,
    muted,
    devices,
    selectedDeviceId,
    speakingLevels,
    localSpeaking,
    enable,
    disable,
    toggleMute,
    selectDevice,
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
