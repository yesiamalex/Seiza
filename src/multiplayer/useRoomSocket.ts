import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ClientMessage, PlayerMedia, PlayerState, Posture, ServerMessage, WorldObject } from "./types";

// The production Worker serves both the app and the Durable Object route, so
// same-origin is the reliable default. Set VITE_SEIZA_ROOM_HOST only when the
// room server is intentionally deployed separately (or for a custom local
// setup).
const ROOM_HOST = import.meta.env.VITE_SEIZA_ROOM_HOST;
// Chat isn't persisted server-side (see worker/room.ts) — capping how much
// we keep client-side too, so a long-running session's message list
// doesn't grow unbounded in memory.
const MAX_CHAT_MESSAGES = 200;
// Capped exponential backoff for reconnect attempts, so a room server
// that's genuinely down (or not running yet in local dev) doesn't spam
// the console/network with a rapid-fire retry loop.
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 10_000;
// A little over the room server's AVATAR_CHANGE_MIN_INTERVAL_MS (1500).
const AVATAR_CHANGE_MIN_INTERVAL_MS = 1600;

export type ConnectionState = "connecting" | "connected" | "reconnecting";

export interface MultiplayerState {
  selfId: string | null;
  players: Record<string, PlayerState>;
  objects: Record<string, WorldObject>;
  messages: ChatMessage[];
  send: (msg: ClientMessage) => void;
  addObject: (object: Omit<WorldObject, "id" | "ownerId">) => void;
  moveObject: (id: string, position: [number, number, number], rotationY: number) => void;
  removeObject: (id: string) => void;
  sendChat: (text: string) => void;
  /** Take up or drop a held pose, so other clients hold it too. */
  setPosture: (posture: Posture) => void;
  /** Write on a board or a note. */
  setObjectText: (id: string, text: string) => void;
  /** Claim a screen to present on, or hand it back. */
  presentOnObject: (id: string, active: boolean) => void;
  /** Publish which of our live streams is which (see PlayerMedia). */
  setMedia: (media: PlayerMedia) => void;
  connected: boolean;
  connectionState: ConnectionState;
  /** Whether this deployment has SEIZA_EDITOR_PASSWORD set at all — if
   *  false, editing is open and there's nothing to authenticate. */
  editorPasswordRequired: boolean;
  /** Whether *this* connection has successfully entered the password
   *  (or editorPasswordRequired is false, in which case always true). */
  isEditor: boolean;
  editorAuthPending: boolean;
  editorAuthFailed: boolean;
  authEditor: (password: string) => void;
  roomFull: number | null;
  /** Room-level environment override (see worker/room.ts), or null when
   *  the deployment's own world.json sceneUrl should be used. */
  environmentUrl: string | null;
  setEnvironment: (url: string | null) => void;
}

/**
 * Connects to the room server — worker/room.ts, a Durable Object routed
 * to via the `/rooms/:id` path on the same Worker that serves the app
 * (see wrangler.jsonc) — for a given world/room id. One room = one
 * deployed world instance's shared session.
 *
 * This is a small hand-rolled reconnecting WebSocket rather than the
 * `partysocket` package: that package hardcodes PartyKit's own
 * `/parties/:party/:room` URL convention, which stopped making sense
 * once the room server moved off PartyKit onto a plain Durable Object
 * with a URL scheme of this project's own choosing.
 *
 * `onVoiceSignal` is a ref-stable escape hatch for WebRTC signaling
 * (see src/media/useRealtimeMedia.ts) — those messages are relay-only and
 * don't belong in `players`/`objects` state, so they're handed off via
 * callback instead of being buffered here.
 */
export function useRoomSocket(
  roomId: string,
  displayName: string,
  avatarUrl: string,
  onVoiceSignal?: (from: string, data: unknown) => void
): MultiplayerState {
  const socketRef = useRef<WebSocket | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Record<string, PlayerState>>({});
  const [objects, setObjects] = useState<Record<string, WorldObject>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [editorPasswordRequired, setEditorPasswordRequired] = useState(false);
  const [isEditor, setIsEditor] = useState(false);
  const [editorAuthPending, setEditorAuthPending] = useState(false);
  const [editorAuthFailed, setEditorAuthFailed] = useState(false);
    const [roomFull, setRoomFull] = useState<number | null>(null);
  const [environmentUrl, setEnvironmentUrl] = useState<string | null>(null);
  const onVoiceSignalRef = useRef(onVoiceSignal);
  onVoiceSignalRef.current = onVoiceSignal;
  // Read at connect time rather than being effect dependencies: changing
  // your avatar used to tear down and reopen the socket, which dropped
  // voice connections and showed you leaving and rejoining to everyone.
  // Now a change is sent in place (setAvatar, below) and a later
  // reconnect simply joins with the latest values.
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  const avatarUrlRef = useRef(avatarUrl);
  const selfIdRef = useRef<string | null>(null);

  const send = useCallback((msg: ClientMessage) => {
    // socketRef.current is assigned the moment `new WebSocket()` runs,
    // not once it's actually open — a plain truthy/null check isn't
    // enough. Sending while still CONNECTING (e.g. a UI click that
    // lands in the gap between construction and the "open" event) threw
    // an uncaught InvalidStateError rather than just silently no-op-ing.
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }, []);

  const addObject = useCallback(
    (object: Omit<WorldObject, "id" | "ownerId">) => send({ type: "objectAdd", object }),
    [send]
  );
  const moveObject = useCallback(
    (id: string, position: [number, number, number], rotationY: number) =>
      send({ type: "objectMove", id, position, rotationY }),
    [send]
  );
  const removeObject = useCallback((id: string) => send({ type: "objectRemove", id }), [send]);
  const sendChat = useCallback((text: string) => send({ type: "chat", text }), [send]);
  const setPosture = useCallback((posture: Posture) => send({ type: "setPosture", posture }), [send]);
  const setObjectText = useCallback((id: string, text: string) => send({ type: "objectSetText", id, text }), [send]);
  const presentOnObject = useCallback((id: string, active: boolean) => send({ type: "objectPresent", id, active }), [send]);
  const setMedia = useCallback((media: PlayerMedia) => send({ type: "setMedia", media }), [send]);
  const setEnvironment = useCallback((url: string | null) => send({ type: "setEnvironment", url }), [send]);
  const authEditor = useCallback(
    (password: string) => {
      setEditorAuthPending(true);
      setEditorAuthFailed(false);
      send({ type: "authEditor", password });
    },
    [send]
  );

  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;
    let reconnectAttempt = 0;
    let reconnectTimer: number | undefined;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = ROOM_HOST || window.location.host;
      const socket = new WebSocket(`${protocol}//${host}/rooms/${encodeURIComponent(roomId)}`);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        reconnectAttempt = 0;
        setConnectionState("connected");
        socket.send(
          JSON.stringify({ type: "join", displayName: displayNameRef.current, avatarUrl: avatarUrlRef.current } satisfies ClientMessage)
        );
      });

      socket.addEventListener("close", () => {
        socketRef.current = null;
        if (cancelled) return;
        setConnectionState("reconnecting");
        const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt);
        reconnectAttempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      });

      socket.addEventListener("message", (event: MessageEvent) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data) as ServerMessage;
        } catch {
          console.warn("Ignoring malformed room message from the server.");
          return;
        }
        switch (msg.type) {
          case "welcome": {
            setRoomFull(null);
            selfIdRef.current = msg.selfId;
            setSelfId(msg.selfId);
            const playerMap: Record<string, PlayerState> = {};
            for (const p of msg.players) playerMap[p.id] = p;
            setPlayers(playerMap);
            const objectMap: Record<string, WorldObject> = {};
            for (const o of msg.objects) objectMap[o.id] = o;
            setObjects(objectMap);
            setEditorPasswordRequired(msg.editorPasswordRequired);
            setIsEditor(!msg.editorPasswordRequired);
            setEnvironmentUrl(msg.environmentUrl);
            break;
          }
          case "environmentChanged":
            setEnvironmentUrl(msg.url);
            break;
          case "roomFull":
            setRoomFull(msg.maxOccupants);
            socket.close();
            break;
          case "playerJoined":
            setPlayers((prev) => ({ ...prev, [msg.player.id]: msg.player }));
            break;
          case "playerUpdated":
            setPlayers((prev) =>
              prev[msg.id]
                ? { ...prev, [msg.id]: { ...prev[msg.id], position: msg.position, rotationY: msg.rotationY } }
                : prev
            );
            break;
          case "playerGesture":
            setPlayers((prev) =>
              prev[msg.id]
                ? { ...prev, [msg.id]: { ...prev[msg.id], activeGesture: msg.gesture, gestureSeq: msg.seq } }
                : prev
            );
            break;
          case "playerPosture":
            setPlayers((prev) => (prev[msg.id] ? { ...prev, [msg.id]: { ...prev[msg.id], posture: msg.posture } } : prev));
            break;
          case "playerAvatarChanged":
            setPlayers((prev) =>
              prev[msg.id] ? { ...prev, [msg.id]: { ...prev[msg.id], avatarUrl: msg.avatarUrl } } : prev
            );
            break;
          case "playerLeft":
            setPlayers((prev) => {
              const next = { ...prev };
              delete next[msg.id];
              return next;
            });
            break;
          case "objectAdded":
            setObjects((prev) => ({ ...prev, [msg.object.id]: msg.object }));
            break;
          case "objectMoved":
            setObjects((prev) =>
              prev[msg.id] ? { ...prev, [msg.id]: { ...prev[msg.id], position: msg.position, rotationY: msg.rotationY } } : prev
            );
            break;
          case "objectUpdated":
            setObjects((prev) => ({ ...prev, [msg.object.id]: msg.object }));
            break;
          case "playerMedia":
            setPlayers((prev) => (prev[msg.id] ? { ...prev, [msg.id]: { ...prev[msg.id], media: msg.media } } : prev));
            break;
          case "objectRemoved":
            setObjects((prev) => {
              const next = { ...prev };
              delete next[msg.id];
              return next;
            });
            break;
          case "chat":
            setMessages((prev) => [...prev, msg.message].slice(-MAX_CHAT_MESSAGES));
            break;
          case "editorAuthResult":
            setEditorAuthPending(false);
            setIsEditor(msg.granted);
            setEditorAuthFailed(!msg.granted);
            break;
          case "voiceSignal":
            onVoiceSignalRef.current?.(msg.from, msg.data);
            break;
        }
      });
    }

    connect();

    return () => {
      cancelled = true;
      window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [roomId]);

  // Avatar changes go out in place. If the socket isn't open right now,
  // the next join carries the new URL instead.
  //
  // The server ignores changes less than 1.5s apart (worker/room.ts), so
  // clicking through presets quickly would otherwise leave everyone else
  // seeing a stale avatar. Changes inside that window are held and only
  // the latest one is sent once it has passed.
  const lastAvatarSendRef = useRef(0);
  const avatarSendTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (avatarUrlRef.current === avatarUrl) return;
    avatarUrlRef.current = avatarUrl;
    const self = selfIdRef.current;
    if (self) {
      setPlayers((prev) => (prev[self] ? { ...prev, [self]: { ...prev[self], avatarUrl } } : prev));
    }
    const flush = () => {
      avatarSendTimerRef.current = undefined;
      lastAvatarSendRef.current = Date.now();
      send({ type: "setAvatar", avatarUrl: avatarUrlRef.current });
    };
    window.clearTimeout(avatarSendTimerRef.current);
    const wait = lastAvatarSendRef.current + AVATAR_CHANGE_MIN_INTERVAL_MS - Date.now();
    if (wait <= 0) flush();
    else avatarSendTimerRef.current = window.setTimeout(flush, wait);
  }, [avatarUrl, send]);
  useEffect(() => () => window.clearTimeout(avatarSendTimerRef.current), []);

  return {
    selfId,
    players,
    objects,
    messages,
    send,
    addObject,
    moveObject,
    removeObject,
    sendChat,
    setPosture,
    setObjectText,
    presentOnObject,
    setMedia,
    connected: connectionState === "connected",
    connectionState,
    editorPasswordRequired,
    isEditor,
    editorAuthPending,
    editorAuthFailed,
    authEditor,
    roomFull,
    environmentUrl,
    setEnvironment,
  };
}
