// Seinag's own code in the world: SeiOU's campus, its two guides, and its
// lifts (worlds/seiou/client/), with hypothetical solar on the roofs, a
// live dashboard by the drive, and the guides' knowledge of both
// (knowledge.ts). The plant runs on Seizora's model (live.ts, plant.ts).
import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { createBrain } from "../../../src/guides/brain";
import { Guide } from "../../../src/guides/Guide";
import { GuideHud } from "../../../src/guides/GuideHud";
import { openGuide, registerGuides, setGuideWarp } from "../../../src/guides/store";
import { showWorldOverlay, type WorldSceneProps } from "../../../src/worlds/WorldExtension";
import { Lifts } from "../../seiou/client/Lifts";
import { RoomLights } from "../../seiou/client/RoomLights";
import { CHANCY, CHANCY_AVATAR, CHANCY_ROUTE, DEAN_ROB, DEAN_ROB_AVATAR, DEAN_ROB_ROUTE, SPAWN } from "../../seiou/client/campus";
import { ConferenceHalls, conferenceObstacles } from "../../seiou/client/Conference";
import { CardHost, cardTitle, openCard, type CardKey } from "./cards";
import { Futures, KIOSK_AT } from "./Imagined";
import { futuresObstacles, LAYER_KEY, LAYERS } from "./futures";
import { Station, stationObstacles } from "./Station";
import { controlsFrom, live } from "./live";
import { seinagKnowledge } from "./knowledge";
import { stepLive } from "./live";
import { setWorldObstacles } from "../../../src/scene/layout";
import { Panels } from "./Panels";
import { L, useLang } from "../../../src/i18n/lang";

function Hud() {
  useLang();
  return (
    <>
      <GuideHud onOpenCard={(card) => openCard(card as CardKey)} cardTitle={(card) => cardTitle(card)} />
      <CardHost />
    </>
  );
}

export function Scene({ warp, getSelfPosition, findPath, canEdit, connected, roomSky, setRoomSky, worldState, setWorldState, sit, occupiedSeatId }: WorldSceneProps) {
  // The console's switches, shared through the room, drive the plant.
  live.controls = controlsFrom(worldState);
  // The station's, the conference halls' tables (SeiOU's campus), and
  // whichever imagined layers are switched on (futures.ts).
  const layers = LAYERS.map((layer) => worldState[LAYER_KEY[layer]] !== false).join(",");
  useEffect(() => {
    setWorldObstacles([
      ...stationObstacles(),
      ...conferenceObstacles(),
      ...futuresObstacles(worldState),
      { x: KIOSK_AT[0], z: KIOSK_AT[2], halfX: 0.08, halfZ: 0.7, rotationY: 0 },
    ]);
    return () => setWorldObstacles([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers]);
  useEffect(() => {
    const knowledge = seinagKnowledge();
    registerGuides([
      { id: "chancy", name: CHANCY.name, brain: createBrain(knowledge, CHANCY) },
      { id: "rob", name: DEAN_ROB.name, brain: createBrain(knowledge, DEAN_ROB) },
    ]);
    showWorldOverlay(<Hud />);
    return () => {
      openGuide(null);
      openCard(null);
      registerGuides(null);
      showWorldOverlay(null);
    };
  }, []);
  useEffect(() => {
    setGuideWarp(warp);
    return () => setGuideWarp(null);
  }, [warp]);
  useFrame((_, delta) => stepLive(delta));

  return (
    <>
      <Panels />
      <Station canEdit={canEdit} connected={connected} roomSky={roomSky} setRoomSky={setRoomSky} worldState={worldState} setWorldState={setWorldState} />
      <Futures worldState={worldState} setWorldState={setWorldState} canEdit={canEdit} connected={connected} />
      <Lifts warp={warp} worldState={worldState} setWorldState={setWorldState} />
      <RoomLights worldState={worldState} />
      <ConferenceHalls sit={sit} occupiedSeatId={occupiedSeatId} />
      <Guide id="chancy" name={CHANCY.name} avatarUrl={CHANCY_AVATAR} stops={CHANCY_ROUTE} faceAt={SPAWN} pathsOnPatrol getSelfPosition={getSelfPosition} findPath={findPath} />
      <Guide id="rob" name={DEAN_ROB.name} avatarUrl={DEAN_ROB_AVATAR} stops={DEAN_ROB_ROUTE} faceAt={SPAWN} pathsOnPatrol getSelfPosition={getSelfPosition} findPath={findPath} />
    </>
  );
}
