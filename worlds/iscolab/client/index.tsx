// ISCOLab's own code in the world, loaded by Seiza's world extension hook
// (src/worlds/WorldExtension.tsx) only when ISCOLab runs.
//
// The world is the lab model on its meadow (world.json: `environment:
// "model"`, its navmesh baked by scripts/build-lab.mjs from plan.ts). What's
// here is what the model doesn't have:
//
//   Barrier.tsx  while the lab is being fixed: the barrier round it, the
//                scaffolding, and the sign sending people to the kubo
//   Kubo.tsx     the temporary kubo across the meadow, for sessions
//   grounds.ts   what's solid, and the benches' seats
//   plan.ts      where everything is (the bake reads it too)
import { useEffect, useMemo } from "react";
import type { WorldSceneProps } from "../../../src/worlds/WorldExtension";
import { setWorldObstacles } from "../../../src/scene/layout";
import { SeatPad } from "../../../src/scene/SeatPad";
import { Barrier } from "./Barrier";
import { Kubo } from "./Kubo";
import { iscolabObstacles, iscolabSeats } from "./grounds";
import { UNDER_CONSTRUCTION } from "./plan";

export function Scene({ sit, occupiedSeatId }: WorldSceneProps) {
  useEffect(() => {
    setWorldObstacles(iscolabObstacles());
    return () => setWorldObstacles([]);
  }, []);
  const seats = useMemo(iscolabSeats, []);
  return (
    <>
      {UNDER_CONSTRUCTION && <Barrier />}
      <Kubo />
      {sit && seats.map((seat) => <SeatPad key={seat.id} seat={seat} onSit={sit} occupied={occupiedSeatId === seat.id} />)}
    </>
  );
}
