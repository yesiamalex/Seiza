import { useEffect, useRef } from "react";
import type { VRM } from "@pixiv/three-vrm";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { PlayerState } from "../../multiplayer/types";
import { floorHeightAt, SHORE, swimmingAt } from "../../scene/layout";
import { markForMirrors } from "../../scene/Mirror";
import { sharedOverlay } from "../../xr/body/bodyIk";
import { LOCAL_TRACKING_SOURCE, trackingStore } from "../../xr/body/trackingStore";
import { TRACKING_STALE_MS } from "../../xr/body/trackingWire";
import { getAddonAvatar, LOCAL_AVATAR } from "../avatars";
import { newBodyPose, poseBody } from "../body";
import { onAddonEvent, sendAddonEvent } from "../bus";
import { feetAndEye, newTrackedHand, poseHands, rigFor, toTrackedHand, type HandTarget } from "../rig";
import { useStore } from "../store";
import { L } from "../../i18n/lang";
import { announcePet, preloadBarks, BODY, buildPet, disposePets, HEAD, LEGS, nearPet, parsePetEvent, pet, PET_LABELS, patPet, patted, petName, petSound, remotePets, SHAPES, TAIL, type BuiltPet, type PetLook } from "./pets";

/**
 * Every pet in the room, each following its owner: along the trail the
 * owner walked (so round corners, not through walls), about a metre
 * behind, catching up at a trot and appearing at their side after a warp.
 * It sits (a capybara lies down) when its owner sits or stands a while,
 * swims at the beach, wags, and is glad to be patted: whoever pats it
 * crouches and reaches to its head (the room sees that too), from the Pat
 * prompt that shows near any pet (PetHud), or in VR by a real hand on its
 * head. A pet with its own model (uploaded) plays that model's own walk
 * and idle clips if it has them, and trots and bobs if it doesn't.
 */
const BEHIND = 1.0;
const CRUMB = 0.15;
const WARP = 15;
const REST_AFTER = 3;
const PAT_REACH = 0.28;
/** How near a pet has to be for the Pat prompt, metres. */
const PAT_NEAR = 1.8;
/** How long a pat takes, seconds: a few slow strokes, not a tap. */
const PAT_TIME = 2.8;
/** An uploaded pet's height at size 1, metres. */
const MODEL_HEIGHT = 0.55;

interface Custom {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  walk: THREE.AnimationAction | null;
  idle: THREE.AnimationAction | null;
}

interface Follower {
  look: PetLook;
  built: BuiltPet | null;
  custom: Custom | null;
  /** What's in the scene: the built pet's mesh, or the model, or nothing yet. */
  root: THREE.Object3D | null;
  pos: THREE.Vector3;
  yaw: number;
  y: number;
  speed: number;
  phase: number;
  rest: number;
  still: number;
  /** Time left of a happy hop, and of being patted (it stays to enjoy it). */
  hop: number;
  petted: number;
  /** Whoever's patting it (their avatar's key). */
  patBy: string | null;
  trail: THREE.Vector3[];
  ownerAt: THREE.Vector3 | null;
}

/** A pat underway: who, which pet, how far along. */
interface Pat {
  pet: string;
  t: number;
}

const owner = new THREE.Vector3();
const hand = new THREE.Vector3();
const headAt = new THREE.Vector3();
const toward = new THREE.Vector3();
const feet = new THREE.Vector3();
const cam = new THREE.Vector3();
const box = new THREE.Box3();
const size = new THREE.Vector3();

const v3 = new THREE.Vector3();
const patQ = new THREE.Quaternion();

/** Where a pet stands to be patted: where it already is round its patter
 *  if that's in front or to the side (within 100° of ahead), at a hand's
 *  reach (0.45 to 0.7 m); from behind, round to the nearer side. */
function patSpot(patter: VRM, f: { pos: THREE.Vector3; look: PetLook }, out: THREE.Vector3) {
  const at = patter.scene.getWorldPosition(v3);
  (patter.scene.parent ?? patter.scene).getWorldQuaternion(patQ);
  const fx = -2 * (patQ.x * patQ.z + patQ.w * patQ.y);
  const fz = -(1 - 2 * (patQ.x * patQ.x + patQ.y * patQ.y));
  const forward = Math.atan2(fx, fz);
  const dx = f.pos.x - at.x;
  const dz = f.pos.z - at.z;
  const bearing = Math.atan2(Math.sin(Math.atan2(dx, dz) - forward), Math.cos(Math.atan2(dx, dz) - forward));
  const limit = (100 * Math.PI) / 180;
  const b = forward + Math.max(-limit, Math.min(limit, bearing));
  const reach = Math.max(0.45, Math.min(0.7, Math.hypot(dx, dz))) * Math.max(1, f.look.size);
  out.set(at.x + Math.sin(b) * reach, at.y, at.z + Math.cos(b) * reach);
}

/** The point `behind` metres back along the trail from its newest end. */
function alongTrail(trail: THREE.Vector3[], behind: number, out: THREE.Vector3) {
  let left = behind;
  for (let i = trail.length - 1; i > 0; i--) {
    const step = trail[i].distanceTo(trail[i - 1]);
    if (step >= left) return out.copy(trail[i]).lerp(trail[i - 1], left / step);
    left -= step;
  }
  return out.copy(trail[0]);
}

const angleTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const sameLook = (a: PetLook, b: PetLook) => a.kind === b.kind && a.coat === b.coat && a.size === b.size && a.model === b.model;

// Uploaded models, loaded once each however many pets use them.
const models = new Map<string, Promise<GLTF | null>>();
function loadModel(url: string) {
  let p = models.get(url);
  if (!p) models.set(url, (p = new GLTFLoader().loadAsync(url).catch(() => null)));
  return p;
}

/** A pet from its owner's model: stood on the ground, facing -z, its height
 *  the kind's, with the model's own walk and idle clips if it has them. */
function customFrom(gltf: GLTF, look: PetLook): Custom {
  const model = cloneSkinned(gltf.scene);
  box.setFromObject(model).getSize(size);
  // As tall as a pet of its size, and never longer than a capybara.
  const scale = Math.min((MODEL_HEIGHT * look.size) / Math.max(size.y, 1e-3), (1.2 * look.size) / Math.max(size.x, size.z, 1e-3));
  model.scale.setScalar(scale);
  box.setFromObject(model);
  model.position.y -= box.min.y;
  // glTF faces +z; a pet here faces -z.
  model.rotation.y = Math.PI;
  const root = new THREE.Group();
  root.add(model);
  root.traverse((o) => {
    o.userData.navIgnore = true;
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    o.frustumCulled = false;
  });
  const clips = gltf.animations;
  if (!clips.length) return { root, mixer: null, walk: null, idle: null };
  const mixer = new THREE.AnimationMixer(model);
  const find = (re: RegExp) => clips.find((c) => re.test(c.name));
  const walkClip = find(/walk|trot|run|move/i) ?? clips[0];
  const idleClip = find(/idle|stand|breath|sit|rest/i) ?? (walkClip === clips[0] ? clips[1] : clips[0]) ?? null;
  const walk = mixer.clipAction(walkClip);
  const idle = idleClip ? mixer.clipAction(idleClip) : null;
  walk.play();
  idle?.play();
  return { root, mixer, walk, idle };
}

export function PetLayer({ selfId, players, selfSeated }: { selfId: string | null; players: Record<string, PlayerState>; selfSeated: boolean }) {
  const { scene, gl, camera } = useThree();
  const followers = useRef(new Map<string, Follower>()).current;
  const pats = useRef(new Map<string, Pat>()).current;
  const playersRef = useRef(players);
  playersRef.current = players;
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;
  const seatedRef = useRef(selfSeated);
  seatedRef.current = selfSeated;
  const mine = useStore(pet);
  const patAt = useRef(0);
  const overlayFrame = useRef(0);

  useEffect(() => sendAddonEvent("pet", { k: "hi" }), []);
  // The dog's recorded barks, fetched now, so its very first bark is real.
  useEffect(() => preloadBarks(), []);
  useEffect(() => {
    if (mine.kind) petSound(mine.kind);
  }, [mine.kind]);
  useEffect(
    () =>
      onAddonEvent("pet", (from, data) => {
        const event = parsePetEvent(data);
        if (!event || from === selfIdRef.current) return;
        if (event.k === "hi") {
          if (pet.get().kind) announcePet();
        } else if (event.k === "pe") {
          if (event.look) remotePets.set(from, event.look);
          else remotePets.delete(from);
        } else patPet(event.owner, from);
      }),
    []
  );
  // A pat, here or heard: the pet hops and makes its sound, and whoever
  // patted it reaches down to it.
  useEffect(
    () =>
      patted.subscribe(() => {
        const { owner: id, by } = patted.get();
        const key = id === (selfIdRef.current ?? "") ? LOCAL_AVATAR : id;
        const f = followers.get(key);
        if (!f) return;
        f.hop = 0.5;
        f.petted = PAT_TIME;
        f.patBy = by === "" || by === selfIdRef.current ? LOCAL_AVATAR : by;
        petSound(f.look.kind, camera.getWorldPosition(cam).distanceTo(f.pos));
        pats.set(by === "" || by === selfIdRef.current ? LOCAL_AVATAR : by, { pet: key, t: 0 });
      }),
    [followers, pats, camera]
  );
  useEffect(
    () => () => {
      for (const f of followers.values()) drop(f);
      followers.clear();
      remotePets.clear();
      pet.set({ kind: null, look: null });
      nearPet.set({ owner: null, name: "" });
      disposePets();
    },
    [followers]
  );

  const drop = (f: Follower) => {
    f.root?.removeFromParent();
    if (f.built) (f.built.mesh.material as THREE.Material).dispose();
    f.custom?.mixer?.stopAllAction();
  };

  /** Puts a pet's body in the scene: built now, or its model once loaded. */
  const embody = (f: Follower) => {
    if (f.look.kind === "dog") preloadBarks();
    if (!f.look.model) {
      f.built = buildPet(f.look.kind, f.look.coat);
      f.built.mesh.scale.setScalar(f.look.size);
      f.root = f.built.mesh;
      scene.add(f.root);
      markForMirrors(f.root);
      return;
    }
    const want = f.look;
    void loadModel(want.model!).then((gltf) => {
      if (f.look !== want || f.root) return;
      if (!gltf) {
        // A model that won't load: the kind's own body instead.
        f.look = { ...want, model: null };
        embody(f);
        return;
      }
      f.custom = customFrom(gltf, want);
      f.root = f.custom.root;
      scene.add(f.root);
      markForMirrors(f.root);
    });
  };

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const t = state.clock.elapsedTime;
    overlayFrame.current = t;
    const seen = new Set<string>();
    const tend = (key: string, look: PetLook | null, seated: boolean) => {
      const vrm = getAddonAvatar(key);
      let f = followers.get(key);
      if (f && (!look || !vrm || !sameLook(f.look, look))) {
        drop(f);
        followers.delete(key);
        f = undefined;
      }
      if (!look || !vrm) return;
      seen.add(key);
      vrm.scene.getWorldPosition(owner);
      if (!f) {
        f = { look, built: null, custom: null, root: null, pos: owner.clone().add(new THREE.Vector3(0.6, 0, 0.6)), yaw: 0, y: owner.y, speed: 0, phase: 0, rest: 0, still: 0, hop: 0, trail: [owner.clone()], ownerAt: null, petted: 0, patBy: null };
        followers.set(key, f);
        embody(f);
      }
      f.look = look.name === f.look.name ? f.look : { ...f.look, name: look.name };
      const s = SHAPES[look.kind];
      // The owner's trail, a crumb every CRUMB metres, a few metres long.
      const last = f.trail[f.trail.length - 1];
      if (last.distanceTo(owner) > WARP) f.trail = [owner.clone()];
      else if (last.distanceTo(owner) > CRUMB) {
        f.trail.push(owner.clone());
        if (f.trail.length > 40) f.trail.shift();
      }
      const ownerMoved = f.ownerAt ? f.ownerAt.distanceTo(owner) / Math.max(dt, 1e-3) : 0;
      f.ownerAt = (f.ownerAt ?? new THREE.Vector3()).copy(owner);
      f.still = ownerMoved < 0.1 ? f.still + dt : 0;
      // Where to be, and getting there: behind its owner on their trail, or,
      // being patted, in front of whoever's patting or beside them (never
      // behind them), a hand's reach away.
      alongTrail(f.trail, BEHIND * look.size, toward);
      const patter = f.petted > 0 && f.patBy ? getAddonAvatar(f.patBy) : null;
      if (patter) patSpot(patter, f, toward);
      const dx = toward.x - f.pos.x;
      const dz = toward.z - f.pos.z;
      const gap = Math.hypot(dx, dz);
      if (gap > WARP || Math.abs(owner.y - f.y) > 3) {
        f.pos.copy(toward);
        f.y = owner.y;
      }
      f.petted = Math.max(0, f.petted - dt);
      const want = gap < 0.15 ? 0 : Math.min(s.speed, gap * 3);
      f.speed += (want - f.speed) * (1 - Math.exp(-6 * dt));
      if (gap > 1e-3 && f.speed > 0.01) {
        const step = Math.min(gap, f.speed * dt);
        f.pos.x += (dx / gap) * step;
        f.pos.z += (dz / gap) * step;
        f.phase = (f.phase + step / (s.stride * look.size)) % 1;
      }
      // Faces where it goes, or, still, whoever's patting it or its owner.
      const faceAt = patter ? patter.scene.getWorldPosition(v3) : owner;
      const look2 = f.speed > 0.2 ? Math.atan2(-dx, -dz) : Math.atan2(-(faceAt.x - f.pos.x), -(faceAt.z - f.pos.z));
      f.yaw += angleTo(f.yaw, look2) * (1 - Math.exp(-(f.speed > 0.2 ? 8 : 3) * dt));
      // On the floor under it (unless that's another storey: then its owner's).
      const swimming = swimmingAt(f.pos.x, f.pos.z);
      let floor = floorHeightAt(f.pos.x, f.pos.z);
      if (Math.abs(floor - owner.y) > 1) floor = owner.y;
      if (swimming) floor = SHORE.seaY - (s.legs + s.height * 0.55) * look.size;
      f.y += (floor - f.y) * (1 - Math.exp(-10 * dt));
      // Resting: when its owner sits, or has stood still a while.
      const resting = !swimming && f.speed < 0.2 && (seated || f.still > REST_AFTER || f.petted > 0);
      f.rest += ((resting ? 1 : 0) - f.rest) * (1 - Math.exp(-4 * dt));
      f.hop = Math.max(0, f.hop - dt);
      if (!f.root) return;
      f.root.position.set(f.pos.x, f.y + Math.sin((f.hop / 0.5) * Math.PI) * 0.12 * look.size, f.pos.z);
      f.root.rotation.y = f.yaw;

      // --- an uploaded model: its own clips, or a trot and a bob ---------------------
      if (f.custom) {
        const c = f.custom;
        if (c.mixer) {
          const moving = Math.min(1, f.speed / 1.5);
          c.walk?.setEffectiveWeight(c.idle ? moving : 1);
          c.idle?.setEffectiveWeight(1 - moving);
          if (c.walk) c.walk.timeScale = Math.max(0.4, f.speed / 1.5);
          c.mixer.update(dt);
        } else {
          f.root.position.y += Math.abs(Math.sin(f.phase * Math.PI * 2)) * 0.04 * look.size * Math.min(1, f.speed);
          f.root.rotation.z = Math.sin(f.phase * Math.PI * 2) * 0.06 * Math.min(1, f.speed);
        }
        return;
      }

      // --- the built pet's pose ------------------------------------------------------
      const b = f.built!.bones;
      const swing = Math.sin(f.phase * Math.PI * 2) * Math.min(swimming ? 0.5 : 0.7, f.speed * 0.3 + (swimming ? 0.3 : 0));
      const r = f.rest;
      const lie = s.rest === "lie";
      // Sitting tips the front up and folds the back legs; lying lowers it all.
      b[BODY].rotation.x = lie ? 0 : 0.45 * r;
      b[BODY].position.y = f.built!.bodyY - (lie ? s.legs * 0.75 : s.legs * 0.35) * r + Math.sin(f.phase * Math.PI * 4) * 0.008 * Math.min(1, f.speed);
      const [fl, fr, bl, br] = LEGS;
      b[fl].rotation.x = swing * (1 - r) + (lie ? -1.3 : -0.45) * r;
      b[fr].rotation.x = -swing * (1 - r) + (lie ? -1.3 : -0.45) * r;
      b[bl].rotation.x = -swing * (1 - r) + (lie ? 1.3 : 0.9) * r;
      b[br].rotation.x = swing * (1 - r) + (lie ? 1.3 : 0.9) * r;
      // The head turns toward its owner, and nods as it trots.
      const toOwner = angleTo(f.yaw, Math.atan2(-(owner.x - f.pos.x), -(owner.z - f.pos.z)));
      b[HEAD].rotation.y += (THREE.MathUtils.clamp(toOwner, -0.7, 0.7) - b[HEAD].rotation.y) * (1 - Math.exp(-4 * dt));
      // Patted, it lifts its head into the hand and leans it side to side.
      const enjoy = Math.min(1, f.petted / 0.4, (PAT_TIME - f.petted) / 0.4);
      b[HEAD].rotation.x = Math.sin(f.phase * Math.PI * 4) * 0.06 * Math.min(1, f.speed) - (lie ? 0 : 0.35 * r) * (1 - enjoy) - 0.25 * enjoy;
      b[HEAD].rotation.z = 0.22 * Math.sin(t * 2.2) * enjoy;
      // A dog wags (more when glad), a cat's tail sways.
      const glad = f.hop > 0 || f.petted > 0 ? 1 : 0.35;
      b[TAIL].rotation.y = look.kind === "dog" ? Math.sin(t * 11) * 0.5 * glad : look.kind === "cat" ? Math.sin(t * 1.4) * 0.35 : 0;
      b[TAIL].rotation.x = look.kind === "cat" ? -0.5 : 0;
    };

    tend(LOCAL_AVATAR, pet.get().look, seatedRef.current);
    for (const [id, look] of remotePets) if (id !== selfIdRef.current) tend(id, look, !!playersRef.current[id]?.posture);
    for (const [key, f] of followers)
      if (!seen.has(key)) {
        drop(f);
        followers.delete(key);
      }

    // The nearest pet you could pat, for the Pat prompt (PetHud).
    const me = getAddonAvatar(LOCAL_AVATAR);
    let near: { key: string; name: string } | null = null;
    if (me) {
      me.scene.getWorldPosition(feet);
      let best = PAT_NEAR;
      for (const [key, f] of followers) {
        const d = Math.hypot(f.pos.x - feet.x, f.pos.z - feet.z);
        if (d < best && Math.abs(f.y - feet.y) < 1) {
          best = d;
          near = { key, name: petName(f.look, L(...PET_LABELS[f.look.kind])) };
        }
      }
    }
    const nearOwner = near ? (near.key === LOCAL_AVATAR ? (selfIdRef.current ?? "") : near.key) : null;
    if (nearPet.get().owner !== nearOwner) nearPet.set({ owner: nearOwner, name: near?.name ?? "" });

    // Patting: the patter crouches and reaches to the pet's head, a few
    // strokes, then stands (not in a headset, where your hands are yours).
    for (const [who, p] of pats) {
      p.t += dt;
      const f = followers.get(p.pet);
      const vrm = getAddonAvatar(who);
      if (p.t > PAT_TIME || !f?.root || !vrm) {
        pats.delete(who);
        continue;
      }
      const source = who === LOCAL_AVATAR ? LOCAL_TRACKING_SOURCE : who;
      const sample = trackingStore.get(source);
      if (sample !== null && performance.now() - sample.receivedAt < TRACKING_STALE_MS) continue;
      const rig = rigFor(vrm);
      if (!rig) continue;
      // In, a few slow strokes, and out: never a jab.
      const weight = Math.max(0, Math.min(1, p.t / 0.4, (PAT_TIME - p.t) / 0.4));
      const eye = feetAndEye(rig, feet);
      if (f.built) f.built.bones[HEAD].getWorldPosition(headAt);
      else headAt.copy(f.root.position).setY(f.root.position.y + MODEL_HEIGHT * f.look.size * 0.85);
      // A stroke from the top of its head back toward its neck, about once a second.
      const along = 0.5 - 0.5 * Math.cos(p.t * 5.2);
      headAt.x += Math.sin(f.yaw) * (0.03 + 0.14 * along) * f.look.size;
      headAt.z += Math.cos(f.yaw) * (0.03 + 0.14 * along) * f.look.size;
      headAt.y -= 0.03 * along * f.look.size;
      // Into the patter's own frame (x right, y up, z back), in eye heights.
      const yaw = (vrm.scene.parent ?? vrm.scene).getWorldQuaternion(new THREE.Quaternion());
      const local = headAt.clone().sub(feet).applyQuaternion(yaw.invert()).divideScalar(eye);
      // Within reach, a hand's breadth above the head, stroking.
      const reach = Math.hypot(local.x, local.z);
      if (reach > 0.55) local.multiplyScalar(0.55 / reach).setY(headAt.y - feet.y > 0 ? (headAt.y - feet.y) / eye : 0.2);
      const overlay = sharedOverlay(vrm, overlayFrame.current);
      const body = newBodyPose();
      // The chest turns toward a pet at your side, as you'd turn to reach it.
      body.twist = THREE.MathUtils.clamp(Math.atan2(local.x, -local.z), -0.7, 0.7) * weight;
      body.lean = 0.5 * weight;
      body.drop = Math.max(0, 0.55 - local.y) * 0.5 * weight;
      poseBody(rig, overlay, body, weight, weight);
      const target: HandTarget = { pos: [local.x, local.y + 0.045, local.z], blade: [0, 0, -1], fingers: [0, -0.6, -1], curl: 0.15 };
      poseHands(rig, overlay, toTrackedHand("right", target, newTrackedHand()), null, weight);
    }

    // In a headset: a hand on a pet's head pats it.
    if (gl.xr.isPresenting && performance.now() - patAt.current > 1500) {
      const origin = gl.xr.getCamera().parent;
      for (let i = 0; i < 2 && origin; i++) {
        const grip = gl.xr.getControllerGrip(i);
        hand.setFromMatrixPosition(grip.matrix).applyMatrix4(origin.matrixWorld);
        for (const [key, f] of followers) {
          if (f.built) f.built.bones[HEAD].getWorldPosition(headAt);
          else if (f.root) headAt.copy(f.root.position).setY(f.root.position.y + MODEL_HEIGHT * f.look.size * 0.85);
          else continue;
          if (hand.distanceTo(headAt) > PAT_REACH * Math.max(1, f.look.size)) continue;
          patAt.current = performance.now();
          patPet(key === LOCAL_AVATAR ? (selfIdRef.current ?? "") : key);
          break;
        }
      }
    }
  }, -0.3);

  return null;
}
