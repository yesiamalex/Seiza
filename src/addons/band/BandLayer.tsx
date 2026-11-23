import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BodyRig } from "../../xr/body/bodyIk";
import { sharedOverlay, type PoseOverlay } from "../../xr/body/bodyIk";
import { LOCAL_TRACKING_SOURCE, trackingStore } from "../../xr/body/trackingStore";
import { TRACKING_STALE_MS, type TrackedHand } from "../../xr/body/trackingWire";
import type { PlayerState } from "../../multiplayer/types";
import { getAddonAvatar, LOCAL_AVATAR } from "../avatars";
import { blendBody, carryHand, copyBody, Gait, newBodyPose, poseBody, type BodyPose } from "../body";
import { onAddonEvent, sendAddonEvent } from "../bus";
import { disposeTree, feetAndEye, holdInHand, newTrackedHand, pointHeld, poseHands, rigFor, toTrackedHand, wearOnChest, type HandTarget } from "../rig";
import { announceBand, atOnce, band, localNote, musicianOf, NoteGate, parseBandEvent, play, remoteMusicians, resetBand, tapped, validNote } from "./band";
import { CHORDS, chordOf, ELECTRIC, GONGS, holdKey, isWorn, KEY_LAYOUT, KEYS_BASE, KIT, LIGHT_COLORS, PICK_BASE, playNote, prepareGuitar, TAIKO, type Instrument, type Worn } from "./instruments";
import { bandBody, updateGroove, type Groove } from "./moves";
import { buzz } from "../../xr/controls";

/** Keys others are holding down, each with its release, by "player:note". */
const remoteHeld = new Map<string, () => void>();
/** Each player's notes, kept to what they may sound at once (atOnce). */
const remoteGates = new Map<string, NoteGate>();

/**
 * Band mode in the scene: each musician's instrument in front of them (a
 * drum pad, a keyboard, a drum kit they sit at) or on them (a guitar, a
 * lead guitar, a bass, a light stick), hands that play the notes they
 * play, a body that moves to them, light sticks swaying overhead in time
 * with everyone else's, and in VR, instruments you play by touch.
 *
 * The stands (pad, keyboard, kit) are drawn in the avatar's own frame scaled
 * by its eye height, the same frame the arm IK takes targets in, so a key's
 * or a drum's position is also where the hand goes to play it.
 */

// --- the stands, in eye heights: x right, y up, z back -------------------------

const DESK_Y = 0.6;
const DESK_Z = -0.3;
const PAD_TOP = DESK_Y + 0.02;
/** Pad centres, back row (further away) first. */
const padAt = (pad: number): [number, number] => [-0.135 + (pad % 4) * 0.09, DESK_Z + (pad < 4 ? -0.045 : 0.045)];
const WHITE_KEY = 0.052;
/** Where each key sits along the keyboard, in white keys, C up to the F
 *  above the next C. */
const KEY_SLOTS = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 7.5, 8, 8.5, 9, 10];
const KEYBOARD_WIDTH = (KEY_SLOTS[KEY_SLOTS.length - 1] + 1) * WHITE_KEY;
const keyX = (semitone: number) => -KEYBOARD_WIDTH / 2 + (KEY_SLOTS[semitone] + 0.5) * WHITE_KEY;
/** Which key a note is on a keyboard set `octave` octaves from middle C:
 *  someone else's octave isn't sent, so out of range it's the same note
 *  in the octave shown. */
const keyOf = (note: number, octave: number) => {
  const k = note - KEYS_BASE - octave * 12;
  return k >= 0 && k < KEY_SLOTS.length ? k : (((note - KEYS_BASE) % 12) + 12) % 12;
};

const material = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

function merged(parts: THREE.BufferGeometry[], mat: THREE.Material) {
  const geometry = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  for (const g of parts) g.dispose();
  const mesh = new THREE.Mesh(geometry ?? new THREE.BufferGeometry(), mat);
  mesh.userData.navIgnore = true;
  return mesh;
}
const boxAt = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const legAt = (x: number, z: number, top: number) => new THREE.CylinderGeometry(0.008, 0.008, top, 6).translate(x, top / 2, z);
const discAt = (r: number, h: number, x: number, y: number, z: number, tilt = 0) => new THREE.CylinderGeometry(r, r, h, 24).rotateX(tilt).translate(x, y, z);

function buildDrumPad() {
  const group = new THREE.Group();
  group.add(merged([boxAt(0.38, 0.03, 0.2, 0, DESK_Y, DESK_Z), legAt(0, DESK_Z, DESK_Y), boxAt(0.16, 0.008, 0.16, 0, 0.004, DESK_Z)], material("#1c1d22", { metalness: 0.4 })));
  const pads = Array.from({ length: 8 }, (_, i) => {
    const [x, z] = padAt(i);
    return boxAt(0.078, 0.01, 0.075, x, PAD_TOP - 0.003, z);
  });
  group.add(merged(pads, material("#7d8392", { roughness: 0.9 })));
  return group;
}

export function buildKeyboard() {
  const group = new THREE.Group();
  const half = KEYBOARD_WIDTH / 2;
  group.add(merged([boxAt(KEYBOARD_WIDTH + 0.03, 0.035, 0.15, 0, DESK_Y, DESK_Z), legAt(-half + 0.05, DESK_Z, DESK_Y), legAt(half - 0.05, DESK_Z, DESK_Y)], material("#16171b", { metalness: 0.3 })));
  const whites: THREE.BufferGeometry[] = [];
  const blacks: THREE.BufferGeometry[] = [];
  for (const { semitone, black } of KEY_LAYOUT) {
    if (black) blacks.push(boxAt(WHITE_KEY * 0.55, 0.016, 0.06, keyX(semitone), PAD_TOP + 0.004, DESK_Z - 0.03));
    else whites.push(boxAt(WHITE_KEY * 0.92, 0.012, 0.11, keyX(semitone), PAD_TOP - 0.004, DESK_Z + 0.005));
  }
  group.add(merged(whites, material("#f4f2ec", { roughness: 0.4 })), merged(blacks, material("#121212", { roughness: 0.4 })));
  return group;
}

// --- the drum kit -------------------------------------------------------------------
// A full kit round a seated drummer, at a seated drummer's height: the kick
// in front with its pedal under the right foot, the snare between the
// knees, the hi-hat to the left with its pedal under the left foot, two
// toms on the kick with a cowbell, a floor tom on the right, a crash high
// left, a splash over the toms, a ride and a china high right. The right
// hand crosses over to the hats, as most drummers' does.

export interface Piece {
  at: [number, number, number];
  r: number;
  /** A drum's shell depth; a cymbal's is 0. */
  depth: number;
  /** Which hand plays it; the kick is the right foot's. */
  hand: "left" | "right" | "foot";
  /** A tilt toward the drummer, radians. */
  tilt: number;
  /** How steeply the stick comes down onto it, if not a drum's or a cymbal's. */
  pitch?: number;
}

export const KIT_PIECES_AT: Record<number, Piece> = {
  [KIT.crash]: { at: [-0.36, 0.7, -0.48], r: 0.14, depth: 0, hand: "left", tilt: 0.3 },
  [KIT.hiTom]: { at: [-0.1, 0.49, -0.52], r: 0.075, depth: 0.065, hand: "left", tilt: 0.35 },
  [KIT.midTom]: { at: [0.09, 0.49, -0.52], r: 0.085, depth: 0.075, hand: "right", tilt: 0.35 },
  [KIT.floorTom]: { at: [0.3, 0.36, -0.34], r: 0.11, depth: 0.15, hand: "right", tilt: 0.05 },
  [KIT.ride]: { at: [0.42, 0.58, -0.44], r: 0.16, depth: 0, hand: "right", tilt: 0.25 },
  [KIT.kick]: { at: [0, 0.17, -0.56], r: 0.17, depth: 0.24, hand: "foot", tilt: 0 },
  [KIT.snare]: { at: [-0.09, 0.41, -0.36], r: 0.095, depth: 0.05, hand: "left", tilt: 0.1 },
  [KIT.hat]: { at: [-0.31, 0.5, -0.32], r: 0.1, depth: 0, hand: "right", tilt: 0 },
  [KIT.openHat]: { at: [-0.31, 0.5, -0.32], r: 0.1, depth: 0, hand: "right", tilt: 0 },
  [KIT.rim]: { at: [-0.09, 0.41, -0.36], r: 0.095, depth: 0.05, hand: "left", tilt: 0.1 },
  [KIT.splash]: { at: [-0.04, 0.7, -0.6], r: 0.075, depth: 0, hand: "left", tilt: 0.3 },
  [KIT.china]: { at: [0.5, 0.72, -0.24], r: 0.13, depth: 0, hand: "right", tilt: -0.15 },
  [KIT.cowbell]: { at: [0.2, 0.45, -0.56], r: 0.03, depth: 0.06, hand: "right", tilt: 0.4 },
};
const pieceTop = (p: Piece) => p.at[1] + p.depth / 2;
const THRONE = { at: [0, 0.3, 0.06] as [number, number, number], r: 0.12 };
/** Pieces drawn as another's (open hat, rim) or on another's mount. */
const DRAWN_AS: Partial<Record<number, number>> = { [KIT.openHat]: KIT.hat, [KIT.rim]: KIT.snare };

export function buildKit() {
  const group = new THREE.Group();
  const shell = material("#7a1f2b", { roughness: 0.35, metalness: 0.15 });
  const head = material("#f1ede4", { roughness: 0.8 });
  const brass = material("#d7b25a", { roughness: 0.3, metalness: 0.6 });
  const dark = material("#9a7a3a", { roughness: 0.45, metalness: 0.6 });
  const chrome = material("#b9bec6", { roughness: 0.3, metalness: 0.7 });
  const seat = material("#1a1a1c", { roughness: 0.7 });
  const stands: THREE.BufferGeometry[] = [];
  for (const [index, piece] of Object.entries(KIT_PIECES_AT)) {
    const n = Number(index);
    if (DRAWN_AS[n] !== undefined) continue;
    const [x, y, z] = piece.at;
    const parts = new THREE.Group();
    parts.userData.piece = n;
    if (n === KIT.kick) {
      // On its side, facing the drummer.
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(piece.r, piece.r, piece.depth, 28).rotateX(Math.PI / 2).translate(x, y, z), shell);
      const face = new THREE.Mesh(new THREE.CircleGeometry(piece.r * 0.96, 28).translate(x, y, z + piece.depth / 2 + 0.002), head);
      parts.add(drum, face);
      stands.push(boxAt(0.05, 0.015, 0.12, x + 0.08, 0.01, z + piece.depth / 2 + 0.1));
    } else if (n === KIT.cowbell) {
      // A bell, mouth to the drummer, on the toms' mount.
      parts.add(new THREE.Mesh(new THREE.CylinderGeometry(piece.r * 0.6, piece.r, piece.depth, 4).rotateY(Math.PI / 4).rotateX(piece.tilt).translate(x, y, z), chrome));
    } else if (piece.depth > 0) {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(piece.r, piece.r, piece.depth, 24).rotateX(piece.tilt).translate(x, y, z), shell);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(piece.r * 0.97, piece.r * 0.97, 0.004, 24).translate(0, piece.depth / 2 + 0.002, 0).rotateX(piece.tilt).translate(x, y, z), head);
      parts.add(drum, top);
      if (n !== KIT.hiTom && n !== KIT.midTom) stands.push(legAt(x, z, y - piece.depth / 2));
      else stands.push(new THREE.CylinderGeometry(0.008, 0.008, y - 0.3, 6).translate(x * 0.6, (y + 0.3) / 2 - 0.02, z + 0.02));
    } else {
      // A china's darker and upturned; the rest a flat disc with a bell.
      const cymbal = new THREE.Mesh(
        mergeGeometries([discAt(piece.r, 0.006, 0, 0, 0), discAt(piece.r * 0.22, 0.02, 0, 0.008, 0)]).rotateX(piece.tilt).translate(x, y, z),
        n === KIT.china ? dark : brass
      );
      parts.add(cymbal);
      if (n === KIT.hat) parts.add(new THREE.Mesh(discAt(piece.r, 0.006, x, y - 0.03, z), brass));
      stands.push(legAt(x, z, y - 0.01));
    }
    for (const mesh of parts.children) mesh.userData.navIgnore = true;
    group.add(parts);
  }
  group.add(merged(stands, chrome));
  group.add(merged([new THREE.CylinderGeometry(THRONE.r, THRONE.r, 0.05, 20).translate(THRONE.at[0], THRONE.at[1], THRONE.at[2]), legAt(THRONE.at[0], THRONE.at[2], THRONE.at[1])], seat));
  return group;
}

// --- the kulintang and the taiko: played standing, with a stick in each hand --------

/** The kulintang's eight gongs in a row on their frame, low gongs left. */
const GONG_R = 0.05;
export const GONGS_AT: Record<number, Piece> = Object.fromEntries(
  GONGS.map((_, i) => {
    const x = (i - 3.5) * 0.105;
    return [i, { at: [x, 0.53, -0.36], r: GONG_R, depth: 0.03, hand: x < 0 ? "left" : "right", tilt: 0 } satisfies Piece];
  })
);

/** The taiko on a slanted stand, its face tilted toward the player: the
 *  face's middle (don) for either hand, its rim (ka) either side. */
const TAIKO_FACE = { at: [0, 0.58, -0.42] as [number, number, number], r: 0.2, tilt: 0.35, length: 0.34 };
const facePoint = (x: number): [number, number, number] => [x, TAIKO_FACE.at[1], TAIKO_FACE.at[2]];
export const TAIKO_AT: Record<number, Piece> = {
  // Struck from above, the bachi coming down steeply onto the tilted face.
  [TAIKO.kaLeft]: { at: facePoint(-0.185), r: 0.035, depth: 0.002, hand: "left", tilt: 0, pitch: 0.8 },
  [TAIKO.donLeft]: { at: facePoint(-0.065), r: 0.075, depth: 0.002, hand: "left", tilt: 0, pitch: 0.8 },
  [TAIKO.donRight]: { at: facePoint(0.065), r: 0.075, depth: 0.002, hand: "right", tilt: 0, pitch: 0.8 },
  [TAIKO.kaRight]: { at: facePoint(0.185), r: 0.035, depth: 0.002, hand: "right", tilt: 0, pitch: 0.8 },
};

/** The instruments played with a stick in each hand: their pieces, where
 *  each hand rests, and the sticks. */
interface StickSet {
  pieces: Record<number, Piece>;
  rest: { left: number; right: number };
  stick: StickKind;
}
const STICK_SETS: Partial<Record<Instrument, StickSet>> = {
  kit: { pieces: KIT_PIECES_AT, rest: { left: KIT.snare, right: KIT.hat }, stick: "stick" },
  kulintang: { pieces: GONGS_AT, rest: { left: 2, right: 5 }, stick: "mallet" },
  taiko: { pieces: TAIKO_AT, rest: { left: TAIKO.donLeft, right: TAIKO.donRight }, stick: "bachi" },
};

export function buildKulintang() {
  const group = new THREE.Group();
  const wood = material("#6b3f22", { roughness: 0.7 });
  const bronze = material("#e0b04f", { roughness: 0.3, metalness: 0.5 });
  const xs = Object.values(GONGS_AT).map((g) => g.at[0]);
  const half = (Math.max(...xs) - Math.min(...xs)) / 2 + GONG_R * 1.6;
  const [, y, z] = GONGS_AT[0].at;
  const frameY = y - 0.03;
  // The frame (an antangan): two rails the gongs rest on, cords between, on legs.
  group.add(
    merged(
      [
        boxAt(half * 2, 0.02, 0.012, 0, frameY, z - GONG_R * 0.7),
        boxAt(half * 2, 0.02, 0.012, 0, frameY, z + GONG_R * 0.7),
        boxAt(0.02, 0.03, GONG_R * 2.2, -half, frameY, z),
        boxAt(0.02, 0.03, GONG_R * 2.2, half, frameY, z),
        legAt(-half + 0.02, z, frameY),
        legAt(half - 0.02, z, frameY),
      ],
      wood
    )
  );
  for (const [index, gong] of Object.entries(GONGS_AT)) {
    const [gx, gy, gz] = gong.at;
    const parts = new THREE.Group();
    parts.userData.piece = Number(index);
    // A shallow bowl, mouth down, with its boss on top: the boss is struck.
    parts.add(
      new THREE.Mesh(
        mergeGeometries([
          new THREE.CylinderGeometry(gong.r * 0.9, gong.r, gong.depth, 20).translate(gx, gy, gz),
          new THREE.SphereGeometry(gong.r * 0.36, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(gx, gy + gong.depth / 2, gz),
        ]),
        bronze
      )
    );
    for (const mesh of parts.children) mesh.userData.navIgnore = true;
    group.add(parts);
  }
  return group;
}

export function buildTaiko() {
  const group = new THREE.Group();
  const { at, r, tilt, length } = TAIKO_FACE;
  // The barrel bulges at its middle, as a taiko's does.
  const profile = Array.from({ length: 9 }, (_, i) => {
    const u = i / 8;
    return new THREE.Vector2(r * (1 + 0.14 * Math.sin(u * Math.PI)), (u - 1) * length);
  });
  // Its axis tilted toward the player, the face at `at`.
  const place = (g: THREE.BufferGeometry) => g.rotateX(tilt).translate(at[0], at[1], at[2]);
  const barrel = new THREE.Mesh(place(new THREE.LatheGeometry(profile, 28)), material("#7a3b1c", { roughness: 0.45, metalness: 0.05, side: THREE.DoubleSide }));
  const heads = new THREE.Mesh(
    mergeGeometries([place(new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.006, 28)), place(new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.006, 28).translate(0, -length, 0))]),
    material("#e9dcc0", { roughness: 0.85 })
  );
  // A ring of tacks round each face.
  const tacks: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    for (const y of [-0.012, -length + 0.012]) tacks.push(place(new THREE.SphereGeometry(0.006, 5, 4).translate(Math.cos(a) * r * 1.02, y, Math.sin(a) * r * 1.02)));
  }
  const stand = [
    // A slanted wooden stand: two feet, two posts up to the barrel.
    boxAt(0.04, 0.03, 0.5, -r * 0.8, 0.015, at[2] - 0.12),
    boxAt(0.04, 0.03, 0.5, r * 0.8, 0.015, at[2] - 0.12),
    boxAt(0.035, at[1] - 0.12, 0.035, -r * 0.9, (at[1] - 0.12) / 2, at[2] - 0.2),
    boxAt(0.035, at[1] - 0.12, 0.035, r * 0.9, (at[1] - 0.12) / 2, at[2] - 0.2),
  ];
  for (const mesh of [barrel, heads]) mesh.userData.navIgnore = true;
  group.add(barrel, heads, merged(tacks, material("#2a2522", { metalness: 0.5, roughness: 0.4 })), merged(stand, material("#3a2414", { roughness: 0.75 })));
  return group;
}

type StickKind = "stick" | "mallet" | "bachi";

/** A drumstick, a kulintang's padded mallet, or a taiko's thick bachi,
 *  along +y from the grip, all the same length. */
export function buildStick(kind: StickKind = "stick") {
  const group = new THREE.Group();
  if (kind === "bachi") group.add(merged([new THREE.CylinderGeometry(0.011, 0.013, 0.4, 8).translate(0, 0.12, 0)], material("#e2c896", { roughness: 0.6 })));
  else group.add(merged([new THREE.CylinderGeometry(0.006, 0.009, 0.4, 6).translate(0, 0.12, 0), new THREE.SphereGeometry(0.009, 6, 4).translate(0, 0.32, 0)], material("#d9b98a", { roughness: 0.6 })));
  // A mallet's head, wrapped in cloth.
  if (kind === "mallet") group.add(merged([new THREE.SphereGeometry(0.018, 10, 8).scale(1, 1.3, 1).translate(0, 0.32, 0)], material("#7a2230", { roughness: 0.9 })));
  return group;
}

/** A shaker: an egg-shaped shell of seeds, held in the right hand. */
export function buildShaker() {
  const group = new THREE.Group();
  group.add(merged([new THREE.SphereGeometry(0.028, 14, 10).scale(1, 1.6, 1).translate(0, 0.06, 0)], material("#e0a526", { roughness: 0.45 })));
  group.add(merged([new THREE.CylinderGeometry(0.029, 0.029, 0.012, 14).translate(0, 0.06, 0)], material("#b2341c", { roughness: 0.5 })));
  return group;
}

// --- the worn instruments: guitar, lead guitar, bass ----------------------------

/** In metres, on the chest: x right, y up, z behind (-z out of the chest). */
const GUITAR_BODY = new THREE.Vector3(0.03, -0.27, -0.13);
const NECK = new THREE.Vector3(-0.88, 0.47, -0.04).normalize();
const NECK_FROM = 0.15;
/** Worn the way players wear one: the body back against the right hip and
 *  low, the neck forward to the left. Square on to the chest and high, the
 *  strumming forearm went through its face. */
const WORN_TURN = -0.38;
const WORN_DROP = -0.07;
/** Along the neck from the body's middle to a note zone's centre: zone 0
 *  at the nut, where the open chords are, as on a real neck. */
const zoneAlong = (spec: WornSpec, zone: number) => NECK_FROM + (1 - ((zone % spec.zones) + 0.5) / spec.zones) * spec.length;
const NECK_ANGLE = Math.atan2(NECK.y, NECK.x) - Math.PI / 2;

interface WornSpec {
  body: string;
  neck: string;
  guard: string;
  /** Neck length from the body, metres, and how many note zones along it. */
  length: number;
  zones: number;
  /** A solid body (lead guitar, bass) is thinner, with horns. */
  solid: boolean;
}

const WORN_SPECS: Record<Worn, WornSpec> = {
  guitar: { body: "#c0452c", neck: "#3b2618", guard: "#111111", length: 0.55, zones: CHORDS.length, solid: false },
  electric: { body: "#141414", neck: "#4a3020", guard: "#f2f0eb", length: 0.55, zones: ELECTRIC.length, solid: true },
  bass: { body: "#2f5fa8", neck: "#4a3020", guard: "#f2f0eb", length: 0.72, zones: CHORDS.length, solid: true },
};

export function buildWorn(kind: Worn) {
  const spec = WORN_SPECS[kind];
  const group = new THREE.Group();
  const depth = spec.solid ? 0.045 : 0.08;
  const b = GUITAR_BODY;
  const shape = [
    new THREE.CylinderGeometry(0.16, 0.16, depth, 20).rotateX(Math.PI / 2).scale(1, 1.05, 1).translate(b.x + 0.03, b.y - 0.05, b.z),
    new THREE.CylinderGeometry(0.12, 0.12, depth, 18).rotateX(Math.PI / 2).translate(b.x - 0.09, b.y + 0.08, b.z),
  ];
  if (spec.solid) {
    // The two horns either side of the neck, swept along it.
    const horn = (r: number, x: number, y: number) =>
      new THREE.CylinderGeometry(r, r, depth, 14).rotateX(Math.PI / 2).scale(1, 2.4, 1).rotateZ(NECK_ANGLE + 0.15).translate(b.x + x, b.y + y, b.z);
    shape.push(horn(0.05, -0.15, 0.13), horn(0.04, -0.01, 0.16));
  }
  group.add(merged(shape, material(spec.body, { roughness: 0.3, metalness: spec.solid ? 0.2 : 0.1 })));
  const neckMid = b.clone().addScaledVector(NECK, NECK_FROM + spec.length / 2);
  const headAt = b.clone().addScaledVector(NECK, NECK_FROM + spec.length + 0.07);
  const neck = new THREE.BoxGeometry(kind === "bass" ? 0.055 : 0.05, spec.length, 0.025).rotateZ(NECK_ANGLE).translate(neckMid.x, neckMid.y, neckMid.z - 0.02);
  const headstock = new THREE.BoxGeometry(0.07, 0.15, 0.022).rotateZ(NECK_ANGLE).translate(headAt.x, headAt.y, headAt.z - 0.02);
  group.add(merged([neck, headstock], material(spec.neck)));
  // Frets marking the note zones a tap picks (see zoneOnNeck).
  const frets = Array.from({ length: spec.zones + 1 }, (_, k) => {
    const at = b.clone().addScaledVector(NECK, NECK_FROM + (k / spec.zones) * spec.length);
    return new THREE.BoxGeometry(0.052, 0.004, 0.004).rotateZ(NECK_ANGLE).translate(at.x, at.y, at.z - 0.034);
  });
  group.add(merged(frets, material("#d8d2c4", { metalness: 0.4, roughness: 0.4 })));
  const face = b.z - depth / 2;
  // An acoustic's sound hole; a solid body's long scratchplate under the strings.
  const guard = spec.solid
    ? new THREE.CylinderGeometry(0.06, 0.06, 0.004, 18).rotateX(Math.PI / 2).scale(2, 0.85, 1).rotateZ(NECK_ANGLE + 1.2).translate(b.x + 0.06, b.y - 0.02, face - 0.002)
    : new THREE.CylinderGeometry(0.045, 0.045, 0.004, 16).rotateX(Math.PI / 2).translate(b.x - 0.05, b.y + 0.02, face - 0.002);
  group.add(merged([guard], material(spec.guard, { roughness: 0.4 })));
  if (spec.solid) {
    // Pickups and a bridge, across the strings.
    const across = (w: number, h: number, along: number) => {
      const at = b.clone().addScaledVector(NECK, along);
      return new THREE.BoxGeometry(w, h, 0.01).rotateZ(NECK_ANGLE).translate(at.x, at.y, face - 0.007);
    };
    const hardware = [across(0.075, 0.024, 0.05), across(0.075, 0.024, -0.02), across(0.06, 0.014, -0.1)];
    group.add(merged(hardware, material("#c9ccd1", { metalness: 0.8, roughness: 0.3 })));
  }
  // The strings, bridge to nut: four on a bass, six on a guitar.
  const count = kind === "bass" ? 4 : 6;
  const from = spec.solid ? -0.1 : -0.12;
  const to = NECK_FROM + spec.length;
  const mid = b.clone().addScaledVector(NECK, (from + to) / 2);
  const across = new THREE.Vector3(NECK.y, -NECK.x, 0);
  const strings = Array.from({ length: count }, (_, k) => {
    const at = mid.clone().addScaledVector(across, (k / (count - 1) - 0.5) * 0.036);
    return new THREE.BoxGeometry(kind === "bass" ? 0.0022 : 0.0014, to - from, 0.0014).rotateZ(NECK_ANGLE).translate(at.x, at.y, b.z - 0.037);
  });
  group.add(merged(strings, material("#e9e4da", { metalness: 0.6, roughness: 0.35 })));
  group.rotation.y = WORN_TURN;
  group.position.y = WORN_DROP;
  return group;
}

/** Which note zone a point on a worn instrument's neck picks; on the body,
 *  null (play the last again). `local` is in the instrument's own metres. */
function zoneOnNeck(kind: Worn, local: THREE.Vector3): number | null {
  const spec = WORN_SPECS[kind];
  const along = local.clone().sub(GUITAR_BODY).dot(NECK);
  if (along < NECK_FROM - 0.02) return null;
  return Math.max(0, Math.min(spec.zones - 1, Math.floor((1 - (along - NECK_FROM) / spec.length) * spec.zones)));
}

/** Where a note is on its instrument, in the instrument's own frame, and
 *  how big a patch to light there. */
function noteSpot(instrument: Instrument, note: number, octave: number): { at: THREE.Vector3; size: [number, number, number]; tilt: number } | null {
  if (instrument === "drums") {
    const [x, z] = padAt(note);
    return { at: new THREE.Vector3(x, PAD_TOP + 0.004, z), size: [0.078, 0.004, 0.075], tilt: 0 };
  }
  if (instrument === "keys") {
    const semitone = keyOf(note, octave);
    const black = KEY_LAYOUT[semitone]?.black;
    return black
      ? { at: new THREE.Vector3(keyX(semitone), PAD_TOP + 0.014, DESK_Z - 0.03), size: [WHITE_KEY * 0.55, 0.004, 0.06], tilt: 0 }
      : { at: new THREE.Vector3(keyX(semitone), PAD_TOP + 0.004, DESK_Z + 0.005), size: [WHITE_KEY * 0.92, 0.004, 0.11], tilt: 0 };
  }
  const set = STICK_SETS[instrument];
  if (set) {
    const piece = set.pieces[note];
    if (!piece || piece.hand === "foot") return null;
    return { at: new THREE.Vector3(piece.at[0], pieceTop(piece) + 0.006, piece.at[2]), size: [piece.r * 1.8, 0.004, piece.r * 1.8], tilt: 0 };
  }
  if (isWorn(instrument)) {
    const spec = WORN_SPECS[instrument];
    const at = GUITAR_BODY.clone().addScaledVector(NECK, zoneAlong(spec, chordOf(note)));
    at.z -= 0.036;
    return { at, size: [0.054, spec.length / spec.zones, 0.004], tilt: NECK_ANGLE };
  }
  return null;
}

const FLASH_SECONDS = 0.18;

/** A patch of light over the pad, key, drum, or fret just played, seen by
 *  everyone; unlit and additive, so it costs nothing to light. */
function buildFlash() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: "#d9c4ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  );
  mesh.userData.navIgnore = true;
  mesh.visible = false;
  return mesh;
}

let halo: THREE.Texture | null = null;
function haloTexture() {
  if (halo || typeof document === "undefined") return halo;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.35, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  halo = new THREE.CanvasTexture(canvas);
  return halo;
}

/** Unlit and additive: it glows without being a light, at no cost. */
export function buildLightStick(color: string) {
  const group = new THREE.Group();
  group.add(merged([new THREE.CylinderGeometry(0.017, 0.019, 0.13, 10)], material("#202228", { metalness: 0.5 })));
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.28, 10).translate(0, 0.205, 0), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  tube.userData.navIgnore = true;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  glow.scale.set(0.22, 0.42, 1);
  glow.position.y = 0.21;
  group.add(tube, glow);
  return group;
}

// --- posing --------------------------------------------------------------------

const target = (): HandTarget => ({ pos: [0, 0, 0], blade: [0, 1, 0], fingers: [0, 0, -1], curl: 0.35 });
const set = (t: HandTarget, pos: [number, number, number], blade: [number, number, number], fingers: [number, number, number], curl: number) => {
  t.pos[0] = pos[0];
  t.pos[1] = pos[1];
  t.pos[2] = pos[2];
  t.blade[0] = blade[0];
  t.blade[1] = blade[1];
  t.blade[2] = blade[2];
  t.fingers[0] = fingers[0];
  t.fingers[1] = fingers[1];
  t.fingers[2] = fingers[2];
  t.curl = curl;
};

/** How high a playing hand is over the keys: down for a note, then back. */
function lift(note: { at: number } | null, now: number, height = 0.05) {
  const age = note ? now - note.at : 1;
  if (age < 0.05) return height * (1 - age / 0.05);
  if (age < 0.2) return height * ((age - 0.05) / 0.15);
  return height;
}

export interface Hands {
  right: HandTarget;
  left: HandTarget;
  /** Where each hand last played along the desk, so the idle one stays. */
  lastX: { left: number; right: number };
  /** Which hand played the last note. */
  last: "left" | "right";
  /** The kit piece each hand last struck. */
  lastPiece: { left: number; right: number };
  /** How far back on the desk each hand last played (the pads' back row). */
  lastZ: { left: number; right: number };
  /** When each hand last struck, so two notes at once bring both down. */
  hitAt: { left: number; right: number };
  /** The newest note already handed to a hand. */
  seen: number;
}

export const newHands = (): Hands => ({
  right: target(),
  left: target(),
  lastX: { left: -0.1, right: 0.1 },
  last: "right",
  lastPiece: { left: KIT.snare, right: KIT.hat },
  lastZ: { left: DESK_Z, right: DESK_Z },
  hitAt: { left: -Infinity, right: -Infinity },
  seen: -Infinity,
});

type Note = { n: number; at: number } | null;
/** Notes closer together than this are played together, a hand each. */
const TOGETHER = 0.08;

/**
 * Hands each new note of the last two to a hand: the one on its side, or
 * the other if that one struck a moment ago (two at once: a kick and a
 * snare, a crash and a hat). `side` picks a note's own hand, or null for
 * none (the kick's a foot).
 */
function strikes(hands: Hands, note: Note, prev: Note, now: number, side: (n: number) => "left" | "right" | null, struck: (hand: "left" | "right", n: number) => void) {
  for (const s of [prev, note]) {
    if (!s || s.at <= hands.seen || now - s.at > 0.3) continue;
    hands.seen = s.at;
    let hand = side(s.n);
    if (!hand) continue;
    const other = hand === "left" ? "right" : "left";
    if (s.at - hands.hitAt[hand] < TOGETHER && s.at - hands.hitAt[other] >= TOGETHER) hand = other;
    hands.hitAt[hand] = s.at;
    hands.last = hand;
    struck(hand, s.n);
  }
}

/** A wrist sits behind the key its fingers play. */
const WRIST_BACK = 0.09;

export function deskPose(hands: Hands, instrument: "drums" | "keys", note: Note, now: number, octave: number, prev: Note = null) {
  const xOf = (n: number) => (instrument === "drums" ? padAt(n)[0] : keyX(keyOf(n, octave)));
  strikes(hands, note, prev, now, (n) => (xOf(n) < 0 ? "left" : "right"), (hand, n) => {
    hands.lastX[hand] = xOf(n);
    hands.lastZ[hand] = instrument === "drums" && n < 4 ? DESK_Z - 0.045 : DESK_Z;
  });
  for (const side of SIDES) {
    const hit = { at: hands.hitAt[side] };
    const z = now - hit.at < 0.3 ? hands.lastZ[side] : DESK_Z;
    const thumb: [number, number, number] = side === "right" ? [-1, 0, 0] : [1, 0, 0];
    set(hands[side], [hands.lastX[side], PAD_TOP + 0.03 + lift(hit, now), z + WRIST_BACK], thumb, [0, -0.25, -1], instrument === "drums" ? 0.75 : 0.3);
  }
}

/** From the grip to the tip of a stick, in eye heights. */
const STICK_REACH = 0.21;
/** How steeply a stick comes down onto a drum, and a cymbal's edge. */
const STICK_PITCH = { drum: 0.38, cymbal: 0.18 };
/** How far a hit flicks the tip up from the wrist before it comes down. */
const STICK_FLICK = 0.75;

/**
 * Sticks over the kit: each hand a stick's length back from what it last
 * struck, the stick pointing out to it from behind the drummer, so the
 * hands stay low over the lap and spread round the kit the way a
 * drummer's do (the right over the left to reach the hats). A hit flicks
 * the stick up from the wrist and down onto the piece, rather than
 * lifting the whole arm.
 */
export function kitPose(hands: Hands, note: Note, now: number, prev: Note = null) {
  malletPose(hands, KIT_PIECES_AT, note, now, prev);
}

/** The same for any instrument played with a stick in each hand: the kit,
 *  the kulintang's gongs, the taiko's face and rim. */
export function malletPose(hands: Hands, pieces: Record<number, Piece>, note: Note, now: number, prev: Note = null) {
  strikes(
    hands,
    note,
    prev,
    now,
    (n) => {
      const piece = pieces[n];
      return !piece || piece.hand === "foot" ? null : piece.hand;
    },
    (hand, n) => (hands.lastPiece[hand] = n)
  );
  for (const side of SIDES) {
    const piece = pieces[hands.lastPiece[side]];
    if (!piece) continue;
    const up = lift({ at: hands.hitAt[side] }, now, 1);
    const cymbal = piece.depth === 0;
    // Where the tip lands: a drum's head, a cymbal's near edge.
    const tipX = piece.at[0];
    const tipY = cymbal ? piece.at[1] + 0.01 : pieceTop(piece) + 0.008;
    const tipZ = piece.at[2] + piece.r * (cymbal ? 0.7 : 0.15);
    // Out from a point behind the drummer, on the hand's own side.
    let dx = tipX - (side === "right" ? 0.1 : -0.1);
    let dz = tipZ - 0.25;
    const across = Math.hypot(dx, dz) || 1;
    dx /= across;
    dz /= across;
    const pitch = piece.pitch ?? (cymbal ? STICK_PITCH.cymbal : STICK_PITCH.drum);
    const along = Math.cos(pitch) * STICK_REACH;
    const raised = pitch - STICK_FLICK * up;
    set(
      hands[side],
      [tipX - dx * along, tipY + Math.sin(pitch) * STICK_REACH + 0.015 * up, tipZ - dz * along],
      [dx * Math.cos(raised), -Math.sin(raised), dz * Math.cos(raised)],
      [0, -1, 0],
      0.9
    );
  }
}

const rootQ = new THREE.Quaternion();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const back = new THREE.Vector3();
const feet = new THREE.Vector3();
const world = new THREE.Vector3();
const scale = new THREE.Vector3();

/** A world point in an avatar's body frame (eye heights; x right, z back). */
function toBody(rig: BodyRig, point: THREE.Vector3, out: [number, number, number]) {
  rig.root.getWorldQuaternion(rootQ);
  right.copy(rig.modelRight).applyQuaternion(rootQ);
  up.copy(rig.modelUp).applyQuaternion(rootQ);
  back.copy(rig.modelForward).applyQuaternion(rootQ).negate();
  (rig.scene.parent ?? rig.scene).getWorldPosition(feet);
  const eye = rig.eyeHeight * rig.root.getWorldScale(scale).y;
  world.copy(point).sub(feet);
  out[0] = world.dot(right) / eye;
  out[1] = world.dot(up) / eye;
  out[2] = world.dot(back) / eye;
  return out;
}

const strumAt: [number, number, number] = [0, 0, 0];
const fretAt: [number, number, number] = [0, 0, 0];
const guitarPoint = new THREE.Vector3();
const offset = new THREE.Vector3();

/** A point on a worn instrument, `along` its neck from the body's middle
 *  and then nudged, in its own metres, as body-frame coordinates. */
function onGuitar(rig: BodyRig, guitar: THREE.Object3D, along: number, nudge: [number, number, number], out: [number, number, number]) {
  guitarPoint.copy(GUITAR_BODY).addScaledVector(NECK, along).add(offset.set(...nudge));
  return toBody(rig, guitar.localToWorld(guitarPoint), out);
}

/** Where the strumming hand and the fretting hand go on a worn instrument. */
function guitarPoints(rig: BodyRig, guitar: THREE.Object3D, kind: Worn, note: number) {
  const spec = WORN_SPECS[kind];
  guitar.updateWorldMatrix(true, false);
  onGuitar(rig, guitar, 0, [0.02, 0, -0.1], strumAt);
  onGuitar(rig, guitar, zoneAlong(spec, note), [0, -0.03, -0.06], fretAt);
}

/** How far a strum sweeps: a guitar's chord the whole way, a lead note or
 *  a bass note just a pick or a pluck. */
const SWEEP: Record<Worn, number> = { guitar: 0.09, electric: 0.06, bass: 0.035 };

export function guitarPose(hands: Hands, rig: BodyRig, guitar: THREE.Object3D, kind: Worn, note: Note, now: number) {
  guitarPoints(rig, guitar, kind, chordOf(note?.n ?? 0));
  const age = note ? now - note.at : 1;
  // A strum sweeps down across the strings and comes back up; a picked
  // string, just a flick.
  const reach = note && note.n >= PICK_BASE ? 0.02 : SWEEP[kind];
  const sweep = age < 0.12 ? (age / 0.12) * reach : age < 0.35 ? reach * (1 - (age - 0.12) / 0.23) : 0;
  set(hands.right, [strumAt[0] + 0.03, strumAt[1] + 0.05 - sweep, strumAt[2] + 0.06], [0, -0.3, -1], [-0.6, -0.8, 0], kind === "bass" ? 0.45 : 0.7);
  set(hands.left, [fretAt[0] + 0.02, fretAt[1] - 0.02, fretAt[2] + 0.06], [0.2, 1, 0.1], [-0.9, 0.3, -0.3], 0.65);
}

/** A shaker in the right hand, at the chest: each shake snaps it forward
 *  and back. Returns false: one hand. */
export function shakerPose(hands: Hands, note: Note, now: number) {
  const age = note ? now - note.at : 1;
  const snap = age < 0.06 ? age / 0.06 : age < 0.18 ? 1 - (age - 0.06) / 0.12 : 0;
  const strength = note && note.n === 0 ? 1 : 0.6;
  set(hands.right, [0.13, 0.76 + 0.02 * snap * strength, -0.24 - 0.06 * snap * strength], [0.05, 1, -0.15 - 0.4 * snap * strength], [-0.3, 0, -1], 1);
  return false;
}

/** One light stick, or one in each hand; returns whether both are held.
 *  `clock` is the wall clock in seconds: everyone's sway runs off it, so a
 *  crowd waves together, and a pair sways as one. */
export function stickPose(hands: Hands, waving: boolean, pair: boolean, clock: number) {
  const s = Math.sin(clock * Math.PI * 2 * 0.9);
  for (const side of pair ? SIDES : RIGHT_ONLY) {
    const m = side === "right" ? 1 : -1;
    if (!waving) set(hands[side], [(pair ? 0.12 : 0.14) * m, 0.72, -0.24], [0.08 * m, 1, -0.2], [-0.3 * m, 0, -1], 1);
    else set(hands[side], [(pair ? 0.17 * m : 0.08) + 0.1 * s, 1.1, -0.08], [0.45 * s + (pair ? 0.12 * m : 0), 1, 0.15], [0, 0, -1], 1);
  }
  return pair;
}
const RIGHT_ONLY = ["right"] as const;

/** Eases what's drawn toward a hand's target: quickly while playing, so a
 *  note still lands on time, and gently between, so nothing snaps. */
function ease(drawn: HandTarget, goal: HandTarget, k: number) {
  for (let i = 0; i < 3; i++) {
    drawn.pos[i] += (goal.pos[i] - drawn.pos[i]) * k;
    drawn.blade[i] += (goal.blade[i] - drawn.blade[i]) * k;
    drawn.fingers[i] += (goal.fingers[i] - drawn.fingers[i]) * k;
  }
  drawn.curl = (drawn.curl ?? 0.35) + ((goal.curl ?? 0.35) - (drawn.curl ?? 0.35)) * k;
}
const copyTarget = (from: HandTarget, to: HandTarget) => {
  ease(to, from, 1);
  return to;
};
/** A second: how fast the hands follow while notes come, and between. */
const EASE_PLAYING = 26;
const EASE_RESTING = 8;
/** And the body, which never needs to be quick. */
const EASE_BODY = 6;

// --- the layer ------------------------------------------------------------------

interface Holder {
  vrm: VRM;
  overlay: PoseOverlay;
  weight: number;
  hands: Hands;
  /** What's drawn: the hands eased toward `hands` (and moved with the body). */
  drawn: { right: HandTarget; left: HandTarget; valid: boolean; carried: HandTarget };
  tracked: { right: TrackedHand; left: TrackedHand };
  propKey: string;
  prop: THREE.Object3D | null;
  detach: () => void;
  /** What's held in a hand (sticks, a light stick, a shaker), and which,
   *  to point along a controller's handle in a headset (pointHeld). */
  inHand: { prop: THREE.Object3D; side: "left" | "right" }[];
  flash: THREE.Mesh | null;
  /** When the note the flash shows was played. */
  flashed: number;
  /** The rest of the body while playing (moves.ts), eased, and whether
   *  they're walking, when the walk keeps the legs. */
  body: BodyPose;
  settled: BodyPose | null;
  gait: Gait;
  groove: Groove;
}

const approach = (current: number, goal: number, rate: number, dt: number) => current + (goal - current) * (1 - Math.exp(-rate * dt));
const SIDES = ["right", "left"] as const;
/** How fast (eye heights a second) a hand must be going to shake. */
const SHAKE_SPEED = 0.9;

interface BandLayerProps {
  selfId: string | null;
  players: Record<string, PlayerState>;
  /** No playing by tap while editing: a click there picks things up. */
  editMode: boolean;
  /** This visitor is seated or in a posture (seiza, lying, a slow dance):
   *  their own avatar is the clip's, not the mode's. Their own posture
   *  never comes back from the room (it's sent to everyone else), so it
   *  comes from here. */
  selfSeated: boolean;
}

export function BandLayer({ selfId, players, editMode, selfSeated }: BandLayerProps) {
  const selfSeatedRef = useRef(selfSeated);
  selfSeatedRef.current = selfSeated;
  const { camera, gl } = useThree();
  const holders = useRef(new Map<string, Holder>()).current;
  const playersRef = useRef(players);
  playersRef.current = players;
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;
  // VR: whether each hand is above the instrument and may strike it.
  const armed = useRef({ left: true, right: true, strum: true, kick: true });
  // VR: the shaking hand's last place and speed, and its last shake.
  const shaken = useRef({ at: [0, 0, 0] as [number, number, number], v: [0, 0, 0], last: 0 });

  // Ask once on starting, for anything announced before this client listened.
  useEffect(() => sendAddonEvent("band", { k: "hi" }), []);

  useEffect(() => {
    prepareGuitar();
    return onAddonEvent("band", (from, data) => {
      const event = parseBandEvent(data);
      if (!event || from === selfIdRef.current) return;
      if (event.k === "hi") {
        // Someone's mode just started: tell them what you're playing.
        if (band.get().instrument) announceBand();
        return;
      }
      const m = musicianOf(from);
      if (event.k === "lo") {
        m.instrument = event.instrument;
        m.color = event.color;
        m.waving = event.waving;
        m.pair = event.pair;
        return;
      }
      const heldKey = `${from}:${event.note}`;
      if (event.k === "f") {
        remoteHeld.get(heldKey)?.();
        remoteHeld.delete(heldKey);
        return;
      }
      if (!m.instrument || !validNote(m.instrument, event.note)) return;
      let gate = remoteGates.get(from);
      if (!gate) remoteGates.set(from, (gate = new NoteGate()));
      if (!gate.allow(m.instrument, performance.now() / 1000)) return;
      m.prev = m.note;
      m.note = { n: event.note, at: performance.now() / 1000 };
      const vrm = getAddonAvatar(from);
      const at = vrm ? vrm.scene.getWorldPosition(new THREE.Vector3()) : null;
      const distance = at ? camera.getWorldPosition(new THREE.Vector3()).distanceTo(at) : undefined;
      // A held key rings here until its release arrives too.
      if (event.hold && m.instrument === "keys") {
        remoteHeld.get(heldKey)?.();
        remoteHeld.delete(heldKey);
        // No more held at once than anyone may (atOnce): the oldest goes.
        const theirs = [...remoteHeld.keys()].filter((k) => k.startsWith(`${from}:`));
        if (theirs.length >= atOnce("keys")) {
          remoteHeld.get(theirs[0])?.();
          remoteHeld.delete(theirs[0]);
        }
        remoteHeld.set(heldKey, holdKey(event.note, distance));
      } else playNote(m.instrument, event.note, distance);
    });
  }, [camera]);

  // Tap or click your own instrument to play it: the pad, key, drum, or
  // fret under the pointer. Stands are in front of you, so they're under
  // your hands in first person and in view in third.
  useEffect(() => {
    if (editMode) return;
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const { instrument, octave } = band.get();
      const holder = holders.get(LOCAL_AVATAR);
      if (!instrument || instrument === "lightstick" || !holder?.prop) return;
      const rect = el.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(holder.prop, true).find((h) => h.object !== holder.flash);
      if (!hit) return;
      const local = holder.prop.worldToLocal(hit.point.clone());
      let note: number | null = null;
      if (isWorn(instrument)) note = zoneOnNeck(instrument, local) ?? band.get().chord;
      else if (instrument === "shaker") note = 0;
      else if (STICK_SETS[instrument]) {
        const piece = hit.object.parent?.userData.piece;
        if (typeof piece === "number") note = piece;
        else {
          // One shell (the taiko): the piece nearest the tap, across.
          let best = Infinity;
          for (const [index, p] of Object.entries(STICK_SETS[instrument]!.pieces)) {
            const d = Math.abs(local.x - p.at[0]);
            if (p.hand !== "foot" && d < best) [best, note] = [d, Number(index)];
          }
        }
      } else if (local.y >= PAD_TOP - 0.025) {
        if (instrument === "drums") {
          for (let pad = 0; pad < 8 && note === null; pad++) {
            const [px, pz] = padAt(pad);
            if (Math.abs(local.x - px) < 0.045 && Math.abs(local.z - pz) < 0.045) note = pad;
          }
        } else if (Math.abs(local.z - DESK_Z) < 0.07) {
          const semitone = (local.z < DESK_Z - 0.01 && local.y > PAD_TOP + 0.006 ? nearestKey(local.x, true) : null) ?? nearestKey(local.x, false);
          if (semitone !== null) note = 60 + octave * 12 + semitone;
        }
      }
      if (note === null) return;
      tapped.at = performance.now();
      play(note);
    };
    el.addEventListener("pointerdown", down);
    return () => el.removeEventListener("pointerdown", down);
  }, [gl, camera, editMode, holders]);

  const roster = Object.keys(players).sort().join(",");
  useEffect(() => {
    for (const id of [...remoteMusicians.keys()]) if (!playersRef.current[id]) remoteMusicians.delete(id);
    for (const id of [...remoteGates.keys()]) if (!playersRef.current[id]) remoteGates.delete(id);
    const timer = setTimeout(() => band.get().instrument && announceBand(), 600);
    return () => clearTimeout(timer);
  }, [roster]);

  useEffect(
    () => () => {
      for (const holder of holders.values()) release(holder);
      holders.clear();
      resetBand();
      for (const stop of remoteHeld.values()) stop();
      remoteHeld.clear();
    },
    [holders]
  );

  useFrame((state, rawDelta) => {
    const frame = state.clock.elapsedTime;
    const dt = Math.min(rawDelta, 0.05);
    const now = performance.now() / 1000;
    const me = band.get();
    const seen = new Set<string>();

    const tend = (key: string, instrument: Instrument | null, color: number, waving: boolean, pair: boolean, note: Note, prev: Note) => {
      const vrm = getAddonAvatar(key);
      if (!vrm) return;
      const rig = rigFor(vrm);
      seen.add(key);
      let holder = holders.get(key);
      if (holder && holder.vrm !== vrm) {
        release(holder);
        holder = undefined;
      }
      if (!holder) {
        holder = {
          vrm,
          overlay: sharedOverlay(vrm, frame),
          weight: 0,
          hands: newHands(),
          drawn: { right: target(), left: target(), valid: false, carried: target() },
          tracked: { right: newTrackedHand(), left: newTrackedHand() },
          propKey: "",
          prop: null,
          detach: () => {},
          inHand: [],
          flash: null,
          flashed: 0,
          body: newBodyPose(),
          settled: null,
          gait: new Gait(),
          groove: { energy: 0 },
        };
        holders.set(key, holder);
      }
      // Last frame's pose off first, once a frame for everything that poses
      // the avatar (bodyIk.ts).
      holder.overlay = sharedOverlay(vrm, frame);

      const propKey = instrument ? `${instrument}:${instrument === "lightstick" ? `${color}:${pair}` : ""}` : "";
      if (propKey !== holder.propKey) {
        holder.detach();
        if (holder.prop) disposeTree(holder.prop);
        holder.prop = null;
        holder.flash = null;
        holder.detach = () => {};
        holder.inHand = [];
        const grip = (side: "left" | "right", prop: THREE.Object3D) => {
          holder!.inHand.push({ prop, side });
          return holdInHand(vrm, side, prop);
        };
        holder.propKey = propKey;
        holder.drawn.valid = false;
        // Fresh hands for a new instrument, resting where it's played.
        holder.hands = newHands();
        const rest = instrument ? STICK_SETS[instrument]?.rest : undefined;
        if (rest) holder.hands.lastPiece = { ...rest };
        if (instrument && rig) {
          if (instrument === "lightstick") {
            const hex = LIGHT_COLORS[color] ?? LIGHT_COLORS[0];
            const stick = buildLightStick(hex);
            holder.prop = stick;
            const letGo = grip("right", stick);
            if (pair) {
              const other = buildLightStick(hex);
              const letGoOther = grip("left", other);
              holder.detach = () => {
                letGo();
                letGoOther();
                disposeTree(other);
              };
            } else holder.detach = letGo;
          } else if (isWorn(instrument)) {
            holder.prop = buildWorn(instrument);
            holder.detach = wearOnChest(vrm, rig, holder.prop);
          } else if (instrument === "shaker") {
            holder.prop = buildShaker();
            holder.detach = grip("right", holder.prop);
          } else {
            // In front of them, in their body frame scaled to their size.
            const builders: Partial<Record<Instrument, () => THREE.Group>> = { drums: buildDrumPad, kit: buildKit, kulintang: buildKulintang, taiko: buildTaiko };
            const stand = (builders[instrument] ?? buildKeyboard)();
            const anchor = vrm.scene.parent;
            if (anchor) {
              stand.scale.setScalar(feetAndEye(rig, feet) / anchor.getWorldScale(scale).y);
              anchor.add(stand);
              holder.prop = stand;
              const detachStand = () => anchor.remove(stand);
              const sticksOf = STICK_SETS[instrument]?.stick;
              if (sticksOf) {
                // A stick in each hand.
                const sticks = [buildStick(sticksOf), buildStick(sticksOf)];
                const letGo = [grip("right", sticks[0]), grip("left", sticks[1])];
                holder.detach = () => {
                  detachStand();
                  letGo.forEach((f) => f());
                  sticks.forEach(disposeTree);
                };
              } else holder.detach = detachStand;
            }
          }
          if (holder.prop && instrument !== "lightstick" && instrument !== "shaker") {
            holder.flash = buildFlash();
            holder.prop.add(holder.flash);
          }
        }
      }

      // Light up what was just played.
      const octave = key === LOCAL_AVATAR ? me.octave : 0;
      if (holder.flash && instrument && note) {
        const spot = noteSpot(instrument, note.n, octave);
        if (note.at !== holder.flashed) {
          holder.flashed = note.at;
          if (spot) {
            holder.flash.position.copy(spot.at);
            holder.flash.scale.set(...spot.size);
            holder.flash.rotation.z = spot.tilt;
          }
        }
        const age = now - note.at;
        const material = holder.flash.material as THREE.MeshBasicMaterial;
        holder.flash.visible = age < FLASH_SECONDS && spot !== null;
        material.opacity = Math.max(0, 0.9 * (1 - age / FLASH_SECONDS));
      }

      const source = key === LOCAL_AVATAR ? LOCAL_TRACKING_SOURCE : key;
      const sample = trackingStore.get(source);
      const inHeadset = sample !== null && performance.now() - sample.receivedAt < TRACKING_STALE_MS;
      for (const h of holder.inHand) pointHeld(h.prop, inHeadset && sample!.pose[h.side]?.held === true);
      const seated = key === LOCAL_AVATAR ? selfSeatedRef.current : !!playersRef.current[key]?.posture;
      holder.weight = approach(holder.weight, instrument && !inHeadset && !seated ? 1 : 0, 6, dt);
      const moving = rig ? holder.gait.update(rig, dt) : 0;
      if (!rig || holder.weight <= 0.001 || !instrument) {
        holder.settled = null;
        return;
      }
      const hands = holder.hands;
      // The body first: it grooves, and an instrument on the chest goes with
      // it, so the hands are placed on it after. Pads, keys, and the kit
      // stand on the floor, so the hands stay on them while the body moves.
      const energy = updateGroove(holder.groove, instrument, note, waving, now, dt);
      // Where along the instrument the last note was, to lean toward.
      const side =
        instrument === "drums" || instrument === "keys" ? hands.lastX[hands.last] : instrument === "kulintang" ? (GONGS_AT[hands.lastPiece[hands.last]]?.at[0] ?? 0) : 0;
      bandBody(instrument, note, energy, side, Date.now() / 1000, now, holder.body);
      if (!holder.settled) holder.settled = copyBody(holder.body, newBodyPose());
      else blendBody(holder.settled, holder.body, 1 - Math.exp(-EASE_BODY * dt));
      const upper = holder.weight * (1 - 0.5 * moving);
      // A seated drummer stays seated, walking or not.
      const legs = instrument === "kit" ? holder.weight : holder.weight * (1 - moving);
      poseBody(rig, holder.overlay, holder.settled, upper, legs);
      let both = true;
      const sticks = STICK_SETS[instrument];
      if (instrument === "drums" || instrument === "keys") deskPose(hands, instrument, note, now, octave, prev);
      else if (sticks) malletPose(hands, sticks.pieces, note, now, prev);
      else if (isWorn(instrument) && holder.prop) guitarPose(hands, rig, holder.prop, instrument, note, now);
      else if (instrument === "shaker") both = shakerPose(hands, note, now);
      else both = stickPose(hands, waving, pair, Date.now() / 1000);
      const playing = note !== null && now - note.at < 0.5;
      const k = holder.drawn.valid ? 1 - Math.exp(-(playing ? EASE_PLAYING : EASE_RESTING) * dt) : 1;
      ease(holder.drawn.right, hands.right, k);
      ease(holder.drawn.left, hands.left, k);
      holder.drawn.valid = true;
      const settled = holder.settled;
      const draw = (handSide: "left" | "right") => {
        const t = copyTarget(holder!.drawn[handSide], holder!.drawn.carried);
        // A light stick or a shaker moves with the body's sway.
        if (instrument === "lightstick" || instrument === "shaker") carryHand(t, settled, upper, legs);
        return toTrackedHand(handSide, t, holder!.tracked[handSide]);
      };
      poseHands(rig, holder.overlay, draw("right"), both ? draw("left") : null, holder.weight);
    };

    tend(LOCAL_AVATAR, me.instrument, me.color, me.waving, me.pair, localNote.note, localNote.prev);
    for (const [id, m] of remoteMusicians) if (m.instrument || holders.has(id)) tend(id, m.instrument, m.color, m.waving, m.pair, m.note, m.prev);
    for (const [key, holder] of holders) {
      if (seen.has(key)) continue;
      release(holder);
      holders.delete(key);
    }

    // VR: play by touch. Hands come down onto the pads, keys, and drums,
    // and a strum across a worn instrument's strings plays the note the
    // other hand is holding along its neck.
    const sample = trackingStore.get(LOCAL_TRACKING_SOURCE);
    if (!sample || performance.now() - sample.receivedAt >= TRACKING_STALE_MS || !me.instrument || me.instrument === "lightstick") return;
    if (isWorn(me.instrument)) {
      const kind = me.instrument;
      const holder = holders.get(LOCAL_AVATAR);
      const rig = holder && rigFor(holder.vrm);
      const strumming = sample.pose.right;
      const fretting = sample.pose.left;
      if (!holder?.prop || !rig || !strumming) return;
      guitarPoints(rig, holder.prop, kind, 0);
      const [x, y, z] = strumming.pose;
      const over = Math.abs(x - strumAt[0]) < 0.14 && Math.abs(z - strumAt[2]) < 0.16;
      if (y > strumAt[1] + 0.04) armed.current.strum = true;
      else if (over && armed.current.strum && y < strumAt[1]) {
        armed.current.strum = false;
        // The note: how far along the neck the other hand is, in the six
        // zones nearest the nut
        // zones (the home row), which an arm can reach without looking.
        let zone = 0;
        if (fretting) {
          const spec = WORN_SPECS[kind];
          const start = onGuitar(rig, holder.prop, NECK_FROM, [0, 0, 0], [0, 0, 0]);
          const end = onGuitar(rig, holder.prop, NECK_FROM + spec.length, [0, 0, 0], [0, 0, 0]);
          const length = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]) || 1;
          const u = ((fretting.pose[0] - start[0]) * (end[0] - start[0]) + (fretting.pose[1] - start[1]) * (end[1] - start[1]) + (fretting.pose[2] - start[2]) * (end[2] - start[2])) / (length * length);
          zone = Math.max(0, Math.min(5, Math.floor((1 - u) * 6)));
        }
        play(zone);
        buzz(gl, "right", 0.3, 25);
      }
      return;
    }
    if (me.instrument === "shaker") {
      // Shake it: a shake sounds where the hand turns back, harder the faster.
      const hand = sample.pose.right;
      if (!hand) return;
      const s = shaken.current;
      const dt = Math.max(1e-3, rawDelta);
      const v = [(hand.pose[0] - s.at[0]) / dt, (hand.pose[1] - s.at[1]) / dt, (hand.pose[2] - s.at[2]) / dt];
      const speed = Math.hypot(...s.v);
      if (speed > SHAKE_SPEED && v[0] * s.v[0] + v[1] * s.v[1] + v[2] * s.v[2] < 0 && now - s.last > 0.08) {
        s.last = now;
        play(speed > SHAKE_SPEED * 2 ? 0 : 1);
        buzz(gl, "right", speed > SHAKE_SPEED * 2 ? 0.25 : 0.12, 15);
      }
      s.at = [hand.pose[0], hand.pose[1], hand.pose[2]];
      s.v = v;
      return;
    }
    if (me.instrument === "kit") {
      // The trigger on the right controller is the kick pedal.
      const squeeze = sample.pose.right?.curl[0] ?? 0;
      if (squeeze >= 0.85 && armed.current.kick) {
        armed.current.kick = false;
        play(KIT.kick);
        buzz(gl, "right", 0.45, 30);
      } else if (squeeze <= 0.55) armed.current.kick = true;
    }
    for (const side of ["left", "right"] as const) {
      const hand = sample.pose[side];
      if (!hand) continue;
      const [x, y, z] = hand.pose;
      const sticks: StickSet | undefined = STICK_SETS[me.instrument];
      if (sticks) {
        // The stick's tip, ahead of and below the hand.
        const tip: [number, number, number] = [x, y - 0.07, z - STICK_REACH * 0.9];
        let hitPiece: number | null = null;
        let above = true;
        for (const [index, piece] of Object.entries(sticks.pieces)) {
          const n = Number(index);
          if (piece.hand === "foot" || DRAWN_AS[n] !== undefined) continue;
          if (Math.hypot(tip[0] - piece.at[0], tip[2] - piece.at[2]) > piece.r + 0.03) continue;
          const top = pieceTop(piece);
          if (tip[1] < top + 0.05) above = false;
          if (tip[1] <= top + 0.01) hitPiece = n;
        }
        if (above) armed.current[side] = true;
        if (hitPiece !== null && armed.current[side]) {
          armed.current[side] = false;
          play(hitPiece);
          buzz(gl, side, 0.4, 25);
        }
        continue;
      }
      // The fingertips, a little ahead of the wrist; with tracked fingers,
      // the index fingertip itself.
      const tipZ = hand.tip ? hand.tip[2] : z - 0.07;
      const tipX = hand.tip ? hand.tip[0] : x;
      const tipY = hand.tip ? hand.tip[1] : y;
      if (tipY > PAD_TOP + 0.05) {
        armed.current[side] = true;
        continue;
      }
      if (!armed.current[side] || tipY > PAD_TOP + 0.01) continue;
      let note: number | null = null;
      if (me.instrument === "drums") {
        for (let pad = 0; pad < 8 && note === null; pad++) {
          const [px, pz] = padAt(pad);
          if (Math.abs(tipX - px) < 0.045 && Math.abs(tipZ - pz) < 0.045) note = pad;
        }
      } else if (Math.abs(tipZ - DESK_Z) < 0.08 && Math.abs(tipX) < KEYBOARD_WIDTH / 2 + 0.02) {
        // Toward the back is where the black keys are; a touch there that
        // isn't on one plays the white key under it.
        const semitone = (tipZ < DESK_Z - 0.01 ? nearestKey(tipX, true) : null) ?? nearestKey(tipX, false);
        if (semitone !== null) note = 60 + me.octave * 12 + semitone;
      }
      if (note !== null) {
        armed.current[side] = false;
        play(note);
        buzz(gl, side, 0.3, 20);
      }
    }
  }, -0.4);

  return null;
}

function nearestKey(x: number, black: boolean): number | null {
  let best = Infinity;
  let found: number | null = null;
  for (const key of KEY_LAYOUT) {
    if (key.black !== black) continue;
    const d = Math.abs(keyX(key.semitone) - x);
    if (d < best) {
      best = d;
      found = key.semitone;
    }
  }
  return black && best > WHITE_KEY * 0.4 ? null : found;
}

function release(holder: Holder) {
  holder.overlay.restore();
  holder.detach();
  if (holder.prop) disposeTree(holder.prop);
}
