// SeiOU's own code in the world, loaded by Seiza's world extension hook
// (src/worlds/WorldExtension.tsx) only when the SeiOU world runs.
//
// The world itself is the campus model (world.json: `environment: "model"`,
// with its navmesh for walking: see scripts/build-campus.mjs). What's here
// is the two guides, Chancy Joan and Dean Rob, on Seiza's shared guides
// (src/guides/), who wait where visitors arrive, answer questions from
// campus.ts, and walk visitors to any building; and the lift kiosks on
// every floor (Lifts.tsx).
import { useEffect } from "react";
import { createBrain } from "../../../src/guides/brain";
import { Guide } from "../../../src/guides/Guide";
import { GuideHud } from "../../../src/guides/GuideHud";
import { openGuide, registerGuides, setGuideWarp } from "../../../src/guides/store";
import { showWorldOverlay, type WorldSceneProps } from "../../../src/worlds/WorldExtension";
import { Lifts } from "./Lifts";
import { CHANCY, CHANCY_AVATAR, CHANCY_ROUTE, DEAN_ROB, DEAN_ROB_AVATAR, DEAN_ROB_ROUTE, seiouKnowledge, SPAWN } from "./campus";

export function Scene({ warp, getSelfPosition, findPath }: WorldSceneProps) {
  useEffect(() => {
    const knowledge = seiouKnowledge();
    registerGuides([
      { id: "chancy", name: CHANCY.name, brain: createBrain(knowledge, CHANCY) },
      { id: "rob", name: DEAN_ROB.name, brain: createBrain(knowledge, DEAN_ROB) },
    ]);
    showWorldOverlay(<GuideHud tagline="answers only from this world, offline" />);
    return () => {
      openGuide(null);
      registerGuides(null);
      showWorldOverlay(null);
    };
  }, []);
  useEffect(() => {
    setGuideWarp(warp);
    return () => setGuideWarp(null);
  }, [warp]);

  return (
    <>
      <Lifts warp={warp} />
      <Guide id="chancy" name={CHANCY.name} avatarUrl={CHANCY_AVATAR} stops={CHANCY_ROUTE} faceAt={SPAWN} pathsOnPatrol getSelfPosition={getSelfPosition} findPath={findPath} />
      <Guide id="rob" name={DEAN_ROB.name} avatarUrl={DEAN_ROB_AVATAR} stops={DEAN_ROB_ROUTE} faceAt={SPAWN} pathsOnPatrol getSelfPosition={getSelfPosition} findPath={findPath} />
    </>
  );
}
