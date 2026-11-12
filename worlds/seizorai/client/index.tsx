// Seizorai's own code in the world, loaded by Seiza's world extension hook
// (src/worlds/WorldExtension.tsx) only when the Seizorai world runs.
//
// Seizorai is Seizora (worlds/seizora), copied, with Ilaw-san: a guide who
// walks the exhibits and answers questions, offline and with guardrails
// (ilaw/, on Seiza's shared guides in src/guides/). Everything else below is Seizora's.
//
// - The plant runs live on the sky's own time and weather (live.ts).
// - The control room is at the front of the classroom: a live display the
//   desks face, and a console to flip breakers, run the battery, change
//   the seal, and set the time and weather for everyone (ControlRoom.tsx).
// - The exhibits stand in the garden and classroom with live info boards,
//   and the turbines turn with their real output (Exhibits.tsx).
// - The perovskite lab bench lets each visitor design a cell (Lab.tsx).
// Clicking any exhibit, board, or part of the display opens an info card.
// Their glow outlines switch with the room's lights: the garden switch for
// everything outside, the classroom's for the control room, lab, and cell,
// and the hall's for the welcome board.
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import type { WorldObject } from "../../../src/multiplayer/types";
import { setWorldObstacles } from "../../../src/scene/layout";
import { showWorldOverlay, type WorldSceneProps } from "../../../src/worlds/WorldExtension";
import { createBrain } from "../../../src/guides/brain";
import { Guide } from "../../../src/guides/Guide";
import { openGuide, registerGuides, setGuideWarp } from "../../../src/guides/store";
import { SeizoraiHud } from "./ilaw/Hud";
import { ILAW, ILAW_AVATAR, ILAW_FACES, ILAW_ROUTE, seizoraiKnowledge } from "./ilaw/knowledge";
import { liveReader } from "./ilaw/liveReader";
import { openInfo } from "./InfoCard";
import { CONSOLE, ControlRoom } from "./ControlRoom";
import { exhibitObstacles, Exhibits } from "./Exhibits";
import { LAB, LabBench } from "./Lab";
import { controlsFrom, live, stepLive } from "./live";

/**
 * Objects from before the exhibits were built into the world: the
 * generated models placed as room objects, and the sign that pointed at
 * the old separate control room page. Their files are no longer built.
 */
function isRetired(object: WorldObject): boolean {
  if (object.modelUrl?.startsWith("/worlds/seizora/models/")) return true;
  return object.kind !== "model" && !!object.text?.includes("/seizora/");
}

export function Scene({ canEdit, connected, objects, removeObject, roomSky, setRoomSky, worldState, setWorldState, lights, warp, getSelfPosition, findPath }: WorldSceneProps) {
  const controls = useMemo(() => controlsFrom(worldState), [worldState]);
  live.controls = controls;
  live.lights = lights;

  useFrame((_, delta) => stepLive(delta));

  useEffect(() => {
    setWorldObstacles([
      ...exhibitObstacles(),
      { x: CONSOLE.x, z: CONSOLE.z, halfX: CONSOLE.width / 2, halfZ: CONSOLE.depth / 2, rotationY: 0 },
      { x: LAB.x, z: LAB.z, halfX: LAB.width / 2, halfZ: LAB.depth / 2, rotationY: 0 },
    ]);
    return () => setWorldObstacles([]);
  }, []);

  // The HUD (info cards and Ilaw-san's chat) holds the world's overlay.
  useEffect(() => {
    registerGuides([{ id: "ilaw", name: ILAW.name, brain: createBrain(seizoraiKnowledge(liveReader), ILAW) }]);
    showWorldOverlay(<SeizoraiHud />);
    return () => {
      openInfo(null);
      openGuide(null);
      registerGuides(null);
      showWorldOverlay(null);
    };
  }, []);
  useEffect(() => {
    setGuideWarp(warp);
    return () => setGuideWarp(null);
  }, [warp]);

  // A room set up before the exhibits were built in still has the old
  // copies as room objects; the first editor to visit clears them.
  useEffect(() => {
    if (!canEdit || !connected) return;
    for (const object of Object.values(objects)) if (isRetired(object)) removeObject(object.id);
  }, [canEdit, connected, objects, removeObject]);

  return (
    <>
      <Exhibits />
      <ControlRoom canEdit={canEdit} connected={connected} roomSky={roomSky} setRoomSky={setRoomSky} controls={controls} setWorldState={setWorldState} />
      <LabBench />
      <Guide id="ilaw" name={ILAW.name} avatarUrl={ILAW_AVATAR} stops={ILAW_ROUTE} faceAt={ILAW_FACES} speed={0.9} getSelfPosition={getSelfPosition} findPath={findPath} />
    </>
  );
}
