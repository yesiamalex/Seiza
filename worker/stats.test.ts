import { describe, expect, it } from "vitest";
import type { PlayerState } from "../src/multiplayer/types";
import { RoomStats } from "./stats";

/** Just enough of a Durable Object's storage. */
function storage() {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async (k: string) => map.get(k),
    put: async (k: string, v: unknown) => void map.set(k, structuredClone(v)),
    delete: async (keys: string[]) => keys.forEach((k) => map.delete(k)),
    list: async ({ prefix, end }: { prefix: string; end?: string }) =>
      new Map([...map].filter(([k]) => k.startsWith(prefix) && (end === undefined || k < end)).sort()),
  } as unknown as DurableObjectStorage & { map: Map<string, unknown> };
}
const player = (id: string, x: number, z: number, posture: string | null = null) => ({ id, position: [x, 0, z], posture }) as unknown as PlayerState;

describe("a room's research counts", () => {
  it("counts each visitor once a day, and what they did, by people and by times", () => {
    const stats = new RoomStats(storage());
    stats.join("a", "session-aaaaaaaaaaaa", 1);
    stats.join("b", "session-bbbbbbbbbbbb", 2);
    stats.did("a", "chat");
    stats.did("a", "chat");
    stats.did("b", "chat");
    stats.setMedia("a", { mic: "on" });
    stats.setMedia("a", { mic: "on" });
    stats.setMedia("a", {});
    stats.setMedia("a", { mic: "on" });
    return stats.read().then(([today]) => {
      expect(today.joins).toBe(2);
      expect(today.people).toBe(2);
      expect(today.peak).toBe(2);
      expect(today.did.chat).toEqual([2, 3]);
      // A mic turned on twice is two times, by one person.
      expect(today.did.mic).toEqual([1, 2]);
    });
  });

  it("knows where people spent their time, and whether they were together or sitting", async () => {
    const stats = new RoomStats(storage());
    stats.join("a", undefined, 1);
    stats.join("b", undefined, 2);
    const t0 = 1_000_000;
    stats.sample([player("a", 1, 1, "sit"), player("b", 2, 1)], t0);
    stats.sample([player("a", 1, 1, "sit"), player("b", 2, 1)], t0 + 20_000);
    const [today] = await stats.read();
    const zone = today.zones["0,0"];
    expect(zone[0]).toBeGreaterThan(0);
    // Sitting, and with someone within 3 m, all the time it was there.
    expect(zone[2]).toBe(zone[0]);
    expect(zone[3]).toBe(zone[0]);
    expect(today.together).toBe(today.seconds);
  });

  it("keeps today's counts across a restart, without anyone's id once a day is done", async () => {
    const store = storage();
    const first = new RoomStats(store);
    first.join("a", "visit-123456789", 1);
    first.did("a", "board");
    await first.save();
    const again = new RoomStats(store);
    await again.load();
    const [today] = await again.read();
    expect(today.did.board).toEqual([1, 1]);
    expect(JSON.stringify(today)).not.toContain("visit-12345");
  });
});
