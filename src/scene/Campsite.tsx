import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LightZone } from "../multiplayer/types";
import { playFireToggle, setFireAmbience } from "../audio/sfx";
import { PooledLight } from "./LightPool";
import { nightNeed } from "./roomLights";
import { poolTexture } from "./UnderGlow";
import { CAMP_CHAIRS, CAMP_SEAT_HEIGHT, CAMPFIRE, FIELD_Y, SLEEPING_BAG, TENT, TENT_YAW } from "./layout";

/**
 * The campsite on the meadow beyond the garden: a campfire ringed with
 * stones, a tent with a sleeping bag inside, and low folding chairs round
 * the fire (real seats; see CAMP_CHAIRS in layout.ts).
 *
 * Cheap on purpose. Everything that doesn't move is merged into one mesh
 * per material, so the whole camp is a handful of draw calls. The fire is
 * three unlit flame cones and a glow sprite, flickered by a few sines each
 * frame, and its light is one of the world's pooled lights (LightPool.tsx),
 * so it costs no more per pixel than the four lights the world already has.
 * Clicking the fire puts it out or lights it, for everyone, like a light
 * switch (the `camp` light zone).
 */
export function Campsite({
  lit,
  onToggle,
  inBed = false,
}: {
  lit: boolean;
  onToggle?: (zone: LightZone, on: boolean) => void;
  /** You're lying in one of the tent's sleeping bags. The walls fade
   *  whenever they'd stand between you and the camera: you in a bag with
   *  the camera outside, or you outside (at the door, say) with a third
   *  person camera behind you inside the tent. */
  inBed?: boolean;
}) {
  const geometry = useMemo(buildCamp, []);
  useEffect(
    () => () => {
      for (const g of Object.values(geometry)) g.dispose();
    },
    [geometry]
  );
  const m = useMemo(
    () => ({
      // Lambert: lit by the sun, the moon, and the fire, at the least cost.
      tent: new THREE.MeshLambertMaterial({ color: "#c8662f", side: THREE.DoubleSide }),
      sheet: new THREE.MeshLambertMaterial({ color: "#3b3a30" }),
      bag: new THREE.MeshLambertMaterial({ color: "#2f4a7a" }),
      fabric: new THREE.MeshLambertMaterial({ color: "#2e5a4a", side: THREE.DoubleSide }),
      metal: new THREE.MeshLambertMaterial({ color: "#3a3d42" }),
      stone: new THREE.MeshLambertMaterial({ color: "#7d7a74", flatShading: true }),
      wood: new THREE.MeshLambertMaterial({ color: "#5a3a22" }),
      ground: new THREE.MeshLambertMaterial({ map: makeCampGroundTexture(), transparent: true, depthWrite: false }),
    }),
    []
  );
  useEffect(
    () => () => {
      for (const material of Object.values(m)) {
        material.map?.dispose();
        material.dispose();
      }
    },
    [m]
  );

  const tentFade = useRef(1);
  useFrame(({ camera }, delta) => {
    const target = inBed !== insideTent(camera.position) ? TENT_SEE_THROUGH : 1;
    if (tentFade.current === target) return;
    tentFade.current = THREE.MathUtils.damp(tentFade.current, target, 8, delta);
    if (Math.abs(tentFade.current - target) < 0.01) tentFade.current = target;
    const see = tentFade.current < 1;
    if (m.tent.transparent !== see) {
      m.tent.transparent = see;
      m.tent.depthWrite = !see;
      m.tent.needsUpdate = true;
    }
    m.tent.opacity = tentFade.current;
  });

  const toggle = onToggle
    ? (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onToggle("camp", !lit);
      }
    : undefined;

  return (
    <group>
      {/* The trodden ground round the fire. Lit (the meadow beyond is not),
          so the firelight shows on it. */}
      <mesh geometry={geometry.ground} material={m.ground} rotation={[-Math.PI / 2, 0, 0]} position={[CAMPFIRE[0], FIELD_Y + 0.006, CAMPFIRE[1]]} receiveShadow />
      <mesh geometry={geometry.tent} material={m.tent} castShadow />
      <mesh geometry={geometry.sheet} material={m.sheet} />
      <mesh geometry={geometry.bag} material={m.bag} />
      <mesh geometry={geometry.fabric} material={m.fabric} castShadow />
      <mesh geometry={geometry.metal} material={m.metal} />
      <group
        onClick={toggle}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerOver={toggle && (() => (document.body.style.cursor = "pointer"))}
        onPointerOut={toggle && (() => (document.body.style.cursor = ""))}
      >
        <mesh geometry={geometry.stone} material={m.stone} castShadow />
        <mesh geometry={geometry.wood} material={m.wood} castShadow />
        <Fire lit={lit} />
      </group>
      <TentLantern lit={lit} metal={m.metal} windows={geometry.windows} />
    </group>
  );
}

const TENT_SEE_THROUGH = 0.22;

/**
 * A small lantern hung from the tent's ridge, and the very faint warm pool
 * it throws on the ground sheet: lit with the fire, on the camp switch. No
 * light. A camping lantern on a cord from the ridge pole: a metal cap,
 * base, and three frame bars (one merged mesh), round a frosted globe that
 * glows, and an additive pool on the ground sheet. Three draw calls.
 */
function TentLantern({ lit, metal, windows }: { lit: boolean; metal: THREE.Material; windows: THREE.BufferGeometry }) {
  // The windows: a fine mesh with soft rounded edges, dark by day and
  // glowing warm when the lantern inside is lit.
  const screen = useMemo(() => {
    const map = windowTexture();
    return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  }, []);
  useEffect(
    () => () => {
      screen.map?.dispose();
      screen.dispose();
    },
    [screen]
  );
  const texture = useMemo(poolTexture, []);
  const parts = useMemo(() => {
    const at = (x: number, y: number, z: number) => {
      const c = Math.cos(TENT_YAW);
      const s = Math.sin(TENT_YAW);
      return [TENT.x + x * c + z * s, FIELD_Y + y, TENT.z - x * s + z * c] as [number, number, number];
    };
    // Built at the origin, its top at the ridge pole, then hung there.
    const parts: THREE.BufferGeometry[] = [
      new THREE.CylinderGeometry(0.004, 0.004, 0.16, 5).translate(0, -0.08, 0), // cord
      new THREE.TorusGeometry(0.018, 0.004, 5, 10).translate(0, -0.172, 0), // hook ring
      new THREE.CylinderGeometry(0.022, 0.062, 0.045, 12).translate(0, -0.21, 0), // cap
      new THREE.CylinderGeometry(0.06, 0.055, 0.03, 12).translate(0, -0.36, 0), // base
    ];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      parts.push(new THREE.BoxGeometry(0.008, 0.12, 0.008).translate(Math.cos(a) * 0.057, -0.29, Math.sin(a) * 0.057));
    }
    const frame = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g))) ?? new THREE.BufferGeometry();
    for (const g of parts) g.dispose();
    return {
      hangAt: at(0, TENT.height - 0.01, -TENT.length * 0.15),
      // Under the lantern, a hair above the ground sheet.
      poolAt: at(0, 0.014, -TENT.length * 0.15),
      frame,
      globe: new THREE.CylinderGeometry(0.05, 0.05, 0.12, 14).translate(0, -0.29, 0),
      bulb: new THREE.MeshBasicMaterial({ color: "#ffc77a", toneMapped: false }),
      pool: new THREE.MeshBasicMaterial({ map: texture, color: "#ffc77a", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    };
  }, [texture]);
  useEffect(
    () => () => {
      texture.dispose();
      parts.bulb.dispose();
      parts.frame.dispose();
      parts.globe.dispose();
      parts.pool.dispose();
    },
    [texture, parts]
  );
  const level = useRef(lit ? 1 : 0);
  useFrame((_, delta) => {
    level.current += ((lit ? 1 : 0) - level.current) * (1 - Math.exp(-delta / 0.4));
    parts.bulb.color.set("#ffc77a").multiplyScalar(0.12 + 0.88 * level.current);
    // Seen glowing at night; by day the mesh just reads dark.
    screen.color.set("#6b5148").lerp(WINDOW_GLOW, 0.75 * level.current * nightNeed());
    // A warm pool on the ground sheet, brightest under the lantern:
    // enough to show it is lit, and to find your bag by.
    parts.pool.color.set("#ffc77a").multiplyScalar(0.55 * level.current);
    parts.pool.visible = level.current > 0.01;
  });
  return (
    <>
      <mesh geometry={windows} material={screen} raycast={() => null} renderOrder={1} />
      <group position={parts.hangAt} rotation={[0, TENT_YAW, 0]}>
        <mesh geometry={parts.frame} material={metal} raycast={() => null} />
        <mesh geometry={parts.globe} material={parts.bulb} raycast={() => null} />
      </group>
      <mesh position={parts.poolAt} rotation={[-Math.PI / 2, 0, TENT_YAW]} material={parts.pool} raycast={() => null} renderOrder={1}>
        <planeGeometry args={[TENT.width * 1.05, TENT.length * 1.05]} />
      </mesh>
    </>
  );
}

const WINDOW_GLOW = new THREE.Color("#ffc77a");

/** A tent window: a dark binding round a rounded opening of see-through
 *  insect mesh, its fine grid faint against whatever is behind it. */
function windowTexture(): THREE.Texture {
  const w = 128;
  const h = 96;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(w, h);
  const r = 26;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Inside the opening, by how far in from the binding (12 px wide).
      const inset = 12;
      const ox = Math.max(r + inset - x, x - (w - 1 - r - inset), 0);
      const oy = Math.max(r + inset - y, y - (h - 1 - r - inset), 0);
      const open = Math.max(0, Math.min(1, (r - Math.hypot(ox, oy)) / 3));
      const grid = x % 6 === 0 || y % 6 === 0;
      // Binding: opaque and dark. Mesh: mostly clear, its threads a little less.
      const alpha = 1 - open * (grid ? 0.6 : 0.85);
      const shade = 255 - (1 - open) * 185;
      image.data.set([shade, shade * 0.86, shade * 0.8, 255 * alpha], (y * w + x) * 4);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Whether a point is under the tent's walls. */
function insideTent(point: THREE.Vector3) {
  const dx = point.x - TENT.x;
  const dz = point.z - TENT.z;
  const c = Math.cos(TENT_YAW);
  const s = Math.sin(TENT_YAW);
  const x = dx * c - dz * s;
  const z = dx * s + dz * c;
  return Math.abs(z) < TENT.length / 2 && point.y < FIELD_Y + TENT.height * (1 - Math.abs(x) / (TENT.width / 2));
}

// --- the fire --------------------------------------------------------------------

const FIRE_COLOR = "#ff9a4a";
const FIRE_INTENSITY = 10;
const FIRE_REACH = 15;

function Fire({ lit }: { lit: boolean }) {
  const flames = useRef<(THREE.Mesh | null)[]>([]);
  const glow = useRef<THREE.Sprite>(null);
  const intensity = useRef(0);
  const level = useRef(lit ? 1 : 0);
  const litRef = useRef(lit);
  litRef.current = lit;
  const camera = useThree((state) => state.camera);

  // Lit or put out, by anyone: heard by everyone near enough. Not on the
  // first render, which is only the room's state arriving.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    playFireToggle(lit, Math.hypot(camera.position.x - CAMPFIRE[0], camera.position.z - CAMPFIRE[1]));
  }, [lit, camera]);

  const parts = useMemo(() => {
    const cone = new THREE.ConeGeometry(1, 1, 7, 1, true).translate(0, 0.5, 0);
    const flame = (color: string) => new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    return {
      cone,
      materials: [flame("#ff6a1a"), flame("#ffae3d"), flame("#fff0a0")],
      embers: new THREE.MeshBasicMaterial({ color: "#ff4a14", toneMapped: false }),
      emberDisc: new THREE.CircleGeometry(0.34, 16).rotateX(-Math.PI / 2),
      glow: new THREE.SpriteMaterial({ map: makeGlowTexture(), color: "#ff8a3a", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    };
  }, []);
  useEffect(
    () => () => {
      parts.cone.dispose();
      parts.emberDisc.dispose();
      for (const material of parts.materials) material.dispose();
      parts.embers.dispose();
      parts.glow.map?.dispose();
      parts.glow.dispose();
    },
    [parts]
  );

  // Flame size and spread, outer to core.
  const FLAMES = [
    { radius: 0.3, height: 0.85, speed: 1 },
    { radius: 0.2, height: 0.7, speed: 1.3 },
    { radius: 0.11, height: 0.5, speed: 1.7 },
  ];

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    // Lighting and going out take a moment, as a real fire does.
    level.current += ((litRef.current ? 1 : 0) - level.current) * (1 - Math.exp(-delta * (litRef.current ? 1.5 : 3)));
    const on = level.current;
    const flicker = 0.78 + 0.1 * Math.sin(t * 7.1) + 0.07 * Math.sin(t * 13.3 + 1.1) + 0.05 * Math.sin(t * 23.7 + 2.3);
    FLAMES.forEach((f, i) => {
      const mesh = flames.current[i];
      if (!mesh) return;
      const wobble = 0.85 + 0.15 * Math.sin(t * 9 * f.speed + i * 2.1) + 0.06 * Math.sin(t * 17 * f.speed + i);
      mesh.visible = on > 0.02;
      mesh.scale.set(f.radius * (0.9 + 0.1 * flicker) * on, f.height * wobble * flicker * on, f.radius * on);
      mesh.rotation.y = t * 0.6 * f.speed + i;
    });
    if (glow.current) {
      glow.current.material.opacity = 0.7 * on * flicker;
      glow.current.scale.setScalar(2.8 + 0.35 * flicker);
    }
    // Embers glow brighter as the flames die down, then settle dim.
    parts.embers.color.setRGB(1, 0.29, 0.08).multiplyScalar(0.25 + 0.75 * on);
    intensity.current = FIRE_INTENSITY * on * flicker;
    setFireAmbience(Math.hypot(state.camera.position.x - CAMPFIRE[0], state.camera.position.z - CAMPFIRE[1]), on, delta);
  });

  const [x, z] = CAMPFIRE;
  return (
    <group position={[x, FIELD_Y, z]}>
      <mesh geometry={parts.emberDisc} material={parts.embers} position={[0, 0.08, 0]} />
      {FLAMES.map((_, i) => (
        <mesh key={i} ref={(mesh) => (flames.current[i] = mesh)} geometry={parts.cone} material={parts.materials[i]} position={[0, 0.1, 0]} raycast={() => null} />
      ))}
      <sprite ref={glow} material={parts.glow} position={[0, 0.55, 0]} raycast={() => null} />
      <PooledLight position={[0, 0.7, 0]} color={FIRE_COLOR} intensityRef={intensity} distance={FIRE_REACH} />
    </group>
  );
}

// --- static geometry -------------------------------------------------------------

/** One geometry per material, everything placed in world space. */
function buildCamp() {
  const windows: THREE.BufferGeometry[] = [];
  const parts: Record<"tent" | "sheet" | "bag" | "fabric" | "metal" | "stone" | "wood", THREE.BufferGeometry[]> = {
    tent: [],
    sheet: [],
    bag: [],
    fabric: [],
    metal: [],
    stone: [],
    wood: [],
  };
  const random = mulberry32(4242);
  const [fx, fz] = CAMPFIRE;

  // Fire ring: stones round the pit, and three logs leaning into a teepee.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + random() * 0.2;
    const s = 0.13 + random() * 0.06;
    parts.stone.push(
      new THREE.DodecahedronGeometry(1, 0)
        .scale(s * 1.3, s * 0.8, s)
        .rotateY(random() * Math.PI)
        .translate(fx + Math.cos(a) * 0.5, FIELD_Y + s * 0.4, fz + Math.sin(a) * 0.5)
    );
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const log = new THREE.CylinderGeometry(0.045, 0.06, 0.62, 7);
    // Lean in toward the middle, foot out by the stones.
    log.rotateZ(-0.62).translate(0.17, 0.14, 0).rotateY(a).translate(fx, FIELD_Y, fz);
    parts.wood.push(log);
  }

  // The tent: an A-frame (two sloped walls, a back, a ground sheet), its
  // open door toward the fire, a sleeping bag and pillow inside.
  const tent = new THREE.Matrix4().compose(
    new THREE.Vector3(TENT.x, FIELD_Y, TENT.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), TENT_YAW),
    new THREE.Vector3(1, 1, 1)
  );
  const half = TENT.width / 2;
  // The walls are fabric, not boards: each sags a little between the ridge
  // and the ground and between the door and the back, with a few soft
  // ripples, so its shading rolls rather than lying flat. One surface,
  // sampled at (u along the length, s up the slope), shared with the
  // windows so they lie exactly on it.
  const wallPoint = (side: number, u: number, s: number, lift = 0) => {
    const sag = Math.sin(Math.PI * s) * (0.07 * (0.55 + 0.45 * Math.sin(Math.PI * u)) + 0.012 * Math.sin(u * Math.PI * 7));
    const slope = Math.hypot(half, TENT.height);
    // Inward, toward the middle of the tent, square to the wall.
    const nx = (-side * TENT.height) / slope;
    const ny = -half / slope;
    const d = sag - lift;
    return new THREE.Vector3(side * half * (1 - s) + nx * d, TENT.height * s + ny * d, (u - 0.5) * TENT.length);
  };
  const wallPatch = (side: number, u0: number, u1: number, s0: number, s1: number, nu: number, ns: number, lift = 0) => {
    const g = new THREE.PlaneGeometry(1, 1, nu, ns);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = u0 + (pos.getX(i) + 0.5) * (u1 - u0);
      const s = s0 + (pos.getY(i) + 0.5) * (s1 - s0);
      pos.setXYZ(i, ...wallPoint(side, u, s, lift).toArray());
    }
    g.computeVertexNormals();
    return g.applyMatrix4(tent);
  };
  // Each wall is four pieces round an opening for its window, toward the
  // back, so you can see in (and out).
  const [w0, w1, h0, h1] = [0.2, 0.52, 0.32, 0.66];
  for (const side of [-1, 1]) {
    parts.tent.push(
      wallPatch(side, 0, 1, 0, h0, 18, 3),
      wallPatch(side, 0, 1, h1, 1, 18, 3),
      wallPatch(side, 0, w0, h0, h1, 4, 3),
      wallPatch(side, w1, 1, h0, h1, 9, 3)
    );
    // The window: binding round the edge and see-through mesh, standing a
    // hair off the fabric line so the two never fight for the same pixels.
    windows.push(wallPatch(side, w0, w1, h0, h1, 6, 4, 0.006));
  }
  const back = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, TENT.height)]);
  parts.tent.push(new THREE.ShapeGeometry(back).translate(0, 0, -TENT.length / 2).applyMatrix4(tent));
  // A ridge pole and the front pole that holds the door's peak up.
  parts.metal.push(new THREE.CylinderGeometry(0.015, 0.015, TENT.length, 6).rotateX(Math.PI / 2).translate(0, TENT.height, 0).applyMatrix4(tent));
  parts.metal.push(new THREE.CylinderGeometry(0.015, 0.015, TENT.height, 6).translate(0, TENT.height / 2, TENT.length / 2).applyMatrix4(tent));
  parts.sheet.push(new THREE.BoxGeometry(TENT.width - 0.05, 0.01, TENT.length).translate(0, 0.006, 0).applyMatrix4(tent));
  // Real beds (the `camp-bed-*` seats in layout.ts): you lie on their tops.
  const bag = SLEEPING_BAG;
  for (const x of bag.xs) {
    parts.bag.push(
      new THREE.CapsuleGeometry(0.24, bag.length - 0.48, 4, 10)
        .rotateX(Math.PI / 2)
        .scale(1, bag.top / 0.48, 1)
        .translate(x, bag.top / 2, bag.z)
        .applyMatrix4(tent)
    );
    parts.sheet.push(new THREE.BoxGeometry(0.42, 0.09, 0.26).translate(x, bag.top + 0.03, bag.pillowZ).applyMatrix4(tent));
  }

  // Folding camp chairs: a sagging fabric seat and back on a metal frame.
  const seat = CAMP_SEAT_HEIGHT;
  for (const chair of CAMP_CHAIRS) {
    // Local frame: the sitter faces -Z (as avatars do), so the back is +Z.
    const place = new THREE.Matrix4().compose(
      new THREE.Vector3(chair.x, FIELD_Y, chair.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), chair.rotationY),
      new THREE.Vector3(1, 1, 1)
    );
    parts.fabric.push(new THREE.BoxGeometry(0.5, 0.02, 0.44).rotateX(0.12).translate(0, seat, 0).applyMatrix4(place));
    parts.fabric.push(new THREE.BoxGeometry(0.5, 0.48, 0.02).rotateX(-0.28).translate(0, seat + 0.26, 0.25).applyMatrix4(place));
    for (const sx of [-1, 1]) {
      // Front and back legs crossing on each side, and an armrest.
      parts.metal.push(new THREE.CylinderGeometry(0.012, 0.012, 0.52, 5).rotateX(0.75).translate(sx * 0.25, seat / 2, 0).applyMatrix4(place));
      parts.metal.push(new THREE.CylinderGeometry(0.012, 0.012, 0.52, 5).rotateX(-0.75).translate(sx * 0.25, seat / 2, 0).applyMatrix4(place));
      parts.metal.push(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 5).rotateX(Math.PI / 2).translate(sx * 0.27, seat + 0.17, 0.02).applyMatrix4(place));
      parts.metal.push(new THREE.CylinderGeometry(0.012, 0.012, 0.66, 5).rotateX(-0.28).translate(sx * 0.25, seat + 0.26, 0.26).applyMatrix4(place));
    }
  }

  const merge = (list: THREE.BufferGeometry[]) => {
    const merged = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
    for (const g of list) g.dispose();
    return merged ?? new THREE.BufferGeometry();
  };
  return {
    tent: merge(parts.tent),
    windows: mergeGeometries(windows) ?? new THREE.BufferGeometry(),
    sheet: merge(parts.sheet),
    bag: merge(parts.bag),
    fabric: merge(parts.fabric),
    metal: merge(parts.metal),
    stone: merge(parts.stone),
    wood: merge(parts.wood),
    ground: new THREE.CircleGeometry(4.4, 40),
  };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bare earth fading out into the grass, so the patch has no hard edge. */
function makeCampGroundTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(58,46,34,1)");
  g.addColorStop(0.45, "rgba(92,78,52,0.9)");
  g.addColorStop(0.8, "rgba(118,112,70,0.45)");
  g.addColorStop(1, "rgba(130,128,80,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const random = mulberry32(77);
  for (let i = 0; i < 140; i++) {
    const r = 1 + random() * 3;
    const a = random() * Math.PI * 2;
    const d = random() * size * 0.42;
    ctx.fillStyle = random() > 0.5 ? "rgba(40,32,24,0.35)" : "rgba(140,120,80,0.3)";
    ctx.beginPath();
    ctx.arc(size / 2 + Math.cos(a) * d, size / 2 + Math.sin(a) * d, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A soft round glow for the fire's halo. */
function makeGlowTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
