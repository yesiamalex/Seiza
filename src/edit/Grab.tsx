import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GRABBABLE_BY_ANYONE, type WorldObject, type WorldObjectKind } from "../multiplayer/types";
import { constrainWalker, floorHeightAt } from "../scene/layout";
import { trackingStore } from "../xr/body/trackingStore";
import { buzz } from "../xr/controls";
import { BALL_RADIUS } from "../scene/Ball";
import { flatPick, heldObjects, remoteThrows } from "./heldStore";
import { playGrab, playThrow } from "../xr/sounds";

/**
 * Picking things up, handing them over, and throwing them.
 *
 * - In a headset: squeeze the grip near something (or close your hand
 *   round it, with tracked hands) to pick it up; it follows your hand,
 *   staying upright and turning as your hand turns. Open to let go. A
 *   ball flies off as fast as your hand was going.
 * - On a flat screen or a phone: click or tap a ball to pick it up (it's
 *   held in front of you), and click or tap again to throw it where you're
 *   looking. Everything else moves in Edit mode, as before.
 * - Anyone may pick up a ball; an editor, anything. Grab what someone else
 *   holds and it's yours: they let go of it.
 *
 * While held or flying, the room sees it ten times a second (holdObject,
 * relayed and never kept); where it ends up is sent once (dropObject).
 */
const GRIP_ON = 0.7;
const GRIP_OFF = 0.4;
/** Tracked hands: a fist round it. */
const FIST_ON = 0.8;
const FIST_OFF = 0.55;
/** How close the hand must be: to a ball or a board, and to furniture. */
const REACH = 0.32;
const FURNITURE_REACH = 0.6;
/** Holding: a move is sent once it's gone this far, at most this often, and
 *  once a second anyway while it sits still, so it doesn't go stale. */
const SEND_MOVE = 0.02;
const SEND_EVERY = 0.2;
const SEND_IDLE = 1;
const GRAVITY = 9.8;
const BOUNCE = 0.45;
const ROLL = 0.82;
const MAX_FLIGHT = 6;
/** A flat-screen throw: this fast along the view, and a little up. */
const THROW_SPEED = 7.5;
const THROW_LIFT = 2;

const FURNITURE: WorldObjectKind[] = ["chair", "bed", "table", "mirror"];

interface Holding {
  id: string;
  kind: WorldObjectKind;
  hand: "left" | "right" | "flat";
  /** From the hand to the object, in the world, at the yaw it was grabbed. */
  offset: THREE.Vector3;
  handYaw: number;
  /** Its yaw when picked up; it turns from there as the hand does. */
  startYaw: number;
  rotationY: number;
  position: THREE.Vector3;
  /** Recent places, for a throw's speed. */
  trail: { p: THREE.Vector3; t: number }[];
}

interface Flying {
  id: string;
  /** Who threw it: null for you (you save where it lands), or their id. */
  by: string | null;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotationY: number;
  since: number;
}

const yawOf = (q: THREE.Quaternion) => {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return Math.atan2(-f.x, -f.z);
};

export function Grab({
  objects,
  canEdit,
  handsBusy,
  hold,
  drop,
  self,
}: {
  objects: Record<string, WorldObject>;
  canEdit: boolean;
  /** A weapon or an instrument in the hands: nothing else to grab with. */
  handsBusy: () => boolean;
  hold: (id: string, position: [number, number, number], rotationY: number, velocity?: [number, number, number]) => void;
  drop: (id: string, position: [number, number, number], rotationY: number) => void;
  /** Where your feet are and which way you face, for a ball held on a flat
   *  screen: in front of your chest, which in third person the camera's
   *  own front isn't. */
  self: () => { position: [number, number, number]; yaw: number };
}) {
  const { gl, camera } = useThree();
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  const holding = useRef<Holding[]>([]);
  const flying = useRef<Flying[]>([]);
  const gripped = useRef({ left: false, right: false });
  const pickedAt = useRef(0);
  /** The frame clock, for a throw started from a pointer event. */
  const clock = useRef(0);

  const grabbable = (o: WorldObject) => canEditRef.current || GRABBABLE_BY_ANYONE.includes(o.kind);
  const publish = (id: string, p: THREE.Vector3, rotationY: number) => heldObjects.set(id, { position: [p.x, p.y, p.z], rotationY, by: null, at: performance.now() });

  /** Lets go: a ball flies on, anything else is put down where it is. */
  const letGo = (h: Holding, now: number) => {
    holding.current = holding.current.filter((x) => x !== h);
    if (h.kind === "ball") {
      const first = h.trail[0];
      const last = h.trail[h.trail.length - 1];
      const dt = last && first ? last.t - first.t : 0;
      const velocity = dt > 0.02 ? last.p.clone().sub(first.p).divideScalar(dt) : new THREE.Vector3();
      if (velocity.length() > 12) velocity.setLength(12);
      throwBall(h.id, h.position, velocity, h.rotationY, now);
      if (velocity.length() > 1.5) playThrow();
      return;
    }
    const p = h.position.clone();
    if (FURNITURE.includes(h.kind)) p.y = floorHeightAt(p.x, p.z);
    publish(h.id, p, h.rotationY);
    drop(h.id, [round(p.x), round(p.y), round(p.z)], round(h.rotationY));
  };

  /** A throw: flown here, and sent once, with its speed, for everyone to fly. */
  const throwBall = (id: string, position: THREE.Vector3, velocity: THREE.Vector3, rotationY: number, now: number) => {
    flying.current.push({ id, by: null, position: position.clone(), velocity, rotationY, since: now });
    hold(id, [round(position.x), round(position.y), round(position.z)], round(rotationY), [round(velocity.x), round(velocity.y), round(velocity.z)]);
  };
  /** What was last sent for each held thing, and when. */
  const sent = useRef(new Map<string, { p: THREE.Vector3; r: number; t: number }>()).current;

  const pickUp = (o: WorldObject, hand: Holding["hand"], from: THREE.Vector3, handYaw: number) => {
    // Someone else's (or your other hand's) goes to this one.
    holding.current = holding.current.filter((h) => h.id !== o.id);
    flying.current = flying.current.filter((f) => f.id !== o.id);
    const held = heldObjects.get(o.id);
    const at = new THREE.Vector3(...(held?.position ?? o.position));
    const rotationY = held?.rotationY ?? o.rotationY;
    // Yours from now: a hold of theirs still here mustn't take it back.
    publish(o.id, at, rotationY);
    holding.current.push({ id: o.id, kind: o.kind, hand, offset: at.clone().sub(from), handYaw, startYaw: rotationY, rotationY, position: at, trail: [] });
  };

  // A flat-screen throw: the next click or tap after picking a ball up.
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const h = holding.current.find((x) => x.hand === "flat");
      if (!h || performance.now() - pickedAt.current < 250) return;
      const dir = camera.getWorldDirection(new THREE.Vector3());
      h.trail = [];
      holding.current = holding.current.filter((x) => x !== h);
      throwBall(h.id, h.position, dir.multiplyScalar(THROW_SPEED).add(new THREE.Vector3(0, THROW_LIFT, 0)), h.rotationY, clock.current);
      playThrow();
    };
    el.addEventListener("pointerdown", down);
    return () => el.removeEventListener("pointerdown", down);
  }, [gl, camera]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const now = state.clock.elapsedTime;
    clock.current = now;
    const objects = objectsRef.current;

    // Taken off you: someone else's hold arrived for something you have.
    for (const h of [...holding.current]) {
      const held = heldObjects.get(h.id);
      if (!objects[h.id] || (held && held.by !== null)) holding.current = holding.current.filter((x) => x !== h);
    }
    // A flight stops when someone else picks it up (their hold is the newest).
    flying.current = flying.current.filter((f) => objects[f.id] && (heldObjects.get(f.id)?.by ?? null) === f.by);
    // Others' throws, flown here the same way.
    while (remoteThrows.length) {
      const t = remoteThrows.shift()!;
      if (!objects[t.id]) continue;
      holding.current = holding.current.filter((h) => h.id !== t.id);
      flying.current = flying.current.filter((f) => f.id !== t.id);
      flying.current.push({ id: t.id, by: t.by, position: new THREE.Vector3(...t.position), velocity: new THREE.Vector3(...t.velocity), rotationY: t.rotationY, since: now });
    }

    // A flat-screen pick.
    if (flatPick.id) {
      const o = objects[flatPick.id];
      flatPick.id = null;
      if (o && grabbable(o) && !holding.current.some((h) => h.hand === "flat")) {
        pickUp(o, "flat", camera.getWorldPosition(new THREE.Vector3()), 0);
        pickedAt.current = performance.now();
        playGrab();
      }
    }

    // In a headset: the grips (or fists).
    const session = gl.xr.getSession();
    const world = trackingStore.getLocalWorld();
    if (session && world) {
      for (const side of ["left", "right"] as const) {
        const hand = world[side];
        if (!hand.active) continue;
        let squeeze = 0;
        let tracked = false;
        for (const s of session.inputSources) if (s.handedness === side) {
          if (s.hand) tracked = true;
          else squeeze = s.gamepad?.buttons[1]?.value ?? 0;
        }
        const closed = tracked ? hand.curl[1] : squeeze;
        const on = tracked ? FIST_ON : GRIP_ON;
        const off = tracked ? FIST_OFF : GRIP_OFF;
        const mine = holding.current.find((h) => h.hand === side);
        if (!gripped.current[side] && closed >= on) {
          gripped.current[side] = true;
          if (handsBusy()) continue;
          // The nearest thing in reach of this hand.
          let best: { o: WorldObject; d: number } | null = null;
          for (const o of Object.values(objects)) {
            if (!grabbable(o)) continue;
            const p = heldObjects.get(o.id)?.position ?? o.position;
            let d: number;
            if (FURNITURE.includes(o.kind)) {
              // Anywhere over it, below about chest height off its floor.
              d = Math.hypot(hand.position.x - p[0], hand.position.z - p[2]);
              if (d > FURNITURE_REACH * (o.scale ?? 1) || hand.position.y > p[1] + 1.3) continue;
            } else {
              const centre = o.kind === "ball" ? p[1] + BALL_RADIUS : p[1];
              d = Math.hypot(hand.position.x - p[0], hand.position.y - centre, hand.position.z - p[2]);
              if (d > REACH * Math.max(1, o.scale ?? 1)) continue;
            }
            if (!best || d < best.d) best = { o, d };
          }
          if (best) {
            pickUp(best.o, side, hand.position, yawOf(hand.quaternion));
            buzz(gl, side, 0.35, 30);
            playGrab();
          }
        } else if (gripped.current[side] && closed <= off) {
          gripped.current[side] = false;
          if (mine) letGo(mine, now);
        }
      }
    }

    // Where each held thing is now.
    for (const h of holding.current) {
      if (h.hand === "flat") {
        const { position: [x, y, z], yaw } = self();
        h.position.set(x - Math.sin(yaw) * 0.45, y + 1.05 - BALL_RADIUS, z - Math.cos(yaw) * 0.45);
      } else if (world) {
        const hand = world[h.hand];
        const turn = yawOf(hand.quaternion) - h.handYaw;
        h.position.copy(hand.position).add(h.offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), turn));
        h.rotationY = h.startYaw + turn;
      }
      h.trail.push({ p: h.position.clone(), t: now });
      while (h.trail.length > 1 && now - h.trail[0].t > 0.1) h.trail.shift();
      publish(h.id, h.position, h.rotationY);
    }

    // Balls in flight: falling, bouncing off the floor and the walls, rolling to a stop.
    const probe = new THREE.Vector3();
    for (const f of [...flying.current]) {
      f.velocity.y -= GRAVITY * dt;
      f.position.addScaledVector(f.velocity, dt);
      const floor = floorHeightAt(f.position.x, f.position.z);
      if (f.position.y <= floor) {
        f.position.y = floor;
        if (f.velocity.y < 0) f.velocity.y = -f.velocity.y * BOUNCE;
        f.velocity.x *= ROLL;
        f.velocity.z *= ROLL;
        if (Math.abs(f.velocity.y) < 0.4) f.velocity.y = 0;
      }
      probe.set(f.position.x, floor + 1.6, f.position.z);
      constrainWalker(probe);
      if (Math.hypot(probe.x - f.position.x, probe.z - f.position.z) > 1e-3) {
        // A wall: back off it, the way it came.
        f.position.x = probe.x;
        f.position.z = probe.z;
        f.velocity.x *= -0.5;
        f.velocity.z *= -0.5;
      }
      f.rotationY += Math.hypot(f.velocity.x, f.velocity.z) * dt * 2;
      heldObjects.set(f.id, { position: [f.position.x, f.position.y, f.position.z], rotationY: f.rotationY, by: f.by, at: performance.now() });
      const resting = f.position.y <= floor + 1e-3 && f.velocity.length() < 0.25;
      if (resting || now - f.since > MAX_FLIGHT) {
        flying.current = flying.current.filter((x) => x !== f);
        // The thrower saves where it landed; everyone else's lands there too.
        if (f.by === null) drop(f.id, [round(f.position.x), round(f.position.y), round(f.position.z)], round(f.rotationY));
      }
    }

    // The room's view of what you hold: only when it moves, at most five
    // times a second, and once a second while it's still.
    for (const h of holding.current) {
      const last = sent.get(h.id);
      const since = last ? now - last.t : Infinity;
      const moved = !last || last.p.distanceTo(h.position) > SEND_MOVE || Math.abs(last.r - h.rotationY) > 0.05;
      if ((moved && since >= SEND_EVERY) || since >= SEND_IDLE) {
        sent.set(h.id, { p: h.position.clone(), r: h.rotationY, t: now });
        hold(h.id, [round(h.position.x), round(h.position.y), round(h.position.z)], round(h.rotationY));
      }
    }
    for (const id of sent.keys()) if (!holding.current.some((h) => h.id === id)) sent.delete(id);
  });

  return null;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
