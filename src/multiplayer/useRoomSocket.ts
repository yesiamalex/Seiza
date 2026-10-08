import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_LIGHTS } from "./types";
import type {
  ChatMessage,
  ClientMessage,
  LightZone,
  PlayerMedia,
  PlayerState,
  Posture,
  PresentSource,
  ServerMessage,
  WorldObject,
} from "./types";
import { rememberAdminKey, rememberEditorPassword } from "../edit/editAuth";
import { trackingStore } from "../xr/body/trackingStore";

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

/** "away": the tab stepped out of the room after a long idle spell in the
 *  background (see App.tsx), and rejoins when it is used again. */
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "away";

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
  /** Opt our avatar out of seiza endurance for everyone, or back in. */
  setCalm: (calm: boolean) => void;
  /** Write on a board or a note. */
  setObjectText: (id: string, text: string) => void;
  /** Claim a screen to present on, or hand it back. */
  presentOnObject: (id: string, active: boolean, source?: PresentSource) => void;
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
  /** Whether this deployment has SEIZA_ADMIN_KEY set. When true, it
   *  supersedes the editor password for gating Edit Mode (see App.tsx's
   *  canEditWorld) and unlocks moderation once authAdmin succeeds. A
   *  deployment with no admin key configured has no admin concept
   *  active at all — see authAdmin's doc comment in types.ts. */
  adminKeyRequired: boolean;
  /** Never defaults to true the way isEditor does when nothing's
   *  configured — admin is opt-in only, proven fresh each connection
   *  (see the "welcome" handler's comment on why this doesn't persist
   *  across a reconnect). */
  isAdmin: boolean;
  adminAuthPending: boolean;
  adminAuthFailed: boolean;
  authAdmin: (key: string) => void;
  /** True for exactly the session after an admin kicked this connection
   *  — see the "close" handler's kicked-flag check, which is what stops
   *  the ordinary reconnect logic from just silently rejoining. */
  wasKicked: boolean;
  adminKick: (targetId: string) => void;
  adminSetMute: (targetId: string, muted: boolean) => void;
  adminGatherAll: () => void;
  /** Whether this room currently requires an entry password — visible
   *  even to a non-admin so a "this room is locked" indicator can show
   *  without exposing the password itself. */
  roomPasswordSet: boolean;
  /** True while the server is waiting on the *right* password — see
   *  passwordRequired's doc comment in types.ts. App.tsx shows a gate
   *  screen while this is true and calls joinWithPassword to retry. */
  passwordRequired: boolean;
  joinWithPassword: (password: string) => void;
  adminSetRoomPassword: (password: string | null) => void;
  roomFull: number | null;
  /** Room-level environment override (see worker/room.ts), or null when
   *  the deployment's own world.json sceneUrl should be used. */
  environmentUrl: string | null;
  setEnvironment: (url: string | null) => void;
  /** Room-level sky image, or null for the built-in sunset. */
  skyboxUrl: string | null;
  setSkybox: (url: string | null) => void;
  /** Light-switch state per zone, shared by everyone in the room. */
  lights: Record<LightZone, boolean>;
  setLight: (zone: LightZone, on: boolean) => void;
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
/** Escape hatches for server messages App.tsx has to act on outside this
 *  hook's own state (media control, avatar position) — an options bag
 *  rather than more positional params so a future addition doesn't
 *  reorder existing call sites, the same reasoning as onVoiceSignal. */
export interface RoomSocketCallbacks {
  /** This connection was told by an admin to mute/unmute its own mic —
   *  see useRealtimeMedia.ts's forceMute. The server never has access to
   *  anyone's audio itself (media is peer-to-peer), so "mute" only works
   *  by asking the target's own client to act on it. */
  onForceMute?: (muted: boolean) => void;
  /** An admin gathered everyone to their position; teleport the local
   *  avatar there — see App.tsx's teleportToPlayer for the same motion
   *  triggered locally by an admin picking one specific person instead. */
  onGatherRequest?: (position: [number, number, number]) => void;
}

export function useRoomSocket(
  roomId: string,
  displayName: string,
  avatarUrl: string,
  onVoiceSignal?: (from: string, data: unknown) => void,
  callbacks?: RoomSocketCallbacks,
  /** True closes the connection without trying to reconnect, and false
   *  rejoins: how an idle background tab stops costing the room. */
  paused = false
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
  const [adminKeyRequired, setAdminKeyRequired] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminAuthPending, setAdminAuthPending] = useState(false);
  const [adminAuthFailed, setAdminAuthFailed] = useState(false);
  const [wasKicked, setWasKicked] = useState(false);
  const [roomPasswordSet, setRoomPasswordSet] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [roomFull, setRoomFull] = useState<number | null>(null);
  const [environmentUrl, setEnvironmentUrl] = useState<string | null>(null);
  const [skyboxUrl, setSkyboxUrl] = useState<string | null>(null);
  const [lights, setLights] = useState<Record<LightZone, boolean>>({ ...DEFAULT_LIGHTS });
  const onVoiceSignalRef = useRef(onVoiceSignal);
  onVoiceSignalRef.current = onVoiceSignal;
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  // Filled in by joinWithPassword and read the next time `join` is sent
  // (on this connection's retry, or a future reconnect) — not React
  // state, since setting it should never itself trigger a re-render.
  const roomPasswordRef = useRef<string | undefined>(undefined);
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
  const setCalm = useCallback((calm: boolean) => send({ type: "setCalm", calm }), [send]);
  const setObjectText = useCallback((id: string, text: string) => send({ type: "objectSetText", id, text }), [send]);
  const presentOnObject = useCallback(
    (id: string, active: boolean, source?: PresentSource) => send({ type: "objectPresent", id, active, source }),
    [send]
  );
  const setMedia = useCallback((media: PlayerMedia) => send({ type: "setMedia", media }), [send]);
  const setEnvironment = useCallback((url: string | null) => send({ type: "setEnvironment", url }), [send]);
  const setSkybox = useCallback((url: string | null) => send({ type: "setSkybox", url }), [send]);
  // Flipped locally straight away so the switch feels instant; the
  // server's lightChanged broadcast (or the next welcome) settles it.
  const setLight = useCallback(
    (zone: LightZone, on: boolean) => {
      setLights((previous) => ({ ...previous, [zone]: on }));
      send({ type: "setLight", zone, on });
    },
    [send]
  );
  const authEditor = useCallback(
    (password: string) => {
      setEditorAuthPending(true);
      setEditorAuthFailed(false);
      rememberEditorPassword(password);
      send({ type: "authEditor", password });
    },
    [send]
  );
  const authAdmin = useCallback(
    (key: string) => {
      setAdminAuthPending(true);
      setAdminAuthFailed(false);
      rememberAdminKey(key);
      send({ type: "authAdmin", key });
    },
    [send]
  );
  const adminKick = useCallback((targetId: string) => send({ type: "adminKick", targetId }), [send]);
  const adminSetMute = useCallback(
    (targetId: string, muted: boolean) => send({ type: "adminSetMute", targetId, muted }),
    [send]
  );
  const adminGatherAll = useCallback(() => send({ type: "adminGatherAll" }), [send]);
  const adminSetRoomPassword = useCallback(
    (password: string | null) => send({ type: "adminSetRoomPassword", password }),
    [send]
  );
  const joinWithPassword = useCallback(
    (password: string) => {
      roomPasswordRef.current = password;
      // Resent over the same still-open socket — see passwordRequired's
      // doc comment in types.ts for why a reconnect isn't needed here.
      send({ type: "join", displayName: displayNameRef.current, avatarUrl: avatarUrlRef.current, roomPassword: password });
    },
    [send]
  );

  useEffect(() => {
    if (!roomId) return;
    if (paused) {
      // Nobody here while away: no stale avatars, and no voice
      // connections held open to people we can no longer see.
      setConnectionState("away");
      setPlayers({});
      setSelfId(null);
      selfIdRef.current = null;
      return;
    }

    let cancelled = false;
    let reconnectAttempt = 0;
    let reconnectTimer: number | undefined;
    // A kick is a deliberate removal, not a network drop — reconnecting
    // would just rejoin (there's no ban list, only a one-time
    // disconnect) and make "kick" look broken by silently undoing
    // itself. Read inside "close" via a plain closure variable rather
    // than React state, since that listener is created once per
    // connect() and would otherwise see whatever `wasKicked` was at
    // definition time, not its latest value.
    let kicked = false;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = ROOM_HOST || window.location.host;
      const socket = new WebSocket(`${protocol}//${host}/rooms/${encodeURIComponent(roomId)}`);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        reconnectAttempt = 0;
        setConnectionState("connected");
        socket.send(
          JSON.stringify({
            type: "join",
            displayName: displayNameRef.current,
            avatarUrl: avatarUrlRef.current,
            roomPassword: roomPasswordRef.current,
            caps: ["batch"],
          } satisfies ClientMessage)
        );
      });

      socket.addEventListener("close", () => {
        // A reconnect gets new ids for everyone; nothing tracked under the
        // old ones should go on posing an avatar.
        trackingStore.clearRemote();
        socketRef.current = null;
        if (cancelled || kicked) return;
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
            setPasswordRequired(false);
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
            // Older room servers predate the admin system and omit the field.
            setAdminKeyRequired(msg.adminKeyRequired ?? false);
            // Deliberately not restored across a reconnect the way
            // isEditor is when no password is set: admin is proven fresh
            // each connection via authAdmin, never granted by default.
            setIsAdmin(false);
            setRoomPasswordSet(msg.roomPasswordSet ?? false);
            setEnvironmentUrl(msg.environmentUrl);
            // Older room servers predate skyboxes and omit the field.
            setSkyboxUrl(msg.skyboxUrl ?? null);
            setLights({ ...DEFAULT_LIGHTS, ...(msg.lights ?? {}) });
            break;
          }
          case "passwordRequired":
            setPasswordRequired(true);
            break;
          case "skyboxChanged":
            setSkyboxUrl(msg.url);
            break;
          case "lightChanged":
            setLights((previous) => ({ ...previous, [msg.zone]: msg.on }));
            break;
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
                ? { ...prev, [msg.id]: { ...prev[msg.id], position: msg.position, rotationY: msg.rotationY, headPitch: msg.headPitch ?? 0 } }
                : prev
            );
            break;
          case "playersUpdated":
            // One render for the whole tick, rather than one per player.
            setPlayers((prev) => {
              let next: Record<string, PlayerState> | null = null;
              for (const update of msg.updates) {
                const player = prev[update.id];
                if (!player || update.id === selfIdRef.current) continue;
                next ??= { ...prev };
                next[update.id] = { ...player, position: update.position, rotationY: update.rotationY, headPitch: update.headPitch ?? 0 };
              }
              return next ?? prev;
            });
            break;
          case "playerTracking":
            // Straight into the tracking store, not React state: these
            // arrive ten times a second per headset and are only ever read
            // from a frame loop (see trackingStore.ts).
            trackingStore.set(msg.id, msg.pose);
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
          case "playerCalm":
            setPlayers((prev) => (prev[msg.id] ? { ...prev, [msg.id]: { ...prev[msg.id], calm: msg.calm } } : prev));
            break;
          case "playerAvatarChanged":
            setPlayers((prev) =>
              prev[msg.id] ? { ...prev, [msg.id]: { ...prev[msg.id], avatarUrl: msg.avatarUrl } } : prev
            );
            break;
          case "playerLeft":
            trackingStore.set(msg.id, null);
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
          case "adminAuthResult":
            setAdminAuthPending(false);
            setIsAdmin(msg.granted);
            setAdminAuthFailed(!msg.granted);
            break;
          case "youWereKicked":
            kicked = true;
            setWasKicked(true);
            // The server closes this connection right after sending
            // this; the "close" handler's `kicked` check (set here)
            // skips its usual reconnect-with-backoff so this doesn't
            // just silently rejoin a moment later.
            break;
          case "forceMute":
            callbacksRef.current?.onForceMute?.(msg.muted);
            break;
          case "gatherRequest":
            callbacksRef.current?.onGatherRequest?.(msg.position);
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
  }, [roomId, paused]);

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
    setCalm,
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
    adminKeyRequired,
    isAdmin,
    adminAuthPending,
    adminAuthFailed,
    authAdmin,
    wasKicked,
    adminKick,
    adminSetMute,
    adminGatherAll,
    roomPasswordSet,
    passwordRequired,
    joinWithPassword,
    adminSetRoomPassword,
    roomFull,
    environmentUrl,
    setEnvironment,
    skyboxUrl,
    setSkybox,
    lights,
    setLight,
  };
}
