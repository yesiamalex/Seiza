import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const WEAPONS = ["sword", "katana", "naginata", "scythe", "lightsaber", "bow", "rod"] as const;
export type Weapon = (typeof WEAPONS)[number];
/** Weapons with a blade that cuts and parries where it touches; the bow and
 *  the necromancer's rod fight from range instead. */
export const isBladed = (weapon: Weapon | null) => weapon !== null && weapon !== "bow" && weapon !== "rod";
/** The long-hafted weapons, held and swung on a pole's own poses. */
export const isPole = (weapon: Weapon) => weapon === "naginata" || weapon === "scythe";
/**
 * What a special carries, each with its own move, burst, glow, and sound:
 * Spectro's light let go from the palm, Havoc's dark plunge, Aero's
 * updraft, Electro called down from the sky, Fusion's fire from the hand,
 * Glacio's ice raised from the ground. Also a light saber's colour.
 */
export const ELEMENTS = ["spectro", "havoc", "aero", "electro", "fusion", "glacio"] as const;
export type Element = (typeof ELEMENTS)[number];

export interface WeaponSpec {
  label: [string, string];
  /** What it's good at, for the weapon picker. */
  note: [string, string];
  /** How far a swing reaches from the body's centre, in metres. */
  reach: number;
  damage: number;
  /** Seconds between attacks. */
  cooldown: number;
  /** How many people one swing can catch. */
  targets: number;
  /** The special: damage to everyone in its blast, and the blast's radius. */
  special: number;
  specialRadius: number;
  /** Where the other hand holds it, back down the grip from the first
   *  (in eye heights), or null for one hand. */
  otherHand: number | null;
  /** Blade from the grip to the tip, in metres, for the swing's trail. */
  blade: [number, number];
  /** How far the tip stands out to the side of the haft, in metres: a
   *  scythe's blade, which cuts out there rather than along the shaft. */
  bladeOut?: number;
}

/**
 * Balanced as trade-offs rather than a ladder: the blades all deal about
 * the same damage a second to one opponent (about 25), and each buys
 * something with the rest. The sword is the all-rounder; the katana cuts
 * hardest but slowest, one at a time; the naginata reaches furthest and
 * sweeps three, for less each; the scythe reaps two at a time from out to
 * the side, slower; the light saber is light and fast; the bow hits from
 * forty metres but slowly. Specials follow suit: the katana's hits hardest
 * in a small blast, the naginata's widest and softest.
 */
export const WEAPON_SPECS: Record<Weapon, WeaponSpec> = {
  sword: {
    label: ["Sword", "剣"],
    note: ["All-round: 11 a hit, up to two at once.", "万能型:1撃11、同時に2人まで。"],
    reach: 2.1, damage: 11, cooldown: 0.42, targets: 2, special: 30, specialRadius: 3.5, otherHand: null, blade: [0.12, 0.86],
  },
  katana: {
    label: ["Katana", "刀"],
    note: ["Heavy cuts: 16 a hit, slower, one at a time. Fiercest special.", "重い斬撃:1撃16、遅め、1人ずつ。必殺技が最強。"],
    reach: 2.2, damage: 16, cooldown: 0.62, targets: 1, special: 36, specialRadius: 2.8, otherHand: 0.1, blade: [0.1, 0.8],
  },
  naginata: {
    label: ["Naginata", "薙刀"],
    note: ["Longest reach: sweeps up to three for 9 each. Widest special.", "最長リーチ:最大3人をなぎ払い各9。必殺技の範囲が最大。"],
    reach: 3.0, damage: 9, cooldown: 0.55, targets: 3, special: 26, specialRadius: 4.8, otherHand: 0.3, blade: [0.55, 1.0],
  },
  scythe: {
    label: ["Scythe", "大鎌"],
    note: ["Reaping sweeps: 14 a hit, up to two, from out to the side. Slower.", "刈り払い:1撃14、横から最大2人。やや遅い。"],
    reach: 2.6, damage: 14, cooldown: 0.56, targets: 2, special: 32, specialRadius: 4, otherHand: 0.32, blade: [0.6, 1.02], bladeOut: 0.5,
  },
  lightsaber: {
    label: ["Light saber", "ライトセーバー"],
    note: ["Fastest: 7 a hit, nearly four a second. Takes your element's colour.", "最速:1撃7、毎秒約4回。属性の色に光ります。"],
    reach: 2.3, damage: 7, cooldown: 0.28, targets: 2, special: 28, specialRadius: 3.5, otherHand: 0.09, blade: [0.14, 1.06],
  },
  rod: {
    label: ["Necromancer", "ネクロマンサー"],
    note: [
      "A rod of slow magic bolts, 10 a hit up to 18 m. Special: three undead rise to fight for you, 3 a hit each. Charges slowly.",
      "遅い魔法弾の杖、18m先まで1撃10。必殺技:アンデッド3体が起き上がって戦う(各1撃3)。ゲージはゆっくり溜まる。",
    ],
    reach: 18, damage: 10, cooldown: 1.1, targets: 1, special: 0, specialRadius: 0, otherHand: null, blade: [0, 0],
  },
  bow: {
    label: ["Bow", "弓"],
    note: ["Range: 12 a hit up to 40 m away, but slow. Special bursts where it lands.", "遠距離:40m先まで1撃12、ただし遅い。必殺技は着弾点で炸裂。"],
    reach: 40, damage: 12, cooldown: 0.8, targets: 1, special: 24, specialRadius: 3, otherHand: null, blade: [0, 0],
  },
};

export const ELEMENT_COLORS: Record<Element, string> = {
  spectro: "#ffe27a",
  havoc: "#c42b74",
  aero: "#5ff0b8",
  electro: "#a77bff",
  fusion: "#ff5a36",
  glacio: "#9ff4ff",
};
export const ELEMENT_LABELS: Record<Element, [string, string]> = {
  spectro: ["Spectro", "スペクトロ(光)"],
  havoc: ["Havoc", "ハヴォック(闇)"],
  aero: ["Aero", "エアロ(風)"],
  electro: ["Electro", "エレクトロ(雷)"],
  fusion: ["Fusion", "フュージョン(炎)"],
  glacio: ["Glacio", "グレイシオ(氷)"],
};

/**
 * How a charged weapon's glow breathes, 0 to 1, by element: Spectro
 * shimmers and twinkles, Havoc throbs slow and deep, Aero ebbs and flows,
 * Electro crackles on and off, Fusion flickers like a flame, Glacio holds
 * a cold, slow pulse.
 */
export function elementPulse(element: Element, t: number): number {
  switch (element) {
    case "spectro":
      return 0.7 + 0.18 * Math.sin(t * 9) + (Math.sin(t * 31) > 0.85 ? 0.12 : 0);
    case "havoc":
      return 0.4 + 0.5 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.4), 3);
    case "aero":
      return 0.62 + 0.25 * Math.sin(t * 4 + 2 * Math.sin(t * 1.3));
    case "electro": {
      const flick = Math.sin(Math.floor(t * 22) * 12.9898) * 43758.5453;
      return flick - Math.floor(flick) > 0.5 ? 0.95 : 0.35;
    }
    case "fusion":
      return 0.62 + 0.18 * Math.sin(t * 13) + 0.14 * Math.sin(t * 29 + 1);
    case "glacio":
      return 0.62 + 0.2 * Math.sin(t * 1.6);
  }
}

export const MAX_HP = 100;
/** The most any special does, for checking what arrives. */
export const MAX_SPECIAL = Math.max(...Object.values(WEAPON_SPECS).map((w) => w.special));

// --- the meshes ---------------------------------------------------------------
// Each built from a few boxes and cylinders, merged per material: a held
// weapon is two or three draw calls. +y is the blade's direction, +x the
// edge, the origin the middle of the grip (see holdInHand in ../rig.ts).

// Low metalness on purpose: with no environment map to reflect, a truly
// metallic blade renders near-black.
const steel = () => new THREE.MeshStandardMaterial({ color: "#e6eaf0", metalness: 0.3, roughness: 0.32 });
const dark = () => new THREE.MeshStandardMaterial({ color: "#2a2422", roughness: 0.8 });
const gold = () => new THREE.MeshStandardMaterial({ color: "#d4ad55", metalness: 0.35, roughness: 0.4 });
const wood = () => new THREE.MeshStandardMaterial({ color: "#6b4a2e", roughness: 0.75 });
// A Japanese blade's two steels: a darker, blued body, and the hardened
// edge (the hamon's side) bright and catching the light.
const bladeBody = () => new THREE.MeshStandardMaterial({ color: "#b9c2cf", metalness: 0.35, roughness: 0.28 });
const bladeEdge = () => new THREE.MeshStandardMaterial({ color: "#f4f7fb", metalness: 0.2, roughness: 0.18, emissive: "#9fb6cc", emissiveIntensity: 0.18 });
const iron = () => new THREE.MeshStandardMaterial({ color: "#2b2a2c", metalness: 0.4, roughness: 0.55 });
// The handle: white ray skin under a black silk wrap.
const samegawa = () => new THREE.MeshStandardMaterial({ color: "#e8e2d2", roughness: 0.85 });
const lacquer = () => new THREE.MeshStandardMaterial({ color: "#4d1416", metalness: 0.1, roughness: 0.3 });

function box(w: number, h: number, d: number, y: number, x = 0, rz = 0) {
  return new THREE.BoxGeometry(w, h, d).rotateZ(rz).translate(x, y, 0);
}
function rod(r: number, from: number, to: number, segments = 8) {
  return new THREE.CylinderGeometry(r, r, to - from, segments).translate(0, (from + to) / 2, 0);
}
/** A blade's tip: a flat wedge. */
function tip(width: number, length: number, thickness: number, y: number, x = 0) {
  const shape = new THREE.Shape([new THREE.Vector2(-width / 2, 0), new THREE.Vector2(width / 2, 0), new THREE.Vector2(0, length)]);
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }).translate(x, y, -thickness / 2);
}

function group(parts: [THREE.BufferGeometry[], THREE.Material][]) {
  const out = new THREE.Group();
  for (const [geometries, material] of parts) {
    const merged = mergeGeometries(geometries.map((g) => (g.index ? g.toNonIndexed() : g)));
    for (const g of geometries) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.userData.navIgnore = true;
    out.add(mesh);
  }
  return out;
}

/** A wrapped grip: cord bands crossing a pale core, as rings. */
function wrapBands(from: number, to: number, radius: number, count: number) {
  const parts: THREE.BufferGeometry[] = [];
  const step = (to - from) / count;
  for (let i = 0; i < count; i++) parts.push(rod(radius, from + step * (i + 0.2), from + step * (i + 0.65), 8));
  return parts;
}

/**
 * A curved, single-edged blade as one smooth outline: the cutting edge on
 * +x, the back curving toward -x, narrowing to a point, extruded thin with
 * its edges rounded. `part` is the whole blade, or the bright band along
 * its edge (the hamon's side), a little proud of its faces. `fat` grows
 * it all round in a rounded bevel, for the glow: a soft aura, where the
 * old boxes showed their corners once it lit.
 */
function curvedBlade(from: number, length: number, width: number, bend: number, part: "blade" | "edge" = "blade", fat = 0, inner = false) {
  const steps = 10;
  const back = (s: number) => -bend * s * s;
  const half = (s: number) => (width * (1 - 0.3 * s)) / 2;
  const edge: THREE.Vector2[] = [];
  const spine: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = (i / steps) * 0.9;
    const y = from + length * s;
    const outer = back(s) + half(s);
    const inside = back(s) - half(s);
    // A scythe's edge is on the inside of its curve; a sword's, the outside.
    if (part === "edge" && inner) {
      edge.push(new THREE.Vector2(inside + half(s) * 0.62, y));
      spine.push(new THREE.Vector2(inside, y));
    } else {
      edge.push(new THREE.Vector2(outer, y));
      spine.push(new THREE.Vector2(part === "edge" ? outer - half(s) * 0.62 : inside, y));
    }
  }
  // The point: the edge sweeps up and round to meet the back.
  const point = new THREE.Vector2(back(1) - half(1) * 0.7, from + length + 0.05);
  const shape = new THREE.Shape([...spine.slice(0, 1), ...edge]);
  // Round to it carrying on the way the edge was going, with no kink.
  const last = edge[edge.length - 1];
  const slope = (-2 * bend * 0.9 - 0.15 * width) / length;
  shape.quadraticCurveTo(last.x + slope * 0.04, last.y + 0.04, part === "edge" && !inner ? point.x + half(1) * 0.35 : point.x, point.y);
  for (let i = spine.length - 1; i >= 0; i--) shape.lineTo(spine[i].x, spine[i].y);
  const depth = part === "edge" ? 0.0052 : 0.003;
  const round = fat || 0.0016;
  return [new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: round, bevelSize: fat || round * 0.8, bevelSegments: fat ? 3 : 1, curveSegments: 6 }).translate(0, 0, -depth / 2)];
}

/** Where a scythe's blade meets its haft, and the blade: out to the side
 *  (+x, where the cut goes), curving down toward the wielder, its edge on
 *  the inside of the curve. */
const SCYTHE_TOP = 1.02;
const scytheBlade = (part: "blade" | "edge", fat = 0) =>
  curvedBlade(0, 0.5, 0.085, 0.16, part, fat, true).map((g) => g.rotateZ(-Math.PI / 2).rotateX(Math.PI).translate(-0.01, SCYTHE_TOP, 0));
const darkSteel = () => new THREE.MeshStandardMaterial({ color: "#6c7380", metalness: 0.4, roughness: 0.35 });

/**
 * The aura round a weapon: its blade's shape, fattened, in its special's
 * colour, unlit and additive. Invisible until FantasyLayer turns it up as
 * the meter fills (see weaponGlow); a light saber's own halo serves.
 */
function glowMaterial(element: Element) {
  return new THREE.MeshBasicMaterial({
    color: ELEMENT_COLORS[element],
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
}

function withGlow(out: THREE.Group, parts: THREE.BufferGeometry[], element: Element) {
  const material = glowMaterial(element);
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  for (const g of parts) g.dispose();
  if (merged) {
    const mesh = new THREE.Mesh(merged, material);
    mesh.userData.navIgnore = true;
    mesh.renderOrder = 2;
    out.add(mesh);
  }
  out.userData.glow = material;
  return out;
}

/** A weapon's aura material, if it has one (see buildWeapon). */
export const weaponGlow = (weapon: THREE.Object3D): THREE.MeshBasicMaterial | null => (weapon.userData.glow as THREE.MeshBasicMaterial | undefined) ?? null;
/** How bright a light saber's halo is at rest. */
export const SABER_HALO = 0.45;

export function buildWeapon(weapon: Weapon, element: Element): THREE.Group {
  switch (weapon) {
    case "sword":
      return withGlow(
        group([
          [[box(0.05, 0.74, 0.008, 0.45), tip(0.05, 0.1, 0.008, 0.82)], steel()],
          [[rod(0.017, -0.09, 0.07)], dark()],
          [[box(0.22, 0.026, 0.036, 0.075), new THREE.SphereGeometry(0.027, 10, 8).translate(0, -0.1, 0)], gold()],
        ]),
        [box(0.085, 0.78, 0.03, 0.46), tip(0.085, 0.13, 0.03, 0.85)],
        element
      );
    case "katana":
      // Blade, the gold collar (habaki) at its foot, an iron guard (tsuba)
      // rimmed in gold, and a handle of black cord over white ray skin,
      // capped in gold.
      return withGlow(
        group([
          [curvedBlade(0.09, 0.7, 0.032, 0.05), bladeBody()],
          [curvedBlade(0.09, 0.7, 0.032, 0.05, "edge"), bladeEdge()],
          [[rod(0.0155, -0.17, 0.066, 10)], samegawa()],
          [wrapBands(-0.16, 0.06, 0.0172, 7), dark()],
          [[rod(0.044, 0.07, 0.08, 18)], iron()],
          [[rod(0.046, 0.073, 0.077, 18), box(0.022, 0.03, 0.014, 0.096, 0.004), rod(0.019, -0.185, -0.165, 10)], gold()],
        ]),
        curvedBlade(0.09, 0.7, 0.032, 0.05, "blade", 0.016),
        element
      );
    case "naginata":
      // A curved blade on a lacquered shaft: gold fittings at both ends, a
      // wrapped grip below the blade, and a metal butt cap.
      return withGlow(
        group([
          [curvedBlade(0.6, 0.42, 0.04, 0.06), bladeBody()],
          [curvedBlade(0.6, 0.42, 0.04, 0.06, "edge"), bladeEdge()],
          [[rod(0.016, -0.55, 0.57, 10)], lacquer()],
          [wrapBands(0.28, 0.52, 0.0185, 6), dark()],
          [[rod(0.021, 0.54, 0.6, 12), rod(0.019, 0.24, 0.27, 10), rod(0.019, -0.58, -0.53, 10), box(0.028, 0.034, 0.016, 0.618, 0.004)], gold()],
        ]),
        curvedBlade(0.6, 0.42, 0.04, 0.06, "blade", 0.018),
        element
      );
    case "scythe":
      // A long dark haft with two wrapped grips, an iron collar at the head,
      // and the blade sweeping out from it.
      return withGlow(
        group([
          [scytheBlade("blade"), darkSteel()],
          [scytheBlade("edge"), bladeEdge()],
          [[rod(0.017, -0.56, SCYTHE_TOP + 0.04, 10)], dark()],
          [[...wrapBands(-0.06, 0.12, 0.019, 4), ...wrapBands(-0.52, -0.36, 0.019, 4)], lacquer()],
          [[rod(0.024, SCYTHE_TOP - 0.05, SCYTHE_TOP + 0.05, 10), rod(0.02, -0.6, -0.55, 10)], iron()],
        ]),
        scytheBlade("blade", 0.018),
        element
      );
    case "lightsaber": {
      const color = new THREE.Color(ELEMENT_COLORS[element]);
      const core = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffffff").lerp(color, 0.25), toneMapped: false });
      const glow = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: SABER_HALO,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const out = group([
        [[rod(0.021, -0.13, 0.12, 12)], new THREE.MeshStandardMaterial({ color: "#c4c9d1", metalness: 0.35, roughness: 0.35 })],
        [[rod(0.024, -0.06, -0.02, 12), rod(0.024, 0.08, 0.12, 12)], dark()],
        [[rod(0.012, 0.12, 1.06, 8)], core],
      ]);
      const halo = new THREE.Mesh(rod(0.03, 0.12, 1.08, 8), glow);
      halo.userData.navIgnore = true;
      out.add(halo);
      out.userData.glow = glow;
      out.userData.saber = true;
      return out;
    }
    case "rod": {
      // A dark staff bound in bone, its head a small skull (looking +x, the
      // way the rod points a cast) under three prongs that cradle an orb of
      // its element, which glows as the meter fills.
      const bone = new THREE.MeshStandardMaterial({ color: "#d9d2bf", roughness: 0.8 });
      const orb = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffffff").lerp(new THREE.Color(ELEMENT_COLORS[element]), 0.6), toneMapped: false });
      const prongs = [0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return new THREE.ConeGeometry(0.009, 0.16, 5).translate(0, 0.08, 0).rotateZ(0.35).rotateY(a).translate(0, 0.95, 0);
      });
      const sockets = [-1, 1].map((s) => new THREE.SphereGeometry(0.014, 6, 4).translate(0.046, 0.905, s * 0.021));
      return withGlow(
        group([
          [[rod(0.018, -0.4, 0.86, 8), rod(0.026, -0.44, -0.38, 8)], new THREE.MeshStandardMaterial({ color: "#2e2018", roughness: 0.8 })],
          [[...wrapBands(-0.08, 0.12, 0.021, 3), new THREE.SphereGeometry(0.056, 12, 10).scale(1.05, 1.1, 1).translate(0, 0.9, 0), box(0.06, 0.03, 0.07, 0.85, 0.012), ...prongs], bone],
          [sockets, dark()],
          [[new THREE.SphereGeometry(0.045, 14, 10).translate(0, 1.06, 0)], orb],
        ]),
        [new THREE.SphereGeometry(0.11, 16, 12).translate(0, 1.06, 0)],
        element
      );
    }
    case "bow": {
      // Limbs bend away from the archer (+x is where the fingers point,
      // toward the target); the string runs tip to tip behind them, in two
      // halves that meet at the nock, so it can be drawn back (setBowString).
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.16, -0.66, 0), new THREE.Vector3(0.12, 0, 0), new THREE.Vector3(-0.16, 0.66, 0));
      const limbs = new THREE.TubeGeometry(curve, 16, 0.014, 6, false);
      const out = withGlow(
        group([
          [[limbs], wood()],
          [[rod(0.022, -0.07, 0.07)], dark()],
        ]),
        [new THREE.TubeGeometry(curve, 16, 0.03, 6, false)],
        element
      );
      // A unit length of string along +y, from its foot: stretched and
      // turned between a tip and the nock.
      const stringGeometry = new THREE.CylinderGeometry(0.0028, 0.0028, 1, 3).translate(0, 0.5, 0);
      const stringMaterial = new THREE.MeshBasicMaterial({ color: "#efe7d6" });
      const halves = [new THREE.Mesh(stringGeometry, stringMaterial), new THREE.Mesh(stringGeometry, stringMaterial)];
      // The arrow on the string while it's drawn: points along +x, its
      // tail at the nock.
      const arrow = new THREE.Group();
      const shaft = buildArrow();
      shaft.rotation.y = Math.PI / 2;
      shaft.position.x = 0.35;
      arrow.add(shaft);
      arrow.visible = false;
      for (const m of [...halves, arrow]) {
        m.userData.navIgnore = true;
        out.add(m);
      }
      out.userData.bow = { halves, arrow };
      setBowString(out, null, 0);
      return out;
    }
  }
}

const BOW_TIPS = [new THREE.Vector3(-0.16, 0.66, 0), new THREE.Vector3(-0.16, -0.66, 0)];
const NOCK_REST = new THREE.Vector3(-0.16, 0, 0);
const nock = new THREE.Vector3();
const span = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0);
const xAxis = new THREE.Vector3(1, 0, 0);

/**
 * Draws a bow's string back to `hand` (a point in the bow's own frame),
 * with an arrow on it, `draw` of the way; null lets it rest straight, tip
 * to tip. Cheap: two stretched cylinders and one moved arrow.
 */
export function setBowString(bow: THREE.Object3D, hand: THREE.Vector3 | null, draw: number) {
  const parts = bow.userData.bow as { halves: THREE.Mesh[]; arrow: THREE.Group } | undefined;
  if (!parts) return;
  nock.copy(NOCK_REST);
  if (hand && draw > 0) {
    // Behind the bow only, never past an archer's reach, and kept near the
    // bow's own plane.
    nock.set(Math.max(-0.95, Math.min(-0.16, hand.x)), THREE.MathUtils.clamp(hand.y, -0.12, 0.12), THREE.MathUtils.clamp(hand.z, -0.12, 0.12));
    nock.lerpVectors(NOCK_REST, nock, Math.min(1, draw));
  }
  parts.halves.forEach((half, i) => {
    span.subVectors(BOW_TIPS[i], nock);
    half.position.copy(nock);
    half.scale.set(1, span.length(), 1);
    half.quaternion.setFromUnitVectors(yAxis, span.normalize());
  });
  parts.arrow.visible = !!hand && draw > 0.05;
  if (parts.arrow.visible) {
    parts.arrow.position.copy(nock);
    // From the nock, through the grip, toward the target.
    parts.arrow.quaternion.setFromUnitVectors(xAxis, span.set(0.05, 0, 0).sub(nock).normalize());
  }
}

/** An arrow, pointing along +z. */
export function buildArrow(color?: string): THREE.Group {
  const shaft = new THREE.CylinderGeometry(0.006, 0.006, 0.7, 5).rotateX(Math.PI / 2);
  const head = new THREE.ConeGeometry(0.016, 0.06, 6).rotateX(Math.PI / 2).translate(0, 0, 0.38);
  const fletch = new THREE.BoxGeometry(0.03, 0.002, 0.09).translate(0, 0, -0.3);
  const fletch2 = new THREE.BoxGeometry(0.002, 0.03, 0.09).translate(0, 0, -0.3);
  return group([
    [[shaft], wood()],
    [[head], color ? new THREE.MeshBasicMaterial({ color, toneMapped: false }) : steel()],
    [[fletch, fletch2], new THREE.MeshStandardMaterial({ color: "#f2efe6", roughness: 0.9 })],
  ]);
}
