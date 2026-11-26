// Seishore's own code in the world, loaded by Seiza's world extension hook
// (src/worlds/WorldExtension.tsx) only when the Seishore world runs.
//
// A small Japanese seaside town on Seiza's meadow and coast, after
// Yuigahama in Kamakura: the street, its shops and the rooms you walk into
// (Town.tsx), the little coastal line and the bus (Transit.tsx, on the
// timetable in vehicles.ts), its people, who talk in Japanese and English
// (people.ts, knowledge.ts), the shrine and the temple, its sounds
// (sounds.ts), and where everything is (plan.ts).
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { createBrain } from "../../../src/guides/brain";
import { Guide } from "../../../src/guides/Guide";
import { GuideHud } from "../../../src/guides/GuideHud";
import { hush, speak } from "../../../src/guides/speech";
import { openGuide, registerGuides, setGuideWarp } from "../../../src/guides/store";
import { floorHeightAt, setTreeClearings, setWorldCeilings, setWorldFloors, setWorldObstacles, setWorldSoundZones } from "../../../src/scene/layout";
import { SeatPad } from "../../../src/scene/SeatPad";
import { skyState } from "../../../src/sky/skyState";
import { L, useLang } from "../../../src/i18n/lang";
import { showWorldOverlay, type WorldSceneProps } from "../../../src/worlds/WorldExtension";
import { seishoreKnowledge } from "./knowledge";
import { CHEF, CUSTOMERS, PEOPLE } from "./people";
import {
  allSeats,

  DINER_TABLES,
  FAMIRESU,
  findPath,
  frontOf,

  OMIKUJI_AT,
  PASS,
  PRAY_AT,
  roomAt,
  SHRINE,
  seishoreCeilings,
  seishoreClearings,
  seishoreFloors,
  seishoreObstacles,
  seishoreSeats,
  TEMPLE,
  TEMPLE_PRAY,
  Y,
  type Kind,
} from "./plan";
import { coin, doorChime, furin, gull, omikujiShake, startFridges, startKitchen, steamWand, suzu, tonbi, type Loop } from "./sounds";
import { FURIN_AT, Town } from "./Town";
import { Transit } from "./Transit";
import { Sitter, Steam } from "./Extras";
import { showCaption, useCaption } from "./caption";
import { ShopMenu, ShopsScene, useShop } from "./Shops";

function Hud() {
  useLang();
  const c = useCaption();
  return (
    <>
      <GuideHud tagline={L("Seishore · talks in English and Japanese", "Seishore · 日本語と英語で話せます")} />
      <ShopMenu />
      {c && (
        <div role="status" style={{ position: "fixed", left: "50%", bottom: 120, transform: "translateX(-50%)", zIndex: 30, padding: "10px 18px", borderRadius: 14, background: "rgba(16,18,24,0.78)", color: "#fff", textAlign: "center", fontFamily: "system-ui, 'Hiragino Sans', 'Noto Sans CJK JP', sans-serif", maxWidth: "calc(100vw - 32px)", pointerEvents: "none" }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{c.ja}</div>
          <div style={{ fontSize: 14, opacity: 0.8, marginTop: 2 }}>{c.en}</div>
        </div>
      )}
    </>
  );
}

// --- fortunes ----------------------------------------------------------------------------

const FORTUNES: { ja: string; en: string }[] = [
  { ja: "大吉 — 願いごとは叶うでしょう。", en: "Great blessing: what you wish for will come true." },
  { ja: "中吉 — 待てば良い知らせが来ます。", en: "Middle blessing: good news will come, if you wait." },
  { ja: "小吉 — 小さな幸せを大切に。", en: "Small blessing: treasure the little joys." },
  { ja: "吉 — 今日は海を見に行くと良し。", en: "Blessing: today is a good day to go and see the sea." },
  { ja: "末吉 — あとから運が開けます。", en: "Future blessing: your luck will open up later." },
  { ja: "凶 — 結んで、運を神社に預けましょう。", en: "Bad luck: tie it to the rope, and leave the bad luck with the shrine." },
];

// --- the town's sounds and greetings -------------------------------------------------------

/** Each room's greeting as you come in, said by whoever works there. */
const GREETINGS: Partial<Record<Kind, { in: [string, string]; out?: [string, string]; pitch: number }>> = {
  konbini: { in: ["いらっしゃいませー!", "Welcome in!"], out: ["ありがとうございましたー!", "Thank you very much!"], pitch: 1.25 },
  cafe: { in: ["いらっしゃいませ、どうぞ。", "Welcome, come on in."], pitch: 1.15 },
  famiresu: { in: ["いらっしゃいませ!何名様ですか?", "Welcome! How many in your party?"], pitch: 0.9 },
};

/** The town's sounds, from where you are: a kite or the gulls now and
 *  then, the wind chimes when you're near them, the konbini's chime and
 *  greeting as you go in or out, the fridges' hum inside, the kitchen's
 *  sizzle, the café's steam. The surf is Seiza's own. */
function TownSounds({ getSelfPosition }: { getSelfPosition: () => [number, number, number] }) {
  const state = useRef({ kite: 8 + Math.random() * 10, gull: 5 + Math.random() * 10, room: null as Kind | null, steam: 6, fridges: null as Loop | null, kitchen: null as Loop | null });
  useEffect(
    () => () => {
      state.current.fridges?.stop();
      state.current.kitchen?.stop();
      hush();
    },
    []
  );
  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const s = state.current;
    const [x, , z] = getSelfPosition();
    const inTown = x > -24 && x < 70 && z > 30 && z < 140;
    const day = (skyState.night ?? 0) < 0.5;
    // A black kite over the coast; gulls nearer the sea.
    s.kite -= dt;
    if (s.kite <= 0) {
      s.kite = 25 + Math.random() * 35;
      if (inTown && day) tonbi(18 + Math.random() * 25);
    }
    s.gull -= dt;
    if (s.gull <= 0) {
      s.gull = 14 + Math.random() * 22;
      if (inTown && day && x > 18) gull(10 + Math.random() * 25);
    }
    // Wind chimes, more often the windier it is.
    const wind = Math.min(1, (skyState.weatherState?.windSpeed() ?? 4) / 12);
    for (const [fx, , fz] of FURIN_AT) {
      const d = Math.hypot(x - fx, z - fz);
      if (d < 12 && Math.random() < dt * (0.08 + 0.35 * wind)) furin(d);
    }
    // Going in or out of a room: the konbini's chime, a greeting.
    const room = roomAt(x, z);
    if (room !== s.room) {
      const left = s.room;
      s.room = room;
      if (room === "konbini" || left === "konbini") doorChime(0);
      const g = room ? GREETINGS[room] : left ? GREETINGS[left] : undefined;
      if (g && room) speak(g.in[0], "ja-JP", { pitch: g.pitch });
      else if (g?.out && left) speak(g.out[0], "ja-JP", { pitch: g.pitch });
    }
    // Inside: the konbini's fridges, the kitchen behind the pass, the café's steam.
    if (room === "konbini") {
      s.fridges ??= startFridges();
      s.fridges?.set(1);
    } else if (s.fridges) {
      s.fridges.stop();
      s.fridges = null;
    }
    if (room === "famiresu") {
      s.kitchen ??= startKitchen();
      s.kitchen?.set(1);
    } else if (s.kitchen) {
      s.kitchen.stop();
      s.kitchen = null;
    }
    s.steam -= dt;
    if (room === "cafe" && s.steam <= 0) {
      s.steam = 18 + Math.random() * 20;
      steamWand(2);
    }
  });
  return null;
}

// --- the scene -------------------------------------------------------------------------------

/** How many of something to have mounted by now: one more every `everyMs`
 *  after `startMs`. Spreads building the townspeople (each an avatar and
 *  its animations) over a few seconds instead of all in one frame, so the
 *  arrival keeps its pace while the world loads behind it. */
function useStagger(total: number, everyMs: number, startMs = 0) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let i = 0;
    let timer = 0;
    const next = () => {
      i++;
      setN(i);
      if (i < total) timer = window.setTimeout(next, everyMs);
    };
    timer = window.setTimeout(next, startMs);
    return () => window.clearTimeout(timer);
  }, [total, everyMs, startMs]);
  return n;
}

export function Scene({ warp, getSelfPosition, sit, occupiedSeatId, playGesture, faceToward }: WorldSceneProps) {
  useLang();
  // The ground the railway needs, before anything is drawn on it.
  const [floors] = useState(() => {
    const ground = seishoreFloors(floorHeightAt);
    setWorldFloors(ground);
    return ground;
  });
  const people = useMemo(() => [...PEOPLE, CHEF], []);
  useEffect(() => {
    registerGuides(people.map((p) => ({ id: p.id, name: p.name, brain: createBrain(seishoreKnowledge(), p.persona) })));
    showWorldOverlay(<Hud />);
    setWorldCeilings(seishoreCeilings());
    // Voices from inside a shop are muffled outside it, and the other way.
    setWorldSoundZones(roomAt);
    // The town's collision now; the bus and train add theirs when they come (Transit).
    setWorldObstacles(seishoreObstacles());
    // No trees on the road, the railway, or the temple's grounds.
    setTreeClearings(seishoreClearings());
    return () => {
      setWorldObstacles([]);
      setTreeClearings([]);
      openGuide(null);
      registerGuides(null);
      showWorldOverlay(null);
      setWorldCeilings([]);
      setWorldSoundZones(null);
      setWorldFloors([]);
    };
  }, [people]);
  useEffect(() => {
    setGuideWarp(warp);
    return () => setGuideWarp(null);
  }, [warp]);
  const fixed = useMemo(seishoreObstacles, []);
  const seats = useMemo(seishoreSeats, []);
  const customers = useMemo(() => allSeats().filter((s) => CUSTOMERS[s.id]), []);
  const shownPeople = useStagger(people.length, 220, 300);
  const shownCustomers = useStagger(customers.length, 220, 300 + people.length * 220);
  const transitShown = useStagger(1, 1, 300 + (people.length + customers.length) * 220) > 0;
  const near = (x: number, z: number) => () => {
    const [sx, , sz] = getSelfPosition();
    return Math.hypot(sx - x, sz - z);
  };

  // A vending machine: its menu, then the coin, the drop, the can in your hand (Shops.tsx).
  const shop = useShop();
  const buy = () => shop("vending");
  // Praying: go to the spot before it, face it, and do it properly.
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (seconds: number, fn: () => void) => timers.current.push(window.setTimeout(fn, seconds * 1000));
  const goPray = (at: [number, number], face: [number, number]) => {
    const [x, , z] = getSelfPosition();
    if (Math.hypot(x - at[0], z - at[1]) > 2.5) warp([at[0], floorHeightAt(at[0], at[1]), at[1]]);
    faceToward(face[0], face[1]);
  };
  const atShrine = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    goPray(PRAY_AT, [SHRINE.x, SHRINE.hokoraZ]);
    coin();
    showCaption("お賽銭", "A coin into the offering box");
    later(0.7, () => {
      suzu();
      showCaption("鈴を鳴らす", "Ring the bell");
    });
    later(1.8, () => {
      playGesture("bow");
      showCaption("二礼 — 一礼目", "Two bows: the first");
    });
    later(3.4, () => {
      playGesture("bow");
      showCaption("二礼 — 二礼目", "Two bows: the second");
    });
    later(5.0, () => {
      playGesture("clap");
      showCaption("二拍手", "Two claps");
    });
    later(6.8, () => {
      playGesture("gassho");
      showCaption("お祈り", "Make your wish", 3.4);
    });
    later(10.2, () => {
      playGesture("bow");
      showCaption("一礼", "One last bow");
    });
  };
  const atTemple = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    goPray(TEMPLE_PRAY, [TEMPLE.hallX, TEMPLE.z]);
    coin();
    showCaption("お賽銭", "A coin into the offering box");
    later(1.0, () => {
      playGesture("gassho");
      showCaption("合掌 — お寺では手を合わせるだけ、拍手はしません", "Hands together: at a temple you don't clap", 4);
    });
    later(5.2, () => {
      playGesture("bow");
      showCaption("一礼", "A bow");
    });
  };
  const drawFortune = () => {
    const [x, , z] = getSelfPosition();
    omikujiShake(Math.hypot(x - OMIKUJI_AT[0], z - OMIKUJI_AT[1]));
    const f = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
    later(1.1, () => showCaption(f.ja, f.en, 7));
  };

  // Steam: over the café's cups and its machine, the kitchen's pots, the temple's incense.
  const kitchenSteam = useMemo<[number, number, number][]>(() => {
    const kz = frontOf(FAMIRESU).back + 0.55;
    return [...[0, 1, 2].map((i): [number, number, number] => [PASS.x0 + 1.4 + i * 2.0, Y + 1.2, kz]), ...DINER_TABLES.map(([x, z]): [number, number, number] => [x + 0.28, Y + 0.85, z - 0.12])];
  }, []);
  const incense = useMemo<[number, number, number][]>(() => [[TEMPLE.burnerX, floorHeightAt(TEMPLE.burnerX, TEMPLE.z) + 1.0, TEMPLE.z]], []);

  return (
    <>
      <Town onVending={buy} onShrine={atShrine} onTemple={atTemple} onOmikuji={drawFortune} />
      {transitShown && <Transit sit={sit} fixed={fixed} floors={floors} />}
      <TownSounds getSelfPosition={getSelfPosition} />
      <ShopsScene />
      <Steam at={kitchenSteam} rise={0.7} size={0.14} opacity={0.3} />
      <Steam at={incense} rise={1.6} size={0.22} color="#d9dcd6" opacity={0.28} rate={0.6} />
      {sit && seats.map((seat) => <SeatPad key={seat.id} seat={seat} onSit={sit} occupied={occupiedSeatId === seat.id} />)}
      {customers.slice(0, shownCustomers).map((seat) => (
        <Sitter key={seat.id} avatar={CUSTOMERS[seat.id].avatar} position={seat.position} rotationY={seat.rotationY} chatter={CUSTOMERS[seat.id].chatter} near={near(seat.position[0], seat.position[2])} />
      ))}
      {people.slice(0, shownPeople).map((p, i) => (
        <Guide
          key={p.id}
          id={p.id}
          name={p.name}
          role={p.role}
          avatarUrl={p.avatar}
          stops={p.stops}
          speed={p.speed}
          faceAt={p.faceAt}
          chatter={p.chatter}
          speak
          pitch={[1.25, 1.15, 0.8, 1.0, 1.1, 1.05, 0.9][i] ?? 1}
          getSelfPosition={getSelfPosition}
          findPath={findPath}
        />
      ))}
    </>
  );
}
