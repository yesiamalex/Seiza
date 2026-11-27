// Nishi-machi, drawn (nishi.ts has where everything is): the ring road and
// Nishi-dōri, the path over the meadow, the six shops inside and out, the
// lantern alley, the park, the bus stops, the bikes in their rack; and
// what you can do there. Try an instrument in the music shop (and, with
// band mode on, take it); order at SeaBurger's counter and eat upstairs;
// pull a book off a shelf; a coffee at the kissaten; listen to the rakugo
// teller's kobanashi; take a practice sword from the dojo's rack (fantasy
// mode); ride one of the bikes (ride mode), which goes back to its rack by
// itself a while after you're done with it.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Chatter } from "../../../src/guides/Guide";
import type { WorldStateValue } from "../../../src/multiplayer/types";
import { floorHeightAt } from "../../../src/scene/layout";
import { buildKeyboard, buildKit, buildViolin, buildWorn } from "../../../src/addons/band/BandLayer";
import { holdNote, KIT, playNote, type Instrument } from "../../../src/addons/band/instruments";
import { setInstrument } from "../../../src/addons/band/band";
import { setWeapon } from "../../../src/addons/fantasy/combat";
import { ride, setVehicle } from "../../../src/addons/exer/ride";
import { buildPet } from "../../../src/addons/pet/pets";
import { Builder, canvasTexture, FONT, noRaycast, ON_TOP, paint } from "../../seisugbo/client/kit";
import { RoutedBuilder, surfaceMaterial } from "./surfaces";
import { DEFAULT_AVATAR_SPEC, encodeAvatarSpec, type AvatarSpec } from "../../../src/avatar/designer/avatarSpec";
import { showCaption } from "./caption";
import { Spot, useShop } from "./Shops";
import { Sitter } from "./Extras";
import { G, LANE } from "./plan";
import {
  BIKE_RACK,
  BOOK_COUNTER,
  BOOK_SHELVES,
  BURGER,
  DOJO,
  KISSA,
  LOOP_STOPS,
  MEADOW_PATH,
  MUSIC_COUNTER,
  MUSIC_KEYS,
  MUSIC_KIT,
  MUSIC_WALL,
  NISHI_SHOPS,
  NISHI_STREET,
  PARK,
  PARK_BENCHES,
  RING,
  ROOM_H,
  shopById,
  shopFront,
  STALLS,
  YOKOCHO,
  YOSE,
  type NishiShop,
} from "./nishi";

const WOOD = "#8a6545";
const WOOD_DARK = "#3a2c22";

// --- the people who follow someone: a dog on its lead ----------------------------------------

/** Where each walker with a dog is now (index.tsx's Guide reports it, onPlace). */
export const walkers = new Map<string, { x: number; y: number; z: number; walking: boolean }>();

/** A shiba on its lead, a little behind and beside its owner, trotting when they walk. */
function Dog({ owner }: { owner: string }) {
  const pet = useMemo(() => buildPet("dog", "#c8823a"), []);
  const group = useRef<THREE.Group>(null);
  const place = useRef({ x: 0, z: 0, yaw: 0, phase: 0, ready: false });
  useEffect(() => () => (pet.mesh.material as THREE.Material).dispose(), [pet]);
  useFrame((_, delta) => {
    const w = walkers.get(owner);
    const g = group.current;
    if (!w || !g) return;
    const p = place.current;
    if (!p.ready) Object.assign(p, { x: w.x + 0.8, z: w.z, ready: true });
    // To a spot 0.9 m from its owner, the lead's length, never on top of them.
    const dx = w.x - p.x;
    const dz = w.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const want = Math.max(0, d - 0.9);
    const step = Math.min(want, (w.walking ? 1.6 : 0.8) * delta * Math.min(3, 1 + want));
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
    const moving = step > 0.002;
    if (moving) p.yaw = Math.atan2(dx, dz);
    p.phase += delta * (moving ? 12 : 0);
    g.position.set(p.x, floorHeightAt(p.x, p.z), p.z);
    g.rotation.y = p.yaw;
    // Its legs, by turns; its tail, always.
    pet.bones.slice(2, 6).forEach((b, i) => (b.rotation.x = moving ? 0.5 * Math.sin(p.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) : 0));
    if (pet.bones[6]) pet.bones[6].rotation.y = 0.5 * Math.sin(performance.now() / 120);
  });
  return (
    <group ref={group}>
      <primitive object={pet.mesh} />
    </group>
  );
}

// --- what's on the shelves, and what the teller tells ----------------------------------------

const BOOKS: { ja: string; en: string; line: string }[] = [
  { ja: "海辺の時刻表", en: "The Seaside Timetable", line: "A novel about a station master who writes a letter for every last train." },
  { ja: "星を数える猫", en: "The Cat Who Counted Stars", line: "A picture book. Someone has written \"for Yui\" inside the cover." },
  { ja: "百円の夏", en: "A Hundred-Yen Summer", line: "Essays on the summer holidays of the 1980s. 100 yen, the sticker says." },
  { ja: "坂の上の喫茶店", en: "The Café at the Top of the Hill", line: "A cookbook of kissaten recipes: napolitan, pudding, cream soda." },
  { ja: "はじめての落語", en: "Your First Rakugo", line: "How a teller with only a fan and a cloth plays a whole street of people." },
  { ja: "潮の満ち引き", en: "Tides", line: "A field guide to the beach at low tide, well thumbed." },
  { ja: "湘南ひとり旅", en: "Shonan on Your Own", line: "A guidebook, ten years old. Half the shops in it are still here." },
];

/** Kobanashi: the little jokes a rakugo teller warms the room up with. */
const KOBANASHI: Chatter[] = [
  { ja: "隣の空き地に囲いができたってね。へぇ〜。", en: "\"They've put a fence (hei) round the lot next door.\" \"Hey!\"" },
  { ja: "布団が吹っ飛んだ!", en: "The futon has flown off! (futon ga futtonda)" },
  { ja: "アルミ缶の上にあるミカン。", en: "A mikan on top of an aluminium can. (arumi-kan no ue ni aru mikan)" },
  { ja: "まんじゅうが怖い……ああ、お茶も怖い。", en: "I'm terrified of manjū… oh, and now a cup of tea, please." },
  { ja: "「今、何刻だい?」「九つで」……一文ごまかし。", en: "\"What hour is it?\" \"Nine.\" And so the soba was a coin short. (Toki-soba)" },
  { ja: "猫が寝転んだ。", en: "The cat lay down. (neko ga nekoronda)" },
  { ja: "えー、毎度ばかばかしいお笑いを一席。", en: "Well, here's another silly little story for you." },
];

// --- building it all --------------------------------------------------------------------------

function signTexture(ja: string, en: string, bg: string, fg = "#ffffff") {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText(ja, w / 2, 50, w - 30);
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(en, w / 2, 100, w - 30);
  });
}

/** Rows of book spines, for the shelves' faces. */
function spines() {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = "#5a3a22";
    ctx.fillRect(0, 0, w, h);
    const colors = ["#8a2f2a", "#2f5fa8", "#e8c37a", "#3f6e4a", "#f2efe6", "#6b3b8a", "#c8572f", "#1d2433", "#9da3a8"];
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let row = 0; row < 4; row++) {
      let x = 4;
      while (x < w - 4) {
        const bw = 8 + rnd() * 14;
        const bh = 44 + rnd() * 16;
        ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
        ctx.fillRect(x, row * 64 + 62 - bh, bw - 1.5, bh);
        x += bw;
      }
      ctx.fillStyle = "#3a2618";
      ctx.fillRect(0, row * 64 + 60, w, 4);
    }
  });
}

function buildQuarter() {
  const b = new Builder();
  const roofs = new Builder();
  const glass = new Builder();
  const lit = new Builder();
  const marks = new Builder();
  const grain = new Builder();
  const plaster = new Builder();
  const grainIn = new Builder();
  const tileIn = new Builder();
  const plankIn = new Builder();
  const inside = new RoutedBuilder(
    new Map<string, Builder>([
      [WOOD, grainIn],
      [WOOD_DARK, grainIn],
      ["#e8e9e6", tileIn],
      ["#9a7452", plankIn],
      ["#b89a6a", plankIn],
    ])
  );
  const out = new RoutedBuilder(new Map<string, Builder>([[WOOD, grain], [WOOD_DARK, grain], ...NISHI_SHOPS.map((s): [string, Builder] => [s.wall.toLowerCase(), plaster])]));

  // The ring road: asphalt, a dashed middle line, the kerbs; the crossing over Nishi-dōri.
  const roadY = G + 0.012;
  const { east, west, north, south, half } = RING;
  const roads: [number, number, number, number][] = [
    [east - half, east + half, south - half, north + half],
    [west - half, west + half, south - half, north + half],
    [west - half, east + half, north - half, north + half],
    [west - half, east + half, south - half, south + half],
  ];
  for (const [x0, x1, z0, z1] of roads) marks.box([x1 - x0, 0.02, z1 - z0], [(x0 + x1) / 2, roadY, (z0 + z1) / 2], "#3a3d42");
  for (let z = south + half + 1; z < north - half - 1; z += 3) for (const x of [east, west]) marks.box([0.15, 0.022, 1.6], [x, roadY + 0.002, z], "#f2f0eb");
  for (let x = west + half + 1; x < east - half - 1; x += 3) for (const z of [north, south]) marks.box([1.6, 0.022, 0.15], [x, roadY + 0.002, z], "#f2f0eb");
  for (let i = 0; i < 6; i++) marks.box([0.5, 0.024, LANE.z1 - LANE.z0 - 0.3], [east - half + 0.6 + i * 1.0, roadY + 0.004, (LANE.z0 + LANE.z1) / 2], "#f2f0eb");
  // Nishi-dōri: red-brown paving, its kerbs; and the stepping stones over the meadow.
  marks.box([NISHI_STREET.x1 - NISHI_STREET.x0, 0.02, NISHI_STREET.z1 - NISHI_STREET.z0], [(NISHI_STREET.x0 + NISHI_STREET.x1) / 2, roadY, (NISHI_STREET.z0 + NISHI_STREET.z1) / 2], "#9a6a52");
  for (let x = NISHI_STREET.x0 + 1; x < NISHI_STREET.x1; x += 1.2) marks.box([0.03, 0.022, NISHI_STREET.z1 - NISHI_STREET.z0], [x, roadY + 0.002, (NISHI_STREET.z0 + NISHI_STREET.z1) / 2], "#7a5040");
  for (let x = MEADOW_PATH.x0 + 0.5; x < MEADOW_PATH.x1; x += 0.95) {
    const z = (MEADOW_PATH.z0 + MEADOW_PATH.z1) / 2 + Math.sin(x * 1.3) * 0.35;
    b.cylinder(0.32, 0.36, 0.06, [x, floorHeightAt(x, z) + 0.02, z], "#a8a49b", undefined, 9);
  }

  // The shops.
  for (const s of NISHI_SHOPS) shop(s, out, roofs, glass, lit, inside);
  musicShop(inside, lit);
  burgerShop(inside, lit, b);
  bookShop(inside, lit);
  kissaten(inside, lit);
  yoseCafe(inside, lit);
  dojoHall(inside, lit);

  // The yokochō: little stalls with their noren and lanterns, wires of lanterns over the alley.
  for (const st of STALLS) {
    const z0 = YOKOCHO.z1;
    const z1 = z0 + YOKOCHO.stallDepth;
    const xc = (st.x0 + st.x1) / 2;
    out.box([st.x1 - st.x0, 2.6, z1 - z0], [xc, G + 1.3, (z0 + z1) / 2], WOOD_DARK);
    roofs.box([st.x1 - st.x0 + 0.3, 0.08, z1 - z0 + 0.8], [xc, G + 2.65, (z0 + z1) / 2 - 0.3], "#3f4652", [0.12, 0, 0]);
    b.box([st.x1 - st.x0 - 0.6, 1.0, 0.5], [xc, G + 0.5, z0 - 0.25], WOOD);
    for (let k = 0; k < 4; k++) b.box([(st.x1 - st.x0 - 0.8) / 4 - 0.04, 0.7, 0.02], [st.x0 + 0.4 + ((k + 0.5) * (st.x1 - st.x0 - 0.8)) / 4, G + 2.1, z0 - 0.02], st.color);
    lit.box([st.x1 - st.x0 - 0.8, 0.06, 0.06], [xc, G + 2.35, z0 - 0.06], "#ffd79a");
  }
  for (let x = YOKOCHO.x0 + 1; x < YOKOCHO.x1; x += 1.8) {
    const z = (YOKOCHO.z0 + YOKOCHO.z1) / 2;
    lit.cylinder(0.16, 0.16, 0.42, [x, G + 2.9, z], "#ff5a3a", undefined, 10);
    b.cylinder(0.17, 0.17, 0.04, [x, G + 3.13, z], "#1d1d1d", undefined, 10);
  }
  b.bar([YOKOCHO.x0, G + 3.15, (YOKOCHO.z0 + YOKOCHO.z1) / 2], [YOKOCHO.x1, G + 3.15, (YOKOCHO.z0 + YOKOCHO.z1) / 2], 0.01, "#222");
  lit.plane(3.4, 0.7, [YOKOCHO.x0 + 2.0, G + 3.6, YOKOCHO.z0 - 0.2], "#ffcf5a", [0, 0, 0]);

  // Nishi park: grass, a gravel path, trees, lamps, its benches.
  marks.box([PARK.x1 - PARK.x0, 0.02, PARK.z1 - PARK.z0], [(PARK.x0 + PARK.x1) / 2, G + 0.01, (PARK.z0 + PARK.z1) / 2], "#6f8f4a");
  marks.box([PARK.x1 - PARK.x0 - 1, 0.024, 1.6], [(PARK.x0 + PARK.x1) / 2, G + 0.012, 41.5], "#c9bfa6");
  for (let x = PARK.x0 + 2; x < PARK.x1; x += 5.5) {
    b.cylinder(0.12, 0.16, 2.0, [x, G + 1.0, 39.9], "#5a4030", undefined, 8);
    b.raw(new THREE.SphereGeometry(1.1, 10, 8).scale(1, 0.85, 1).translate(x, G + 2.6, 39.9), "#4a7a3e");
  }
  for (const [x, z] of PARK_BENCHES) {
    b.box([1.7, 0.06, 0.42], [x, G + 0.45, z], WOOD);
    b.box([1.7, 0.38, 0.06], [x, G + 0.68, z + 0.2], WOOD);
    for (const dx of [-0.7, 0.7]) b.box([0.06, 0.44, 0.38], [x + dx, G + 0.22, z], "#4d5054");
  }
  for (const x of [PARK.x0 + 4.5, PARK.x1 - 4.5]) {
    b.cylinder(0.05, 0.06, 3.2, [x, G + 1.6, 43.2], "#3a3d42", undefined, 8);
    lit.raw(new THREE.SphereGeometry(0.18, 10, 8).translate(x, G + 3.3, 43.2), "#fff3d6");
  }

  // The bus stops: a pole and its round sign, a bench by it.
  for (const st of LOOP_STOPS) {
    b.cylinder(0.04, 0.04, 2.4, [st.pole[0], G + 1.2, st.pole[1]], "#c9ccd0", undefined, 8);
    lit.cylinder(0.28, 0.28, 0.04, [st.pole[0], G + 2.45, st.pole[1]], "#f2994a", [Math.PI / 2, st.heading, 0], 16);
  }
  // The bike rack, and its canopy.
  b.box([0.08, 0.6, 2.4], [BIKE_RACK.x + 0.35, G + 0.3, (BIKE_RACK.zs[0] + BIKE_RACK.zs[2]) / 2], "#9da3a8");
  roofs.box([1.4, 0.06, 2.8], [BIKE_RACK.x, G + 2.1, (BIKE_RACK.zs[0] + BIKE_RACK.zs[2]) / 2], "#3f4652");
  for (const dz of [-1.2, 1.2]) b.box([0.06, 2.1, 0.06], [BIKE_RACK.x + 0.6, G + 1.05, (BIKE_RACK.zs[0] + BIKE_RACK.zs[2]) / 2 + dz], "#7d7f82");

  return {
    painted: b.build(),
    walls: out.build(),
    roofs: roofs.build(),
    glass: glass.build(),
    lit: lit.build(),
    marks: marks.build(),
    inside: inside.build(),
    grain: grain.build(),
    plaster: plaster.build(),
    grainIn: grainIn.build(),
    tileIn: tileIn.build(),
    plankIn: plankIn.build(),
  };
}

const FLOORS: Record<NishiShop["kind"], string> = { music: "#9a7452", burger: "#e8e9e6", books: "#9a7452", kissa: "#b89a6a", yose: "#c9b37a", dojo: "#b89a6a" };

/** A shop's shell: walls with its door and windows, the floor and ceiling, the roof, its awning. */
function shop(s: NishiShop, out: Builder, roofs: Builder, glass: Builder, lit: Builder, inside: Builder) {
  const f = shopFront(s);
  const H = s.kind === "burger" ? 5.4 : ROOM_H;
  const w = s.x1 - s.x0;
  const zc = (f.z0 + f.z1) / 2;
  const T = 0.2;
  const fz = s.side === "south" ? f.z1 - T / 2 : f.z0 + T / 2;
  const bz = s.side === "south" ? f.z0 + T / 2 : f.z1 - T / 2;
  out.box([T, H, s.depth], [s.x0 + T / 2, G + H / 2, zc], s.wall);
  out.box([T, H, s.depth], [s.x1 - T / 2, G + H / 2, zc], s.wall);
  out.box([w, H, T], [(s.x0 + s.x1) / 2, G + H / 2, bz], s.wall);
  // The front: a low wall and big windows either side of the door, the wall above.
  for (const [a, c] of [
    [s.x0, s.door[0]],
    [s.door[1], s.x1],
  ] as [number, number][]) {
    out.box([c - a, 0.6, T], [(a + c) / 2, G + 0.3, fz], s.wall);
    out.box([c - a, H - 2.4, T], [(a + c) / 2, G + 2.4 + (H - 2.4) / 2, fz], s.wall);
    glass.plane(c - a - 0.1, 1.8, [(a + c) / 2, G + 1.5, fz], "#ffffff", [0, s.side === "south" ? 0 : Math.PI, 0]);
    out.box([0.06, 1.8, T + 0.02], [(a + c) / 2, G + 1.5, fz], "#3a3330");
  }
  out.box([s.door[1] - s.door[0], H - 2.2, T], [(s.door[0] + s.door[1]) / 2, G + 2.2 + (H - 2.2) / 2, fz], s.wall);
  roofs.box([w + 0.3, 0.2, s.depth + 0.3], [(s.x0 + s.x1) / 2, G + H + 0.1, zc], s.roof);
  // An awning over the windows, in the roof's colour.
  roofs.box([w, 0.05, 0.9], [(s.x0 + s.x1) / 2, G + 2.45, fz + f.out * 0.45], s.roof, [f.out * 0.25, 0, 0]);
  inside.plane(w - 0.4, s.depth - 0.4, [(s.x0 + s.x1) / 2, G + 0.014, zc], FLOORS[s.kind], [-Math.PI / 2, 0, 0]);
  inside.plane(w - 0.4, s.depth - 0.4, [(s.x0 + s.x1) / 2, G + H - 0.02, zc], "#f3efe6", [Math.PI / 2, 0, 0]);
  for (let i = 0; i < Math.max(1, Math.round(w / 3)); i++) lit.plane(0.4, s.depth * 0.5, [s.x0 + ((i + 0.5) * w) / Math.max(1, Math.round(w / 3)), G + H - 0.04, zc], "#ffffff", [Math.PI / 2, 0, 0]);
}

function musicShop(inside: Builder, lit: Builder) {
  const s = shopById("music");
  const f = shopFront(s);
  const c = MUSIC_COUNTER;
  inside.box([c.x1 - c.x0, 1.0, c.z1 - c.z0], [(c.x0 + c.x1) / 2, G + 0.5, (c.z0 + c.z1) / 2], WOOD_DARK);
  inside.box([0.4, 0.3, 0.3], [c.x0 + 0.4, G + 1.15, (c.z0 + c.z1) / 2], "#2b2d30");
  // Pegboards on the walls the instruments hang on; amplifiers on the floor.
  for (const x of [s.x0 + 0.22, s.x1 - 0.22]) inside.box([0.03, 2.2, s.depth - 1.0], [x, G + 1.5, (f.z0 + f.z1) / 2], "#d9cdb5");
  for (let i = 0; i < 3; i++) inside.box([0.55, 0.5, 0.35], [s.x1 - 0.7, G + 0.25, f.z0 + 1.6 + i * 1.1], "#1d1d1d");
  lit.plane(2.4, 0.4, [(s.x0 + s.x1) / 2, G + 2.6, f.z0 + 0.25], "#ffcf5a");
}

function burgerShop(inside: Builder, lit: Builder, b: Builder) {
  const c = BURGER.counter;
  inside.box([c.x1 - c.x0, 1.05, c.z1 - c.z0], [(c.x0 + c.x1) / 2, G + 0.52, (c.z0 + c.z1) / 2], "#c8402f");
  // The menu boards over the counter, lit.
  for (let i = 0; i < 3; i++) lit.plane(1.3, 0.7, [c.x0 + 0.9 + i * 1.5, G + 2.0, c.z0 - 0.02], ["#ffcf5a", "#ffe9a8", "#ffcf5a"][i], [0, 0, 0]);
  const k = BURGER.kitchen;
  inside.box([k.x1 - k.x0, 0.95, 0.7], [(k.x0 + k.x1) / 2, G + 0.48, k.z0 + 0.5], "#b9bec2");
  // The mezzanine: its slab, the rail along its open edge, the tables by the window.
  const m = BURGER.mezzanine;
  inside.box([m.x1 - m.x0, 0.2, m.z1 - m.z0], [(m.x0 + m.x1) / 2, BURGER.up - 0.1, (m.z0 + m.z1) / 2], "#e8e9e6");
  inside.box([m.x1 - m.x0 - 1.6, 1.0, 0.05], [(m.x0 + m.x1) / 2 - 0.8, BURGER.up + 0.5, m.z1], "#c9ccd0");
  for (const [x, z] of BURGER.tables) {
    inside.box([0.7, 0.04, 0.7], [x, BURGER.up + 0.74, z], "#f2efe6");
    inside.box([0.08, 0.72, 0.08], [x, BURGER.up + 0.36, z], "#55504a");
    for (const s of [-1, 1]) inside.box([0.42, 0.45, 0.42], [x, BURGER.up + 0.225, z + s * 0.6], "#c8402f");
  }
  // The stairs: a step every 20 cm up to the mezzanine.
  const st = BURGER.stairs;
  const steps = Math.round((BURGER.up - G) / 0.2);
  for (let i = 0; i < steps; i++) {
    const z = st.z1 - ((i + 0.5) * (st.z1 - st.z0)) / steps;
    inside.box([st.x1 - st.x0, 0.2 * (i + 1), (st.z1 - st.z0) / steps], [(st.x0 + st.x1) / 2, G + 0.1 * (i + 1), z], "#9da3a8");
  }
  b.bar([st.x0, G + 1.0, st.z1], [st.x0, BURGER.up + 1.0, st.z0], 0.02, "#c9ccd0");
}

function bookShop(inside: Builder, lit: Builder) {
  for (const sh of BOOK_SHELVES) inside.box([sh.maxX - sh.minX, 2.0, sh.maxZ - sh.minZ], [(sh.minX + sh.maxX) / 2, G + 1.0, (sh.minZ + sh.maxZ) / 2], WOOD);
  const c = BOOK_COUNTER;
  inside.box([c.x1 - c.x0, 1.0, c.z1 - c.z0], [(c.x0 + c.x1) / 2, G + 0.5, (c.z0 + c.z1) / 2], WOOD_DARK);
  lit.plane(1.6, 0.5, [c.x0 + 0.8, G + 2.4, c.z0 - 0.6], "#fff2d0");
}

function kissaten(inside: Builder, lit: Builder) {
  const c = KISSA.counter;
  inside.box([c.x1 - c.x0, 1.0, c.z1 - c.z0], [(c.x0 + c.x1) / 2, G + 0.5, (c.z0 + c.z1) / 2], WOOD_DARK);
  inside.box([c.x1 - c.x0 + 0.08, 0.05, c.z1 - c.z0 + 0.08], [(c.x0 + c.x1) / 2, G + 1.02, (c.z0 + c.z1) / 2], "#d9c3a0");
  for (let i = 0; i < 4; i++) inside.cylinder(0.18, 0.18, 0.06, [shopById("kissa").x0 + 1.2 + i * 1.2, G + 0.62, c.z0 - 0.45], "#8a2f2a", undefined, 14);
  for (const [x, z] of KISSA.tables) {
    inside.cylinder(0.34, 0.34, 0.04, [x, G + 0.72, z], WOOD, undefined, 16);
    inside.cylinder(0.05, 0.05, 0.7, [x, G + 0.35, z], WOOD_DARK, undefined, 8);
    for (const s of [-1, 1]) inside.box([0.44, 0.45, 0.44], [x + s * 0.6, G + 0.225, z], "#8a2f2a");
  }
  // Glass pendant lamps, and the jukebox's glow in the corner.
  for (const [x, z] of KISSA.tables) lit.cylinder(0.12, 0.2, 0.18, [x, G + 2.3, z], "#ffcf7a", undefined, 12);
  lit.box([0.6, 1.2, 0.4], [shopById("kissa").x1 - 0.6, G + 0.6, shopFront(shopById("kissa")).z1 - 0.5], "#ff8a5a");
}

function yoseCafe(inside: Builder, lit: Builder) {
  const st = YOSE.stage;
  inside.box([st.x1 - st.x0, 0.6, st.z1 - st.z0], [(st.x0 + st.x1) / 2, G + 0.3, (st.z0 + st.z1) / 2], WOOD);
  // The red-and-white curtain behind the kōza, the zabuton the teller kneels on, a little screen.
  for (let i = 0; i < 10; i++) inside.box([(st.x1 - st.x0) / 10, 2.0, 0.03], [st.x0 + ((i + 0.5) * (st.x1 - st.x0)) / 10, G + 1.6, st.z1 - 0.05], i % 2 ? "#ffffff" : "#c8302b");
  inside.box([0.7, 0.08, 0.7], [YOSE.teller[0], G + 0.64, YOSE.teller[1]], "#8a2f5a");
  // The audience's low benches, in their rows.
  for (const z of YOSE.rows) inside.box([5.2, 0.4, 0.42], [(YOSE.cols[0] + YOSE.cols[3]) / 2, G + 0.2, z], WOOD);
  for (const x of [st.x0 - 0.3, st.x1 + 0.3]) lit.cylinder(0.14, 0.14, 0.4, [x, G + 2.2, st.z0], "#ffd79a", undefined, 10);
}

function dojoHall(inside: Builder, lit: Builder) {
  const s = shopById("dojo");
  const f = shopFront(s);
  // Tatami down the middle, their dark edges.
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 2; j++) {
      const x = s.x0 + 1.2 + i * 1.18;
      const z = f.z0 + 1.6 + j * 1.9;
      inside.box([1.1, 0.04, 1.8], [x, G + 0.03, z], "#c9b37a");
      inside.box([1.12, 0.042, 0.04], [x, G + 0.032, z - 0.9], "#2b3a2a");
      inside.box([1.12, 0.042, 0.04], [x, G + 0.032, z + 0.9], "#2b3a2a");
    }
  // The rack of practice swords, the makiwara posts, the kamidana shelf, the banner.
  const r = DOJO.rack;
  inside.box([r.x1 - r.x0, 1.1, r.z1 - r.z0], [(r.x0 + r.x1) / 2, G + 0.55, (r.z0 + r.z1) / 2], WOOD_DARK);
  for (let i = 0; i < 6; i++) inside.bar([r.x0 + 0.2 + i * 0.32, G + 0.2, r.z0 - 0.02], [r.x0 + 0.2 + i * 0.32, G + 1.2, r.z0 - 0.02], 0.02, "#d9c3a0");
  for (const [x, z] of DOJO.posts) {
    inside.box([0.16, 1.5, 0.16], [x, G + 0.75, z], WOOD);
    inside.box([0.2, 0.4, 0.2], [x, G + 1.2, z], "#d8c58a");
  }
  inside.box([1.6, 0.1, 0.4], [(s.x0 + s.x1) / 2, G + 2.3, f.z1 - 0.3], WOOD_DARK);
  lit.plane(1.0, 1.6, [(s.x0 + s.x1) / 2 + 2.0, G + 1.6, f.z1 - 0.24], "#f4efe2", [0, Math.PI, 0]);
}

/** A bike in the rack: two wheels, the frame, a basket. */
function bikeGeometry() {
  const b = new Builder();
  for (const z of [-0.5, 0.5]) b.raw(new THREE.TorusGeometry(0.32, 0.025, 6, 20).rotateY(Math.PI / 2).translate(0, 0.34, z), "#1f2023");
  b.bar([0, 0.34, -0.5], [0, 0.75, -0.05], 0.02, "#2f6fd0");
  b.bar([0, 0.75, -0.05], [0, 0.34, 0.5], 0.02, "#2f6fd0");
  b.bar([0, 0.75, -0.05], [0, 0.95, -0.15], 0.02, "#2f6fd0");
  b.box([0.18, 0.05, 0.26], [0, 0.97, -0.18], "#1d1d1d");
  b.bar([0, 0.34, 0.5], [0, 1.0, 0.42], 0.02, "#2f6fd0");
  b.bar([-0.25, 1.0, 0.42], [0.25, 1.0, 0.42], 0.015, "#c9ccd0");
  b.box([0.3, 0.2, 0.25], [0, 0.95, 0.62], "#9da3a8");
  return b.build();
}

// --- the scene -----------------------------------------------------------------------------------

/** How long a bike waits after its rider is done before it's back in the rack (nobody watching it). */
const BIKE_RETURN_SECONDS = 45;

export function NishiScene({ worldState, getSelfPosition }: { worldState: Record<string, WorldStateValue>; getSelfPosition: () => [number, number, number] }) {
  const geometry = useMemo(buildQuarter, []);
  const m = useMemo(
    () => ({
      painted: paint(),
      walls: paint(),
      roofs: paint(),
      marks: paint({ ...ON_TOP }),
      glass: new THREE.MeshLambertMaterial({ color: "#cfe6ee", transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
      lit: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      inside: new THREE.MeshBasicMaterial({ vertexColors: true }),
      grain: surfaceMaterial("grain", true),
      plaster: surfaceMaterial("plaster", true),
      grainIn: surfaceMaterial("grain", false),
      tileIn: surfaceMaterial("tile", false),
      plankIn: surfaceMaterial("plank", false),
      books: new THREE.MeshBasicMaterial({ map: spines() }),
      signs: Object.fromEntries(NISHI_SHOPS.map((s) => [s.id, new THREE.MeshBasicMaterial({ map: signTexture(s.sign[0], s.sign[1], s.roof, s.kind === "burger" ? "#c8402f" : "#ffffff"), toneMapped: false })])),
      bike: paint(),
    }),
    []
  );
  const bike = useMemo(bikeGeometry, []);
  const instruments = useMemo(() => {
    const worn = MUSIC_WALL.map((w) => {
      // Built where a player wears it (at the chest, out in front): centred
      // on itself here, then hung on the wall facing out into the shop.
      const worn = w.instrument === "violin" ? buildViolin() : buildWorn(w.instrument);
      const centre = new THREE.Box3().setFromObject(worn).getCenter(new THREE.Vector3());
      worn.position.sub(centre);
      const g = new THREE.Group();
      g.add(worn);
      g.rotation.set(0, w.facing, 0);
      g.position.set(w.x - Math.sin(w.facing) * -0.06, G + 1.55, w.z);
      return { g, w };
    });
    const kit = buildKit();
    kit.position.set(MUSIC_KIT[0], G, MUSIC_KIT[1]);
    kit.rotation.y = Math.PI;
    const keys = buildKeyboard();
    keys.position.set(MUSIC_KEYS[0], G, MUSIC_KEYS[1]);
    keys.rotation.y = Math.PI / 2;
    return { worn, kit, keys };
  }, []);
  useEffect(
    () => () => {
      for (const g of Object.values(geometry)) g.dispose();
      bike.dispose();
      for (const [key, mat] of Object.entries(m)) {
        if (key === "signs") for (const s of Object.values(mat as Record<string, THREE.MeshBasicMaterial>)) {
          s.map?.dispose();
          s.dispose();
        }
        else {
          (mat as THREE.MeshBasicMaterial).map?.dispose();
          (mat as THREE.Material).dispose();
        }
      }
    },
    [geometry, m, bike]
  );

  const shop = useShop();
  const modeOn = (mode: string) => worldState[`mode.${mode}`] === true;

  // Trying an instrument: a strum, a chord, a beat, and (band mode on) it's yours.
  const tryInstrument = (instrument: Instrument) => {
    if (instrument === "kit") [KIT.kick, KIT.hat, KIT.snare, KIT.hat].forEach((n, i) => window.setTimeout(() => playNote("kit", n), i * 230));
    else if (instrument === "keys") {
      const stop = [60, 64, 67].map((n) => holdNote("keys", n));
      window.setTimeout(() => stop.forEach((s) => s()), 1100);
    } else if (instrument === "violin") {
      const stop = holdNote("violin", 7);
      window.setTimeout(stop, 1200);
    } else playNote(instrument, 0);
    if (modeOn("band")) {
      setInstrument(instrument);
      showCaption("お買い上げありがとうございます!", "It's yours to play: band mode is on");
    } else showCaption("試奏どうぞ", "Try it out! (An editor can turn band mode on to play it for real.)", 4);
  };

  const takeSword = () => {
    if (modeOn("fantasy")) {
      setWeapon("katana");
      showCaption("礼!", "Bow, then practise on the makiwara");
    } else showCaption("稽古中", "The dojo's for fantasy mode: an editor can turn it on", 4);
  };

  const pickBook = () => {
    const book = BOOKS[Math.floor(Math.random() * BOOKS.length)];
    showCaption(`『${book.ja}』`, `${book.en}: ${book.line}`, 6);
  };

  // The bikes: which is out, and when it goes back by itself.
  const [out, setOut] = useState<Record<number, number>>({});
  const riding = useRef<number | null>(null);
  const takeBike = (i: number) => {
    if (!modeOn("exer")) {
      showCaption("レンタサイクル", "Free bikes: an editor can turn ride mode on to ride one", 4);
      return;
    }
    setVehicle("bike");
    riding.current = i;
    setOut((o) => ({ ...o, [i]: Infinity }));
    showCaption("いってらっしゃい!", "Off you go: it'll find its own way back to the rack");
  };
  useFrame(() => {
    const now = performance.now();
    const i = riding.current;
    if (i !== null && ride.get().vehicle !== "bike") {
      // Done with it: back in the rack a while later, when nobody's looking.
      riding.current = null;
      setOut((o) => ({ ...o, [i]: now + BIKE_RETURN_SECONDS * 1000 }));
    }
    for (const [k, at] of Object.entries(out)) {
      if (at > now) continue;
      const [x, , z] = getSelfPosition();
      // Not while you're right by the rack (it isn't magic in front of you).
      if (Math.hypot(x - BIKE_RACK.x, z - BIKE_RACK.zs[1]) < 6) continue;
      setOut((o) => {
        const next = { ...o };
        delete next[Number(k)];
        return next;
      });
    }
  });

  const burgerAt: [number, number, number] = [(BURGER.counter.x0 + BURGER.counter.x1) / 2, G + 1.15, (BURGER.counter.z0 + BURGER.counter.z1) / 2];
  const kissaAt: [number, number, number] = [(KISSA.counter.x0 + KISSA.counter.x1) / 2, G + 1.15, (KISSA.counter.z0 + KISSA.counter.z1) / 2];
  const dojo = shopById("dojo");
  return (
    <group>
      <mesh geometry={geometry.painted} material={m.painted} castShadow receiveShadow />
      <mesh geometry={geometry.walls} material={m.walls} castShadow receiveShadow />
      <mesh geometry={geometry.grain} material={m.grain} castShadow receiveShadow />
      <mesh geometry={geometry.plaster} material={m.plaster} castShadow receiveShadow />
      <mesh geometry={geometry.roofs} material={m.roofs} castShadow />
      <mesh geometry={geometry.marks} material={m.marks} receiveShadow raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh geometry={geometry.glass} material={m.glass} raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh geometry={geometry.lit} material={m.lit} raycast={noRaycast} userData={{ navIgnore: true }} />
      <mesh geometry={geometry.inside} material={m.inside} />
      <mesh geometry={geometry.grainIn} material={m.grainIn} />
      <mesh geometry={geometry.tileIn} material={m.tileIn} />
      <mesh geometry={geometry.plankIn} material={m.plankIn} />
      {/* The bookshop's shelves, their spines on both faces. */}
      {BOOK_SHELVES.flatMap((sh, i) =>
        [-1, 1].map((s) => (
          <mesh key={`${i}${s}`} position={[(sh.minX + sh.maxX) / 2 + s * ((sh.maxX - sh.minX) / 2 + 0.005), G + 1.0, (sh.minZ + sh.maxZ) / 2]} rotation={[0, s * (Math.PI / 2), 0]} material={m.books} raycast={noRaycast}>
            <planeGeometry args={[sh.maxZ - sh.minZ - 0.1, 1.9]} />
          </mesh>
        ))
      )}
      {/* The shops' signs, over their doors. */}
      {NISHI_SHOPS.map((s) => {
        const f = shopFront(s);
        const z = s.side === "south" ? f.z1 + 0.12 : f.z0 - 0.12;
        return (
          <mesh key={s.id} position={[(s.x0 + s.x1) / 2, G + (s.kind === "burger" ? 4.4 : 2.75), z]} rotation={[0, s.side === "south" ? 0 : Math.PI, 0]} material={m.signs[s.id]} raycast={noRaycast} userData={{ navIgnore: true }}>
            <planeGeometry args={[Math.min(4.6, s.x1 - s.x0 - 0.6), 0.9]} />
          </mesh>
        );
      })}
      {/* The music shop's instruments, to try. */}
      {instruments.worn.map(({ g, w }) => (
        <group key={w.instrument}>
          <primitive object={g} />
          <Spot at={[w.x + Math.sin(w.facing) * 0.15, G + 1.5, w.z + Math.cos(w.facing) * 0.15]} size={[0.4, 1.1, 0.6]} onClick={() => tryInstrument(w.instrument)} />
        </group>
      ))}
      <primitive object={instruments.kit} />
      <Spot at={[MUSIC_KIT[0], G + 0.7, MUSIC_KIT[1]]} size={[1.3, 1.2, 1.1]} onClick={() => tryInstrument("kit")} />
      <primitive object={instruments.keys} />
      <Spot at={[MUSIC_KEYS[0], G + 0.9, MUSIC_KEYS[1]]} size={[1.1, 0.4, 0.5]} onClick={() => tryInstrument("keys")} />
      {/* SeaBurger's counter, the kissaten's, a book off the shelf, the dojo's rack. */}
      <Spot at={burgerAt} size={[BURGER.counter.x1 - BURGER.counter.x0, 0.3, 0.7]} onClick={() => shop("burger")} />
      <Spot at={kissaAt} size={[KISSA.counter.x1 - KISSA.counter.x0, 0.3, 0.7]} onClick={() => shop("kissa")} />
      {BOOK_SHELVES.map((sh, i) => (
        <Spot key={i} at={[(sh.minX + sh.maxX) / 2, G + 1.2, (sh.minZ + sh.maxZ) / 2]} size={[sh.maxX - sh.minX + 0.2, 1.6, sh.maxZ - sh.minZ]} onClick={pickBook} />
      ))}
      <Spot at={[(DOJO.rack.x0 + DOJO.rack.x1) / 2, G + 0.9, (DOJO.rack.z0 + DOJO.rack.z1) / 2]} size={[DOJO.rack.x1 - DOJO.rack.x0, 1.2, 0.7]} onClick={takeSword} />
      {/* The bikes in the rack (one out is gone from it until it's back). */}
      {BIKE_RACK.zs.map((z, i) =>
        out[i] === undefined ? (
          <group key={i}>
            <mesh geometry={bike} material={m.bike} position={[BIKE_RACK.x, G, z]} rotation={[0, Math.PI / 2, 0]} castShadow raycast={noRaycast} />
            <Spot at={[BIKE_RACK.x, G + 0.6, z]} size={[1.2, 1.1, 0.5]} onClick={() => takeBike(i)} />
          </group>
        ) : null
      )}
      {/* The rakugo teller, kneeling on the kōza, telling kobanashi. */}
      <Sitter
        avatar={TELLER}
        position={[YOSE.teller[0], G + 0.68, YOSE.teller[1]]}
        rotationY={0}
        kneel
        bubbleSeconds={6.5}
        chatter={KOBANASHI}
        near={() => {
          const [x, , z] = getSelfPosition();
          return Math.hypot(x - YOSE.teller[0], z - YOSE.teller[1]);
        }}
      />
      {/* The dojo's sensei, kneeling at the head of the hall. */}
      <Sitter avatar={SENSEI} position={[(dojo.x0 + dojo.x1) / 2 - 2.0, G + 0.05, shopFront(dojo).z1 - 0.9]} rotationY={0} kneel chatter={[{ ja: "礼に始まり、礼に終わる。", en: "It starts with a bow, and ends with one." }, { ja: "構えて。", en: "On guard." }]} near={() => Math.hypot(getSelfPosition()[0] - dojo.x0 - 4.7, getSelfPosition()[2] - shopFront(dojo).z1)} />
      {/* The dogs, each with its walker. */}
      {DOG_WALKERS.map((id) => (
        <Dog key={id} owner={id} />
      ))}
    </group>
  );
}

/** Who walks a dog round Nishi park (people.ts's NISHI_PEOPLE). */
export const DOG_WALKERS = ["mika"];

const look = (spec: Partial<AvatarSpec>) =>
  encodeAvatarSpec({ ...DEFAULT_AVATAR_SPEC, skin: "#eec1a0", accessories: [], ...spec });
// The teller in a dark montsuki-like top; the sensei in white over dark hakama-ish trousers.
const TELLER = look({ hairStyle: "short", hairColor: "#1f1a17", top: "longsleeve", topColor: "#1d2433", bottom: "pants", bottomColor: "#2f3b52", shoeColor: "#f2f0eb", height: 0.98 });
const SENSEI = look({ hairStyle: "buzz", hairColor: "#6b6f78", top: "longsleeve", topColor: "#f2f0eb", bottom: "pants", bottomColor: "#1d2433", shoeColor: "#1d2433", build: 1.05 });
