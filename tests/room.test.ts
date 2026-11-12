/**
 * The room server, end to end: the real Worker and Durable Object, started
 * in-process by Wrangler, and plain WebSocket clients speaking the room
 * protocol. No browser and no 3D, so it runs in seconds.
 *
 * Needs a built client in dist/ (the Worker serves it as static assets):
 * run `npx vite build` once first. Skipped otherwise.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev, type Unstable_DevWorker } from "wrangler";
import type { ClientMessage, ServerMessage } from "../src/multiplayer/types";

const built = existsSync("dist/index.html");

describe.skipIf(!built)("room server", () => {
  let worker: Unstable_DevWorker;
  let roomCount = 0;

  beforeAll(async () => {
    worker = await unstable_dev("worker/index.ts", {
      config: "wrangler.jsonc",
      experimental: { disableExperimentalWarning: true },
      logLevel: "none",
    });
  }, 60_000);

  afterAll(async () => {
    await worker?.stop();
  });

  /** A protocol-level client: joins a room and records what it receives. */
  async function client(room: string, name: string, caps?: string[], session?: string) {
    const socket = new WebSocket(`ws://${worker.address}:${worker.port}/rooms/${room}`);
    const received: ServerMessage[] = [];
    socket.addEventListener("message", (event) => received.push(JSON.parse(String(event.data)) as ServerMessage));
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () => reject(new Error("socket failed")));
    });
    const send = (message: ClientMessage) => socket.send(JSON.stringify(message));
    send({ type: "join", displayName: name, avatarUrl: "", ...(caps ? { caps } : {}), ...(session ? { session } : {}) });
    const welcome = await until(() => received.find((m) => m.type === "welcome"));
    const selfId = welcome.type === "welcome" ? welcome.selfId : "";
    return { socket, received, send, selfId };
  }

  const freshRoom = () => `test-${Date.now()}-${roomCount++}`;

  it("delivers movement as one batched message per tick", async () => {
    const room = freshRoom();
    const a = await client(room, "A", ["batch"]);
    const b = await client(room, "B", ["batch"]);
    for (let x = 1; x <= 3; x++) a.send({ type: "state", position: [x, 0, 0], rotationY: 0 });
    const batch = await until(() => b.received.find((m) => m.type === "playersUpdated"));
    expect(batch.type === "playersUpdated" && batch.updates).toEqual([{ id: a.selfId, position: [3, 0, 0], rotationY: 0, headPitch: 0 }]);
    expect(b.received.some((m) => m.type === "playerUpdated")).toBe(false);
    a.socket.close();
    b.socket.close();
  });

  it("still sends single updates to a client from before batching", async () => {
    const room = freshRoom();
    const a = await client(room, "A", ["batch"]);
    const old = await client(room, "Old");
    a.send({ type: "state", position: [2, 0, 1], rotationY: 1 });
    const update = await until(() => old.received.find((m) => m.type === "playerUpdated"));
    expect(update.type === "playerUpdated" && update.position).toEqual([2, 0, 1]);
    await sleep(400);
    expect(old.received.some((m) => m.type === "playersUpdated")).toBe(false);
    a.socket.close();
    old.socket.close();
  });

  it("gives a newcomer everyone's latest position", async () => {
    const room = freshRoom();
    const a = await client(room, "A", ["batch"]);
    a.send({ type: "state", position: [4, 0, -2], rotationY: 0 });
    await sleep(300);
    const late = await client(room, "Late", ["batch"]);
    const welcome = late.received.find((m) => m.type === "welcome");
    const seen = welcome?.type === "welcome" ? welcome.players.find((p) => p.id === a.selfId) : undefined;
    expect(seen?.position).toEqual([4, 0, -2]);
    a.socket.close();
    late.socket.close();
  });

  it("relays that a microphone is muted", async () => {
    const room = freshRoom();
    const a = await client(room, "A", ["batch"]);
    const b = await client(room, "B", ["batch"]);
    a.send({ type: "setMedia", media: { mic: "mic-stream-1", micMuted: true } });
    const media = await until(() => b.received.find((m) => m.type === "playerMedia"));
    expect(media.type === "playerMedia" && media.media).toEqual({ mic: "mic-stream-1", micMuted: true });
    a.socket.close();
    b.socket.close();
  });

  it("replaces a page's old connection when it reconnects", async () => {
    // A dropped network leaves the old socket open on the server; the page
    // then reconnects with the same session. Nobody should see two of them.
    const room = freshRoom();
    const watcher = await client(room, "Watcher", ["batch"]);
    const first = await client(room, "Laptop", ["batch"], "page-session-1234");
    let oldClosed = false;
    first.socket.addEventListener("close", () => (oldClosed = true));
    const second = await client(room, "Laptop", ["batch"], "page-session-1234");

    const left = await until(() => watcher.received.find((m) => m.type === "playerLeft"));
    expect(left.type === "playerLeft" && left.id).toBe(first.selfId);
    await until(() => (oldClosed ? true : undefined));
    const welcome = second.received.find((m) => m.type === "welcome");
    const names = welcome?.type === "welcome" ? welcome.players.map((p) => p.displayName).sort() : [];
    expect(names).toEqual(["Laptop", "Watcher"]);
    // The old socket closing later must not announce the player again.
    await sleep(300);
    expect(watcher.received.filter((m) => m.type === "playerLeft")).toHaveLength(1);
    watcher.socket.close();
    second.socket.close();
  });

  it("keeps two tabs from different page loads as two players", async () => {
    const room = freshRoom();
    const a = await client(room, "Tab", ["batch"], "page-session-aaaa");
    const b = await client(room, "Tab", ["batch"], "page-session-bbbb");
    await sleep(300);
    expect(a.received.some((m) => m.type === "playerLeft")).toBe(false);
    expect(b.received.find((m) => m.type === "welcome")?.type === "welcome").toBe(true);
    a.socket.close();
    b.socket.close();
  });

  it("shares a room sky, stamps its start time, and gives it to newcomers", async () => {
    const room = freshRoom();
    const a = await client(room, "A", ["batch"]);
    const b = await client(room, "B", ["batch"]);
    const before = Date.now();
    a.send({ type: "setRoomSky", sky: { mode: "running", hour: 30.1, scale: 999, weather: "rain", setAt: 1 } });
    const changed = await until(() => b.received.find((m) => m.type === "roomSkyChanged"));
    const sky = changed.type === "roomSkyChanged" ? changed.sky : null;
    // Hour wrapped into the day, an unknown speed back to real speed, and
    // the client's own setAt replaced by the server's clock.
    expect(sky).toMatchObject({ mode: "running", hour: 6.1, scale: 1, weather: "rain" });
    expect(sky?.setAt).toBeGreaterThanOrEqual(before - 1000);

    a.send({ type: "setRoomSky", sky: { mode: "fixed" } as never });
    a.send({ type: "setRoomSky", sky: { mode: "fixed", hour: 18.5, weather: "snow" as never } });
    const late = await client(room, "Late", ["batch"]);
    const welcome = late.received.find((m) => m.type === "welcome");
    // The malformed one (no hour) was ignored; an unknown weather is auto.
    expect(welcome?.type === "welcome" && welcome.roomSky).toEqual({ mode: "fixed", hour: 18.5, weather: "auto" });

    a.send({ type: "setRoomSky", sky: null });
    await until(() => late.received.find((m) => m.type === "roomSkyChanged" && m.sky === null));
    a.socket.close();
    b.socket.close();
    late.socket.close();
  });

  it("shares world state and checks it", async () => {
    const room = freshRoom();
    const a = await client(room, "A", ["batch"]);
    const b = await client(room, "B", ["batch"]);
    a.send({ type: "setWorldState", key: "breaker.wind", value: false });
    const changed = await until(() => b.received.find((m) => m.type === "worldStateChanged"));
    expect(changed).toEqual({ type: "worldStateChanged", key: "breaker.wind", value: false });
    // Bad keys and oversized values are ignored.
    a.send({ type: "setWorldState", key: "Bad Key!", value: 1 });
    a.send({ type: "setWorldState", key: "note", value: "x".repeat(200) });
    a.send({ type: "setWorldState", key: "battery.mode", value: "hold" });
    const late = await client(room, "Late", ["batch"]);
    const welcome = late.received.find((m) => m.type === "welcome");
    expect(welcome?.type === "welcome" && welcome.worldState).toEqual({ "breaker.wind": false, "battery.mode": "hold" });
    a.socket.close();
    b.socket.close();
    late.socket.close();
  });

  it("passes a voice 'busy' signal through untouched", async () => {
    const room = freshRoom();
    const a = await client(room, "A", ["batch"]);
    const b = await client(room, "B", ["batch"]);
    a.send({ type: "voiceSignal", to: b.selfId, data: { kind: "busy" } });
    const signal = await until(() => b.received.find((m) => m.type === "voiceSignal"));
    expect(signal.type === "voiceSignal" && signal.data).toEqual({ kind: "busy" });
    a.socket.close();
    b.socket.close();
  });

  // --- security -----------------------------------------------------------------------------

  /** A socket that connects but never joins. */
  async function rawSocket(room: string) {
    const socket = new WebSocket(`ws://${worker.address}:${worker.port}/rooms/${room}`);
    await new Promise<void>((resolve) => socket.addEventListener("open", () => resolve()));
    return socket;
  }

  it("only relays voice signals between joined players, and not oversized ones", async () => {
    const room = freshRoom();
    const a = await client(room, "A", ["batch"]);
    const b = await client(room, "B", ["batch"]);
    const stranger = await rawSocket(room);
    stranger.send(JSON.stringify({ type: "voiceSignal", to: b.selfId, data: { kind: "busy" } }));
    a.send({ type: "voiceSignal", to: b.selfId, data: { kind: "sdp", padding: "x".repeat(40_000) } });
    a.send({ type: "voiceSignal", to: b.selfId, data: null as never });
    await sleep(400);
    expect(b.received.some((m) => m.type === "voiceSignal")).toBe(false);
    a.send({ type: "voiceSignal", to: b.selfId, data: { kind: "busy" } });
    await until(() => b.received.find((m) => m.type === "voiceSignal"));
    stranger.close();
    a.socket.close();
    b.socket.close();
  });

  it("keeps a world's private messages small, structured, and slow", async () => {
    const room = freshRoom();
    const a = await client(room, "A", ["batch"]);
    const b = await client(room, "B", ["batch"]);
    const world = (data: unknown) => a.send({ type: "voiceSignal", to: b.selfId, data: { world: data } as never });
    world("a plain string"); // not an object
    world(["an", "array"]);
    world({ ns: "x", padding: "x".repeat(2_000) }); // over 1 KB, though far under the signalling limit
    await sleep(400);
    expect(b.received.some((m) => m.type === "voiceSignal")).toBe(false);
    // A burst is capped well below signalling's: 20 at once, then 4 a second.
    for (let i = 0; i < 60; i++) world({ ns: "x", i });
    await sleep(500);
    const delivered = b.received.filter((m) => m.type === "voiceSignal").length;
    expect(delivered).toBeGreaterThan(0);
    expect(delivered).toBeLessThanOrEqual(24);
    a.socket.close();
    b.socket.close();
  });

  describe("together gestures", () => {
    const gesturesOf = (c: { received: ServerMessage[] }, name: string) =>
      c.received.filter((m) => m.type === "playerGesture" && m.gesture === name).length;

    it("refuses a hug, fist bump, or dap nobody agreed to", async () => {
      const room = freshRoom();
      const a = await client(room, "A", ["batch"]);
      const b = await client(room, "B", ["batch"]);
      for (const g of ["hug", "fistbump", "dap", "handshake", "highfive"]) {
        a.send({ type: "gesture", gesture: g });
        await sleep(300); // past the per-connection gesture rate limit
      }
      a.send({ type: "gesture", gesture: "wave" }); // an ordinary gesture still plays
      await until(() => b.received.find((m) => m.type === "playerGesture" && m.gesture === "wave"));
      for (const g of ["hug", "fistbump", "dap", "handshake", "highfive"]) expect(gesturesOf(b, g)).toBe(0);
      a.socket.close();
      b.socket.close();
    });

    it("plays once, for both, after a yes", async () => {
      const room = freshRoom();
      const a = await client(room, "A", ["batch"]);
      const b = await client(room, "B", ["batch"]);
      a.send({ type: "togetherAsk", to: b.selfId, gesture: "hug" });
      const sent = await until(() => a.received.find((m) => m.type === "togetherSent"));
      const asked = await until(() => b.received.find((m) => m.type === "togetherAsked"));
      expect(asked.type === "togetherAsked" && asked.from).toBe(a.selfId);
      expect(sent.type === "togetherSent" && asked.type === "togetherAsked" && sent.id === asked.id).toBe(true);
      b.send({ type: "togetherAnswer", id: asked.type === "togetherAsked" ? asked.id : "", accept: true });
      await until(() => a.received.find((m) => m.type === "togetherStart"));
      await until(() => b.received.find((m) => m.type === "togetherStart"));
      a.send({ type: "gesture", gesture: "hug" });
      await until(() => b.received.find((m) => m.type === "playerGesture" && m.gesture === "hug"));
      // The yes covered one hug, not a standing licence.
      await sleep(300);
      a.send({ type: "gesture", gesture: "hug" });
      await sleep(400);
      expect(gesturesOf(b, "hug")).toBe(1);
      a.socket.close();
      b.socket.close();
    });

    it("turns away someone out of reach, without telling them why", async () => {
      const room = freshRoom();
      const a = await client(room, "A", ["batch"]);
      const b = await client(room, "B", ["batch"]);
      b.send({ type: "state", position: [10, 0, 0], rotationY: 0 });
      await sleep(400);
      a.send({ type: "togetherAsk", to: b.selfId, gesture: "handshake" });
      const closed = await until(() => a.received.find((m) => m.type === "togetherClosed"));
      expect(closed.type === "togetherClosed" && closed.reason).toBe("unavailable");
      expect(b.received.some((m) => m.type === "togetherAsked")).toBe(false);
      a.socket.close();
      b.socket.close();
    });

    it("won't let someone ask again right after a no", async () => {
      const room = freshRoom();
      const a = await client(room, "A", ["batch"]);
      const b = await client(room, "B", ["batch"]);
      a.send({ type: "togetherAsk", to: b.selfId, gesture: "highfive" });
      const asked = await until(() => b.received.find((m) => m.type === "togetherAsked"));
      b.send({ type: "togetherAnswer", id: asked.type === "togetherAsked" ? asked.id : "", accept: false });
      const closed = await until(() => a.received.find((m) => m.type === "togetherClosed"));
      expect(closed.type === "togetherClosed" && closed.reason).toBe("declined");
      a.send({ type: "togetherAsk", to: b.selfId, gesture: "highfive" });
      await until(() => a.received.filter((m) => m.type === "togetherClosed").length === 2 || undefined);
      expect(b.received.filter((m) => m.type === "togetherAsked").length).toBe(1);
      a.socket.close();
      b.socket.close();
    });

    it("holds the slow dance to a yes, each partner to their part, and ends it for both", async () => {
      const room = freshRoom();
      const a = await client(room, "A", ["batch"]);
      const b = await client(room, "B", ["batch"]);
      const postures = (c: { received: ServerMessage[] }, name: string | null) =>
        c.received.filter((m) => m.type === "playerPosture" && m.posture === name).length;
      // Without a yes: neither the poses nor a "slowdance" clip get through.
      a.send({ type: "setPosture", posture: "slowdancelead" });
      a.send({ type: "gesture", gesture: "slowdance" });
      await sleep(400);
      expect(postures(b, "slowdancelead")).toBe(0);
      expect(gesturesOf(b, "slowdance")).toBe(0);
      // A asks, B says yes: A leads, B follows.
      a.send({ type: "togetherAsk", to: b.selfId, gesture: "slowdance" });
      const asked = await until(() => b.received.find((m) => m.type === "togetherAsked"));
      b.send({ type: "togetherAnswer", id: asked.type === "togetherAsked" ? asked.id : "", accept: true });
      const start = await until(() => a.received.find((m) => m.type === "togetherStart"));
      expect(start.type === "togetherStart" && start.role).toBe("lead");
      a.send({ type: "setPosture", posture: "slowdancefollow" }); // not A's part
      await sleep(300);
      expect(postures(b, "slowdancefollow")).toBe(0);
      a.send({ type: "setPosture", posture: "slowdancelead" });
      b.send({ type: "setPosture", posture: "slowdancefollow" });
      await until(() => b.received.find((m) => m.type === "playerPosture" && m.posture === "slowdancelead"));
      await until(() => a.received.find((m) => m.type === "playerPosture" && m.posture === "slowdancefollow"));
      // A stops: B is told, so B's side stops too.
      a.send({ type: "setPosture", posture: null });
      const ended = await until(() => b.received.find((m) => m.type === "togetherEnded"));
      expect(ended.type === "togetherEnded" && ended.partner).toBe(a.selfId);
      a.socket.close();
      b.socket.close();
    });

    it("only lets the person asked answer", async () => {
      const room = freshRoom();
      const a = await client(room, "A", ["batch"]);
      const b = await client(room, "B", ["batch"]);
      const c = await client(room, "C", ["batch"]);
      a.send({ type: "togetherAsk", to: b.selfId, gesture: "hug" });
      const asked = await until(() => b.received.find((m) => m.type === "togetherAsked"));
      c.send({ type: "togetherAnswer", id: asked.type === "togetherAsked" ? asked.id : "", accept: true });
      await sleep(400);
      expect(a.received.some((m) => m.type === "togetherStart")).toBe(false);
      a.socket.close();
      b.socket.close();
      c.socket.close();
    });
  });

  it("ignores a second join on the same connection", async () => {
    const room = freshRoom();
    const watcher = await client(room, "Watcher", ["batch"]);
    const a = await client(room, "A", ["batch"]);
    a.send({ type: "join", displayName: "A again", avatarUrl: "" });
    await sleep(400);
    expect(watcher.received.filter((m) => m.type === "playerJoined")).toHaveLength(1);
    watcher.socket.close();
    a.socket.close();
  });

  it("won't pass on an outside avatar URL, which would log everyone's IP", async () => {
    const room = freshRoom();
    const watcher = await client(room, "Watcher", ["batch"]);
    const socket = new WebSocket(`ws://${worker.address}:${worker.port}/rooms/${room}`);
    await new Promise<void>((resolve) => socket.addEventListener("open", () => resolve()));
    socket.send(JSON.stringify({ type: "join", displayName: "Sneaky", avatarUrl: "https://logger.example/me.vrm" }));
    const joined = await until(() => watcher.received.find((m) => m.type === "playerJoined"));
    // Kept in the room, with the default avatar instead.
    expect(joined.type === "playerJoined" && joined.player.avatarUrl).toBe("");
    socket.send(JSON.stringify({ type: "setAvatar", avatarUrl: "/api/avatars/abc.vrm" }));
    const changed = await until(() => watcher.received.find((m) => m.type === "playerAvatarChanged"));
    expect(changed.type === "playerAvatarChanged" && changed.avatarUrl).toBe("/api/avatars/abc.vrm");
    socket.close();
    watcher.socket.close();
  });

  it("refuses model links to local networks and disguised addresses", async () => {
    const room = freshRoom();
    const a = await client(room, "A", ["batch"]);
    const object = (modelUrl: string) => ({ kind: "model", modelUrl, color: "#ffffff", position: [0, 0, 0], rotationY: 0, scale: 1 });
    for (const bad of ["https://192.168.1.1/router.glb", "https://localhost/x.glb", "http://example.com/x.glb", "/\\evil.example/x.glb", "https://user:pw@example.com/x.glb"]) {
      a.send({ type: "objectAdd", object: object(bad) as never });
    }
    a.send({ type: "objectAdd", object: object("https://models.example.com/ok.glb") as never });
    const added = await until(() => a.received.find((m) => m.type === "objectAdded"));
    await sleep(300);
    expect(a.received.filter((m) => m.type === "objectAdded")).toHaveLength(1);
    expect(added.type === "objectAdded" && added.object.modelUrl).toBe("https://models.example.com/ok.glb");
    a.socket.close();
  });

  it("lets a picture carry an https link, and refuses anything else", async () => {
    const room = freshRoom();
    const a = await client(room, "A", ["batch"]);
    a.send({ type: "objectAdd", object: { kind: "image", src: "/api/assets/pic.webp", color: "#ffffff", position: [0, 0, 0], rotationY: 0, scale: 1 } as never });
    const added = await until(() => a.received.find((m) => m.type === "objectAdded"));
    const id = added.type === "objectAdded" ? added.object.id : "";
    for (const bad of ["javascript:alert(1)", "http://example.com", "https://192.168.1.1/", "https://example.com/\u202Eexe.gpj"]) {
      a.send({ type: "objectSetLink", id, link: bad });
    }
    a.send({ type: "objectSetLink", id, link: "https://framevr.io/example" });
    const updated = await until(() => a.received.find((m) => m.type === "objectUpdated"));
    await sleep(300);
    expect(a.received.filter((m) => m.type === "objectUpdated")).toHaveLength(1);
    expect(updated.type === "objectUpdated" && updated.object.link).toBe("https://framevr.io/example");
    a.send({ type: "objectSetLink", id, link: "" });
    await until(() => (a.received.filter((m) => m.type === "objectUpdated").length === 2 ? true : undefined));
    const cleared = a.received.filter((m) => m.type === "objectUpdated")[1];
    expect(cleared.type === "objectUpdated" && cleared.object.link).toBeUndefined();
    a.socket.close();
  });

  it("strips direction overrides and control characters from chat and names", async () => {
    const room = freshRoom();
    const a = await client(room, "A‮gnp.exe", ["batch"]);
    a.send({ type: "chat", text: "hello‮ dlrow\u0007\nnext" });
    const chat = await until(() => a.received.find((m) => m.type === "chat"));
    expect(chat.type === "chat" && chat.message.text).toBe("hello dlrownext");
    expect(chat.type === "chat" && chat.message.senderName).toBe("Agnp.exe");
    a.socket.close();
  });

  it("checks what's inside an uploaded avatar, not just its header", async () => {
    const { writeGlb } = await import("../src/avatar/import/glbToVrm");
    const tracker = writeGlb({ asset: { version: "2.0" }, images: [{ uri: "https://tracker.example/p.png" }] } as never, null);
    const refused = await fetch(`http://${worker.address}:${worker.port}/api/avatars`, { method: "POST", body: tracker });
    expect(refused.status).toBe(400);
    const plain = writeGlb({ asset: { version: "2.0" } } as never, null);
    const accepted = await fetch(`http://${worker.address}:${worker.port}/api/avatars`, { method: "POST", body: plain });
    expect(accepted.status).toBe(201);
    const { url } = (await accepted.json()) as { url: string };
    const download = await fetch(`http://${worker.address}:${worker.port}${url}`);
    expect(download.headers.get("x-content-type-options")).toBe("nosniff");
    expect(download.headers.get("content-security-policy")).toContain("sandbox");
  });
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls until `find` returns something, or fails after two seconds. */
async function until<T>(find: () => T | undefined, timeoutMs = 2000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const found = find();
    if (found !== undefined) return found;
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for a message");
    await sleep(20);
  }
}

/** A second server with an admin key set, for the password limits. */
describe.skipIf(!built)("room server with passwords", () => {
  let worker: Unstable_DevWorker;
  const ADMIN_KEY = "test-admin-key";

  beforeAll(async () => {
    worker = await unstable_dev("worker/index.ts", {
      config: "wrangler.jsonc",
      vars: { SEIZA_ADMIN_KEY: ADMIN_KEY },
      experimental: { disableExperimentalWarning: true },
      logLevel: "none",
    });
  }, 60_000);

  afterAll(async () => {
    await worker?.stop();
  });

  async function open(room: string) {
    const socket = new WebSocket(`ws://${worker.address}:${worker.port}/rooms/${room}`);
    const received: ServerMessage[] = [];
    let closed = false;
    socket.addEventListener("message", (event) => received.push(JSON.parse(String(event.data)) as ServerMessage));
    socket.addEventListener("close", () => (closed = true));
    await new Promise<void>((resolve) => socket.addEventListener("open", () => resolve()));
    const send = (message: ClientMessage) => socket.send(JSON.stringify(message));
    return { socket, received, send, isClosed: () => closed };
  }

  it("closes a connection after too many room password guesses", async () => {
    const room = `pw-${Date.now()}`;
    const admin = await open(room);
    admin.send({ type: "join", displayName: "Admin", avatarUrl: "" });
    await until(() => admin.received.find((m) => m.type === "welcome"));
    admin.send({ type: "authAdmin", key: ADMIN_KEY });
    await until(() => admin.received.find((m) => m.type === "adminAuthResult"));
    admin.send({ type: "adminSetRoomPassword", password: "open-sesame" });
    await sleep(200);

    const guesser = await open(room);
    for (let i = 0; i < 5; i++) guesser.send({ type: "join", displayName: "G", avatarUrl: "", roomPassword: `wrong-${i}` });
    await until(() => (guesser.isClosed() ? true : undefined));
    expect(guesser.received.some((m) => m.type === "welcome")).toBe(false);

    // The right password still works on a fresh connection.
    const friend = await open(room);
    friend.send({ type: "join", displayName: "Friend", avatarUrl: "", roomPassword: "open-sesame" });
    await until(() => friend.received.find((m) => m.type === "welcome"));
    admin.socket.close();
    friend.socket.close();
  });

  it("doesn't let a second join reset the admin key guess limit", async () => {
    const room = `adm-${Date.now()}`;
    const a = await open(room);
    a.send({ type: "join", displayName: "A", avatarUrl: "" });
    await until(() => a.received.find((m) => m.type === "welcome"));
    for (let i = 0; i < 5; i++) a.send({ type: "authAdmin", key: `nope-${i}` });
    a.send({ type: "join", displayName: "A", avatarUrl: "" });
    a.send({ type: "authAdmin", key: ADMIN_KEY });
    await until(() => (a.received.filter((m) => m.type === "adminAuthResult").length >= 6 ? true : undefined));
    const results = a.received.filter((m) => m.type === "adminAuthResult");
    // Even the right key is refused once the limit is used up.
    expect(results.every((m) => m.type === "adminAuthResult" && !m.granted)).toBe(true);
    a.socket.close();
  });
});
