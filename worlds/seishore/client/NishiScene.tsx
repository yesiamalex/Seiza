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
import { buildWeapon } from "../../../src/addons/fantasy/weapons";
import { holdNote, KIT, playNote, type Instrument } from "../../../src/addons/band/instruments";
import { setInstrument } from "../../../src/addons/band/band";
import { fantasy, practiceStrike, practiceTargets, setWeapon } from "../../../src/addons/fantasy/combat";
import type { VRM } from "@pixiv/three-vrm";
import { VrmAvatar } from "../../../src/avatar/VrmAvatar";
import { AvatarAnimator } from "../../../src/avatar/AvatarAnimator";
import { ride, setVehicle } from "../../../src/addons/exer/ride";
import { buildPet } from "../../../src/addons/pet/pets";
import { Builder, canvasTexture, FONT, noRaycast, ON_TOP, paint, useDrawDistance } from "../../seisugbo/client/kit";
import { RoutedBuilder, surfaceMaterial } from "./surfaces";
import { DEFAULT_AVATAR_SPEC, encodeAvatarSpec, type AvatarSpec } from "../../../src/avatar/designer/avatarSpec";
import { showCaption } from "./caption";
import { panelTexture, Register, Spot, useShop } from "./Shops";
import { SHOPS, yen } from "./shop";
import { setPlaces } from "./serve";
import { openBook, useBookOpen } from "./BookReader";
import { getAddonAvatar, LOCAL_AVATAR } from "../../../src/addons/avatars";
import { facing, feetAndEye, rigFor } from "../../../src/addons/rig";
import { track } from "../../../src/analytics/track";
import { Sitter } from "./Extras";
import { G, LANE } from "./plan";
import {
  ARCH,
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
  MUSIC_STANDS,
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
/** How far a worn instrument's neck leans from upright (BandLayer builds them across the chest). */
const NECK_TILT = Math.atan2(0.47, -0.88) - Math.PI / 2;
const WOOD_DARK = "#3a2c22";
/** Where the lanterns hang over the yokochō's alley, every 1.8 m. */
const ALLEY_LANTERNS = Array.from({ length: Math.floor((YOKOCHO.x1 - YOKOCHO.x0 - 1) / 1.8) + 1 }, (_, i) => YOKOCHO.x0 + 1 + i * 1.8);

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

/** A hanging sign's face: the shop's name read downwards, as on a sode-kanban. */
function hangingTexture(name: string, bg: string) {
  return canvasTexture(128, 384, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    const chars = [...name.replace(/[s　]/g, "")].slice(0, 7);
    const size = Math.min(84, (h - 40) / chars.length);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${size}px ${FONT}`;
    chars.forEach((c, i) => ctx.fillText(c, w / 2, 20 + size * (i + 0.5) + (h - 40 - size * chars.length) / 2));
  });
}

/** A paper lantern's shape: full in the middle, narrowing to its caps. */
const LANTERN_PROFILE = Array.from({ length: 11 }, (_, i) => new THREE.Vector2(0.04 + 0.15 * Math.sin((Math.PI * i) / 10), (i / 10) * 0.36));

/** What each stall sells, on its menu board. */
const STALL_MENUS: Record<string, string[]> = {
  Yakitori: ["もも 150", "ねぎま 160", "つくね 180", "皮 140"],
  "Capsule toys": ["1回 200", "2回 300"],
  Takoyaki: ["6個 400", "8個 500", "ネギ +50"],
  Karaoke: ["30分 300", "1時間 500"],
  Sweets: ["団子 120", "大福 180", "わらび餅 350"],
};

/** A noren: the stall's name across split panels of cloth. */
function norenTexture(name: string, color: string) {
  return canvasTexture(512, 160, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    for (let k = 1; k < 4; k++) ctx.fillRect((k * w) / 4 - 3, 26, 6, h - 26);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, 0, w, 16);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 76px ${FONT}`;
    ctx.fillText(name, w / 2, h / 2 + 12, w - 40);
  });
}

/** A stall's menu board: chalk on black. */
function menuTexture(name: string, lines: string[]) {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = "#1f2a24";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#8a6545";
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = "#f4f2ec";
    ctx.textAlign = "center";
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText(name, w / 2, 36, w - 16);
    ctx.font = `600 17px ${FONT}`;
    ctx.fillStyle = "#ffe9a8";
    lines.forEach((l, i) => ctx.fillText(l, w / 2, 76 + i * 34, w - 16));
  });
}

/** A lantern's paper: its colour, the 西 mark on it, and the dark bands of its ribs. */
function lanternTexture(color: string, ink: string) {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    for (let k = 1; k < 8; k++) ctx.fillRect(0, (k * h) / 8, w, 2);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 64px ${FONT}`;
    for (const x of [w * 0.25, w * 0.75]) ctx.fillText("西", x, h / 2);
  });
}

/** A loop bus stop's sign face: its name, and that it's the loop's. */
function stopTexture(ja: string, en: string) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#fff7ea";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c86a1e";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 46px ${FONT}`;
    ctx.fillText(ja, w / 2, 100, w - 40);
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(en, w / 2, 146, w - 50);
    ctx.font = `600 20px ${FONT}`;
    ctx.fillText("西町循環 · Loop", w / 2, 186, w - 60);
  });
}

/** An open book: its cover, and two pages rising a little from the spine. */
function openBookModel() {
  const g = new THREE.Group();
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, 0.21), new THREE.MeshLambertMaterial({ color: "#7a2f2a" }));
  g.add(cover);
  for (const side of [-1, 1]) {
    const page = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.018, 0.2), new THREE.MeshLambertMaterial({ color: "#f3ead6" }));
    page.position.set(side * 0.072, 0.012, 0);
    page.rotation.z = -side * 0.12;
    g.add(page);
  }
  g.traverse((o) => (o.userData.navIgnore = true));
  return g;
}

/**
 * The book in a reader's hands: held open before them where the reading
 * pose ("read", a built-in gesture) puts their hands, tipped up to the face,
 * growing in as the pose comes on. `id` is whose avatar (LOCAL_AVATAR for
 * yours, else their player id).
 */
function HeldBook({ id }: { id: string }) {
  const book = useMemo(openBookModel, []);
  const grow = useRef(0);
  const at = useMemo(() => ({ feet: new THREE.Vector3(), ahead: new THREE.Vector3() }), []);
  useEffect(
    () => () => {
      book.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        (mesh.material as THREE.Material | undefined)?.dispose();
      });
    },
    [book]
  );
  useFrame((_, delta) => {
    const vrm = getAddonAvatar(id);
    const rig = vrm ? rigFor(vrm) : null;
    // In after the pose has raised the hands (about half a second).
    grow.current = Math.min(1, grow.current + Math.min(delta, 0.1) * 1.6);
    const k = Math.max(0, (grow.current - 0.35) / 0.65);
    book.visible = !!rig && k > 0;
    if (!rig) return;
    const eye = feetAndEye(rig, at.feet);
    facing(rig, at.ahead);
    book.position.copy(at.feet).addScaledVector(at.ahead, eye * 0.27).setY(at.feet.y + eye * 0.66);
    book.rotation.set(0, Math.atan2(at.ahead.x, at.ahead.z), 0);
    book.rotateX(-0.55);
    book.scale.setScalar(Math.max(0.001, k));
  });
  return <primitive object={book} />;
}

/**
 * Reading, for everyone. Opening a book in the bookshop puts you into the
 * reading pose: a posture, like kneeling, so everyone in the room sees it,
 * and anyone who comes in later. Putting the book back stands you up again;
 * walking off puts the book back. And whoever is in the pose, you included,
 * holds a book in their hands on every screen.
 */
function Readers({ players, selfId, playGesture }: { players: Record<string, { posture?: string | null }>; selfId: string | null; playGesture: (name: string) => void }) {
  const open = useBookOpen();
  const mine = selfId ? (players[selfId]?.posture ?? null) : null;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && mine !== "read") playGesture("read");
    // The pose toggles: asked again while in it, it ends.
    if (!open && wasOpen.current && mine === "read") playGesture("read");
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // Walked off (which ends a posture): the book goes back on the shelf too.
  const wasMine = useRef(mine);
  useEffect(() => {
    if (wasMine.current === "read" && mine !== "read" && open) openBook(null);
    wasMine.current = mine;
  }, [mine, open]);
  const readers = Object.entries(players)
    .filter(([, p]) => p?.posture === "read")
    .map(([id]) => id);
  return (
    <>
      {readers.map((id) => (
        <HeldBook key={id} id={id === selfId ? LOCAL_AVATAR : id} />
      ))}
    </>
  );
}

/** The arch's sign: the street's name, lit. */
function archTexture() {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = "#1d2433";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffd79a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 56px ${FONT}`;
    ctx.fillText("西通り商店街", w / 2, 52, w - 24);
    ctx.font = `600 22px ${FONT}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("NISHI-DŌRI SHOPPING STREET", w / 2, 104, w - 24);
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

/**
 * One yokochō stall: a little timber room open to the alley, its posts and
 * a pent roof with an eave board, a counter with a pale top, a shelf at the
 * back, a bulb over the counter, and what it sells: the yakitori grill's
 * coals, the takoyaki plate, the gacha machines, the karaoke booth's door,
 * the sweets' case.
 */
function addStall(st: (typeof STALLS)[number], b: Builder, out: Builder, roofs: Builder, lit: Builder) {
  const z0 = YOKOCHO.z1;
  const z1 = z0 + YOKOCHO.stallDepth;
  const w = st.x1 - st.x0;
  const xc = (st.x0 + st.x1) / 2;
  const zc = (z0 + z1) / 2;
  // The room: back and side walls, posts at the front corners, a floor.
  out.box([w, 2.5, 0.1], [xc, G + 1.25, z1 - 0.05], WOOD_DARK);
  for (const x of [st.x0 + 0.05, st.x1 - 0.05]) out.box([0.1, 2.5, z1 - z0], [x, G + 1.25, zc], WOOD_DARK);
  for (const x of [st.x0 + 0.08, st.x1 - 0.08]) b.box([0.14, 2.6, 0.14], [x, G + 1.3, z0 + 0.07], WOOD);
  b.box([w - 0.2, 0.03, z1 - z0 - 0.1], [xc, G + 0.015, zc], "#5a4636");
  // The roof: sloping down to the alley, an eave board along its edge, a ridge at the back.
  roofs.box([w + 0.3, 0.07, z1 - z0 + 0.7], [xc, G + 2.72, zc - 0.3], "#3f4652", [0.22, 0, 0]);
  b.box([w + 0.3, 0.14, 0.04], [xc, G + 2.55, z0 - 0.62], WOOD_DARK);
  b.box([w + 0.3, 0.1, 0.12], [xc, G + 3.0, z1 + 0.02], "#2b2d30");
  // The counter, its pale top, a footrail; the shelf at the back with bottles and bowls.
  b.box([w - 0.5, 0.95, 0.45], [xc, G + 0.475, z0 + 0.3], WOOD);
  b.box([w - 0.4, 0.04, 0.55], [xc, G + 0.97, z0 + 0.28], "#d9c3a0");
  b.bar([st.x0 + 0.3, G + 0.18, z0 - 0.08], [st.x1 - 0.3, G + 0.18, z0 - 0.08], 0.015, "#9da3a8");
  b.box([w - 0.4, 0.03, 0.25], [xc, G + 1.55, z1 - 0.25], WOOD);
  for (let i = 0; i < Math.floor((w - 0.6) / 0.22); i++)
    b.cylinder(0.04, 0.045, 0.16 + (i % 3) * 0.05, [st.x0 + 0.4 + i * 0.22, G + 1.65 + (i % 3) * 0.025, z1 - 0.25], ["#3f6e4a", "#8a5a33", "#f4f2ec", "#2f5fa8"][i % 4], undefined, 8);
  // The bulb over the counter, and its glow on the counter's top.
  b.bar([xc, G + 2.5, z0 + 0.5], [xc, G + 2.15, z0 + 0.5], 0.006, "#222");
  lit.raw(new THREE.SphereGeometry(0.07, 10, 8).translate(xc, G + 2.1, z0 + 0.5), "#fff3d6");
  // What it sells.
  switch (st.en) {
    case "Yakitori": {
      b.box([1.2, 0.18, 0.3], [xc, G + 1.08, z0 + 0.55], "#2b2d30");
      lit.box([1.1, 0.03, 0.22], [xc, G + 1.18, z0 + 0.55], "#ff6a2a");
      for (let i = 0; i < 9; i++) b.box([0.02, 0.02, 0.36], [xc - 0.48 + i * 0.12, G + 1.22, z0 + 0.55], "#c9a46a");
      for (let i = 0; i < 9; i++) b.raw(new THREE.SphereGeometry(0.025, 6, 4).translate(xc - 0.48 + i * 0.12, G + 1.23, z0 + 0.5), "#8a4a26");
      break;
    }
    case "Takoyaki": {
      b.box([0.9, 0.12, 0.45], [xc, G + 1.05, z0 + 0.5], "#1d1d1d");
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) b.raw(new THREE.SphereGeometry(0.04, 8, 6).translate(xc - 0.3 + i * 0.12, G + 1.12, z0 + 0.38 + j * 0.12), "#c98a3a");
      b.box([0.5, 0.02, 0.2], [xc + 0.7, G + 1.0, z0 + 0.4], "#2f6fd0");
      break;
    }
    case "Capsule toys": {
      // A row of gacha machines along the counter: a body, a clear dome of capsules, a handle.
      for (let i = 0; i < 4; i++) {
        const gx = st.x0 + 0.55 + i * ((w - 1.1) / 3);
        b.box([0.42, 0.55, 0.38], [gx, G + 1.27, z0 + 0.25], ["#e94f3d", "#2f6fd0", "#f2c94c", "#3f8f5a"][i]);
        b.raw(new THREE.SphereGeometry(0.19, 12, 8).translate(gx, G + 1.72, z0 + 0.25), "#e8f4ff");
        for (let k = 0; k < 5; k++) b.raw(new THREE.SphereGeometry(0.045, 6, 4).translate(gx - 0.08 + (k % 3) * 0.08, G + 1.62 + Math.floor(k / 3) * 0.08, z0 + 0.2), ["#ff8a9a", "#9fe07a", "#8fd3ff", "#ffd27a", "#c79bff"][k]);
        b.cylinder(0.05, 0.05, 0.03, [gx, G + 1.2, z0 + 0.06], "#f4f2ec", [Math.PI / 2, 0, 0], 10);
      }
      break;
    }
    case "Karaoke": {
      // The booth: its padded door, a porthole window, the neon over it.
      b.box([1.0, 2.0, 0.08], [xc, G + 1.0, z1 - 0.12], "#2b2140");
      b.cylinder(0.16, 0.16, 0.02, [xc, G + 1.5, z1 - 0.17], "#9a7fd0", [Math.PI / 2, 0, 0], 16);
      lit.box([1.3, 0.12, 0.04], [xc, G + 2.15, z1 - 0.14], "#ff4fd0");
      lit.box([0.04, 0.6, 0.04], [xc - 0.7, G + 1.8, z1 - 0.14], "#4fd8ff");
      break;
    }
    default: {
      // Sweets: a glass case of dango and wagashi on the counter.
      b.box([1.4, 0.03, 0.4], [xc, G + 1.0, z0 + 0.28], "#f4f2ec");
      for (let i = 0; i < 6; i++) {
        const dx = xc - 0.55 + i * 0.22;
        b.box([0.008, 0.18, 0.008], [dx, G + 1.1, z0 + 0.28], "#d9c3a0");
        for (let k = 0; k < 3; k++) b.raw(new THREE.SphereGeometry(0.03, 8, 6).translate(dx, G + 1.08 + k * 0.055, z0 + 0.28), ["#f7c8d6", "#f4f2ec", "#9fd08a"][k]);
      }
      lit.box([1.5, 0.3, 0.02], [xc, G + 1.15, z0 + 0.06], "#ffffff");
    }
  }
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
  // Nishi-dōri: red-brown paving with a paler band down its middle and a
  // darker gutter each side, in two pieces, either side of the ring road
  // (laid over it, the two fought for the same ground and flickered).
  const sz0 = NISHI_STREET.z0;
  const sz1 = NISHI_STREET.z1;
  const szc = (sz0 + sz1) / 2;
  for (const [a, c] of [
    [NISHI_STREET.x0, east - half],
    [east + half, NISHI_STREET.x1],
  ] as [number, number][]) {
    const xc = (a + c) / 2;
    marks.box([c - a, 0.02, sz1 - sz0], [xc, roadY, szc], "#9a6a52");
    marks.box([c - a, 0.022, 0.9], [xc, roadY + 0.002, szc], "#b98a6a");
    for (const zz of [sz0 + 0.12, sz1 - 0.12]) marks.box([c - a, 0.022, 0.18], [xc, roadY + 0.002, zz], "#6e4a3a");
    for (let x = a + 0.6; x < c; x += 1.2) marks.box([0.03, 0.024, sz1 - sz0 - 0.4], [x, roadY + 0.003, szc], "#7a5040");
  }
  // The shopping street's arch over its way in, from the ring road: two
  // posts and the lit sign band (NishiScene draws its words).
  for (const zz of [ARCH.z0, ARCH.z1]) {
    b.box([0.3, 4.1, 0.3], [ARCH.x, G + 2.05, zz], "#3a3d42");
    b.box([0.42, 0.2, 0.42], [ARCH.x, G + 0.1, zz], "#5f6670");
  }
  b.box([0.36, 0.86, ARCH.z1 - ARCH.z0 + 0.3], [ARCH.x, G + 3.85, (ARCH.z0 + ARCH.z1) / 2], "#3a3d42");
  for (let i = 0; i < 9; i++) lit.cylinder(0.07, 0.07, 0.05, [ARCH.x + 0.21, G + 4.36, ARCH.z0 + 0.2 + i * ((ARCH.z1 - ARCH.z0 - 0.4) / 8)], "#ffd79a", [0, 0, Math.PI / 2], 10);
  // Lamps on brackets off the shop fronts, between the shops and at the ends.
  for (const x of [-33.6, -41.4, -50.2, -60.8])
    for (const [zz, out] of [
      [sz0, 1],
      [sz1, -1],
    ] as [number, number][]) {
      b.bar([x, G + 3.0, zz], [x, G + 3.0, zz + out * 0.55], 0.025, "#2b2d30");
      b.bar([x, G + 3.0, zz + out * 0.55], [x, G + 2.85, zz + out * 0.55], 0.012, "#2b2d30");
      lit.raw(new THREE.SphereGeometry(0.13, 12, 8).translate(x, G + 2.72, zz + out * 0.55), "#fff3d6");
    }
  // Strings of pennants across the street, as a shōtengai hangs them.
  const flags = ["#c8302b", "#f2c94c", "#2f6fd0", "#3f8f5a", "#f2efe6"];
  for (let x = -36.5; x > -60; x -= 6) {
    b.bar([x, G + 3.7, sz0 + 0.05], [x, G + 3.7, sz1 - 0.05], 0.006, "#2b2d30");
    for (let i = 0; i < 6; i++) {
      const zz = sz0 + 0.3 + i * ((sz1 - sz0 - 0.6) / 5);
      b.raw(new THREE.ConeGeometry(0.09, 0.22, 3).rotateX(Math.PI).translate(x, G + 3.58, zz), flags[(i + Math.round(-x)) % flags.length]);
    }
  }
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

  // The yokochō: a row of little stalls, each its own (noren, lantern,
  // menu board and the names are NishiScene's, drawn with their words).
  for (const st of STALLS) addStall(st, b, out, roofs, lit);
  // Lanterns on a wire down the alley: their ribs and caps here, the paper (lit, with its mark) in NishiScene.
  const wireZ = (YOKOCHO.z0 + YOKOCHO.z1) / 2;
  b.bar([YOKOCHO.x0, G + 3.25, wireZ], [YOKOCHO.x1, G + 3.25, wireZ], 0.008, "#222");
  for (const x of ALLEY_LANTERNS) {
    b.bar([x, G + 3.25, wireZ], [x, G + 3.08, wireZ], 0.006, "#222");
    for (const [y, r] of [
      [G + 3.06, 0.11],
      [G + 2.68, 0.11],
    ] as [number, number][])
      b.cylinder(r, r, 0.04, [x, y, wireZ], "#1d1d1d", undefined, 12);
    for (let k = 1; k < 6; k++) b.raw(new THREE.TorusGeometry(0.17 * Math.sin((Math.PI * k) / 6) + 0.02, 0.005, 4, 18).rotateX(Math.PI / 2).translate(x, G + 2.7 + (k / 6) * 0.34, wireZ), "#7a1f16");
    b.bar([x, G + 2.66, wireZ], [x, G + 2.54, wireZ], 0.012, "#c8302b");
  }

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
  // (The round signs on top, with each stop's name, are NishiScene's.)
  for (const st of LOOP_STOPS) b.cylinder(0.04, 0.04, 2.2, [st.pole[0], G + 1.1, st.pole[1]], "#c9ccd0", undefined, 8);
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
  // The front rises above the roof, as a shōtengai shop's does (kanban
  // kenchiku): its sign on the flat face, nothing over it. Pilasters at its
  // ends, a coping along its top, two lamps leaning over the sign.
  const FRONT = s.kind === "burger" ? H : H + 0.85;
  if (FRONT > H) out.box([w, FRONT - H, T], [(s.x0 + s.x1) / 2, G + H + (FRONT - H) / 2, fz], s.wall);
  for (const x of [s.x0 + 0.07, s.x1 - 0.07]) out.box([0.18, FRONT, T + 0.08], [x, G + FRONT / 2, fz], s.roof);
  out.box([w + 0.08, 0.12, T + 0.18], [(s.x0 + s.x1) / 2, G + FRONT + 0.06, fz], s.roof);
  const signY = s.kind === "burger" ? 4.4 : 3.05;
  for (const dx of [-1, 1]) {
    const lx = (s.x0 + s.x1) / 2 + dx * Math.min(1.6, w / 2 - 0.8);
    out.bar([lx, G + signY + 0.6, fz + f.out * 0.1], [lx, G + signY + 0.62, fz + f.out * 0.42], 0.015, "#2b2d30");
    lit.box([0.16, 0.05, 0.1], [lx, G + signY + 0.59, fz + f.out * 0.44], "#fff3d6");
  }
  // The roof, behind the front (not over it), out a little at the sides and back.
  {
    const inner = f.front - f.out * T;
    const far = f.back - f.out * 0.15;
    roofs.box([w + 0.2, 0.2, Math.abs(inner - far)], [(s.x0 + s.x1) / 2, G + H + 0.1, (inner + far) / 2], s.roof);
  }
  // An awning over the windows and the door, below the sign, in the roof's colour.
  roofs.box([w - 0.36, 0.05, 0.62], [(s.x0 + s.x1) / 2, G + 2.32, fz + f.out * 0.31], s.roof, [f.out * 0.3, 0, 0]);
  inside.plane(w - 0.4, s.depth - 0.4, [(s.x0 + s.x1) / 2, G + 0.014, zc], FLOORS[s.kind], [-Math.PI / 2, 0, 0]);
  inside.plane(w - 0.4, s.depth - 0.4, [(s.x0 + s.x1) / 2, G + H - 0.02, zc], "#f3efe6", [Math.PI / 2, 0, 0]);
  for (let i = 0; i < Math.max(1, Math.round(w / 3)); i++) lit.plane(0.4, s.depth * 0.5, [s.x0 + ((i + 0.5) * w) / Math.max(1, Math.round(w / 3)), G + H - 0.04, zc], "#ffffff", [Math.PI / 2, 0, 0]);
}

function musicShop(inside: Builder, lit: Builder) {
  const s = shopById("music");
  const f = shopFront(s);
  const c = MUSIC_COUNTER;
  // The counter, its glass top over strings and picks; the clerk's stool behind.
  inside.box([c.x1 - c.x0, 0.95, c.z1 - c.z0], [(c.x0 + c.x1) / 2, G + 0.475, (c.z0 + c.z1) / 2], WOOD_DARK);
  inside.box([c.x1 - c.x0 + 0.04, 0.04, c.z1 - c.z0 + 0.04], [(c.x0 + c.x1) / 2, G + 0.97, (c.z0 + c.z1) / 2], "#c9ccd0");
  for (let i = 0; i < 8; i++) inside.box([0.12, 0.02, 0.16], [c.x0 + 0.25 + i * 0.24, G + 0.92, (c.z0 + c.z1) / 2], ["#c8302b", "#f2c94c", "#2f6fd0", "#3f8f5a"][i % 4]);
  // Pegboards on both walls, hooks on them for what hangs there.
  for (const [x, inward] of [
    [s.x0 + 0.22, 1],
    [s.x1 - 0.22, -1],
  ] as [number, number][]) {
    inside.box([0.03, 2.2, s.depth - 1.0], [x, G + 1.5, (f.z0 + f.z1) / 2], "#d9cdb5");
    for (let k = 0; k < 9; k++) inside.bar([x, G + 2.15, f.z0 + 0.8 + k * ((s.depth - 1.6) / 8)], [x + inward * 0.1, G + 2.17, f.z0 + 0.8 + k * ((s.depth - 1.6) / 8)], 0.008, "#7d7f82");
  }
  // The violin's display: a board on the wall, its bracket, a little lit label.
  const v = MUSIC_WALL.find((w) => w.instrument === "violin")!;
  inside.box([0.05, 0.95, 0.5], [v.x - 0.05, G + 1.6, v.z], "#5a3a22");
  inside.box([0.1, 0.03, 0.3], [v.x + 0.01, G + 1.18, v.z], "#3a2c22");
  lit.box([0.012, 0.1, 0.36], [v.x - 0.02, G + 2.14, v.z], "#ffe9a8");
  // Amplifiers, stacked, their grilles and knobs; guitar stands on the floor.
  for (let i = 0; i < 3; i++) {
    const az = f.z0 + 1.6 + i * 1.1;
    inside.box([0.55, 0.5, 0.35], [s.x1 - 0.7, G + 0.25, az], "#1d1d1d");
    inside.box([0.01, 0.34, 0.28], [s.x1 - 0.98, G + 0.22, az], "#3a3d42");
    for (let k = 0; k < 4; k++) inside.cylinder(0.012, 0.012, 0.02, [s.x1 - 0.98, G + 0.44, az - 0.1 + k * 0.065], "#c9ccd0", [0, 0, Math.PI / 2], 6);
  }
  for (const gx of MUSIC_STANDS.map(([x]) => x)) {
    const gz = MUSIC_STANDS.find(([x]) => x === gx)![1];
    inside.bar([gx - 0.14, G, gz + 0.12], [gx, G + 0.5, gz], 0.012, "#2b2d30");
    inside.bar([gx + 0.14, G, gz + 0.12], [gx, G + 0.5, gz], 0.012, "#2b2d30");
    inside.bar([gx, G, gz - 0.16], [gx, G + 0.5, gz], 0.012, "#2b2d30");
  }
  lit.plane(2.4, 0.4, [(s.x0 + s.x1) / 2, G + 2.6, f.z0 + 0.25], "#ffcf5a");
}

function burgerShop(inside: Builder, lit: Builder, b: Builder) {
  const c = BURGER.counter;
  const cx = (c.x0 + c.x1) / 2;
  const cz = (c.z0 + c.z1) / 2;
  // The counter: red, a yellow stripe along it, a steel top; trays stacked at its end.
  inside.box([c.x1 - c.x0, 1.05, c.z1 - c.z0], [cx, G + 0.52, cz], "#c8402f");
  inside.box([c.x1 - c.x0 + 0.01, 0.12, c.z1 - c.z0 + 0.01], [cx, G + 0.7, cz], "#f2c94c");
  inside.box([c.x1 - c.x0 + 0.04, 0.03, c.z1 - c.z0 + 0.04], [cx, G + 1.06, cz], "#c9ccd0");
  for (let i = 0; i < 5; i++) inside.box([0.34, 0.012, 0.26], [c.x0 + 0.3, G + 1.08 + i * 0.014, cz], "#c8402f");
  // The kitchen behind: the fryers, the grill, the drinks fountain, the warming shelf.
  const k = BURGER.kitchen;
  inside.box([k.x1 - k.x0, 0.95, 0.7], [(k.x0 + k.x1) / 2, G + 0.48, k.z0 + 0.5], "#b9bec2");
  for (let i = 0; i < 2; i++) {
    inside.box([0.45, 0.06, 0.4], [k.x0 + 0.6 + i * 0.55, G + 0.98, k.z0 + 0.5], "#2b2d30");
    inside.box([0.35, 0.02, 0.3], [k.x0 + 0.6 + i * 0.55, G + 1.0, k.z0 + 0.5], "#c99a3a");
  }
  inside.box([0.9, 0.05, 0.5], [k.x0 + 2.0, G + 0.98, k.z0 + 0.5], "#3a3d42");
  inside.box([0.6, 0.7, 0.45], [k.x1 - 0.6, G + 1.3, k.z0 + 0.45], "#d9dde2");
  for (let i = 0; i < 4; i++) inside.box([0.06, 0.1, 0.06], [k.x1 - 0.82 + i * 0.15, G + 1.08, k.z0 + 0.72], ["#9fe07a", "#3a2416", "#f2994a", "#e94f3d"][i]);
  lit.box([1.2, 0.04, 0.3], [k.x0 + 2.0, G + 1.62, k.z0 + 0.45], "#ffd27a");
  // The mezzanine: its slab, the rail along its open edge, the tables by the window.
  const m = BURGER.mezzanine;
  inside.box([m.x1 - m.x0, 0.2, m.z1 - m.z0], [(m.x0 + m.x1) / 2, BURGER.up - 0.1, (m.z0 + m.z1) / 2], "#e8e9e6");
  for (let x = m.x0 + 0.1; x < m.x1 - 1.6; x += 0.4) b.bar([x, BURGER.up, m.z1], [x, BURGER.up + 1.0, m.z1], 0.015, "#c9ccd0");
  b.bar([m.x0, BURGER.up + 1.0, m.z1], [m.x1 - 1.6, BURGER.up + 1.0, m.z1], 0.03, "#c8402f");
  for (const [x, z] of BURGER.tables) {
    inside.box([0.7, 0.04, 0.7], [x, BURGER.up + 0.74, z], "#f2efe6");
    inside.box([0.08, 0.72, 0.08], [x, BURGER.up + 0.36, z], "#55504a");
    // Four to a table: red stools on chrome posts.
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      inside.cylinder(0.2, 0.2, 0.07, [x + ax * 0.6, BURGER.up + 0.43, z + az * 0.6], "#c8402f", undefined, 14);
      inside.cylinder(0.03, 0.03, 0.4, [x + ax * 0.6, BURGER.up + 0.2, z + az * 0.6], "#c9ccd0", undefined, 8);
      inside.cylinder(0.16, 0.18, 0.02, [x + ax * 0.6, BURGER.up + 0.01, z + az * 0.6], "#9da3a8", undefined, 12);
    }
  }
  // The stairs: a step every 20 cm up to the mezzanine, a nosing on each.
  const st = BURGER.stairs;
  const steps = Math.round((BURGER.up - G) / 0.2);
  for (let i = 0; i < steps; i++) {
    const z = st.z1 - ((i + 0.5) * (st.z1 - st.z0)) / steps;
    inside.box([st.x1 - st.x0, 0.2 * (i + 1), (st.z1 - st.z0) / steps], [(st.x0 + st.x1) / 2, G + 0.1 * (i + 1), z], "#9da3a8");
    inside.box([st.x1 - st.x0, 0.02, 0.04], [(st.x0 + st.x1) / 2, G + 0.2 * (i + 1) + 0.01, z + (st.z1 - st.z0) / steps / 2 - 0.02], "#f2c94c");
  }
  b.bar([st.x0, G + 1.0, st.z1], [st.x0, BURGER.up + 1.0, st.z0], 0.02, "#c9ccd0");
}

function bookShop(inside: Builder, lit: Builder) {
  for (const sh of BOOK_SHELVES) {
    const xc = (sh.minX + sh.maxX) / 2;
    const zc = (sh.minZ + sh.maxZ) / 2;
    // The shelf's carcass, a board under each row of books, its end panels and their signs.
    inside.box([sh.maxX - sh.minX - 0.06, 2.0, sh.maxZ - sh.minZ], [xc, G + 1.0, zc], WOOD_DARK);
    for (let r = 0; r <= 4; r++) inside.box([sh.maxX - sh.minX + 0.04, 0.03, sh.maxZ - sh.minZ], [xc, G + 0.06 + r * 0.47, zc], WOOD);
    for (const z of [sh.minZ - 0.02, sh.maxZ + 0.02]) {
      inside.box([sh.maxX - sh.minX + 0.06, 2.06, 0.04], [xc, G + 1.03, z], WOOD);
      lit.box([sh.maxX - sh.minX - 0.04, 0.18, 0.01], [xc, G + 1.85, z + Math.sign(z - zc) * 0.025], "#fff2d0");
    }
  }
  const c = BOOK_COUNTER;
  inside.box([c.x1 - c.x0, 1.0, c.z1 - c.z0], [(c.x0 + c.x1) / 2, G + 0.5, (c.z0 + c.z1) / 2], WOOD_DARK);
  // Stacks of books on the counter waiting to be priced, a step stool by the shelves.
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4 - i; j++) inside.box([0.22, 0.04, 0.16], [c.x0 + 0.3 + i * 0.3, G + 1.02 + j * 0.042, (c.z0 + c.z1) / 2], ["#8a2f2a", "#2f5fa8", "#e8c37a", "#3f6e4a"][(i + j) % 4]);
  const sx = BOOK_SHELVES[0].maxX + 0.45;
  inside.box([0.36, 0.22, 0.3], [sx, G + 0.11, BOOK_SHELVES[0].minZ + 0.6], "#c49a6c");
  inside.box([0.36, 0.22, 0.15], [sx, G + 0.33, BOOK_SHELVES[0].minZ + 0.525], "#c49a6c");
  lit.plane(1.6, 0.5, [c.x0 + 0.8, G + 2.4, c.z0 - 0.6], "#fff2d0");
}

function kissaten(inside: Builder, lit: Builder) {
  const s = shopById("kissa");
  const f = shopFront(s);
  const c = KISSA.counter;
  // Dark wood panelling to dado height round the room.
  for (const x of [s.x0 + 0.22, s.x1 - 0.22]) inside.box([0.03, 1.1, s.depth - 0.5], [x, G + 0.55, (f.z0 + f.z1) / 2], WOOD_DARK);
  inside.box([s.x1 - s.x0 - 0.5, 1.1, 0.03], [(s.x0 + s.x1) / 2, G + 0.55, f.z1 - 0.22], WOOD_DARK);
  // The counter, its pale top; behind it the back bar: shelves of cups, the siphons.
  inside.box([c.x1 - c.x0, 1.0, c.z1 - c.z0], [(c.x0 + c.x1) / 2, G + 0.5, (c.z0 + c.z1) / 2], WOOD_DARK);
  inside.box([c.x1 - c.x0 + 0.08, 0.05, c.z1 - c.z0 + 0.08], [(c.x0 + c.x1) / 2, G + 1.02, (c.z0 + c.z1) / 2], "#d9c3a0");
  for (const y of [1.45, 1.85]) {
    inside.box([c.x1 - c.x0, 0.03, 0.26], [(c.x0 + c.x1) / 2, G + y, f.z1 - 0.34], WOOD);
    for (let i = 0; i < 10; i++) inside.cylinder(0.04, 0.035, 0.08, [c.x0 + 0.3 + i * ((c.x1 - c.x0 - 0.6) / 9), G + y + 0.055, f.z1 - 0.34], i % 3 ? "#f4f2ec" : "#2f6fd0", undefined, 10);
  }
  for (let i = 0; i < 3; i++) {
    const x = c.x0 + 0.5 + i * 0.35;
    inside.cylinder(0.08, 0.06, 0.16, [x, G + 1.13, (c.z0 + c.z1) / 2], "#cfe6ee", undefined, 12);
    inside.raw(new THREE.SphereGeometry(0.07, 10, 8).translate(x, G + 1.3, (c.z0 + c.z1) / 2), "#3a2416");
    inside.cylinder(0.01, 0.01, 0.3, [x, G + 1.2, (c.z0 + c.z1) / 2 + 0.12], "#2b2d30", undefined, 6);
  }
  // The counter's stools: a red seat on a post, a footring, a heavy foot.
  for (let i = 0; i < 4; i++) {
    const x = s.x0 + 1.2 + i * 1.2;
    const z = c.z0 - 0.45;
    inside.cylinder(0.18, 0.18, 0.07, [x, G + 0.62, z], "#8a2f2a", undefined, 16);
    inside.cylinder(0.035, 0.035, 0.6, [x, G + 0.3, z], "#c9ccd0", undefined, 8);
    inside.raw(new THREE.TorusGeometry(0.13, 0.012, 6, 16).rotateX(Math.PI / 2).translate(x, G + 0.25, z), "#c9ccd0");
    inside.cylinder(0.16, 0.18, 0.03, [x, G + 0.015, z], "#3a3d42", undefined, 14);
  }
  for (const [x, z] of KISSA.tables) {
    inside.cylinder(0.4, 0.4, 0.04, [x, G + 0.72, z], WOOD, undefined, 18);
    inside.cylinder(0.05, 0.05, 0.7, [x, G + 0.35, z], WOOD_DARK, undefined, 8);
    inside.cylinder(0.22, 0.24, 0.03, [x, G + 0.015, z], WOOD_DARK, undefined, 12);
    // Velvet chairs, four to a table, each with its back away from the table.
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      inside.box([0.44, 0.12, 0.44], [x + ax * 0.62, G + 0.4, z + az * 0.62], "#8a2f2a");
      inside.box(ax ? [0.08, 0.5, 0.44] : [0.44, 0.5, 0.08], [x + ax * 0.84, G + 0.7, z + az * 0.84], "#8a2f2a");
      for (const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) inside.box([0.04, 0.34, 0.04], [x + ax * 0.62 + lx, G + 0.17, z + az * 0.62 + lz], WOOD_DARK);
    }
  }
  // Glass pendant lamps, and the jukebox's glow in the corner.
  for (const [x, z] of KISSA.tables) {
    inside.bar([x, G + ROOM_H - 0.02, z], [x, G + 2.4, z], 0.008, "#222");
    lit.cylinder(0.12, 0.2, 0.18, [x, G + 2.3, z], "#ffcf7a", undefined, 12);
  }
  lit.box([0.6, 1.2, 0.4], [s.x1 - 0.6, G + 0.6, f.z0 + 0.6], "#ff8a5a");
}

function yoseCafe(inside: Builder, lit: Builder) {
  const s = shopById("yose");
  const f = shopFront(s);
  const st = YOSE.stage;
  const sx = (st.x0 + st.x1) / 2;
  // The kōza: the raised stage, its red felt (hi-mōsen) over the top and down the front.
  inside.box([st.x1 - st.x0, 0.6, st.z1 - st.z0], [sx, G + 0.3, (st.z0 + st.z1) / 2], WOOD);
  inside.box([st.x1 - st.x0 + 0.02, 0.02, st.z1 - st.z0 + 0.02], [sx, G + 0.61, (st.z0 + st.z1) / 2], "#b8252a");
  inside.box([st.x1 - st.x0 + 0.02, 0.5, 0.01], [sx, G + 0.35, st.z0 - 0.01], "#b8252a");
  // Behind it, a gold folding screen (byōbu), six panels zigzagging.
  for (let i = 0; i < 6; i++) {
    const w = (st.x1 - st.x0 - 0.4) / 6;
    inside.box([w, 1.6, 0.03], [st.x0 + 0.2 + (i + 0.5) * w, G + 1.42, st.z1 - 0.12 - (i % 2) * 0.06], i % 2 ? "#d9b25a" : "#e8c56a");
    inside.box([w, 0.04, 0.05], [st.x0 + 0.2 + (i + 0.5) * w, G + 2.23, st.z1 - 0.12 - (i % 2) * 0.06], "#3a2c22");
  }
  // The teller's cushion, and the mekuri stand beside the stage with today's name on it.
  inside.box([0.7, 0.08, 0.7], [YOSE.teller[0], G + 0.66, YOSE.teller[1]], "#6b3b8a");
  inside.box([0.06, 1.2, 0.06], [st.x1 + 0.25, G + 0.6, st.z0 + 0.3], WOOD_DARK);
  inside.box([0.5, 0.06, 0.06], [st.x1 + 0.25, G + 1.22, st.z0 + 0.3], WOOD_DARK);
  // Wooden lattice (kōshi) along the side walls, and the chōchin lanterns over them.
  for (const x of [s.x0 + 0.22, s.x1 - 0.22]) for (let k = 0; k < 14; k++) inside.box([0.03, 2.2, 0.04], [x, G + 1.2, f.z0 + 0.6 + k * ((s.depth - 1.4) / 13)], WOOD);
  for (const x of [s.x0 + 0.5, s.x1 - 0.5])
    for (let k = 0; k < 4; k++) {
      const z = f.z0 + 1.0 + k * ((s.depth - 2.2) / 3);
      lit.cylinder(0.14, 0.14, 0.36, [x, G + 2.45, z], "#ffe9c8", undefined, 12);
      inside.cylinder(0.145, 0.145, 0.04, [x, G + 2.65, z], "#1d1d1d", undefined, 12);
    }
  // The audience's benches, in rows, a cushion at each place.
  for (const z of YOSE.rows) {
    inside.box([5.2, 0.06, 0.42], [(YOSE.cols[0] + YOSE.cols[3]) / 2, G + 0.37, z], WOOD);
    for (const x of [YOSE.cols[0] - 0.4, YOSE.cols[3] + 0.4]) inside.box([0.08, 0.34, 0.38], [x, G + 0.17, z], WOOD_DARK);
    for (const x of YOSE.cols) inside.box([0.4, 0.05, 0.36], [x, G + 0.42, z], "#6b3b8a");
  }
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
  // The sword rack: its frame, two rails with a notch for each sword (the swords are NishiScene's).
  const r = DOJO.rack;
  const rx = (r.x0 + r.x1) / 2;
  const rz = (r.z0 + r.z1) / 2;
  inside.box([r.x1 - r.x0, 0.08, r.z1 - r.z0], [rx, G + 0.04, rz], WOOD_DARK);
  for (const x of [r.x0 + 0.04, r.x1 - 0.04]) inside.box([0.06, 1.25, 0.08], [x, G + 0.625, rz], WOOD_DARK);
  for (const y of [0.45, 1.05]) inside.box([r.x1 - r.x0, 0.06, 0.1], [rx, G + y, rz], WOOD_DARK);
  // The makiwara: posts wrapped in straw at striking height.
  for (const [x, z] of DOJO.posts) {
    inside.box([0.16, 1.5, 0.16], [x, G + 0.75, z], WOOD);
    inside.box([0.2, 0.4, 0.2], [x, G + 1.2, z], "#d8c58a");
    for (const y of [1.04, 1.36]) inside.box([0.22, 0.03, 0.22], [x, G + y, z], "#8a6545");
  }
  // The kamidana, a shelf high on the back wall (in front of it, not in it), and the banner.
  inside.box([1.6, 0.08, 0.3], [(s.x0 + s.x1) / 2, G + 2.3, f.z1 - 0.36], WOOD_DARK);
  for (const dx of [-0.6, 0.6]) inside.box([0.06, 0.3, 0.06], [(s.x0 + s.x1) / 2 + dx, G + 2.15, f.z1 - 0.26], WOOD_DARK);
  inside.box([0.4, 0.3, 0.2], [(s.x0 + s.x1) / 2, G + 2.49, f.z1 - 0.34], "#e8dcc4");
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

export function NishiScene({
  worldState,
  getSelfPosition,
  players,
  selfId,
  playGesture,
}: {
  worldState: Record<string, WorldStateValue>;
  getSelfPosition: () => [number, number, number];
  players: Record<string, { posture?: string | null }>;
  selfId: string | null;
  playGesture: (name: string) => void;
}) {
  const geometry = useMemo(buildQuarter, []);
  // The whole quarter, only when you're anywhere near it.
  const area = useRef<THREE.Group>(null);
  useDrawDistance(area, [-46, 55], 70);
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
      arch: new THREE.MeshBasicMaterial({ map: archTexture(), toneMapped: false }),
      stops: LOOP_STOPS.map((st) => new THREE.MeshBasicMaterial({ map: stopTexture(st.ja, st.en), toneMapped: false })),
      yokocho: new THREE.MeshBasicMaterial({ map: panelTexture([["西町横丁", 52], ["NISHI-MACHI YOKOCHŌ", 20]], "#1d1d1d", "#ffcf5a", 512, 110), toneMapped: false }),
      noren: STALLS.map((st) => new THREE.MeshBasicMaterial({ map: norenTexture(st.ja, st.color), side: THREE.DoubleSide })),
      menus: STALLS.map((st) => new THREE.MeshBasicMaterial({ map: menuTexture(st.ja, STALL_MENUS[st.en] ?? []), toneMapped: false })),
      paper: ["#ff5a3a", "#fff1d6"].map((c, i) => new THREE.MeshBasicMaterial({ map: lanternTexture(c, i === 0 ? "#1d1d1d" : "#c8302b"), toneMapped: false })),
      hanging: Object.fromEntries(NISHI_SHOPS.map((s) => [s.id, new THREE.MeshBasicMaterial({ map: hangingTexture(s.sign[0], s.roof), toneMapped: false })])),
      signs: Object.fromEntries(NISHI_SHOPS.map((s) => [s.id, new THREE.MeshBasicMaterial({ map: signTexture(s.sign[0], s.sign[1], s.roof, s.kind === "burger" ? "#c8402f" : "#ffffff"), toneMapped: false })])),
      bike: paint(),
    }),
    []
  );
  const bike = useMemo(bikeGeometry, []);
  const instruments = useMemo(() => {
    // An instrument as a player wears it (at the chest, its neck across them),
    // turned neck-up and centred on itself, to hang on a hook or stand on a stand.
    const upright = (kind: "guitar" | "ukulele" | "electric" | "bass" | "violin") => {
      const model = kind === "violin" ? buildViolin() : buildWorn(kind);
      const tilt = new THREE.Group();
      tilt.add(model);
      if (kind !== "violin") tilt.rotation.z = -NECK_TILT;
      const centre = new THREE.Box3().setFromObject(tilt).getCenter(new THREE.Vector3());
      tilt.position.sub(centre);
      const g = new THREE.Group();
      g.add(tilt);
      return g;
    };
    const worn = MUSIC_WALL.map((w) => {
      const g = upright(w.instrument);
      g.rotation.y = w.facing;
      g.position.set(w.x - Math.sin(w.facing) * 0.06, G + (w.instrument === "violin" ? 1.6 : 1.5), w.z);
      return { g, w };
    });
    const stands = MUSIC_STANDS.map(([x, z, kind]) => {
      const g = upright(kind);
      g.position.set(x, G + 0.86, z);
      return { g, x, z, kind };
    });
    const kit = buildKit();
    kit.position.set(MUSIC_KIT[0], G, MUSIC_KIT[1]);
    kit.rotation.y = Math.PI;
    const keys = buildKeyboard();
    keys.position.set(MUSIC_KEYS[0], G, MUSIC_KEYS[1]);
    keys.rotation.y = Math.PI / 2;
    return { worn, stands, kit, keys };
  }, []);
  // The dojo's practice swords, standing in their rack: the katana, without its glow.
  const swords = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const sword = buildWeapon("katana", "spectro");
        const glow = sword.userData.glow as THREE.Material | undefined;
        sword.traverse((o) => {
          if ((o as THREE.Mesh).material === glow) o.visible = false;
        });
        sword.position.set(DOJO.rack.x0 + 0.25 + i * 0.3, G + 0.16, (DOJO.rack.z0 + DOJO.rack.z1) / 2);
        sword.rotation.set(0.08, 0, 0);
        return sword;
      }),
    []
  );
  useEffect(
    () => () => {
      for (const g of Object.values(geometry)) g.dispose();
      bike.dispose();
      for (const [key, mat] of Object.entries(m)) {
        if (key === "signs" || key === "hanging" || Array.isArray(mat)) for (const s of Object.values(mat as Record<string, THREE.MeshBasicMaterial>)) {
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
  // Its boards: the burgers, the sides, the drinks.
  const menuBoards = useMemo(() => {
    const w = SHOPS.burger.wares;
    const board = (title: string, items: typeof w, bg: string) =>
      new THREE.MeshBasicMaterial({ map: panelTexture([[title, 30], ...items.map((x): [string, number] => [`${x.ja} ${yen(x.price)}`, 24])], bg, "#7a1f16", 320, 172), toneMapped: false });
    return [board("バーガー BURGERS", w.filter((x) => x.item === "sandwich"), "#ffcf5a"), board("サイド SIDES", w.filter((x) => x.item === "meal"), "#ffe9a8"), board("ドリンク DRINKS", w.filter((x) => x.item === "cup"), "#ffcf5a")];
  }, []);
  useEffect(
    () => () => {
      for (const m of menuBoards) {
        m.map?.dispose();
        m.dispose();
      }
    },
    [menuBoards]
  );
  const modeOn = (mode: string) => worldState[`mode.${mode}`] === true;
  // The tables an order here can be brought to: four places at each.
  useEffect(() => {
    const at = (x: number, y: number, z: number, i: number, key: string) =>
      ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]).map(([ax, az], k) => ({ id: `${key}-${i}-${k}`, at: [x + ax * 0.19, y, z + az * 0.19] as [number, number, number] }));
    setPlaces("nishi", [...KISSA.tables.flatMap(([x, z], i) => at(x, G + 0.745, z, i, "kissa")), ...BURGER.tables.flatMap(([x, z], i) => at(x, BURGER.up + 0.76, z, i, "burger"))]);
    return () => setPlaces("nishi", null);
  }, []);

  // Trying an instrument: a strum, a chord, a beat, and (band mode on) it's yours.
  const tryInstrument = (instrument: Instrument) => {
    track(`try.${instrument}`);
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

  // A book off the shelf, opened on the screen to read (BookReader.tsx).
  const pickBook = () => {
    const book = BOOKS[Math.floor(Math.random() * BOOKS.length)];
    track(`book.${book.en}`);
    openBook(book);
  };

  // The bikes: which is out, and when it goes back by itself.
  const [out, setOut] = useState<Record<number, number>>({});
  const riding = useRef<number | null>(null);
  const takeBike = (i: number) => {
    track("bike");
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
    <group ref={area}>
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
      {/* The arch's sign, on both faces of its beam (it was inside it). */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[ARCH.x + side * 0.185, G + 3.85, (ARCH.z0 + ARCH.z1) / 2]} rotation={[0, (side * Math.PI) / 2, 0]} material={m.arch} raycast={noRaycast} userData={{ navIgnore: true }}>
          <planeGeometry args={[ARCH.z1 - ARCH.z0 + 0.2, 0.74]} />
        </mesh>
      ))}
      {/* The loop bus's stops: a round sign on each pole, its name both ways. */}
      {LOOP_STOPS.map((st, i) => (
        <group key={st.id} position={[st.pole[0], G + 2.45, st.pole[1]]} rotation={[0, st.heading, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} userData={{ navIgnore: true }}>
            <cylinderGeometry args={[0.29, 0.29, 0.04, 24]} />
            <meshBasicMaterial color="#f2994a" toneMapped={false} />
          </mesh>
          {[1, -1].map((face) => (
            <mesh key={face} position={[0, 0, face * 0.022]} rotation={[0, face > 0 ? 0 : Math.PI, 0]} material={m.stops[i]} raycast={noRaycast} userData={{ navIgnore: true }}>
              <circleGeometry args={[0.26, 24]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* The yokochō: its name over the way in, the stalls' noren, lanterns and menus, the alley's lanterns. */}
      <mesh position={[YOKOCHO.x0 + 2.0, G + 3.6, YOKOCHO.z0 - 0.21]} material={m.yokocho} raycast={noRaycast} userData={{ navIgnore: true }}>
        <planeGeometry args={[3.4, 0.7]} />
      </mesh>
      {STALLS.map((st, i) => {
        const w = st.x1 - st.x0;
        const xc = (st.x0 + st.x1) / 2;
        return (
          <group key={st.en}>
            <mesh position={[xc, G + 2.12, YOKOCHO.z1 - 0.02]} rotation={[0, Math.PI, 0]} material={m.noren[i]} raycast={noRaycast} userData={{ navIgnore: true }}>
              <planeGeometry args={[w - 0.4, 0.62]} />
            </mesh>
            <mesh position={[st.x1 - 0.02, G + 1.82, YOKOCHO.z1 - 0.3]} material={m.paper[i % m.paper.length]} raycast={noRaycast} userData={{ navIgnore: true }}>
              <latheGeometry args={[LANTERN_PROFILE, 16]} />
            </mesh>
            <mesh position={[st.x0 + 0.32, G + 1.35, YOKOCHO.z1 - 0.06]} rotation={[0, Math.PI, 0]} material={m.menus[i]} raycast={noRaycast} userData={{ navIgnore: true }}>
              <planeGeometry args={[0.36, 0.7]} />
            </mesh>
          </group>
        );
      })}
      {ALLEY_LANTERNS.map((x, i) => (
        <mesh key={x} position={[x, G + 2.7, (YOKOCHO.z0 + YOKOCHO.z1) / 2]} material={m.paper[i % m.paper.length]} raycast={noRaycast} userData={{ navIgnore: true }}>
          <latheGeometry args={[LANTERN_PROFILE, 16]} />
        </mesh>
      ))}
      <Readers players={players} selfId={selfId} playGesture={playGesture} />
      {/* The shops' signs, over their doors. */}
      {NISHI_SHOPS.map((s) => {
        const f = shopFront(s);
        const face = f.front + f.out * 0.07;
        const y = G + (s.kind === "burger" ? 4.4 : 3.05);
        const w = Math.min(4.6, s.x1 - s.x0 - 0.9);
        const turn = s.side === "south" ? 0 : Math.PI;
        // The hanging sign at the shop's end, its name downwards, read from along the street.
        const hx = (s.side === "south" ? s.x1 : s.x0) + (s.side === "south" ? -0.45 : 0.45);
        return (
          <group key={s.id}>
            <mesh position={[(s.x0 + s.x1) / 2, y, f.front + f.out * 0.035]} raycast={noRaycast} userData={{ navIgnore: true }}>
              <boxGeometry args={[w + 0.14, 1.04, 0.07]} />
              <meshLambertMaterial color="#1d1d1d" />
            </mesh>
            <mesh position={[(s.x0 + s.x1) / 2, y, face + f.out * 0.002]} rotation={[0, turn, 0]} material={m.signs[s.id]} raycast={noRaycast} userData={{ navIgnore: true }}>
              <planeGeometry args={[w, 0.9]} />
            </mesh>
            {s.kind !== "burger" && (
              <group position={[hx, G + 2.95, f.front + f.out * 0.42]}>
                <mesh raycast={noRaycast} userData={{ navIgnore: true }}>
                  <boxGeometry args={[0.1, 1.36, 0.5]} />
                  <meshLambertMaterial color="#1d1d1d" />
                </mesh>
                {[-1, 1].map((side) => (
                  <mesh key={side} position={[side * 0.052, 0, 0]} rotation={[0, side * (Math.PI / 2), 0]} material={m.hanging[s.id]} raycast={noRaycast} userData={{ navIgnore: true }}>
                    <planeGeometry args={[0.44, 1.3]} />
                  </mesh>
                ))}
                <mesh position={[0, 0, -f.out * 0.3]} raycast={noRaycast} userData={{ navIgnore: true }}>
                  <boxGeometry args={[0.04, 0.04, 0.2]} />
                  <meshLambertMaterial color="#2b2d30" />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
      {/* The music shop's instruments, to try. */}
      {instruments.worn.map(({ g, w }) => (
        <group key={w.instrument}>
          <primitive object={g} />
          <Spot at={[w.x + Math.sin(w.facing) * 0.15, G + 1.5, w.z + Math.cos(w.facing) * 0.15]} size={[0.4, 1.1, 0.6]} onClick={() => tryInstrument(w.instrument)} label={INSTRUMENT_NAMES[w.instrument]} />
        </group>
      ))}
      {instruments.stands.map(({ g, x, z, kind }) => (
        <group key={`stand-${x}`}>
          <primitive object={g} />
          <Spot at={[x, G + 0.85, z]} size={[0.4, 1.2, 0.4]} onClick={() => tryInstrument(kind)} label={INSTRUMENT_NAMES[kind]} />
        </group>
      ))}
      <Register position={[MUSIC_COUNTER.x0 + 0.5, G + 0.99, (MUSIC_COUNTER.z0 + MUSIC_COUNTER.z1) / 2]} />
      <Register position={[BOOK_COUNTER.x1 - 0.45, G + 1.0, (BOOK_COUNTER.z0 + BOOK_COUNTER.z1) / 2]} />
      {swords.map((sw, i) => (
        <primitive key={`sword-${i}`} object={sw} />
      ))}
      <primitive object={instruments.kit} />
      <Spot at={[MUSIC_KIT[0], G + 0.7, MUSIC_KIT[1]]} size={[1.3, 1.2, 1.1]} onClick={() => tryInstrument("kit")} label={["ドラム", "Drum kit: try it"]} />
      <primitive object={instruments.keys} />
      <Spot at={[MUSIC_KEYS[0], G + 0.9, MUSIC_KEYS[1]]} size={[1.1, 0.4, 0.5]} onClick={() => tryInstrument("keys")} label={["キーボード", "Keyboard: try it"]} />
      {/* SeaBurger's counter, the kissaten's, a book off the shelf, the dojo's rack. */}
      {/* SeaBurger's menu, lit over its counter. */}
      {menuBoards.map((mat, i) => (
        <mesh key={i} position={[BURGER.counter.x0 + 0.9 + i * 1.5, G + 2.0, BURGER.counter.z0 - 0.02]} material={mat}>
          <planeGeometry args={[1.3, 0.7]} />
        </mesh>
      ))}
      {/* The counters' registers: SeaBurger's two, facing the door; the kissaten's, its master's. */}
      {[-1, 1].map((s) => (
        <Register key={s} position={[burgerAt[0] + s * 1.3, G + 1.05, burgerAt[2] + 0.05]} />
      ))}
      <Register position={[KISSA.counter.x1 - 0.7, G + 1.045, kissaAt[2]]} facing={Math.PI} />
      <Spot at={burgerAt} size={[BURGER.counter.x1 - BURGER.counter.x0, 0.4, 0.7]} onClick={() => shop("burger")} label={["ご注文はこちら", "Order here: it's brought to your table"]} />
      <Spot at={kissaAt} size={[KISSA.counter.x1 - KISSA.counter.x0, 0.4, 0.7]} onClick={() => shop("kissa")} label={["ご注文", "Order: it's brought to your table"]} />
      {BOOK_SHELVES.map((sh, i) => (
        <Spot key={i} at={[(sh.minX + sh.maxX) / 2, G + 1.2, (sh.minZ + sh.maxZ) / 2]} size={[sh.maxX - sh.minX + 0.2, 1.6, sh.maxZ - sh.minZ]} onClick={pickBook} label={["本棚", "Take a book off the shelf"]} />
      ))}
      <Spot at={[(DOJO.rack.x0 + DOJO.rack.x1) / 2, G + 0.9, (DOJO.rack.z0 + DOJO.rack.z1) / 2]} size={[DOJO.rack.x1 - DOJO.rack.x0, 1.2, 0.7]} onClick={takeSword} label={["木刀", "Practice swords"]} />
      {/* The bikes in the rack (one out is gone from it until it's back). */}
      {BIKE_RACK.zs.map((z, i) =>
        out[i] === undefined ? (
          <group key={i}>
            <mesh geometry={bike} material={m.bike} position={[BIKE_RACK.x, G, z]} rotation={[0, Math.PI / 2, 0]} castShadow raycast={noRaycast} />
            <Spot at={[BIKE_RACK.x, G + 0.6, z]} size={[1.2, 1.1, 0.5]} onClick={() => takeBike(i)} label={["レンタサイクル", "Free bike: ride it"]} />
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
      {/* The dojo: its students, and the sensei, who spars if you ask. */}
      <DojoPractice fantasyOn={modeOn("fantasy")} getSelfPosition={getSelfPosition} />
      {/* The dogs, each with its walker. */}
      {DOG_WALKERS.map((id) => (
        <Dog key={id} owner={id} />
      ))}
    </group>
  );
}

/** Each instrument's name, over it on the wall. */
const INSTRUMENT_NAMES: Record<string, [string, string]> = {
  guitar: ["アコースティックギター", "Acoustic guitar: try it"],
  ukulele: ["ウクレレ", "Ukulele: try it"],
  electric: ["エレキギター", "Electric guitar: try it"],
  bass: ["ベース", "Bass: try it"],
  violin: ["バイオリン", "Violin: try it"],
};

/** Who walks a dog round Nishi park (people.ts's NISHI_PEOPLE). */
export const DOG_WALKERS = ["mika"];

const look = (spec: Partial<AvatarSpec>) =>
  encodeAvatarSpec({ ...DEFAULT_AVATAR_SPEC, skin: "#eec1a0", accessories: [], ...spec });
// The teller in a dark montsuki-like top; the sensei in white over dark hakama-ish trousers.
const TELLER = look({ hairStyle: "short", hairColor: "#1f1a17", top: "longsleeve", topColor: "#1d2433", bottom: "pants", bottomColor: "#2f3b52", shoeColor: "#f2f0eb", height: 0.98 });
const STUDENTS = [
  look({ hairStyle: "ponytail", hairColor: "#1f1a17", top: "longsleeve", topColor: "#f2f0eb", bottom: "pants", bottomColor: "#1d2433", shoeColor: "#1d2433", height: 0.95, build: 0.92 }),
  look({ skin: "#d9a07a", hairStyle: "short", hairColor: "#4a2f22", top: "longsleeve", topColor: "#f2f0eb", bottom: "pants", bottomColor: "#1d2433", shoeColor: "#1d2433", height: 1.02 }),
];
const SENSEI = look({ hairStyle: "buzz", hairColor: "#6b6f78", top: "longsleeve", topColor: "#f2f0eb", bottom: "pants", bottomColor: "#1d2433", shoeColor: "#1d2433", build: 1.05 });

// --- the dojo's practice: the sensei and two students --------------------------------------------

const STILL = new THREE.Vector3();
/** How long a bout with the sensei runs at most, and how often he strikes, and how near. */
const BOUT = { seconds: 45, every: 3.2, reach: 2.6, wins: 3, damage: 6 };

/** A katana from the fantasy mode's own, its glow off: a practice sword. */
function practiceSword() {
  const sword = buildWeapon("katana", "spectro");
  const glow = sword.userData.glow as THREE.Material | undefined;
  sword.traverse((o) => {
    if ((o as THREE.Mesh).material === glow) o.visible = false;
  });
  return sword;
}

/**
 * Someone to spar with in the dojo: standing, a practice sword in hand,
 * turned toward you. With `armed`, they can be struck (combat.ts's
 * practiceTargets, on this screen only), and flinch when they are.
 * `lunge` (a ref, 0 to 1) plays their strike: a step in and back.
 */
function Sparrer({ id, avatar, home, armed, onHit, lunge, getSelfPosition }: { id: string; avatar: string; home: [number, number]; armed: boolean; onHit: (special: boolean) => void; lunge?: React.MutableRefObject<number>; getSelfPosition: () => [number, number, number] }) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const group = useRef<THREE.Group>(null);
  const recoil = useRef(0);
  const hit = useRef(onHit);
  hit.current = onHit;
  const sword = useMemo(practiceSword, []);
  // The sword in the right hand, its blade forward and down, held at the side.
  useEffect(() => {
    const hand = vrm?.humanoid.getNormalizedBoneNode("rightHand");
    if (!hand) return;
    hand.add(sword);
    sword.position.set(-0.06, -0.02, 0.02);
    sword.rotation.set(Math.PI / 2 + 0.5, 0, Math.PI / 2);
    return () => {
      hand.remove(sword);
    };
  }, [vrm, sword]);
  useEffect(() => {
    if (!armed) return;
    practiceTargets.set(id, {
      feet: { x: home[0], y: G, z: home[1] },
      eye: 1.5,
      onHit: (special) => {
        recoil.current = 1;
        hit.current(special);
      },
    });
    return () => {
      practiceTargets.delete(id);
    };
  }, [armed, id, home]);
  const yaw = useRef(0);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const dt = Math.min(delta, 0.1);
    // Turned toward you, unhurried.
    const [sx, , sz] = getSelfPosition();
    const want = Math.atan2(sx - home[0], sz - home[1]);
    let turn = want - yaw.current;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    yaw.current += turn * Math.min(1, dt * 3);
    g.rotation.y = yaw.current;
    // A flinch back when struck; a step in on their own strike.
    recoil.current = Math.max(0, recoil.current - dt * 3);
    const step = (lunge ? 0.35 * Math.sin(Math.PI * lunge.current) : 0) - 0.18 * Math.sin(Math.PI * recoil.current);
    g.position.set(home[0] + Math.sin(yaw.current) * step, G, home[1] + Math.cos(yaw.current) * step);
  });
  return (
    <group ref={group} position={[home[0], G, home[1]]}>
      <VrmAvatar url={avatar} onLoaded={setVrm} updateEvery={() => 2} />
      <AvatarAnimator vrm={vrm} updateEvery={() => 2} getPosition={() => STILL} gesture={null} gestureSeq={0} />
    </group>
  );
}

/** The students' calls as they're struck, and when they've had enough. */
const STUDENT_CALLS: [string, string][] = [
  ["お願いします!", "Again, please!"],
  ["まだまだ!", "Not yet!"],
  ["参りました!", "You got me!"],
];

/**
 * The dojo's practice. Two students on the tatami, there to practise on
 * whenever fantasy mode is on. And the sensei, kneeling at the head of the
 * hall until you ask him for a bout: then he stands, turns to face you,
 * and strikes now and then; keep your guard up and turn his blows aside,
 * and land three clean ones on him to win.
 */
function DojoPractice({ fantasyOn, getSelfPosition }: { fantasyOn: boolean; getSelfPosition: () => [number, number, number] }) {
  const dojo = shopById("dojo");
  const f = shopFront(dojo);
  const kneelAt: [number, number, number] = [(dojo.x0 + dojo.x1) / 2 - 2.0, G + 0.05, f.z1 - 0.9];
  const standAt: [number, number] = [(dojo.x0 + dojo.x1) / 2 - 1.0, f.z0 + 3.4];
  const students: { id: string; avatar: string; at: [number, number] }[] = [
    { id: "dojo-student-1", avatar: STUDENTS[0], at: [dojo.x0 + 3.8, f.z0 + 1.9] },
    { id: "dojo-student-2", avatar: STUDENTS[1], at: [dojo.x0 + 6.6, f.z0 + 1.9] },
  ];
  const [bout, setBout] = useState(false);
  const state = useRef({ hits: 0, started: 0, next: 0, said: new Map<string, number>() });
  const lunge = useRef(0);
  const ask = () => {
    if (!fantasyOn) {
      showCaption("稽古中", "The dojo's for fantasy mode: an editor can turn it on", 4);
      return;
    }
    if (!fantasy.get().weapon) {
      showCaption("まず木刀を", "Take a practice sword from the rack first", 4);
      return;
    }
    if (bout) return;
    state.current.hits = 0;
    state.current.started = performance.now() / 1000;
    state.current.next = state.current.started + 2;
    setBout(true);
    track("dojo.bout");
    showCaption("よし、かかってきなさい", "Very well: come at me. Three clean hits, and guard against mine.", 4);
  };
  const end = (won: boolean) => {
    setBout(false);
    if (won) track("dojo.won");
    showCaption(won ? "見事!一本!" : "今日はここまで", won ? "Well struck! The bout is yours." : "That's enough for today. Come again.", 4);
  };
  const senseiHit = () => {
    const s = state.current;
    s.hits++;
    if (s.hits >= BOUT.wins) end(true);
    else showCaption(["面!", "小手!"][s.hits % 2], `A clean hit: ${s.hits} of ${BOUT.wins}`, 1.6);
  };
  const studentHit = (id: string) => {
    const s = state.current;
    const n = (s.said.get(id) ?? 0) + 1;
    s.said.set(id, n % 3);
    const [ja, en] = STUDENT_CALLS[(n - 1) % 3];
    showCaption(ja, en, 1.6);
  };
  useFrame((_, delta) => {
    lunge.current = Math.max(0, lunge.current - Math.min(delta, 0.1) * 2.5);
    if (!bout) return;
    const s = state.current;
    const now = performance.now() / 1000;
    if (now - s.started > BOUT.seconds || !fantasy.get().weapon || !fantasyOn) {
      end(false);
      return;
    }
    if (now < s.next) return;
    s.next = now + BOUT.every;
    const [x, , z] = getSelfPosition();
    if (Math.hypot(x - standAt[0], z - standAt[1]) > BOUT.reach) return;
    // His strike: a step in, and a blow you can turn aside on guard.
    lunge.current = 1;
    const result = practiceStrike(BOUT.damage);
    if (result === "blocked") showCaption("受けた!", "Blocked: well guarded", 1.6);
    else if (result === "hit") showCaption("面あり!", "He struck you: guard (hold your block) when he steps in", 2.2);
  });
  return (
    <>
      {bout ? (
        <Sparrer id="dojo-sensei" avatar={SENSEI} home={standAt} armed onHit={senseiHit} lunge={lunge} getSelfPosition={getSelfPosition} />
      ) : (
        <>
          <Sitter
            avatar={SENSEI}
            position={kneelAt}
            rotationY={0}
            kneel
            chatter={[
              { ja: "礼に始まり、礼に終わる。", en: "It starts with a bow, and ends with one." },
              { ja: "稽古をつけてほしければ、声をかけなさい。", en: "If you want a bout, just ask." },
            ]}
            near={() => Math.hypot(getSelfPosition()[0] - kneelAt[0], getSelfPosition()[2] - kneelAt[2])}
          />
          <Spot at={[kneelAt[0], G + 0.7, kneelAt[2]]} size={[0.8, 1.1, 0.8]} onClick={ask} label={["先生に稽古を頼む", "Ask the sensei for a bout"]} />
        </>
      )}
      {students.map((st) => (
        <Sparrer key={st.id} id={st.id} avatar={st.avatar} home={st.at} armed={fantasyOn} onHit={() => studentHit(st.id)} getSelfPosition={getSelfPosition} />
      ))}
    </>
  );
}
