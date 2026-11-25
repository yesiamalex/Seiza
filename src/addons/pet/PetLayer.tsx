import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { PlayerState } from "../../multiplayer/types";
import { floorHeightAt, SHORE, swimmingAt } from "../../scene/layout";
import { markForMirrors } from "../../scene/Mirror";
import { getAddonAvatar, LOCAL_AVATAR } from "../avatars";
import { onAddonEvent, sendAddonEvent } from "../bus";
import { useStore } from "../store";
import { announcePet, BODY, buildPet, disposePets, HEAD, LEGS, parsePetEvent, pet, patPet, patted, petSound, remotePets, SHAPES, TAIL, type BuiltPet, type Pet } from "./pets";

/**
 * Every pet in the room, each following its owner: along the trail the
 * owner walked (so round corners, not through walls), about a metre
 * behind, catching up at a trot and appearing at their side after a warp.
 * It sits (a capybara lies down) when its owner sits or stands a while,
 * swims at the beach, wags, and is glad to be patted: in VR, by a hand
 * on its head; on a screen, the Pat button.
 */
const BEHIND = 1.0;
const CRUMB = 0.15;
const WARP = 15;
const REST_AFTER = 3;
const PAT_REACH = 0.28;

interface Follower {
  kind: Pet;
  built: BuiltPet;
  pos: THREE.Vector3;
  yaw: number;
  y: number;
  speed: number;
  phase: number;
  rest: number;
  still: number;
  /** Time left of a happy hop. */
  hop: number;
  trail: THREE.Vector3[];
  ownerAt: THREE.Vector3 | null;
}

const owner = new THREE.Vector3();
const hand = new THREE.Vector3();
const headAt = new THREE.Vector3();
const toward = new THREE.Vector3();

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

export function PetLayer({ selfId, players, selfSeated }: { selfId: string | null; players: Record<string, PlayerState>; selfSeated: boolean }) {
  const { scene, gl, camera } = useThree();
  const followers = useRef(new Map<string, Follower>()).current;
  const playersRef = useRef(players);
  playersRef.current = players;
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;
  const seatedRef = useRef(selfSeated);
  seatedRef.current = selfSeated;
  const mine = useStore(pet);
  const patAt = useRef(0);

  useEffect(() => sendAddonEvent("pet", { k: "hi" }), []);
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
          if (event.kind) remotePets.set(from, event.kind);
          else remotePets.delete(from);
        } else patPet(event.owner, false);
      }),
    []
  );
  // A pat, here or heard: that pet hops and makes its sound.
  useEffect(
    () =>
      patted.subscribe(() => {
        const { owner: id } = patted.get();
        const f = followers.get(id === (selfIdRef.current ?? "") ? LOCAL_AVATAR : id);
        if (!f) return;
        f.hop = 0.5;
        const cam = camera.getWorldPosition(new THREE.Vector3());
        petSound(f.kind, cam.distanceTo(f.pos));
      }),
    [followers, camera]
  );
  useEffect(
    () => () => {
      for (const f of followers.values()) f.built.mesh.removeFromParent();
      followers.clear();
      remotePets.clear();
      pet.set({ kind: null });
      disposePets();
    },
    [followers]
  );

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const t = state.clock.elapsedTime;
    const seen = new Set<string>();
    const tend = (key: string, kind: Pet | null, seated: boolean) => {
      const vrm = getAddonAvatar(key);
      let f = followers.get(key);
      if (f && (f.kind !== kind || !vrm)) {
        f.built.mesh.removeFromParent();
        followers.delete(key);
        f = undefined;
      }
      if (!kind || !vrm) return;
      seen.add(key);
      vrm.scene.getWorldPosition(owner);
      if (!f) {
        const built = buildPet(kind);
        scene.add(built.mesh);
        markForMirrors(built.mesh);
        f = { kind, built, pos: owner.clone().add(new THREE.Vector3(0.6, 0, 0.6)), yaw: 0, y: owner.y, speed: 0, phase: 0, rest: 0, still: 0, hop: 0, trail: [owner.clone()], ownerAt: null };
        followers.set(key, f);
      }
      const s = SHAPES[kind];
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
      // Where to be, and getting there.
      alongTrail(f.trail, BEHIND, toward);
      const dx = toward.x - f.pos.x;
      const dz = toward.z - f.pos.z;
      const gap = Math.hypot(dx, dz);
      if (gap > WARP || Math.abs(owner.y - f.y) > 3) {
        f.pos.copy(toward);
        f.y = owner.y;
      }
      const want = gap < 0.15 ? 0 : Math.min(s.speed, gap * 3);
      f.speed += (want - f.speed) * (1 - Math.exp(-6 * dt));
      if (gap > 1e-3 && f.speed > 0.01) {
        const step = Math.min(gap, f.speed * dt);
        f.pos.x += (dx / gap) * step;
        f.pos.z += (dz / gap) * step;
        f.phase = (f.phase + step / s.stride) % 1;
      }
      // Faces where it goes, or its owner when still.
      const look = f.speed > 0.2 ? Math.atan2(-dx, -dz) : Math.atan2(-(owner.x - f.pos.x), -(owner.z - f.pos.z));
      f.yaw += angleTo(f.yaw, look) * (1 - Math.exp(-(f.speed > 0.2 ? 8 : 3) * dt));
      // On the floor under it (unless that's another storey: then its owner's).
      const swimming = swimmingAt(f.pos.x, f.pos.z);
      let floor = floorHeightAt(f.pos.x, f.pos.z);
      if (Math.abs(floor - owner.y) > 1) floor = owner.y;
      if (swimming) floor = SHORE.seaY - s.legs - s.height * 0.55;
      f.y += (floor - f.y) * (1 - Math.exp(-10 * dt));
      // Resting: when its owner sits, or has stood still a while.
      const resting = !swimming && f.speed < 0.2 && (seated || f.still > REST_AFTER);
      f.rest += ((resting ? 1 : 0) - f.rest) * (1 - Math.exp(-4 * dt));
      f.hop = Math.max(0, f.hop - dt);

      // --- the pose ------------------------------------------------------------------
      const b = f.built.bones;
      const mesh = f.built.mesh;
      mesh.position.set(f.pos.x, f.y + Math.sin((f.hop / 0.5) * Math.PI) * 0.12, f.pos.z);
      mesh.rotation.y = f.yaw;
      const swing = Math.sin(f.phase * Math.PI * 2) * Math.min(swimming ? 0.5 : 0.7, f.speed * 0.3 + (swimming ? 0.3 : 0));
      const r = f.rest;
      const lie = s.rest === "lie";
      // Sitting tips the front up and folds the back legs; lying lowers it all.
      b[BODY].rotation.x = lie ? 0 : 0.45 * r;
      b[BODY].position.y = f.built.bodyY - (lie ? s.legs * 0.75 : s.legs * 0.35) * r + Math.sin(f.phase * Math.PI * 4) * 0.008 * Math.min(1, f.speed);
      const [fl, fr, bl, br] = LEGS;
      b[fl].rotation.x = swing * (1 - r) + (lie ? -1.3 : -0.45) * r;
      b[fr].rotation.x = -swing * (1 - r) + (lie ? -1.3 : -0.45) * r;
      b[bl].rotation.x = -swing * (1 - r) + (lie ? 1.3 : 0.9) * r;
      b[br].rotation.x = swing * (1 - r) + (lie ? 1.3 : 0.9) * r;
      // The head turns toward its owner, and nods as it trots.
      const toOwner = angleTo(f.yaw, Math.atan2(-(owner.x - f.pos.x), -(owner.z - f.pos.z)));
      b[HEAD].rotation.y += (THREE.MathUtils.clamp(toOwner, -0.7, 0.7) - b[HEAD].rotation.y) * (1 - Math.exp(-4 * dt));
      b[HEAD].rotation.x = Math.sin(f.phase * Math.PI * 4) * 0.06 * Math.min(1, f.speed) - (lie ? 0 : 0.35 * r);
      // A dog wags (more when glad), a cat's tail sways.
      const glad = f.hop > 0 ? 1 : 0.35;
      b[TAIL].rotation.y = kind === "dog" ? Math.sin(t * 11) * 0.5 * glad : kind === "cat" ? Math.sin(t * 1.4) * 0.35 : 0;
      b[TAIL].rotation.x = kind === "cat" ? -0.5 : 0;
    };

    tend(LOCAL_AVATAR, pet.get().kind, seatedRef.current);
    for (const [id, kind] of remotePets) if (id !== selfIdRef.current) tend(id, kind, !!playersRef.current[id]?.posture);
    for (const [key, f] of followers)
      if (!seen.has(key)) {
        f.built.mesh.removeFromParent();
        followers.delete(key);
      }

    // In a headset: a hand on a pet's head pats it.
    if (gl.xr.isPresenting && performance.now() - patAt.current > 1500) {
      const origin = gl.xr.getCamera().parent;
      for (let i = 0; i < 2 && origin; i++) {
        const grip = gl.xr.getControllerGrip(i);
        hand.setFromMatrixPosition(grip.matrix).applyMatrix4(origin.matrixWorld);
        for (const [key, f] of followers) {
          f.built.bones[HEAD].getWorldPosition(headAt);
          if (hand.distanceTo(headAt) > PAT_REACH) continue;
          patAt.current = performance.now();
          patPet(key === LOCAL_AVATAR ? (selfIdRef.current ?? "") : key);
          break;
        }
      }
    }
  }, -0.3);

  return null;
}
