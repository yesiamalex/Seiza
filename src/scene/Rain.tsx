/**
 * Rain you can see: thin streaks falling around the viewer, as many as the
 * weather's rain (skyState.rain, 0 to 1) calls for, slanted by its wind,
 * and none under cover (layout's `sheltered`: Seiza's rooms, or a model
 * world's buildings where its navmesh has a floor overhead). Without it, a
 * rainy sky only greyed, and picking Rain seemed to do nothing.
 *
 * Cheap: one line-segments mesh, its positions updated in place each frame,
 * and nothing at all drawn while it's dry.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { skyState } from "../sky/skyState";
import { sheltered } from "./layout";

/** Most streaks at once, for a typhoon's downpour. */
const MAX_DROPS = 1400;
/** How far around the viewer they fall, in metres. */
const RADIUS = 16;
const TOP = 11;
const BOTTOM = 3;
/** Metres a second. */
const FALL = 11;
const STREAK = 0.55;

export function Rain() {
  const lines = useRef<THREE.LineSegments>(null);
  const drops = useMemo(() => {
    const x = new Float32Array(MAX_DROPS), y = new Float32Array(MAX_DROPS), z = new Float32Array(MAX_DROPS);
    return { x, y, z, live: new Uint8Array(MAX_DROPS) };
  }, []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_DROPS * 6), 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const material = useMemo(() => new THREE.LineBasicMaterial({ color: "#c9d6e6", transparent: true, opacity: 0, depthWrite: false, fog: true }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  useFrame(({ camera }, delta) => {
    const mesh = lines.current;
    if (!mesh) return;
    const rain = skyState.active ? skyState.rain : 0;
    if (rain < 0.04) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const dt = Math.min(delta, 0.1);
    const count = Math.round(MAX_DROPS * Math.min(1, rain));
    const wind = skyState.weatherState?.windSpeed() ?? 0;
    // Slant: metres sideways per metre fallen, from the wind (toward +X).
    const slant = Math.min(0.9, wind * 0.03);
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const p = position.array as Float32Array;
    const respawn = (i: number, high: boolean) => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * RADIUS;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const y = high ? cy + TOP : cy - BOTTOM + Math.random() * (TOP + BOTTOM);
      drops.x[i] = x;
      drops.y[i] = y;
      drops.z[i] = z;
      drops.live[i] = sheltered(x, cy, z) ? 0 : 1;
    };
    for (let i = 0; i < count; i++) {
      const far = Math.hypot(drops.x[i] - cx, drops.z[i] - cz) > RADIUS + 2;
      if (drops.y[i] === 0 && drops.x[i] === 0) respawn(i, false);
      else {
        drops.y[i] -= FALL * dt;
        drops.x[i] += FALL * slant * dt;
        if (drops.y[i] < cy - BOTTOM || far) respawn(i, !far);
      }
      const o = i * 6;
      if (!drops.live[i]) {
        p.fill(0, o, o + 6);
        continue;
      }
      p[o] = drops.x[i];
      p[o + 1] = drops.y[i];
      p[o + 2] = drops.z[i];
      p[o + 3] = drops.x[i] - STREAK * slant;
      p[o + 4] = drops.y[i] + STREAK;
      p[o + 5] = drops.z[i];
    }
    position.needsUpdate = true;
    geometry.setDrawRange(0, count * 2);
    material.opacity = 0.25 + 0.3 * Math.min(1, rain);
  });

  // Always in view of the camera: never culled by the box it started in.
  return <lineSegments ref={lines} geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}
