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
//   (Xr.tsx);
// - Tala, the guide (guide.ts), who knows the forum, its Urbanity Walk,
//   and how this world was made (knowledge.ts).
import { useEffect } from "react";
import { createBrain } from "../../../src/guides/brain";
import { Guide } from "../../../src/guides/Guide";
import { GuideHud } from "../../../src/guides/GuideHud";
import { openGuide, registerGuides, setGuideWarp } from "../../../src/guides/store";
import { setWorldObstacles } from "../../../src/scene/layout";
import { showWorldOverlay, type WorldSceneProps } from "../../../src/worlds/WorldExtension";
import { boardObstacles, Boards } from "./Boards";
import { Court, courtObstacles } from "./Court";
import { findPath, TALA, TALA_AVATAR, TALA_FACES, TALA_ROUTE } from "./guide";
import { SeisugboHud } from "./Hud";
import { cardTitle, seisugboKnowledge, TOUR_IDS } from "./knowledge";
import { Lane, laneObstacles } from "./Lane";
import { Portals, portalObstacles } from "./Portals";
import { openPiece } from "./viewer";
import { XrViewer } from "./Xr";

/** A card the guide offers: a board, a portal, a piece, or the walking
 *  tour's photos from the first. */
function openCard(card: string) {
  if (card === "tour") openPiece(TOUR_IDS[0], TOUR_IDS);
  else openPiece(card);
}

function Hud() {
  return (
    <>
      <SeisugboHud />
      <GuideHud onOpenCard={openCard} cardTitle={cardTitle} />
    </>
  );
}

export function Scene({ warp, getSelfPosition }: WorldSceneProps) {
  useEffect(() => {
    registerGuides([{ id: "tala", name: TALA.name, brain: createBrain(seisugboKnowledge(), TALA) }]);
    showWorldOverlay(<Hud />);
    setWorldObstacles([...laneObstacles(), ...courtObstacles(), ...boardObstacles(), ...portalObstacles()]);
    return () => {
      openPiece(null);
      openGuide(null);
      registerGuides(null);
      showWorldOverlay(null);
      setWorldObstacles([]);
    };
  }, []);
  useEffect(() => {
    setGuideWarp(warp);
    return () => setGuideWarp(null);
  }, [warp]);

  return (
    <>
      <Lane />
      <Court />
      <Boards />
      <Portals />
      <XrViewer />
      <Guide id="tala" name={TALA.name} avatarUrl={TALA_AVATAR} stops={TALA_ROUTE} faceAt={TALA_FACES} speed={0.9} pathsOnPatrol getSelfPosition={getSelfPosition} findPath={findPath} />
    </>
  );
}
