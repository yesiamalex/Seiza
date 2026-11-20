import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const WEAPONS = ["sword", "katana", "naginata", "lightsaber", "bow"] as const;
export type Weapon = (typeof WEAPONS)[number];
/** What a special attack carries. Also a lightsaber's colour. */
export const ELEMENTS = ["lightning", "fire", "ice"] as const;
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
}

/**
 * Balanced as trade-offs rather than a ladder: the blades all deal about
 * the same damage a second to one opponent (about 25), and each buys
 * something with the rest. The sword is the all-rounder; the katana cuts
 * hardest but slowest, one at a time; the naginata reaches furthest and
 * sweeps three, for less each; the light saber is light and fast; the bow
 * hits from forty metres but slowly. Specials follow suit: the katana's
 * hits hardest in a small blast, the naginata's widest and softest.
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
    reach: 3.0, damage: 9, cooldown: 0.55, targets: 3, special: 26, specialRadius: 4.8, otherHand: 0.38, blade: [0.55, 1.0],
  },
  lightsaber: {
    label: ["Light saber", "ライトセーバー"],
    note: ["Fastest: 7 a hit, nearly four a second. Takes your element's colour.", "最速:1撃7、毎秒約4回。属性の色に光ります。"],
    reach: 2.3, damage: 7, cooldown: 0.28, targets: 2, special: 28, specialRadius: 3.5, otherHand: 0.09, blade: [0.14, 1.06],
  },
  bow: {
    label: ["Bow", "弓"],
    note: ["Range: 12 a hit up to 40 m away, but slow. Special bursts where it lands.", "遠距離:40m先まで1撃12、ただし遅い。必殺技は着弾点で炸裂。"],
    reach: 40, damage: 12, cooldown: 0.8, targets: 1, special: 24, specialRadius: 3, otherHand: null, blade: [0, 0],
  },
};

export const ELEMENT_COLORS: Record<Element, string> = { lightning: "#7fc8ff", fire: "#ff5a36", ice: "#9ff4ff" };
export const ELEMENT_LABELS: Record<Element, [string, string]> = {
  lightning: ["Lightning", "雷"],
  fire: ["Fire", "炎"],
  ice: ["Ice", "氷"],
};

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

/** A curved blade from straight segments, bending toward the back (-x). */
function curvedBlade(from: number, length: number, width: number, bend: number, segments = 4) {
  const parts: THREE.BufferGeometry[] = [];
  const step = length / segments;
  for (let i = 0; i < segments; i++) {
    const s = (i + 0.5) / segments;
    parts.push(box(width * (1 - 0.25 * s), step * 1.04, 0.007, from + step * (i + 0.5), -bend * s * s, bend * 1.6 * s / segments));
  }
  parts.push(tip(width * 0.75, 0.07, 0.007, from + length, -bend));
  return parts;
}

export function buildWeapon(weapon: Weapon, element: Element): THREE.Group {
  switch (weapon) {
    case "sword":
      return group([
        [[box(0.05, 0.74, 0.008, 0.45), tip(0.05, 0.1, 0.008, 0.82)], steel()],
        [[rod(0.017, -0.09, 0.07)], dark()],
        [[box(0.22, 0.026, 0.036, 0.075), new THREE.SphereGeometry(0.027, 10, 8).translate(0, -0.1, 0)], gold()],
      ]);
    case "katana":
      return group([
        [curvedBlade(0.09, 0.7, 0.032, 0.05), steel()],
        [[rod(0.016, -0.17, 0.07)], dark()],
        [[rod(0.045, 0.072, 0.084, 14), rod(0.018, 0.084, 0.1)], gold()],
      ]);
    case "naginata":
      return group([
        [curvedBlade(0.6, 0.42, 0.04, 0.06, 3), steel()],
        [[rod(0.016, -0.95, 0.57)], wood()],
        [[rod(0.021, 0.54, 0.6), rod(0.019, -0.98, -0.93)], gold()],
      ]);
    case "lightsaber": {
      const color = new THREE.Color(ELEMENT_COLORS[element]);
      const core = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffffff").lerp(color, 0.25), toneMapped: false });
      const glow = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.45,
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
      return out;
    }
    case "bow": {
      // Limbs bend away from the archer (+x is where the fingers point,
      // toward the target); the string runs tip to tip behind them.
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.16, -0.66, 0), new THREE.Vector3(0.12, 0, 0), new THREE.Vector3(-0.16, 0.66, 0));
      const limbs = new THREE.TubeGeometry(curve, 16, 0.014, 6, false);
      const string = new THREE.CylinderGeometry(0.0025, 0.0025, 1.3, 3).translate(-0.16, 0, 0);
      return group([
        [[limbs], wood()],
        [[rod(0.022, -0.07, 0.07)], dark()],
        [[string], new THREE.MeshBasicMaterial({ color: "#efe7d6" })],
      ]);
    }
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
