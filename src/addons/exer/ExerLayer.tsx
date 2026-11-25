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
import { announceRide, getOffBehind, myPassenger, nearRide, parseExerEvent, passenger, passengers, playBell, releaseBell, remoteRiders, resetRide, ride, ringBell, setVehicle, startEngine, startHorn, type Engine } from "./ride";
import { SEAT_HEIGHT } from "../../scene/layout";
import { skyState } from "../../sky/skyState";
import { buildVehicle, gripTarget, RIDE_EYE, riderPose, slopeFactor, TRICKS, VEHICLE_SPECS, type RideMotion, type Vehicle } from "./vehicles";

/** Walking speed (PlayerRig's MOVE_SPEED), m/s: rides go a multiple of it. */
const WALK = 3.2;
/** How far ahead the slope is read, metres. */
const SLOPE_AHEAD = 1.5;
/** The right controller's A and B buttons (xr-standard mapping). */
const A_BUTTON = 4;
const B_BUTTON = 5;

/** Getting on or off, or changing rides: each half (the old ride going,
 *  the new one coming) takes this long, seconds. */
const SWAP = 0.3;
/** A moped's engine is heard within this far, metres. */
const ENGINE_RANGE = 28;
const ease = (g: number) => g * g * (3 - 2 * g);

interface Holder {
  vrm: VRM;
  overlay: PoseOverlay;
  /** The ride shown, which may still be going or coming (grow 0 to 1). */
  vehicle: Vehicle | null;
  grow: number;
  base: number;
  beam: THREE.Mesh | null;
  lamp: THREE.SpotLight | null;
  engine: Engine | null;
  engineAt: number;
  /** How the ride is going (vehicles.ts's RideMotion), for the body. */
  motion: RideMotion;
  yaw: number | null;
  /** Which trick the next jump does (a skateboard's), by turn. */
  trick: number;
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
const turnQ = new THREE.Quaternion();

export function ExerLayer({ selfId, players, getSelfPosition, selfSeated }: { selfId: string | null; players: Record<string, PlayerState>; getSelfPosition: () => [number, number, number]; selfSeated: boolean }) {
  const { gl, camera, scene } = useThree();
  const holders = useRef(new Map<string, Holder>()).current;
  /** Horns sounding from others, until they let go. */
  const horns = useRef(new Map<string, () => void>()).current;
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;
  const playersRef = useRef(players);
  playersRef.current = players;
  const selfRef = useRef(getSelfPosition);
  selfRef.current = getSelfPosition;
  const seatedRef = useRef(selfSeated);
  seatedRef.current = selfSeated;
  const local = useRef({ last: null as [number, number, number] | null, heading: new THREE.Vector3(0, 0, -1), aWas: false, sentGradientAt: 0, storeAt: 0, speed: 0, gradient: 0, distance: 0, climb: 0, vehicle: null as Vehicle | null, braking: false, bWas: false, vrSpeed: 0 });

  useEffect(() => sendAddonEvent("exer", { k: "hi" }), []);
  // The first moped used to stall a frame: its paint, and its headlight (a
  // light more in the scene, which every lit material's shader changes
  // for), compiled on the spot. Warmed up here as soon as ExerSeiza is on,
  // in the background: compiled with a spare moped and an unlit lamp in the
  // scene, both hidden at once so no frame waits for them, then removed.
  // Programs are cached by what they are, so the real ones reuse these.
  useEffect(() => {
    const warm = buildVehicle("moped").root;
    const lamp = new THREE.SpotLight("#fff2d0", 0, 24, 0.5, 0.6, 1.2);
    warm.add(lamp, lamp.target);
    scene.add(warm);
    const done = gl.compileAsync(scene, camera).catch(() => undefined);
    warm.visible = false;
    let gone = false;
    const drop = () => {
      if (gone) return;
      gone = true;
      // Not disposed: that would let its compiled programs go too.
      scene.remove(warm);
    };
    void done.then(drop);
    return drop;
  }, [gl, scene, camera]);
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
        if (event.k === "pa") {
          if (event.driver) passengers.set(from, event.driver);
          else passengers.delete(from);
          return;
        }
        if (event.k === "off") {
          if (event.id === selfIdRef.current && passenger.get().driver === from) getOffBehind();
          return;
        }
        const stopHorn = horns.get(from);
        horns.delete(from);
        stopHorn?.();
        if (event.k === "hu") return;
        const vehicle = remoteRiders.get(from)?.vehicle;
        const bell = vehicle ? VEHICLE_SPECS[vehicle].bell : null;
        const vrm = getAddonAvatar(from);
        const distance = vrm ? camera.getWorldPosition(v1).distanceTo(vrm.scene.getWorldPosition(v2)) : undefined;
        // A horn sounds until they let go ("hu"); a bell rings out.
        if (bell === "horn") horns.set(from, startHorn(distance));
        else if (bell) playBell(distance);
      }),
    [camera]
  );
  // Sitting down gets off the ride; standing up gets off a ride you're behind.
  useEffect(() => {
    if (selfSeated && ride.get().vehicle) setVehicle(null);
    if (!selfSeated && passenger.get().driver) getOffBehind();
  }, [selfSeated]);
  useEffect(
    () => () => {
      for (const h of holders.values()) release(h);
      holders.clear();
      for (const stop of horns.values()) stop();
      horns.clear();
      resetRide();
    },
    [holders]
  );

  /** The back seat, moved with the ride you're behind; and the ride you
   *  could get on behind, and who's behind you, for the HUD. */
  const tendPassengers = () => {
    const mine = passenger.get();
    if (mine.driver && mine.seat && mine.kind) {
      const h = holders.get(mine.driver);
      const spot = BEHIND[mine.kind];
      if (!h?.prop || h.vehicle !== mine.kind || !spot) {
        getOffBehind();
      } else {
        h.prop.localToWorld(seatAt.set(spot.x, spot.y, spot.z));
        const yaw = new THREE.Euler().setFromQuaternion(h.prop.getWorldQuaternion(seatQ), "YXZ").y;
        mine.seat.position[0] = seatAt.x;
        mine.seat.position[1] = seatAt.y - SEAT_HEIGHT;
        mine.seat.position[2] = seatAt.z;
        mine.seat.rotationY = yaw + spot.turn;
      }
    }
    // A ride near enough, with room behind (and you on foot).
    const self = getAddonAvatar(LOCAL_AVATAR);
    let near: { driver: string; kind: Vehicle } | null = null;
    if (self && !ride.get().vehicle && !mine.driver && !seatedRef.current) {
      self.scene.getWorldPosition(v1);
      let best = 2.2;
      for (const [id, r] of remoteRiders) {
        if (!r.vehicle || !BEHIND[r.vehicle] || [...passengers.values()].includes(id)) continue;
        const vrm = getAddonAvatar(id);
        if (!vrm) continue;
        const d = vrm.scene.getWorldPosition(v2).distanceTo(v1);
        if (d < best) {
          best = d;
          near = { driver: id, kind: r.vehicle };
        }
      }
    }
    if (nearRide.get().driver !== (near?.driver ?? null)) nearRide.set(near ? { driver: near.driver, name: playersRef.current[near.driver]?.displayName ?? "", kind: near.kind } : { driver: null, name: "", kind: null });
    const behindMe = [...passengers].find(([, d]) => d === selfIdRef.current)?.[0] ?? null;
    if (myPassenger.get().id !== behindMe) myPassenger.set({ id: behindMe, name: behindMe ? playersRef.current[behindMe]?.displayName ?? "" : "" });
  };

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
      drive.ease = VEHICLE_SPECS[me.vehicle].ease;
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
      // A rings the bell, or sounds the horn while held.
      if (a && !l.aWas) {
        ringBell();
        buzz(gl, "right", 0.2, 30);
      }
      if (!a && l.aWas) releaseBell();
      l.aWas = a;
      const world = trackingStore.getLocalWorld();
      const origin = gl.xr.getCamera().parent;
      // The brake stops everything, a smart trainer's speed included.
      const braking = brake > 0.5;
      if (braking && !l.braking) buzz(gl, "left", 0.25, 40);
      l.braking = braking;
      // Speed builds while the trigger's held and fades when it's let go
      // (the brake stops much sooner), as on a screen (PlayerRig).
      const want = braking ? 0 : drive.cruise > 0 ? drive.cruise : trigger > 0.5 ? WALK * drive.scale : 0;
      l.vrSpeed += (want - l.vrSpeed) * (1 - Math.exp(-(braking ? drive.ease * 4 : drive.ease) * dt));
      if (l.vrSpeed < 0.02) l.vrSpeed = 0;
      const speed = l.vrSpeed;
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
        h = { vrm, overlay: sharedOverlay(vrm, frame), vehicle: null, grow: 0, base: 1, beam: null, lamp: null, engine: null, engineAt: 0, motion: { t: 0, speed: 0, turn: 0, air: 0 }, yaw: null, trick: 0, prop: null, wheels: [], detach: () => {}, weight: 0, phase: 0, last: null, speed: 0, body: newBodyPose(), hands: { right: target(), left: target() }, tracked: { right: newTrackedHand(), left: newTrackedHand() } };
        holders.set(key, h);
      }
      h.overlay = sharedOverlay(vrm, frame);
      // A change of ride: the old one shrinks away (and the rider eases off
      // it), then the new one grows in under them.
      if (vehicle !== h.vehicle && h.vehicle && h.grow > 0) h.grow = Math.max(0, h.grow - dt / SWAP);
      else if (vehicle !== h.vehicle) {
        dropProp(h);
        h.vehicle = vehicle;
        h.grow = 0;
        const anchor = vrm.scene.parent;
        if (vehicle && rig && anchor) {
          const built = buildVehicle(vehicle);
          h.base = feetAndEye(rig, v1) / RIDE_EYE / anchor.getWorldScale(scaleV).y;
          anchor.add(built.root);
          h.prop = built.root;
          h.wheels = built.wheels;
          h.beam = (built.root.getObjectByName("beam") as THREE.Mesh | undefined) ?? null;
          // Your own moped's headlight is a real light (no shadows): the
          // only one, and only while you ride one.
          if (key === LOCAL_AVATAR && vehicle === "moped") {
            const lamp = new THREE.SpotLight("#fff2d0", 0, 24, 0.5, 0.6, 1.2);
            lamp.position.set(0, 0.9, -0.56);
            lamp.target.position.set(0, 0.1, -6);
            built.root.add(lamp, lamp.target);
            h.lamp = lamp;
          }
          const root = built.root;
          h.detach = () => anchor.remove(root);
        }
      } else if (h.grow < 1) h.grow = Math.min(1, h.grow + dt / SWAP);
      const shown = ease(h.grow);
      if (h.prop) h.prop.scale.setScalar(h.base * Math.max(0.001, shown));
      const night = skyState.night ?? 0;
      if (h.beam) (h.beam.material as THREE.MeshBasicMaterial).opacity = (0.04 + 0.22 * night) * shown;
      if (h.lamp) h.lamp.intensity = (2 + 28 * night) * shown;
      // A moped's engine, heard nearby, putting along faster as it goes.
      const distance = camera.getWorldPosition(v1).distanceTo(vrm.scene.getWorldPosition(v2));
      if (h.vehicle === "moped" && distance < ENGINE_RANGE) {
        h.engine ??= startEngine();
        if (h.engine && frame - h.engineAt > 0.1) {
          h.engineAt = frame;
          h.engine.set(h.speed, shown * (1 - distance / ENGINE_RANGE));
        }
      } else if (h.engine) {
        h.engine.stop();
        h.engine = null;
      }
      // How far it went, for the wheels and the pedals.
      const p = vrm.scene.getWorldPosition(v2);
      const step = h.last ? Math.hypot(p.x - h.last.x, p.z - h.last.z) : 0;
      h.last = (h.last ?? new THREE.Vector3()).copy(p);
      if (step < 2 && h.vehicle) {
        h.speed += (step / Math.max(dt, 1e-3) - h.speed) * (1 - Math.exp(-6 * dt));
        for (const w of h.wheels) w.rotation.x -= step / (w.userData.wheel as number);
        // A crank turn every 4.4 m, as a real bike is geared (about 80 rpm at a
        // ride's speed): faster read as backward, the wagon-wheel effect.
        h.phase += step / 0.7;
      }
      const source = key === LOCAL_AVATAR ? LOCAL_TRACKING_SOURCE : key;
      const sample = trackingStore.get(source);
      const inHeadset = sample !== null && performance.now() - sample.receivedAt < TRACKING_STALE_MS;
      const seated = key === LOCAL_AVATAR ? seatedRef.current : !!playersRef.current[key]?.posture;
      h.weight += ((h.vehicle && !inHeadset && !seated ? shown : 0) - h.weight) * (1 - Math.exp(-12 * dt));
      // How it's going: how fast it turns (from the rider's heading), and
      // whether it's off the ground (a jump), for the body and the ride.
      const m = h.motion;
      m.t = frame;
      m.speed = h.speed;
      const anchorYaw = new THREE.Euler().setFromQuaternion((vrm.scene.parent ?? vrm.scene).getWorldQuaternion(turnQ), "YXZ").y;
      if (h.yaw !== null) m.turn += (Math.atan2(Math.sin(anchorYaw - h.yaw), Math.cos(anchorYaw - h.yaw)) / Math.max(dt, 1e-3) - m.turn) * (1 - Math.exp(-5 * dt));
      h.yaw = anchorYaw;
      const airborne = p.y - floorHeightAt(p.x, p.z) > 0.15;
      if (airborne) m.air += dt;
      else if (m.air > 0) {
        m.air = 0;
        h.trick = (h.trick + 1) % TRICKS.length;
      }
      if (h.prop) {
        // The ride banks into a turn, a bike most; a board does its trick.
        const bank = Math.max(-0.35, Math.min(0.35, m.turn * (h.vehicle === "bike" ? 0.12 : h.vehicle === "moped" ? 0.08 : 0.1))) * Math.min(1, h.speed / 3);
        h.prop.rotation.set(0, 0, bank);
        h.prop.position.y = 0;
        if (h.vehicle === "skateboard" && m.air > 0) {
          const k = Math.min(1, m.air / 0.55);
          const spin = Math.PI * 2 * k * k * (3 - 2 * k);
          const trick = TRICKS[h.trick];
          if (trick === "kickflip") h.prop.rotation.z = spin;
          else if (trick === "shove-it") h.prop.rotation.y = spin;
          h.prop.position.y = 0.06 * Math.sin(Math.PI * k);
        }
      }
      if (!rig || !h.vehicle || h.weight < 0.01) return;
      // Pedals turn only while moving; standing still, feet rest level.
      riderPose(h.vehicle, h.speed > 0.2 ? h.phase : Math.PI / 2, h.body, m, TRICKS[h.trick]);
      poseBody(rig, h.overlay, h.body, h.weight, h.weight);
      const right = gripTarget(h.vehicle, "right", h.hands.right);
      const left = gripTarget(h.vehicle, "left", h.hands.left);
      if (right && left) poseHands(rig, h.overlay, toTrackedHand("right", right, h.tracked.right), toTrackedHand("left", left, h.tracked.left), h.weight);
    };
    tend(LOCAL_AVATAR, me.vehicle);
    tendPassengers();
    for (const [id, r] of remoteRiders) if (r.vehicle || holders.has(id)) tend(id, r.vehicle);
    for (const [key, h] of holders)
      if (!seen.has(key)) {
        release(h);
        holders.delete(key);
      }
  }, -0.35);

  return null;
}

function dropProp(h: Holder) {
  h.detach();
  if (h.prop) disposeTree(h.prop);
  h.prop = null;
  h.wheels = [];
  h.beam = null;
  h.lamp?.dispose();
  h.lamp = null;
  h.detach = () => {};
}

/** Where a passenger sits, in a ride's own frame (metres, for its 1.55 m
 *  rider; -z ahead): side-saddle on a bike's carrier facing right, as in
 *  so many anime ride-homes, or astride behind on a moped. */
const BEHIND: Partial<Record<Vehicle, { x: number; y: number; z: number; turn: number }>> = {
  bike: { x: 0.12, y: 0.8, z: 0.44, turn: -Math.PI / 2 },
  moped: { x: 0, y: 0.76, z: 0.52, turn: 0 },
};
const seatAt = new THREE.Vector3();
const seatQ = new THREE.Quaternion();

function release(h: Holder) {
  h.overlay.restore();
  dropProp(h);
  h.engine?.stop();
  h.engine = null;
}
