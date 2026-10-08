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
  async function client(room: string, name: string, caps?: string[]) {
    const socket = new WebSocket(`ws://${worker.address}:${worker.port}/rooms/${room}`);
    const received: ServerMessage[] = [];
    socket.addEventListener("message", (event) => received.push(JSON.parse(String(event.data)) as ServerMessage));
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () => reject(new Error("socket failed")));
    });
    const send = (message: ClientMessage) => socket.send(JSON.stringify(message));
    send({ type: "join", displayName: name, avatarUrl: "", ...(caps ? { caps } : {}) });
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
