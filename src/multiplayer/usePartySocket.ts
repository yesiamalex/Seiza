import { useCallback, useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";
import type { ClientMessage, PlayerState, ServerMessage } from "./types";

const PARTY_HOST = import.meta.env.VITE_SEIZA_PARTY_HOST ?? "127.0.0.1:1999";

export interface MultiplayerState {
  selfId: string | null;
  players: Record<string, PlayerState>;
  send: (msg: ClientMessage) => void;
  connected: boolean;
}

/**
 * Connects to the room server in party/room.ts for a given world/room id.
 * One room = one deployed world instance's shared session.
 */
export function usePartySocket(roomId: string, displayName: string, avatarUrl: string): MultiplayerState {
  const socketRef = useRef<PartySocket | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Record<string, PlayerState>>({});
  const [connected, setConnected] = useState(false);

  const send = useCallback((msg: ClientMessage) => {
    socketRef.current?.send(JSON.stringify(msg));
  }, []);

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
          const map: Record<string, PlayerState> = {};
          for (const p of msg.players) map[p.id] = p;
          setPlayers(map);
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

  return { selfId, players, send, connected };
}
