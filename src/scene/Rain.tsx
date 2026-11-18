/**
 * Rain you can see and hear: thin streaks falling around the viewer, as
 * many as the weather's rain (skyState.rain, 0 to 1) calls for, slanted by
 * its wind, and none under cover (layout's `sheltered`: Seiza's rooms, or a
 * model world's buildings where its navmesh has a floor overhead). Without
 * it, a rainy sky only greyed, and picking Rain seemed to do nothing.
 *
 * Also the storm around it: the sound of the rain (muffled indoors) and,
 * in heavy rain, lightning and its thunder (src/sky/lightning.ts), the
 * flash written to skyState for the sky and the lights to show.
 *
 * And where it lands: tiny splashes twinkling on the ground around you.
 * In a world dressed for winter (src/sky/seasons.ts), it falls as snow:
 * slow, drifting flakes, and quiet but for a typhoon's wind.
 *
 * Cheap: one line-segments mesh and one points mesh, their positions
 * updated in place each frame, and nothing at all drawn while it's dry.
 * Sounds are synthesized; the flash is two numbers.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { seasonWeight, skyState } from "../sky/skyState";
import { flashLevel, strikeAt } from "../sky/lightning";
import { playThunder, setRainAmbience } from "../audio/sfx";
import { floorHeightAt, sheltered } from "./layout";
import { viewerPosition } from "../xr/viewer";
import { softDotTexture } from "./softDot";

const scratchEye = new THREE.Vector3();

/** Most streaks at once, for a typhoon's downpour. */
const MAX_DROPS = 1400;
/** How far around the viewer they fall, in metres. */
const RADIUS = 16;
const TOP = 11;
const BOTTOM = 3;
/** Metres a second. */
const FALL = 11;
const STREAK = 0.55;
/** Under cover, the flash on the lights is what comes in at the windows. */
const FLASH_INDOORS = 0.35;

/**
 * Shelter, remembered per half-metre cell and storey. Each drop is checked
 * as it falls, not just where it starts, since the wind carries it
 * sideways: checked once, a drop that started outside drifted in through
 * the walls. A model world's test is a navmesh query, far too slow for
 * every drop on every frame, but a cell's answer never changes.
 */
const CELL = 0.5;
const shelterCache = new Map<number, boolean>();
function cellKey(x: number, y: number, z: number): number {
  const cx = Math.floor(x / CELL) + 32768;
  const cz = Math.floor(z / CELL) + 32768;
  return (cx * 65536 + cz) * 64 + (Math.round(y / 2.5) & 63);
}
function shelteredCell(x: number, y: number, z: number): boolean {
  const cx = Math.floor(x / CELL) + 32768;
  const cz = Math.floor(z / CELL) + 32768;
  const key = cellKey(x, y, z);
  let covered = shelterCache.get(key);
  if (covered === undefined) {
    if (shelterCache.size > 60000) shelterCache.clear();
    covered = sheltered((cx - 32768 + 0.5) * CELL, y, (cz - 32768 + 0.5) * CELL);
    shelterCache.set(key, covered);
  }
  return covered;
}

/** The ground's height, remembered the same way, for the splashes. */
const floorCache = new Map<number, number>();
function floorCell(x: number, y: number, z: number): number {
  const key = cellKey(x, y, z);
  let floor = floorCache.get(key);
  if (floor === undefined) {
    if (floorCache.size > 60000) floorCache.clear();
    floor = floorHeightAt(x, z);
    floorCache.set(key, floor);
  }
  return floor;
}

/** Most splashes showing at once. */
const MAX_SPLASHES = 96;
/** Splashes a second in a typhoon, all within SPLASH_RADIUS of you. */
const SPLASH_RATE = 240;
const SPLASH_RADIUS = 7;
/** Seconds a splash lasts. */
const SPLASH_LIFE = 0.22;

/**
 * Rain landing: points that flick on and fade where drops hit the ground,
 * so a wet path glitters. They aren't the falling drops themselves (those
 * would need the ground's height under every one of them), just as many
 * as that much rain would make, scattered nearby. None under cover, or
 * more than a storey from your feet.
 */
function Splashes({ eye }: { eye: THREE.Vector3 }) {
  const points = useRef<THREE.Points>(null);
  const state = useMemo(() => ({ age: new Float32Array(MAX_SPLASHES).fill(SPLASH_LIFE), next: 0, owed: 0 }), []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_SPLASHES * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX_SPLASHES * 3), 3).setUsage(THREE.DynamicDrawUsage));
    return g;
  }, []);
  // Additive, so a fading splash is a dimming colour: no sorting, no alpha.
  // A tiny soft dot, not the square a bare point draws.
  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.07,
        map: softDotTexture(),
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    []
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      floorCache.clear();
    },
    [geometry, material]
  );

  useFrame((_, delta) => {
    const mesh = points.current;
    if (!mesh) return;
    const rain = skyState.active ? skyState.rain : 0;
    if (rain < 0.15 || seasonWeight("winter") > 0.5) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const dt = Math.min(delta, 0.1);
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const color = geometry.getAttribute("color") as THREE.BufferAttribute;
    const p = position.array as Float32Array;
    const c = color.array as Float32Array;
    // Dimmer at night, when there's less light to catch.
    const shine = 0.55 * (1 - 0.6 * skyState.night) + skyState.flash;

    state.owed += SPLASH_RATE * rain * dt;
    for (; state.owed >= 1; state.owed--) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * SPLASH_RADIUS;
      const x = eye.x + Math.cos(a) * r;
      const z = eye.z + Math.sin(a) * r;
      if (shelteredCell(x, eye.y, z)) continue;
      const y = floorCell(x, eye.y, z);
      if (Math.abs(eye.y - 1.6 - y) > 2.5) continue;
      const i = state.next;
      state.next = (i + 1) % MAX_SPLASHES;
      state.age[i] = 0;
      p[i * 3] = x;
      p[i * 3 + 1] = y + 0.02;
      p[i * 3 + 2] = z;
    }
    for (let i = 0; i < MAX_SPLASHES; i++) {
      const age = (state.age[i] += dt);
      // A quick flick on, then a fade.
      const k = age >= SPLASH_LIFE ? 0 : age < 0.03 ? age / 0.03 : 1 - (age - 0.03) / (SPLASH_LIFE - 0.03);
      const v = k * shine;
      c[i * 3] = 0.85 * v;
      c[i * 3 + 1] = 0.92 * v;
      c[i * 3 + 2] = v;
    }
    position.needsUpdate = true;
    color.needsUpdate = true;
  });

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}

/** Most flakes at once, in a typhoon's blizzard. */
const MAX_FLAKES = 900;
/** Metres a second: snow drifts down, it doesn't fall. */
const FLAKE_FALL = 1.1;

/** Snow, where rain would be: flakes falling slowly round the viewer,
 *  swaying, carried by the wind, and none under cover. */
function Snow({ eye }: { eye: THREE.Vector3 }) {
  const points = useRef<THREE.Points>(null);
  const flakes = useMemo(
    () => ({ x: new Float32Array(MAX_FLAKES), y: new Float32Array(MAX_FLAKES), z: new Float32Array(MAX_FLAKES), phase: new Float32Array(MAX_FLAKES), live: new Uint8Array(MAX_FLAKES), time: 0 }),
    []
  );
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_FLAKES * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const material = useMemo(
    () => new THREE.PointsMaterial({ size: 0.11, map: softDotTexture(), color: "#f4f7fb", transparent: true, depthWrite: false, fog: true }),
    []
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  useFrame((_, delta) => {
    const mesh = points.current;
    if (!mesh) return;
    const rain = skyState.active ? skyState.rain : 0;
    if (rain < 0.04 || seasonWeight("winter") <= 0.5) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const dt = Math.min(delta, 0.1);
    flakes.time += dt;
    const count = Math.round(MAX_FLAKES * Math.min(1, rain));
    const drift = (skyState.weatherState?.windSpeed() ?? 0) * 0.12;
    const { x: cx, y: cy, z: cz } = eye;
    const p = (geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    const respawn = (i: number, high: boolean) => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * RADIUS;
      flakes.x[i] = cx + Math.cos(a) * r;
      flakes.z[i] = cz + Math.sin(a) * r;
      flakes.y[i] = high ? cy + TOP : cy - BOTTOM + Math.random() * (TOP + BOTTOM);
      flakes.phase[i] = Math.random() * Math.PI * 2;
      flakes.live[i] = 1;
    };
    for (let i = 0; i < count; i++) {
      const far = Math.hypot(flakes.x[i] - cx, flakes.z[i] - cz) > RADIUS + 2;
      if (flakes.y[i] === 0 && flakes.x[i] === 0) respawn(i, false);
      else {
        flakes.y[i] -= FLAKE_FALL * dt;
        flakes.x[i] += drift * dt;
        if (flakes.y[i] < cy - BOTTOM || far) respawn(i, !far);
      }
      if (flakes.live[i] && shelteredCell(flakes.x[i], cy, flakes.z[i])) flakes.live[i] = 0;
      const o = i * 3;
      if (!flakes.live[i]) {
        p[o] = p[o + 1] = p[o + 2] = 0;
        continue;
      }
      // A slow side-to-side flutter, each flake on its own phase.
      const sway = Math.sin(flakes.time * 1.3 + flakes.phase[i]) * 0.25;
      p[o] = flakes.x[i] + sway;
      p[o + 1] = flakes.y[i];
      p[o + 2] = flakes.z[i] + Math.cos(flakes.time * 1.1 + flakes.phase[i]) * 0.2;
    }
    (geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    geometry.setDrawRange(0, count);
  });

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}

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
      shelterCache.clear();
      skyState.flash = 0;
      skyState.flashLight = 0;
      setRainAmbience(0, 0, false);
    },
    [geometry, material]
  );
  /** The last strike heard, so each one thunders once. */
  const heard = useRef(-1);

  useFrame(({ camera }, delta) => {
    const precipitation = skyState.active ? skyState.rain : 0;
    // In winter it snows instead (Snow, above): no rain, rain sound, or
    // lightning, though a typhoon's wind still blows.
    const snowing = seasonWeight("winter") > 0.5;
    const rain = snowing ? 0 : precipitation;
    const wind = skyState.weatherState?.windSpeed() ?? 0;
    const eye = viewerPosition(camera, scratchEye);
    const cx = eye.x, cy = eye.y, cz = eye.z;
    const indoors = precipitation > 0.04 && shelteredCell(cx, cy, cz);

    setRainAmbience(rain, wind, indoors);
    const strike = strikeAt(Date.now(), rain);
    const flash = strike ? flashLevel(Date.now() - strike.at, strike.distance) : 0;
    skyState.flash = flash;
    skyState.flashLight = flash * (indoors ? FLASH_INDOORS : 1);
    if (strike && strike.id !== heard.current) {
      heard.current = strike.id;
      const { distance, thunderDelay } = strike;
      window.setTimeout(() => playThunder(distance, shelteredCell(cx, cy, cz)), thunderDelay * 1000);
    }

    const mesh = lines.current;
    if (!mesh) return;
    if (rain < 0.04) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const dt = Math.min(delta, 0.1);
    const count = Math.round(MAX_DROPS * Math.min(1, rain));
    // Slant: metres sideways per metre fallen, from the wind (toward +X).
    const slant = Math.min(0.9, wind * 0.03);
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const p = position.array as Float32Array;
    const respawn = (i: number, high: boolean) => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * RADIUS;
      drops.x[i] = cx + Math.cos(a) * r;
      drops.z[i] = cz + Math.sin(a) * r;
      drops.y[i] = high ? cy + TOP : cy - BOTTOM + Math.random() * (TOP + BOTTOM);
      drops.live[i] = 1;
    };
    for (let i = 0; i < count; i++) {
      const far = Math.hypot(drops.x[i] - cx, drops.z[i] - cz) > RADIUS + 2;
      if (drops.y[i] === 0 && drops.x[i] === 0) respawn(i, false);
      else {
        drops.y[i] -= FALL * dt;
        drops.x[i] += FALL * slant * dt;
        if (drops.y[i] < cy - BOTTOM || far) respawn(i, !far);
      }
      // Once it's under a roof it's gone, until it starts again up top.
      if (drops.live[i] && shelteredCell(drops.x[i], cy, drops.z[i])) drops.live[i] = 0;
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
  return (
    <>
      <lineSegments ref={lines} geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />
      <Splashes eye={scratchEye} />
      <Snow eye={scratchEye} />
    </>
  );
}
