import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { trackingStore } from "../body/trackingStore";
import { DWELL_SECONDS, gazeHit, gazeMode, type GazeHit } from "./gaze";

/** Steps the dwell ring is drawn in: one prebuilt geometry per step, so
 *  filling it never builds geometry mid-frame. */
const RING_STEPS = 24;
/** After a press, how long before the same button can be pressed again by
 *  dwelling: long enough to look away, short enough to press twice. */
const REARM_SECONDS = 0.6;
/** Where the reticle floats when the gaze rests on nothing. */
const IDLE_DISTANCE = 1.5;
/** After a press, dwelling stays off until the head has turned this far
 *  (radians, about 4°). A press often changes what's under the gaze (the
 *  menu opens right there), and a steady gaze would otherwise go on to
 *  press whatever button appeared under it. Moving to a button on purpose
 *  turns the head anyway. Taps aren't affected. */
const REARM_TURN = 0.07;

/**
 * The gaze reticle and its presses (see gaze.ts). A small dot at the
 * centre of view, sitting on whatever it points at; over a button a ring
 * fills, and pressing happens when it's full or when you tap the screen.
 * Draws and does nothing unless the session is in gaze mode.
 */
export function GazeCursor({ session }: { session: XRSession }) {
  const group = useRef<THREE.Group>(null);
  const progress = useRef<THREE.Mesh>(null);
  const hitRef = useRef<GazeHit | null>(null);
  const dwell = useRef({ key: null as string | null, mesh: null as THREE.Object3D | null, time: 0, rearm: 0, armed: true, pressedAt: new THREE.Vector3() });

  const geometries = useMemo(
    () => Array.from({ length: RING_STEPS + 1 }, (_, i) => new THREE.RingGeometry(0.014, 0.019, 32, 1, Math.PI / 2, -(i / RING_STEPS) * Math.PI * 2 || -1e-4)),
    []
  );
  const dot = useMemo(() => new THREE.CircleGeometry(0.0045, 16), []);
  const track = useMemo(() => new THREE.RingGeometry(0.014, 0.019, 32), []);
  const materials = useMemo(
    () => ({
      dot: new THREE.MeshBasicMaterial({ color: "#ffffff", depthTest: false, depthWrite: false, transparent: true, toneMapped: false }),
      track: new THREE.MeshBasicMaterial({ color: "#ffffff", opacity: 0.25, depthTest: false, depthWrite: false, transparent: true, toneMapped: false }),
      fill: new THREE.MeshBasicMaterial({ color: "#e8c37a", depthTest: false, depthWrite: false, transparent: true, toneMapped: false }),
    }),
    []
  );
  useEffect(
    () => () => {
      for (const g of geometries) g.dispose();
      dot.dispose();
      track.dispose();
      for (const m of Object.values(materials)) m.dispose();
    },
    [geometries, dot, track, materials]
  );

  const press = (hit: GazeHit) => {
    hit.target.select(hit.uv);
    const d = dwell.current;
    d.time = 0;
    d.rearm = REARM_SECONDS;
    d.armed = false;
    const world = trackingStore.getLocalWorld();
    if (world) d.pressedAt.set(0, 0, -1).applyQuaternion(world.head.quaternion);
  };

  // A tap on the screen (or a viewer's button) arrives as a `select` on the
  // session, whatever kind of input the browser models it as. Controllers
  // and tracked hands aren't gaze, and point for themselves.
  useEffect(() => {
    const onSelect = (event: Event) => {
      if (!gazeMode.active) return;
      const mode = (event as XRInputSourceEvent).inputSource?.targetRayMode;
      if (mode === "tracked-pointer" || mode === "transient-pointer") return;
      const hit = hitRef.current;
      if (hit?.key) press(hit);
    };
    session.addEventListener("select", onSelect);
    return () => session.removeEventListener("select", onSelect);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, rawDelta) => {
    const g = group.current;
    if (!g) return;
    const world = trackingStore.getLocalWorld();
    if (!gazeMode.active || !world) {
      g.visible = false;
      hitRef.current = null;
      return;
    }
    const delta = Math.min(rawDelta, 0.1);
    const head = world.head.position;
    const hit = gazeHit(head, world.head.quaternion);
    hitRef.current = hit;

    // The reticle sits just in front of what it points at, or floats ahead.
    g.visible = true;
    if (hit) g.position.copy(hit.point).lerp(head, 0.02);
    else g.position.copy(head).add(new THREE.Vector3(0, 0, -IDLE_DISTANCE).applyQuaternion(world.head.quaternion));
    g.quaternion.copy(world.head.quaternion);
    // Constant size on screen, whatever the distance.
    g.scale.setScalar(g.position.distanceTo(head));

    // Dwell: a ring fills while the gaze stays on one button.
    const d = dwell.current;
    d.rearm = Math.max(0, d.rearm - delta);
    if (!d.armed && new THREE.Vector3(0, 0, -1).applyQuaternion(world.head.quaternion).angleTo(d.pressedAt) > REARM_TURN) d.armed = true;
    const key = hit?.key ?? null;
    if (!hit || key === null || key !== d.key || hit.mesh !== d.mesh) {
      d.key = key;
      d.mesh = hit?.mesh ?? null;
      d.time = 0;
    } else if (d.rearm === 0 && d.armed) {
      d.time += delta;
      if (d.time >= DWELL_SECONDS) press(hit);
    }
    const ring = progress.current;
    if (ring) {
      const step = key && d.rearm === 0 && d.armed ? Math.round((d.time / DWELL_SECONDS) * RING_STEPS) : 0;
      ring.geometry = geometries[Math.min(RING_STEPS, step)];
      ring.visible = step > 0;
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh geometry={dot} material={materials.dot} renderOrder={2000} raycast={() => null} />
      <mesh geometry={track} material={materials.track} renderOrder={2000} raycast={() => null} />
      <mesh ref={progress} geometry={geometries[0]} material={materials.fill} renderOrder={2001} raycast={() => null} />
    </group>
  );
}
