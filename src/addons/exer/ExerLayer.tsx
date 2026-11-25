import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { sharedOverlay, type PoseOverlay } from "../../xr/body/bodyIk";
import { LOCAL_TRACKING_SOURCE, trackingStore } from "../../xr/body/trackingStore";
import { TRACKING_STALE_MS } from "../../xr/body/trackingWire";
import type { PlayerState } from "../../multiplayer/types";
import { floorHeightAt } from "../../scene/layout";
import { buzz } from "../../xr/controls";
import { drive } from "../../player/drive";
import { getAddonAvatar, LOCAL_AVATAR } from "../avatars";
import { newBodyPose, poseBody, type BodyPose } from "../body";
import { onAddonEvent, sendAddonEvent } from "../bus";
import { disposeTree, feetAndEye, newTrackedHand, poseHands, rigFor, toTrackedHand, type HandTarget } from "../rig";
import { latestReading, sendGradient } from "../sport";
import { announceRide, parseExerEvent, playBell, remoteRiders, resetRide, ride, ringBell, setVehicle } from "./ride";
import { buildVehicle, gripTarget, RIDE_EYE, riderPose, slopeFactor, VEHICLE_SPECS, type Vehicle } from "./vehicles";

/** Walking speed (PlayerRig's MOVE_SPEED), m/s: rides go a multiple of it. */
const WALK = 3.2;
/** How far ahead the slope is read, metres. */
const SLOPE_AHEAD = 1.5;
/** The right controller's A and B buttons (xr-standard mapping). */
const A_BUTTON = 4;
const B_BUTTON = 5;

interface Holder {
  vrm: VRM;
  overlay: PoseOverlay;
  vehicle: Vehicle | null;
  prop: THREE.Group | null;
  wheels: THREE.Object3D[];
  detach: () => void;
  weight: number;
  phase: number;
  last: THREE.Vector3 | null;
  speed: number;
  body: BodyPose;
  hands: { right: HandTarget; left: HandTarget };
  tracked: { right: ReturnType<typeof newTrackedHand>; left: ReturnType<typeof newTrackedHand> };
}

const target = (): HandTarget => ({ pos: [0, 0, 0], blade: [0, 1, 0], fingers: [0, 0, -1], curl: 0.9 });
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const scaleV = new THREE.Vector3();

export function ExerLayer({ selfId, players, getSelfPosition, selfSeated }: { selfId: string | null; players: Record<string, PlayerState>; getSelfPosition: () => [number, number, number]; selfSeated: boolean }) {
  const { gl, camera } = useThree();
  const holders = useRef(new Map<string, Holder>()).current;
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;
  const playersRef = useRef(players);
  playersRef.current = players;
  const selfRef = useRef(getSelfPosition);
  selfRef.current = getSelfPosition;
  const seatedRef = useRef(selfSeated);
  seatedRef.current = selfSeated;
  const local = useRef({ last: null as [number, number, number] | null, heading: new THREE.Vector3(0, 0, -1), aWas: false, sentGradientAt: 0, storeAt: 0, speed: 0, gradient: 0, distance: 0, climb: 0, vehicle: null as Vehicle | null, braking: false, bWas: false });

  useEffect(() => sendAddonEvent("exer", { k: "hi" }), []);
  useEffect(
    () =>
      onAddonEvent("exer", (from, data) => {
        const event = parseExerEvent(data);
        if (!event || from === selfIdRef.current) return;
        if (event.k === "hi") {
          if (ride.get().vehicle) announceRide();
          return;
        }
        if (event.k === "lo") {
          remoteRiders.set(from, { vehicle: event.vehicle });
          return;
        }
        const vehicle = remoteRiders.get(from)?.vehicle;
        const bell = vehicle ? VEHICLE_SPECS[vehicle].bell : null;
        const vrm = getAddonAvatar(from);
        if (bell) playBell(bell, vrm ? camera.getWorldPosition(v1).distanceTo(vrm.scene.getWorldPosition(v2)) : undefined);
      }),
    [camera]
  );
  // Sitting down gets off the ride.
  useEffect(() => {
    if (selfSeated && ride.get().vehicle) setVehicle(null);
  }, [selfSeated]);
  useEffect(
    () => () => {
      for (const h of holders.values()) release(h);
      holders.clear();
      resetRide();
    },
    [holders]
  );

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const frame = state.clock.elapsedTime;
    const me = ride.get();
    const l = local.current;
    // A new ride (or getting off) starts the counts again.
    if (me.vehicle !== l.vehicle) {
      l.vehicle = me.vehicle;
      l.speed = l.gradient = l.distance = l.climb = 0;
    }

    // --- this visitor's ride: speed, distance, the slope ahead ----------------------
    const at = selfRef.current();
    if (l.last && me.vehicle) {
      const dx = at[0] - l.last[0];
      const dz = at[2] - l.last[2];
      const step = Math.hypot(dx, dz);
      if (step < 2) {
        l.speed += (step / Math.max(dt, 1e-3) - l.speed) * (1 - Math.exp(-6 * dt));
        l.distance += step;
        l.climb += Math.max(0, at[1] - l.last[1]);
        if (step > 1e-3) l.heading.set(dx / step, 0, dz / step);
      }
    } else l.speed = 0;
    l.last = at;
    if (me.vehicle) {
      const here = floorHeightAt(at[0], at[2]);
      const ahead = floorHeightAt(at[0] + l.heading.x * SLOPE_AHEAD, at[2] + l.heading.z * SLOPE_AHEAD);
      l.gradient += ((ahead - here) / SLOPE_AHEAD - l.gradient) * (1 - Math.exp(-3 * dt));
      drive.scale = VEHICLE_SPECS[me.vehicle].speed * slopeFactor(me.vehicle, l.gradient);
      // A smart trainer (SportSeiza) sets the speed itself, and hears the slope.
      const reading = latestReading();
      drive.cruise = reading?.speed ?? 0;
      if (frame - l.sentGradientAt > 1) {
        l.sentGradientAt = frame;
        sendGradient(Math.round(l.gradient * 1000) / 10);
      }
      // The panel's numbers, five times a second.
      if (frame - l.storeAt > 0.2) {
        l.storeAt = frame;
        ride.set((s) => ({ ...s, speed: l.speed, gradient: l.gradient, distance: l.distance, climb: l.climb }));
      }
    } else if (l.distance) {
      l.distance = l.climb = l.gradient = 0;
    }

    // --- in a headset: the right trigger rides on, the left brakes, A rings ---------
    const session = gl.xr.getSession();
    if (session && me.vehicle) {
      let trigger = 0;
      let brake = 0;
      let a = false;
      let b = false;
      for (const s of session.inputSources) {
        if (!s.gamepad) continue;
        if (s.handedness === "left") brake = s.gamepad.buttons[0]?.value ?? 0;
        if (s.handedness !== "right") continue;
        trigger = s.gamepad.buttons[0]?.value ?? 0;
        a = !!s.gamepad.buttons[A_BUTTON]?.pressed;
        b = !!s.gamepad.buttons[B_BUTTON]?.pressed;
      }
      // B gets off.
      if (b && !l.bWas) {
        l.bWas = true;
        setVehicle(null);
        buzz(gl, "right", 0.3, 40);
        return;
      }
      l.bWas = b;
      if (a && !l.aWas) {
        ringBell();
        buzz(gl, "right", 0.2, 30);
      }
      l.aWas = a;
      const world = trackingStore.getLocalWorld();
      const origin = gl.xr.getCamera().parent;
      // The brake stops everything, a smart trainer's speed included.
      const braking = brake > 0.5;
      if (braking && !l.braking) buzz(gl, "left", 0.25, 40);
      l.braking = braking;
      const speed = braking ? 0 : drive.cruise > 0 ? drive.cruise : trigger > 0.5 ? WALK * drive.scale : 0;
      if (speed > 0 && world && origin && !seatedRef.current) {
        // Along where you face, level; the walls still have their say
        // (PlayerRig corrects the head against them every frame).
        v1.set(0, 0, -1).applyQuaternion(world.head.quaternion).setY(0);
        if (v1.lengthSq() > 1e-6) origin.position.addScaledVector(v1.normalize(), speed * dt);
      }
    }

    // --- every rider's ride under them, and how they sit on it ----------------------
    const seen = new Set<string>();
    const tend = (key: string, vehicle: Vehicle | null) => {
      const vrm = getAddonAvatar(key);
      if (!vrm) return;
      const rig = rigFor(vrm);
      seen.add(key);
      let h = holders.get(key);
      if (h && h.vrm !== vrm) {
        release(h);
        holders.delete(key);
        h = undefined;
      }
      if (!h) {
        h = { vrm, overlay: sharedOverlay(vrm, frame), vehicle: null, prop: null, wheels: [], detach: () => {}, weight: 0, phase: 0, last: null, speed: 0, body: newBodyPose(), hands: { right: target(), left: target() }, tracked: { right: newTrackedHand(), left: newTrackedHand() } };
        holders.set(key, h);
      }
      h.overlay = sharedOverlay(vrm, frame);
      if (vehicle !== h.vehicle) {
        h.detach();
        if (h.prop) disposeTree(h.prop);
        h.prop = null;
        h.wheels = [];
        h.detach = () => {};
        h.vehicle = vehicle;
        const anchor = vrm.scene.parent;
        if (vehicle && rig && anchor) {
          const built = buildVehicle(vehicle);
          built.root.scale.setScalar(feetAndEye(rig, v1) / RIDE_EYE / anchor.getWorldScale(scaleV).y);
          anchor.add(built.root);
          h.prop = built.root;
          h.wheels = built.wheels;
          const root = built.root;
          h.detach = () => anchor.remove(root);
        }
      }
      // How far it went, for the wheels and the pedals.
      const p = vrm.scene.getWorldPosition(v2);
      const step = h.last ? Math.hypot(p.x - h.last.x, p.z - h.last.z) : 0;
      h.last = (h.last ?? new THREE.Vector3()).copy(p);
      if (step < 2 && vehicle) {
        h.speed += (step / Math.max(dt, 1e-3) - h.speed) * (1 - Math.exp(-6 * dt));
        for (const w of h.wheels) w.rotation.x -= step / (w.userData.wheel as number);
        h.phase += step / 0.35;
      }
      const source = key === LOCAL_AVATAR ? LOCAL_TRACKING_SOURCE : key;
      const sample = trackingStore.get(source);
      const inHeadset = sample !== null && performance.now() - sample.receivedAt < TRACKING_STALE_MS;
      const seated = key === LOCAL_AVATAR ? seatedRef.current : !!playersRef.current[key]?.posture;
      h.weight += ((vehicle && !inHeadset && !seated ? 1 : 0) - h.weight) * (1 - Math.exp(-6 * dt));
      if (!rig || !h.vehicle || h.weight < 0.01) return;
      // Pedals turn only while moving; standing still, feet rest level.
      riderPose(h.vehicle, h.speed > 0.2 ? h.phase : Math.PI / 2, h.body);
      poseBody(rig, h.overlay, h.body, h.weight, h.weight);
      const right = gripTarget(h.vehicle, "right", h.hands.right);
      const left = gripTarget(h.vehicle, "left", h.hands.left);
      if (right && left) poseHands(rig, h.overlay, toTrackedHand("right", right, h.tracked.right), toTrackedHand("left", left, h.tracked.left), h.weight);
    };
    tend(LOCAL_AVATAR, me.vehicle);
    for (const [id, r] of remoteRiders) if (r.vehicle || holders.has(id)) tend(id, r.vehicle);
    for (const [key, h] of holders)
      if (!seen.has(key)) {
        release(h);
        holders.delete(key);
      }
  }, -0.35);

  return null;
}

function release(h: Holder) {
  h.overlay.restore();
  h.detach();
  if (h.prop) disposeTree(h.prop);
}
