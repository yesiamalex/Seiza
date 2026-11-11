// Seisugbo's own code in the world, loaded by Seiza's world extension hook
// (src/worlds/WorldExtension.tsx) only when the Seisugbo world runs.
//
// The Meiji × UP arts-based research exhibition of 2026, on Seiza's meadow:
// - the lane (Lane.tsx): a model Cebu neighbourhood, with the walking
//   tour's photos on placards along it;
// - the covered court (Court.tsx): each group's art on its own sampayan,
//   and the collage posters on a cork board;
// - boards (Boards.tsx): a welcome by the tent, how the work was made in
//   the hall, and the talkback prompts and the dance in the classroom;
// - a close-up view of any piece, on a screen (Hud.tsx) or in a headset
//   (Xr.tsx).
import { useEffect } from "react";
import { setWorldObstacles } from "../../../src/scene/layout";
import { showWorldOverlay, type WorldSceneProps } from "../../../src/worlds/WorldExtension";
import { boardObstacles, Boards } from "./Boards";
import { Court, courtObstacles } from "./Court";
import { SeisugboHud } from "./Hud";
import { Lane, laneObstacles } from "./Lane";
import { openPiece } from "./viewer";
import { XrViewer } from "./Xr";

export function Scene(_props: WorldSceneProps) {
  useEffect(() => {
    showWorldOverlay(<SeisugboHud />);
    setWorldObstacles([...laneObstacles(), ...courtObstacles(), ...boardObstacles()]);
    return () => {
      openPiece(null);
      showWorldOverlay(null);
      setWorldObstacles([]);
    };
  }, []);

  return (
    <>
      <Lane />
      <Court />
      <Boards />
      <XrViewer />
    </>
  );
}
