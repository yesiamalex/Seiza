import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BodyRig } from "../../xr/body/bodyIk";
import { PoseOverlay } from "../../xr/body/bodyIk";
import { LOCAL_TRACKING_SOURCE, trackingStore } from "../../xr/body/trackingStore";
import { TRACKING_STALE_MS, type TrackedHand } from "../../xr/body/trackingWire";
import type { PlayerState } from "../../multiplayer/types";
import { getAddonAvatar, LOCAL_AVATAR } from "../avatars";
import { onAddonEvent, sendAddonEvent } from "../bus";
import { disposeTree, feetAndEye, holdInHand, newTrackedHand, poseHands, rigFor, toTrackedHand, wearOnChest, type HandTarget } from "../rig";
import { announceBand, band, localNote, musicianOf, parseBandEvent, play, remoteMusicians, resetBand, tapped, validNote } from "./band";
import { CHORDS, KEY_LAYOUT, LIGHT_COLORS, playNote, prepareGuitar, type Instrument } from "./instruments";

/**
 * Band mode in the scene: each musician's instrument in front of them (a
 * drum pad, a keyboard) or on them (a guitar, a light stick), hands that
 * play the notes they play, light sticks swaying overhead in time with
 * everyone else's, and in VR, instruments you play by touch.
 *
 * The drum pad and keyboard are drawn in the avatar's own frame scaled by
 * its eye height, the same frame the arm IK takes targets in, so a key's
 * position is also where the hand goes to play it.
 */

// --- the instruments, in eye heights: x right, y up, z back --------------------

const DESK_Y = 0.6;
const DESK_Z = -0.3;
const PAD_TOP = DESK_Y + 0.02;
/** Pad centres, back row (further away) first. */
const padAt = (pad: number): [number, number] => [-0.135 + (pad % 4) * 0.09, DESK_Z + (pad < 4 ? -0.045 : 0.045)];
const WHITE_KEY = 0.0625;
/** Where each semitone of the octave sits along the keyboard, in white keys. */
const KEY_SLOTS = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7];
const keyX = (semitone: number) => -0.25 + (KEY_SLOTS[semitone] + 0.5) * WHITE_KEY;

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

function buildKeyboard() {
  const group = new THREE.Group();
  group.add(merged([boxAt(0.54, 0.035, 0.15, 0, DESK_Y, DESK_Z), legAt(-0.2, DESK_Z, DESK_Y), legAt(0.2, DESK_Z, DESK_Y)], material("#16171b", { metalness: 0.3 })));
  const whites: THREE.BufferGeometry[] = [];
  const blacks: THREE.BufferGeometry[] = [];
  for (const { semitone, black } of KEY_LAYOUT) {
    if (black) blacks.push(boxAt(WHITE_KEY * 0.55, 0.016, 0.06, keyX(semitone), PAD_TOP + 0.004, DESK_Z - 0.03));
    else whites.push(boxAt(WHITE_KEY * 0.92, 0.012, 0.11, keyX(semitone), PAD_TOP - 0.004, DESK_Z + 0.005));
  }
  group.add(merged(whites, material("#f4f2ec", { roughness: 0.4 })), merged(blacks, material("#121212", { roughness: 0.4 })));
  return group;
}

/** In metres, on the chest: x right, y up, z behind (-z out of the chest). */
const GUITAR_BODY = new THREE.Vector3(0.03, -0.27, -0.13);
const NECK = new THREE.Vector3(-0.88, 0.47, -0.04).normalize();
const NECK_FROM = 0.15;
const NECK_LENGTH = 0.55;

function buildGuitar() {
  const group = new THREE.Group();
  const lower = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 20).rotateX(Math.PI / 2).scale(1, 1.05, 1).translate(GUITAR_BODY.x + 0.03, GUITAR_BODY.y - 0.05, GUITAR_BODY.z);
  const upper = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 18).rotateX(Math.PI / 2).translate(GUITAR_BODY.x - 0.09, GUITAR_BODY.y + 0.08, GUITAR_BODY.z);
  group.add(merged([lower, upper], material("#c0452c", { roughness: 0.35, metalness: 0.1 })));
  const angle = Math.atan2(NECK.y, NECK.x) - Math.PI / 2;
  const neckMid = GUITAR_BODY.clone().addScaledVector(NECK, NECK_FROM + NECK_LENGTH / 2);
  const headAt = GUITAR_BODY.clone().addScaledVector(NECK, NECK_FROM + NECK_LENGTH + 0.07);
  const neck = new THREE.BoxGeometry(0.05, NECK_LENGTH, 0.025).rotateZ(angle).translate(neckMid.x, neckMid.y, neckMid.z - 0.02);
  const head = new THREE.BoxGeometry(0.07, 0.15, 0.022).rotateZ(angle).translate(headAt.x, headAt.y, headAt.z - 0.02);
  group.add(merged([neck, head], material("#3b2618")));
  // Frets marking the chord zones a tap picks (see chordOnNeck).
  const frets = Array.from({ length: CHORDS.length + 1 }, (_, k) => {
    const at = GUITAR_BODY.clone().addScaledVector(NECK, NECK_FROM + (k / CHORDS.length) * NECK_LENGTH);
    return new THREE.BoxGeometry(0.052, 0.004, 0.004).rotateZ(angle).translate(at.x, at.y, at.z - 0.034);
  });
  group.add(merged(frets, material("#d8d2c4", { metalness: 0.4, roughness: 0.4 })));
  const pickguard = new THREE.CylinderGeometry(0.045, 0.045, 0.004, 16).rotateX(Math.PI / 2).translate(GUITAR_BODY.x - 0.05, GUITAR_BODY.y + 0.02, GUITAR_BODY.z - 0.042);
  group.add(merged([pickguard], material("#111111")));
  return group;
}

/** Which chord a point on a worn guitar picks: by how far up the neck it
 *  is, one zone per chord between the frets; on the body, null (strum
 *  the last chord again). `local` is in the guitar's own metres. */
function chordOnNeck(local: THREE.Vector3): number | null {
  const along = local.clone().sub(GUITAR_BODY).dot(NECK);
  if (along < NECK_FROM - 0.02) return null;
  return Math.max(0, Math.min(CHORDS.length - 1, Math.floor(((along - NECK_FROM) / NECK_LENGTH) * CHORDS.length)));
}

/** Where a note is on its instrument, in the instrument's own frame, and
 *  how big a patch to light there. */
function noteSpot(instrument: Instrument, note: number): { at: THREE.Vector3; size: [number, number, number] } | null {
  if (instrument === "drums") {
    const [x, z] = padAt(note);
    return { at: new THREE.Vector3(x, PAD_TOP + 0.004, z), size: [0.078, 0.004, 0.075] };
  }
  if (instrument === "keys") {
    const semitone = (((note - 60) % 12) + 12) % 12;
    const black = KEY_LAYOUT[semitone]?.black;
    return black
      ? { at: new THREE.Vector3(keyX(semitone), PAD_TOP + 0.014, DESK_Z - 0.03), size: [WHITE_KEY * 0.55, 0.004, 0.06] }
      : { at: new THREE.Vector3(keyX(semitone), PAD_TOP + 0.004, DESK_Z + 0.005), size: [WHITE_KEY * 0.92, 0.004, 0.11] };
  }
  if (instrument === "guitar") {
    const at = GUITAR_BODY.clone().addScaledVector(NECK, NECK_FROM + ((note + 0.5) / CHORDS.length) * NECK_LENGTH);
    at.z -= 0.036;
    return { at, size: [0.054, NECK_LENGTH / CHORDS.length, 0.004] };
  }
  return null;
}

const FLASH_SECONDS = 0.18;

/** A patch of light over the pad, key, or fret just played, seen by
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

/** The last chord played here, for a strum on the guitar's body. */
let lastChord = 0;

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
function buildLightStick(color: string) {
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
function lift(note: { at: number } | null, now: number) {
  const age = note ? now - note.at : 1;
  if (age < 0.05) return 0.05 * (1 - age / 0.05);
  if (age < 0.2) return 0.05 * ((age - 0.05) / 0.15);
  return 0.05;
}

interface Hands {
  right: HandTarget;
  left: HandTarget;
  /** Where each hand last played along the desk, so the idle one stays. */
  lastX: { left: number; right: number };
  /** Which hand played the last note. */
  last: "left" | "right";
}

/** A wrist sits behind the key its fingers play. */
const WRIST_BACK = 0.09;

function deskPose(hands: Hands, instrument: "drums" | "keys", note: { n: number; at: number } | null, now: number) {
  if (note && now - note.at < 0.3) {
    const x = instrument === "drums" ? padAt(note.n)[0] : keyX(((note.n % 12) + 12) % 12);
    const side = x < 0 ? "left" : "right";
    hands.lastX[side] = x;
    hands.last = side;
  }
  const z = instrument === "drums" && note && note.n < 4 && now - note.at < 0.3 ? DESK_Z - 0.045 : DESK_Z;
  for (const side of ["left", "right"] as const) {
    const playing = side === hands.last ? lift(note, now) : 0.05;
    const thumb: [number, number, number] = side === "right" ? [-1, 0, 0] : [1, 0, 0];
    set(hands[side], [hands.lastX[side], PAD_TOP + 0.03 + playing, z + WRIST_BACK], thumb, [0, -0.25, -1], instrument === "drums" ? 0.75 : 0.3);
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

/** A point on a worn guitar, `along` its neck from the body's middle and
 *  then nudged, in the guitar's own metres, as body-frame coordinates. */
function onGuitar(rig: BodyRig, guitar: THREE.Object3D, along: number, nudge: [number, number, number], out: [number, number, number]) {
  guitarPoint.copy(GUITAR_BODY).addScaledVector(NECK, along).add(offset.set(...nudge));
  return toBody(rig, guitar.localToWorld(guitarPoint), out);
}

/** Where the strumming hand and the fretting hand go on a worn guitar. */
function guitarPoints(rig: BodyRig, guitar: THREE.Object3D, chord: number) {
  guitar.updateWorldMatrix(true, false);
  onGuitar(rig, guitar, 0, [0.02, 0, -0.1], strumAt);
  onGuitar(rig, guitar, NECK_FROM + 0.08 + Math.min(3, chord) * 0.07, [0, -0.03, -0.06], fretAt);
}

function guitarPose(hands: Hands, rig: BodyRig, guitar: THREE.Object3D, note: { n: number; at: number } | null, now: number) {
  guitarPoints(rig, guitar, note?.n ?? 0);
  const age = note ? now - note.at : 1;
  // A strum sweeps down across the strings and comes back up.
  const sweep = age < 0.12 ? (age / 0.12) * 0.09 : age < 0.35 ? 0.09 * (1 - (age - 0.12) / 0.23) : 0;
  set(hands.right, [strumAt[0] + 0.03, strumAt[1] + 0.05 - sweep, strumAt[2] + 0.06], [0, -0.3, -1], [-0.6, -0.8, 0], 0.7);
  set(hands.left, [fretAt[0] + 0.02, fretAt[1] - 0.02, fretAt[2] + 0.06], [0.2, 1, 0.1], [-0.9, 0.3, -0.3], 0.65);
}

function stickPose(hands: Hands, waving: boolean) {
  if (!waving) {
    set(hands.right, [0.14, 0.72, -0.24], [0, 1, -0.2], [-0.3, 0, -1], 1);
    return;
  }
  // Everyone's sway runs off the same clock, so a crowd waves together.
  const s = Math.sin((Date.now() / 1000) * Math.PI * 2 * 0.9);
  set(hands.right, [0.08 + 0.13 * s, 1.1, -0.08], [0.55 * s, 1, 0.15], [0, 0, -1], 1);
}

// --- the layer ------------------------------------------------------------------

interface Holder {
  vrm: VRM;
  overlay: PoseOverlay;
  weight: number;
  hands: Hands;
  tracked: { right: TrackedHand; left: TrackedHand };
  propKey: string;
  prop: THREE.Object3D | null;
  detach: () => void;
  flash: THREE.Mesh | null;
  /** When the note the flash shows was played. */
  flashed: number;
}

const approach = (current: number, goal: number, rate: number, dt: number) => current + (goal - current) * (1 - Math.exp(-rate * dt));

interface BandLayerProps {
  selfId: string | null;
  players: Record<string, PlayerState>;
  /** No playing by tap while editing: a click there picks things up. */
  editMode: boolean;
}

export function BandLayer({ selfId, players, editMode }: BandLayerProps) {
  const { camera, gl } = useThree();
  const holders = useRef(new Map<string, Holder>()).current;
  const playersRef = useRef(players);
  playersRef.current = players;
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;
  // VR: whether each hand is above the instrument and may strike it.
  const armed = useRef({ left: true, right: true, strum: true });

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
        return;
      }
      if (!m.instrument || !validNote(m.instrument, event.note)) return;
      m.note = { n: event.note, at: performance.now() / 1000 };
      const vrm = getAddonAvatar(from);
      const at = vrm ? vrm.scene.getWorldPosition(new THREE.Vector3()) : null;
      playNote(m.instrument, event.note, at ? camera.getWorldPosition(new THREE.Vector3()).distanceTo(at) : undefined);
    });
  }, [camera]);

  // Tap or click your own instrument to play it: the pad, key, or fret
  // under the pointer. Drums and keys stand in front of you, so they're
  // under your hands in first person and in view in third.
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
      if (instrument === "guitar") {
        const chord = chordOnNeck(local);
        note = chord ?? lastChord;
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
      if (instrument === "guitar") lastChord = note;
      tapped.at = performance.now();
      play(note);
    };
    el.addEventListener("pointerdown", down);
    return () => el.removeEventListener("pointerdown", down);
  }, [gl, camera, editMode, holders]);

  const roster = Object.keys(players).sort().join(",");
  useEffect(() => {
    for (const id of [...remoteMusicians.keys()]) if (!playersRef.current[id]) remoteMusicians.delete(id);
    const timer = setTimeout(() => band.get().instrument && announceBand(), 600);
    return () => clearTimeout(timer);
  }, [roster]);

  useEffect(
    () => () => {
      for (const holder of holders.values()) release(holder);
      holders.clear();
      resetBand();
    },
    [holders]
  );

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const now = performance.now() / 1000;
    const me = band.get();
    const seen = new Set<string>();

    const tend = (key: string, instrument: Instrument | null, color: number, waving: boolean, note: { n: number; at: number } | null) => {
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
          overlay: new PoseOverlay(),
          weight: 0,
          hands: { right: target(), left: target(), lastX: { left: -0.1, right: 0.1 }, last: "right" },
          tracked: { right: newTrackedHand(), left: newTrackedHand() },
          propKey: "",
          prop: null,
          detach: () => {},
          flash: null,
          flashed: 0,
        };
        holders.set(key, holder);
      }
      holder.overlay.restore();

      const propKey = instrument ? `${instrument}:${instrument === "lightstick" ? color : ""}` : "";
      if (propKey !== holder.propKey) {
        holder.detach();
        if (holder.prop) disposeTree(holder.prop);
        holder.prop = null;
        holder.flash = null;
        holder.detach = () => {};
        holder.propKey = propKey;
        if (instrument && rig) {
          if (instrument === "lightstick") {
            holder.prop = buildLightStick(LIGHT_COLORS[color] ?? LIGHT_COLORS[0]);
            holder.detach = holdInHand(vrm, "right", holder.prop);
          } else if (instrument === "guitar") {
            holder.prop = buildGuitar();
            holder.detach = wearOnChest(vrm, rig, holder.prop);
          } else {
            // In front of them, in their body frame scaled to their size.
            const stand = instrument === "drums" ? buildDrumPad() : buildKeyboard();
            const anchor = vrm.scene.parent;
            if (anchor) {
              stand.scale.setScalar(feetAndEye(rig, feet) / anchor.getWorldScale(scale).y);
              anchor.add(stand);
              holder.prop = stand;
              holder.detach = () => anchor.remove(stand);
            }
          }
          if (holder.prop && instrument !== "lightstick") {
            holder.flash = buildFlash();
            holder.prop.add(holder.flash);
          }
        }
      }

      // Light up what was just played.
      if (holder.flash && instrument && note) {
        if (note.at !== holder.flashed) {
          holder.flashed = note.at;
          const spot = noteSpot(instrument, note.n);
          if (spot) {
            holder.flash.position.copy(spot.at);
            holder.flash.scale.set(...spot.size);
            holder.flash.rotation.z = instrument === "guitar" ? Math.atan2(NECK.y, NECK.x) - Math.PI / 2 : 0;
          }
        }
        const age = now - note.at;
        const material = holder.flash.material as THREE.MeshBasicMaterial;
        holder.flash.visible = age < FLASH_SECONDS;
        material.opacity = Math.max(0, 0.9 * (1 - age / FLASH_SECONDS));
      }

      const source = key === LOCAL_AVATAR ? LOCAL_TRACKING_SOURCE : key;
      const sample = trackingStore.get(source);
      const inHeadset = sample !== null && performance.now() - sample.receivedAt < TRACKING_STALE_MS;
      const seated = !!playersRef.current[key === LOCAL_AVATAR ? (selfIdRef.current ?? "") : key]?.posture;
      holder.weight = approach(holder.weight, instrument && !inHeadset && !seated ? 1 : 0, 8, dt);
      if (!rig || holder.weight <= 0.001 || !instrument) return;
      const hands = holder.hands;
      let both = true;
      if (instrument === "drums" || instrument === "keys") deskPose(hands, instrument, note, now);
      else if (instrument === "guitar" && holder.prop) guitarPose(hands, rig, holder.prop, note, now);
      else {
        stickPose(hands, waving);
        both = false;
      }
      poseHands(rig, holder.overlay, toTrackedHand("right", hands.right, holder.tracked.right), both ? toTrackedHand("left", hands.left, holder.tracked.left) : null, holder.weight);
    };

    tend(LOCAL_AVATAR, me.instrument, me.color, me.waving, localNote.note);
    for (const [id, m] of remoteMusicians) if (m.instrument || holders.has(id)) tend(id, m.instrument, m.color, m.waving, m.note);
    for (const [key, holder] of holders) {
      if (seen.has(key)) continue;
      release(holder);
      holders.delete(key);
    }

    // VR: play by touch. Hands come down onto the pads and keys, and a
    // strum across a worn guitar's strings plays the chord the other hand
    // is holding along its neck.
    const sample = trackingStore.get(LOCAL_TRACKING_SOURCE);
    if (!sample || performance.now() - sample.receivedAt >= TRACKING_STALE_MS || !me.instrument || me.instrument === "lightstick") return;
    if (me.instrument === "guitar") {
      const holder = holders.get(LOCAL_AVATAR);
      const rig = holder && rigFor(holder.vrm);
      const strumming = sample.pose.right;
      const fretting = sample.pose.left;
      if (!holder?.prop || !rig || !strumming) return;
      guitarPoints(rig, holder.prop, 0);
      const [x, y, z] = strumming.pose;
      const over = Math.abs(x - strumAt[0]) < 0.14 && Math.abs(z - strumAt[2]) < 0.16;
      if (y > strumAt[1] + 0.04) armed.current.strum = true;
      else if (over && armed.current.strum && y < strumAt[1]) {
        armed.current.strum = false;
        // The chord: how far up the neck the other hand is, in four steps.
        let chord = 0;
        if (fretting) {
          const start = onGuitar(rig, holder.prop, NECK_FROM, [0, 0, 0], [0, 0, 0]);
          const end = onGuitar(rig, holder.prop, NECK_FROM + NECK_LENGTH, [0, 0, 0], [0, 0, 0]);
          const length = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]) || 1;
          const u = ((fretting.pose[0] - start[0]) * (end[0] - start[0]) + (fretting.pose[1] - start[1]) * (end[1] - start[1]) + (fretting.pose[2] - start[2]) * (end[2] - start[2])) / (length * length);
          chord = Math.max(0, Math.min(3, Math.floor(u * 4)));
        }
        lastChord = chord;
        play(chord);
      }
      return;
    }
    for (const side of ["left", "right"] as const) {
      const hand = sample.pose[side];
      if (!hand) continue;
      const [x, y, z] = hand.pose;
      // The fingertips, a little ahead of the wrist.
      const tipZ = z - 0.07;
      if (y > PAD_TOP + 0.05) {
        armed.current[side] = true;
        continue;
      }
      if (!armed.current[side] || y > PAD_TOP + 0.01) continue;
      let note: number | null = null;
      if (me.instrument === "drums") {
        for (let pad = 0; pad < 8 && note === null; pad++) {
          const [px, pz] = padAt(pad);
          if (Math.abs(x - px) < 0.045 && Math.abs(tipZ - pz) < 0.045) note = pad;
        }
      } else if (Math.abs(tipZ - DESK_Z) < 0.08 && Math.abs(x) < 0.27) {
        // Toward the back is where the black keys are; a touch there that
        // isn't on one plays the white key under it.
        const semitone = (tipZ < DESK_Z - 0.01 ? nearestKey(x, true) : null) ?? nearestKey(x, false);
        if (semitone !== null) note = 60 + me.octave * 12 + semitone;
      }
      if (note !== null) {
        armed.current[side] = false;
        play(note);
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
