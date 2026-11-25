import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { selfViewStore } from "../xr/body/selfViewStore";
import { constrainWalker, floorHeightAt, getGround } from "./layout";
import type { PortalConfig } from "../config/worldConfig";

/**
 * A free-standing mirror, full length, on two feet: to see your avatar,
 * check a pose, dance in front of, or watch yourself in seiza.
 *
 * A true mirror draws the whole room a second time, which halved the frame
 * rate. This one reflects only people: avatars, guides, and what they
 * hold (marked with markForMirrors, on MIRROR_LAYER), standing on a floor
 * of their own before a soft backdrop. That is a handful of draw calls
 * instead of the world's hundreds, and it's what a mirror is for here:
 * seeing yourself. It draws only when you're within MIRROR_RANGE, in front
 * of it, and it's in view, into a small texture, once a frame even in a
 * headset (both eyes share it). Out of range it keeps its last picture.
 *
 * Behind the people is the room itself, but a still of it: a small cube
 * snapshot taken from the mirror (ENV_SIZE a face, one face a frame over
 * six frames, so no frame pays for all of it) as you come near, and again
 * every ENV_REFRESH seconds while you're there. People are left out of the
 * still, since they are drawn live over it. The world is never drawn for
 * the mirror frame by frame.
 *
 * In first person your own head is hidden from your camera (SelfView, so
 * you don't see the inside of it). The mirror shows it for its own pass.
 */
export const MIRROR = { width: 0.9, height: 1.7, foot: 0.12 };
const MIRROR_RANGE = 7;
const FLAT_SIZE = 768;
const XR_SIZE = 512;
/** The room's still behind the people: pixels a cube face, and how often
 *  it's taken again while you're near, seconds. */
const ENV_SIZE = 256;
const ENV_REFRESH = 60;
const ENV_RANGE = MIRROR_RANGE + 3;

/** The layer a mirror sees: people, what they hold, and the lights. */
export const MIRROR_LAYER = 3;
const BACKDROP = new THREE.Color("#c3ccd4");

/** Marks an avatar (or anything) to show in mirrors, with all it holds. */
const marked = new Set<THREE.Object3D>();
/** Every mirror's own objects, hidden while any mirror takes its still. */
const mirrorParts = new Set<THREE.Object3D>();

export function markForMirrors(root: THREE.Object3D) {
  marked.add(root);
  root.userData.inMirrors = true;
  root.traverse((o) => o.layers.enable(MIRROR_LAYER));
}

/** Every couple of seconds: what's been marked, and what it has picked up
 *  since (a weapon, an instrument), and every light, onto the mirror's
 *  layer. A light filtered out of the pass would leave the people black. */
let lastScan = -Infinity;
function scanForMirrors(scene: THREE.Object3D) {
  const now = performance.now();
  if (now - lastScan < 2000) return;
  lastScan = now;
  scene.traverse((o) => {
    if ((o as THREE.Light).isLight) o.layers.enable(MIRROR_LAYER);
    else if (o.userData.inMirrors) o.traverse((c) => c.layers.enable(MIRROR_LAYER));
  });
}

const envAt = new THREE.Vector3();
const envNear = new THREE.Vector3();
const envDir = new THREE.Vector3();

const frameMaterial = () => new THREE.MeshStandardMaterial({ color: "#6b4a2f", roughness: 0.55, metalness: 0.05 });

/** The room as the mirror sees it, without people or mirrors, into one
 *  face of the cube a call. */
function captureFace(gl: THREE.WebGLRenderer, scene: THREE.Scene, cube: THREE.CubeCamera, face: number) {
  if (cube.coordinateSystem !== gl.coordinateSystem) {
    cube.coordinateSystem = gl.coordinateSystem;
    cube.updateCoordinateSystem();
  }
  const hidden: THREE.Object3D[] = [];
  const hide = (o: THREE.Object3D) => {
    if (o.visible) {
      o.visible = false;
      hidden.push(o);
    }
  };
  for (const o of marked) {
    if (!o.parent) marked.delete(o);
    else hide(o);
  }
  for (const o of mirrorParts) hide(o);
  const target = gl.getRenderTarget();
  const targetFace = gl.getActiveCubeFace();
  const targetMip = gl.getActiveMipmapLevel();
  const xr = gl.xr.enabled;
  const shadows = gl.shadowMap.autoUpdate;
  gl.xr.enabled = false;
  gl.shadowMap.autoUpdate = false;
  gl.setRenderTarget(cube.renderTarget, face);
  gl.render(scene, cube.children[face] as THREE.Camera);
  gl.setRenderTarget(target, targetFace, targetMip);
  gl.xr.enabled = xr;
  gl.shadowMap.autoUpdate = shadows;
  for (const o of hidden) o.visible = true;
}

export function Mirror() {
  const { gl, scene, camera } = useThree();
  const presenting = useXrPresenting(gl);
  const tick = useRef(0);
  // The room's still: taking it a face a frame (face 0 to 5), or idle (-1).
  const env = useMemo(() => {
    const target = new THREE.WebGLCubeRenderTarget(ENV_SIZE, { generateMipmaps: false });
    return { target, cube: new THREE.CubeCamera(0.1, 600, target), face: -1, at: -Infinity, ready: false };
  }, []);
  useEffect(() => () => env.target.dispose(), [env]);

  const { reflector, frame } = useMemo(() => {
    const size = presenting ? XR_SIZE : FLAT_SIZE;
    const reflector = new Reflector(new THREE.PlaneGeometry(MIRROR.width, MIRROR.height), {
      textureWidth: Math.round(size * (MIRROR.width / MIRROR.height)),
      textureHeight: size,
      color: new THREE.Color("#c9cdd2"),
      clipBias: 0.003,
    });
    reflector.position.y = MIRROR.foot + MIRROR.height / 2;
    reflector.camera.layers.set(MIRROR_LAYER);
    reflector.userData.navIgnore = true;
    const render = reflector.onBeforeRender;
    let renderedAt = -1;
    let skinned: THREE.SkinnedMesh[] = [];
    let skinnedOf: THREE.Object3D | null = null;
    const near = new THREE.Vector3();
    const at = new THREE.Vector3();
    reflector.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      // Not into another mirror's still.
      if (!reflector.visible) return;
      // Once a frame: the second eye uses what the first saw.
      if (renderedAt === tick.current) return;
      reflector.getWorldPosition(at);
      if (camera.getWorldPosition(near).distanceTo(at) > MIRROR_RANGE) return;
      renderedAt = tick.current;
      const head = selfViewStore.hiddenHead;
      const hidden = head ? head.scale.x : 1;
      if (head) head.scale.setScalar(1);
      scanForMirrors(scene);
      const background = scene.background;
      scene.background = env.ready ? env.target.texture : BACKDROP;
      render.call(reflector, renderer, scene, camera, geometry, material, group);
      scene.background = background;
      if (head) {
        // Hidden again before anything after this mirror is drawn: its
        // matrices, and the skeleton the skin reads them from.
        head.scale.setScalar(hidden);
        head.updateMatrixWorld(true);
        const avatar = selfViewStore.avatar;
        if (avatar && avatar !== skinnedOf) {
          skinnedOf = avatar;
          skinned = [];
          avatar.traverse((o) => (o as THREE.SkinnedMesh).isSkinnedMesh && skinned.push(o as THREE.SkinnedMesh));
        }
        for (const mesh of skinned) mesh.skeleton.update();
      }
    };

    // The frame round the glass, and two feet to stand on.
    const t = 0.045;
    const { width: w, height: h, foot } = MIRROR;
    const parts = [
      new THREE.BoxGeometry(w + t * 2, t, t * 1.4).translate(0, foot - t / 2, -t * 0.6),
      new THREE.BoxGeometry(w + t * 2, t, t * 1.4).translate(0, foot + h + t / 2, -t * 0.6),
      new THREE.BoxGeometry(t, h, t * 1.4).translate(-w / 2 - t / 2, foot + h / 2, -t * 0.6),
      new THREE.BoxGeometry(t, h, t * 1.4).translate(w / 2 + t / 2, foot + h / 2, -t * 0.6),
      // A back panel, so it isn't see-through from behind.
      new THREE.BoxGeometry(w + t * 2, h + t * 2, 0.012).translate(0, foot + h / 2, -t * 1.3),
      new THREE.BoxGeometry(0.07, 0.04, 0.5).translate(-w / 2, 0.02, -0.1),
      new THREE.BoxGeometry(0.07, 0.04, 0.5).translate(w / 2, 0.02, -0.1),
      new THREE.BoxGeometry(0.05, foot + 0.04, 0.05).translate(-w / 2, (foot + 0.04) / 2, -t * 0.6),
      new THREE.BoxGeometry(0.05, foot + 0.04, 0.05).translate(w / 2, (foot + 0.04) / 2, -t * 0.6),
    ];
    // The floor the people in it stand on, seen only in the glass.
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 24).rotateX(-Math.PI / 2).translate(0, 0.004, 1.6), new THREE.MeshStandardMaterial({ color: "#a79f93", roughness: 1 }));
    floor.layers.set(MIRROR_LAYER);
    const frame = new THREE.Group();
    frame.add(floor);
    frame.userData.floor = floor;
    floor.visible = !env.ready;
    for (const g of parts) {
      const mesh = new THREE.Mesh(g, frameMaterial());
      mesh.castShadow = true;
      frame.add(mesh);
    }
    return { reflector, frame };
  }, [presenting, env]);

  useEffect(() => {
    mirrorParts.add(reflector);
    mirrorParts.add(frame);
    return () => {
      mirrorParts.delete(reflector);
      mirrorParts.delete(frame);
    };
  }, [reflector, frame]);

  useFrame((state) => {
    tick.current++;
    const now = state.clock.elapsedTime;
    if (env.face < 0) {
      if (now - env.at < ENV_REFRESH) return;
      reflector.getWorldPosition(envAt);
      if (camera.getWorldPosition(envNear).distanceTo(envAt) > ENV_RANGE) return;
      // From just in front of the glass, what it faces.
      reflector.getWorldDirection(envDir);
      env.cube.position.copy(envAt).addScaledVector(envDir, 0.08);
      env.cube.updateMatrixWorld(true);
      env.face = 0;
    }
    captureFace(gl, scene, env.cube, env.face);
    if (++env.face === 6) {
      env.face = -1;
      env.at = now;
      env.ready = true;
      // The room's own floor is in the still now.
      (frame.userData.floor as THREE.Object3D).visible = false;
    }
  });

  useEffect(
    () => () => {
      reflector.dispose();
      frame.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        (mesh.material as THREE.Material | undefined)?.dispose?.();
      });
    },
    [reflector, frame]
  );

  return (
    <group>
      <primitive object={reflector} />
      <primitive object={frame} />
    </group>
  );
}

function useXrPresenting(gl: THREE.WebGLRenderer) {
  const [presenting, setPresenting] = useState(gl.xr.isPresenting);
  useEffect(() => {
    const on = () => setPresenting(true);
    const off = () => setPresenting(false);
    gl.xr.addEventListener("sessionstart", on);
    gl.xr.addEventListener("sessionend", off);
    return () => {
      gl.xr.removeEventListener("sessionstart", on);
      gl.xr.removeEventListener("sessionend", off);
    };
  }, [gl]);
  return presenting;
}

export interface MirrorSpot {
  x: number;
  z: number;
  rotationY: number;
}

/** Where a world's own mirror goes when its world.json doesn't say: ahead of
 *  the arrival point and off to one side, angled back to face it. Tried in
 *  order, each [metres ahead, metres to the right]. */
const CANDIDATES: [number, number][] = [
  [4, 3],
  [4, -3],
  [3, 4.5],
  [3, -4.5],
  [6, 2.5],
  [6, -2.5],
  [2, 5.5],
  [2, -5.5],
];
/** Clear of the portals' arches by this much. */
const PORTAL_CLEARANCE = 3;
/** Clear of where a guide stands or walks by this much, and of the line
 *  from the arrival point to it, so the mirror never hides the guide. */
const GUIDE_CLEARANCE = 3.5;
const SIGHT_CLEARANCE = 1.75;

/** Spots to keep the mirror away from: each guide's stops, put here by the
 *  guide (src/guides/Guide.tsx) when it's placed in the world. */
export const mirrorKeepClear = new Set<[number, number]>();
/** Bumped whenever a guide arrives or leaves, so a mirror placed before
 *  its guide loaded (a world's own code loads after the meadow) moves. */
let keepClearVersion = 0;
export function keepMirrorClearOf(spots: [number, number][]) {
  for (const s of spots) mirrorKeepClear.add(s);
  keepClearVersion++;
  return () => {
    for (const s of spots) mirrorKeepClear.delete(s);
    keepClearVersion++;
  };
}

/** How far a point is from the segment a to b, on the ground. */
const offSegment = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
};

/**
 * A spot near arrival, on floor anyone can walk to at about the arrival's
 * height, clear of the portals, facing the arrival point. Null if none is.
 */
export function findMirrorSpot(spawn: { x: number; y: number; z: number }, facing: number, portals?: PortalConfig): MirrorSpot | null {
  const ahead = [-Math.sin(facing), -Math.cos(facing)];
  const right = [Math.cos(facing), -Math.sin(facing)];
  const arches: [number, number][] = [];
  if (portals) {
    const spacing = portals.spacing ?? 2.6;
    const across = [Math.cos(portals.facing), -Math.sin(portals.facing)];
    const first = -((portals.worlds.length - 1) * spacing) / 2;
    portals.worlds.forEach((_, i) => arches.push([portals.at.x + across[0] * (first + i * spacing), portals.at.z + across[1] * (first + i * spacing)]));
  }
  const probe = new THREE.Vector3();
  for (const [a, r] of CANDIDATES) {
    const x = spawn.x + ahead[0] * a + right[0] * r;
    const z = spawn.z + ahead[1] * a + right[1] * r;
    if (arches.some(([px, pz]) => Math.hypot(px - x, pz - z) < PORTAL_CLEARANCE)) continue;
    const guides = [...mirrorKeepClear];
    if (guides.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < GUIDE_CLEARANCE || offSegment(x, z, spawn.x, spawn.z, gx, gz) < SIGHT_CLEARANCE)) continue;
    // Its feet and both sides on the floor: the walls mustn't move any of them.
    const ok = [-0.6, 0, 0.6].every((side) => {
      const sx = x + right[0] * side;
      const sz = z + right[1] * side;
      probe.set(sx, floorHeightAt(sx, sz) + 1.6, sz);
      const y = constrainWalker(probe);
      return Math.hypot(probe.x - sx, probe.z - sz) < 0.05 && Math.abs(y - spawn.y) < 0.8;
    });
    if (!ok) continue;
    // The glass faces +z at yaw 0: turned toward the arrival point.
    return { x, z, rotationY: Math.atan2(spawn.x - x, spawn.z - z) };
  }
  return null;
}

/**
 * The world's own mirrors, in every room of it: world.json's \`mirrors\`
 * if it lists them (an empty list for none), or one found near arrival
 * (findMirrorSpot) once the ground is there to check it against.
 */
export function WorldMirrors({ spots, spawn, facing, portals, needsGround }: { spots?: MirrorSpot[]; spawn: { x: number; y: number; z: number }; facing: number; portals?: PortalConfig; needsGround: boolean }) {
  const [found, setFound] = useState<MirrorSpot[] | null>(spots ?? null);
  const since = useRef(0);
  const placedAt = useRef(-1);
  useFrame((_, delta) => {
    // Found by itself (not listed by the world), and a guide has come since: look again.
    if (found && !spots && placedAt.current !== keepClearVersion) setFound(null);
    if (found) return;
    since.current += delta;
    // A model world walks on its navmesh: wait for it. Give up after a while.
    if (needsGround && !getGround() && since.current < 20) return;
    if (since.current < 2) return;
    const spot = findMirrorSpot(spawn, facing, portals);
    placedAt.current = keepClearVersion;
    setFound(spot ? [spot] : []);
  });
  return (
    <>
      {(found ?? []).map((s, i) => (
        <group key={i} position={[s.x, floorHeightAt(s.x, s.z), s.z]} rotation-y={s.rotationY}>
          <Mirror />
        </group>
      ))}
    </>
  );
}
