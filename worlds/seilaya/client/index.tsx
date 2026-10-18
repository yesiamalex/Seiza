// Seilaya's own code in the world, loaded by Seiza's world extension hook
// (src/worlds/WorldExtension.tsx) only when the Seilaya world runs.
//
// - Safety tools for every visitor (safety.ts, Hud.tsx, Social.tsx):
//   personal space, together gestures that need the other person's yes,
//   blocking, pronoun tags, and Kanlungan, a refuge to step out to.
// - Learning stations in the hall, classroom, and garden (Exhibits.tsx,
//   info.ts): the Safe Spaces Act, gender and development, SOGIESC, safety
//   by design, women in Philippine science, gender data, and two
//   interactive stations on harassment and bystander action.
// - A code of conduct to agree to on a first visit.
//
// The handshake, high five, and hug are Seiza's own (every world has them,
// with consent enforced by the room server); Seilaya adds its rules on top
// (safety.ts) and shows requests in a headset (Xr.tsx).
import { useEffect, useRef } from "react";
import { setWorldObstacles } from "../../../src/scene/layout";
import { showWorldOverlay, type WorldSceneProps } from "../../../src/worlds/WorldExtension";
import { exhibitObstacles, Exhibits } from "./Exhibits";
import { SeilayaHud } from "./Hud";
import { applyFilter, emit, isCardKey, onPlayersChanged, openCard, ROOM_KEYS, setApi, sharePronouns, startListening, stopListening } from "./safety";
import { PronounTags, SafetyLoop } from "./Social";
import { XrSafety } from "./Xr";

export function Scene(props: WorldSceneProps) {
  const { selfId, players, getSelfPosition, playGesture, warp, faceToward, sendWorldMessage, setPlayerFilter, canEdit, worldState, setWorldState } = props;
  setApi({ selfId, players, getSelfPosition, playGesture, warp, faceToward, sendWorldMessage, setPlayerFilter, canEdit, worldState, setWorldState });
  const playersRef = useRef(players);
  playersRef.current = players;

  useEffect(() => {
    startListening();
    showWorldOverlay(<SeilayaHud />);
    setWorldObstacles(exhibitObstacles());
    return () => {
      stopListening();
      showWorldOverlay(null);
      setWorldObstacles([]);
    };
  }, []);

  // Newcomers get this visitor's pronouns; people who left are forgotten.
  const roster = Object.keys(players).sort().join();
  useEffect(() => {
    onPlayersChanged();
  }, [roster, selfId]);
  // A facilitator's room settings changed: redraw, and open a card they
  // showed to everyone. Only a change opens it, not the value already set
  // when this visitor arrived.
  const shown = typeof worldState[ROOM_KEYS.show] === "string" ? (worldState[ROOM_KEYS.show] as string) : "";
  const lastShown = useRef<string | null>(null);
  useEffect(() => {
    if (lastShown.current !== null && shown && shown !== lastShown.current) {
      const card = shown.split(":")[0];
      if (isCardKey(card)) openCard(card);
    }
    lastShown.current = shown;
  }, [shown]);
  useEffect(() => {
    applyFilter();
    emit();
  }, [worldState, canEdit]);

  // On joining (or rejoining), share pronouns with everyone already here,
  // and step aside if someone is standing on the spawn point. Everyone
  // arrives on the same spot, and with personal space on, people stacked
  // there would vanish for each other.
  useEffect(() => {
    if (!selfId) return;
    sharePronouns();
    const [x, y, z] = getSelfPosition();
    const crowded = Object.values(playersRef.current).some((p) => p.id !== selfId && Math.hypot(p.position[0] - x, p.position[2] - z) < 1.2);
    if (!crowded) return;
    // Along z: the spawn is outside the tent's door, facing the fire along
    // x, with the tent behind it and the fire ahead.
    const side = Math.random() < 0.5 ? -1 : 1;
    warp([x + (Math.random() - 0.5) * 0.6, y, z + side * (1.4 + Math.random() * 0.6)]);
  }, [selfId, getSelfPosition, warp]);

  return (
    <>
      <Exhibits />
      <SafetyLoop selfId={selfId} players={players} getSelfPosition={getSelfPosition} />
      <PronounTags players={players} selfId={selfId} />
      <XrSafety />
    </>
  );
}
