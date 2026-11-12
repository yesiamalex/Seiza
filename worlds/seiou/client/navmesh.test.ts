import { beforeAll, describe, expect, it } from "vitest";
import { NavGround } from "../../../src/nav/navGround";
import { PLACES } from "./campus";
import type { FloorPlan } from "./Lifts";

// The app's types leave Node out, so the file reader is typed by hand.
let readFileSync: (path: string, encoding?: "utf8") => Uint8Array & string;
const file = (name: string) => decodeURIComponent(new URL(`../world/models/${name}`, import.meta.url).pathname);
let ground: NavGround;

beforeAll(async () => {
  ({ readFileSync } = await import(/* @vite-ignore */ `node:${"fs"}`));
  const { init, importNavMesh, NavMeshQuery } = await import("recast-navigation");
  await init();
  const { navMesh } = importNavMesh(new Uint8Array(readFileSync(file("campus.navmesh"))));
  ground = new NavGround(new NavMeshQuery(navMesh) as unknown as ConstructorParameters<typeof NavGround>[0]);
});

describe("SeiOU's navmesh", () => {
  // Each warp lands on the floor it names, not on a level above or below
  // it (once, the Academic Residences' landed under its ground floor).
  it.each(Object.values(PLACES).map((p) => [p.id, p.at] as const))("%s lands on its own floor", (_, at) => {
    expect(Math.abs(ground.place(...at) - at[1])).toBeLessThan(0.5);
  });

  it("a lift lands on the floor it was sent to, from any other floor", () => {
    const plan = JSON.parse(readFileSync(file("floors.json"), "utf8")) as FloorPlan;
    for (const { floors } of Object.values(plan))
      for (const from of floors)
        for (const to of floors) {
          ground.place(...from.at);
          expect(Math.abs(ground.place(...to.at) - to.at[1])).toBeLessThan(0.3);
        }
  });

  it("the Academic Residences has its ground floor, second floor, and third floor", () => {
    const plan = JSON.parse(readFileSync(file("floors.json"), "utf8")) as FloorPlan;
    const heights = plan.ar.floors.map((f) => Math.round(f.at[1]));
    expect(heights).toEqual(expect.arrayContaining([1, 7, 10]));
  });
});
