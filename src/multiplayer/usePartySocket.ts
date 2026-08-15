import { useCallback, useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";
import type { ClientMessage, PlayerState, ServerMessage, WorldObject } from "./types";

const PARTY_HOST = import.meta.env.VITE_SEIZA_PARTY_HOST ?? "127.0.0.1:1999";

export interface MultiplayerState {
  selfId: string | null;
  players: Record<string, PlayerState>;
  objects: Record<string, WorldObject>;
  send: (msg: ClientMessage) => void;
  addObject: (object: Omit<WorldObject, "id" | "ownerId">) => void;
  moveObject: (id: string, position: [number, number, number], rotationY: number) => void;
  removeObject: (id: string) => void;
  connected: boolean;
}

/**
 * Connects to the room server in party/room.ts for a given world/room id.
 * One room = one deployed world instance's shared session.
 *
 * `onVoiceSignal` is a ref-stable escape hatch for WebRTC signaling
 * (see src/voice/useVoiceChat.ts) — those messages are relay-only and
 * don't belong in `players`/`objects` state, so they're handed off via
 * callback instead of being buffered here.
 */
export function usePartySocket(
  roomId: string,
  displayName: string,
  avatarUrl: string,
  onVoiceSignal?: (from: string, data: unknown) => void
): MultiplayerState {
  const socketRef = useRef<PartySocket | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Record<string, PlayerState>>({});
  const [objects, setObjects] = useState<Record<string, WorldObject>>({});
  const [connected, setConnected] = useState(false);
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

  useEffect(() => {
    if (!roomId) return;
    const socket = new PartySocket({ host: PARTY_HOST, room: roomId });
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnected(true);
      socket.send(JSON.stringify({ type: "join", displayName, avatarUrl } satisfies ClientMessage));
    });

    socket.addEventListener("close", () => setConnected(false));

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
        case "voiceSignal":
          onVoiceSignalRef.current?.(msg.from, msg.data);
          break;
      }
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
    // Intentionally only re-runs on roomId change — displayName/avatarUrl
    // are captured at join time. Re-joining on every rename is a
    // reasonable future improvement, not a bug in this scaffold.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  return { selfId, players, objects, send, addObject, moveObject, removeObject, connected };
}
