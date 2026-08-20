import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ClientMessage, PlayerState, ServerMessage, WorldObject } from "./types";

const ROOM_HOST = import.meta.env.VITE_SEIZA_ROOM_HOST ?? "127.0.0.1:8787";
// Chat isn't persisted server-side (see worker/room.ts) — capping how much
// we keep client-side too, so a long-running session's message list
// doesn't grow unbounded in memory.
const MAX_CHAT_MESSAGES = 200;
// Capped exponential backoff for reconnect attempts, so a room server
// that's genuinely down (or not running yet in local dev) doesn't spam
// the console/network with a rapid-fire retry loop.
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 10_000;

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
 * (see src/voice/useVoiceChat.ts) — those messages are relay-only and
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
  const onVoiceSignalRef = useRef(onVoiceSignal);
  onVoiceSignalRef.current = onVoiceSignal;

  const send = useCallback((msg: ClientMessage) => {
    socketRef.current?.send(JSON.stringify(msg));
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
      const socket = new WebSocket(`${protocol}//${ROOM_HOST}/rooms/${encodeURIComponent(roomId)}`);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        reconnectAttempt = 0;
        setConnectionState("connected");
        socket.send(JSON.stringify({ type: "join", displayName, avatarUrl } satisfies ClientMessage));
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
        const msg = JSON.parse(event.data) as ServerMessage;
        switch (msg.type) {
          case "welcome": {
            setSelfId(msg.selfId);
            const playerMap: Record<string, PlayerState> = {};
            for (const p of msg.players) playerMap[p.id] = p;
            setPlayers(playerMap);
            const objectMap: Record<string, WorldObject> = {};
            for (const o of msg.objects) objectMap[o.id] = o;
            setObjects(objectMap);
            setEditorPasswordRequired(msg.editorPasswordRequired);
            setIsEditor(!msg.editorPasswordRequired);
            break;
          }
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
              prev[msg.id] ? { ...prev, [msg.id]: { ...prev[msg.id], activeGesture: msg.gesture } } : prev
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
    // Intentionally only re-runs on roomId change — displayName/avatarUrl
    // are captured at join time. Re-joining on every rename is a
    // reasonable future improvement, not a bug in this scaffold.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

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
    connected: connectionState === "connected",
    connectionState,
    editorPasswordRequired,
    isEditor,
    editorAuthPending,
    editorAuthFailed,
    authEditor,
  };
}
