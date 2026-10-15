import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { skyState } from "../sky/skyState";
import { POND_CENTER, POND_WATER_RADIUS } from "./layout";

/**
 * What you see through the windows.
 *
 * Everything here is procedural — no downloaded textures, no bundled
 * models — because a deployment is meant to run entirely on the deployer's
 * own infrastructure, and because none of it needs to survive close
 * inspection: you only ever see it from inside, through a window, at
 * distance.
 *
 * It replaces a flat brown disc and a flat green ring, which read as
 * cardboard. The three things that actually sell an exterior at this
 * distance are a ground that varies, a silhouette where the ground meets
 * the sky, and haze to sit them apart — so that's what this is, at a cost
 * of four draw calls.
 *
 * Everything is tagged navIgnore so the navmesh doesn't decide the whole
 * countryside is walkable.
 */

const GROUND_RADIUS = 170;
/** Trees ring the building from just past the walls out to the treeline. */
const TREE_INNER = 38;
const TREE_OUTER = 130;
const TREE_COUNT = 260;
const HILL_COUNT = 9;

/** Deterministic, so every client in the room sees the same landscape. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ground colouring, painted once into a canvas: grass close in, dry and
 * hazy toward the horizon where the sun is. A gradient does most of the
 * work; the blotches stop it looking like a lighting bug.
 */
function makeGroundTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.5);
  gradient.addColorStop(0, "#8d9a5c");
  gradient.addColorStop(0.35, "#7e8b52");
  gradient.addColorStop(0.7, "#9c9160");
  gradient.addColorStop(1, "#c2a074");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const random = mulberry32(90210);
  for (let i = 0; i < 260; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 3 + random() * 14;
    // Tint toward the colour already under the blotch, so patches read as
    // uneven grass rather than as spots painted on top.
    ctx.fillStyle = random() > 0.5 ? "rgba(112,128,74,0.22)" : "rgba(168,146,96,0.2)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** How dark the unlit ground and hills get in full night, and the cool
 *  tint they take on: moonlit rather than black. */
const NIGHT_BRIGHTNESS = 0.22;
const NIGHT_TINT = new THREE.Color(0.75, 0.82, 1.0);

export function Outdoors() {
  const ground = useMemo(makeGroundTexture, []);
  const groundMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const hillMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const tint = useMemo(() => new THREE.Color(), []);

  // The ground and hills are unlit, so with a moving sky (src/sky/) they
  // follow it by hand: dimmer and cooler after dusk, a little greyer under
  // cloud. With the fixed sunset skyState is inactive and their colours are
  // never touched.
  useFrame(() => {
    if (!skyState.active) return;
    const k = THREE.MathUtils.lerp(1, NIGHT_BRIGHTNESS, skyState.night) * (1 - 0.25 * skyState.cloud * (1 - skyState.night));
    tint.setRGB(1, 1, 1).lerp(NIGHT_TINT, skyState.night).multiplyScalar(k);
    if (groundMaterial.current) {
      groundMaterial.current.color.set(ground ? "#ffffff" : "#8d9a5c").multiply(tint);
    }
    if (hillMaterial.current) hillMaterial.current.color.set("#6c6b58").multiply(tint);
  });

  /**
   * The outer ground, with the pond cut out of it.
   *
   * This disc is unlit and sits at y = -0.06, just under the decking —
   * which means it also ran straight across the top of the sunken pond
   * basin. That was invisible while the water was opaque, and became the
   * whole problem the moment the water was made see-through: looking
   * into the pond showed this flat green circle rather than the bed and
   * the koi below it. The pond reading as "green" was never the water's
   * colour; it was the lawn, seen through it.
   *
   * A ShapeGeometry with a hole rather than moving or shrinking the
   * ground, so the lawn still meets the decking everywhere else exactly
   * as before.
   */
  const groundGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, GROUND_RADIUS, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    // The mesh is rotated -90 degrees about X, which maps shape (x, y)
    // onto world (x, 0, -y) — hence the negated pond Z. Slightly wider
    // than the water so the cut edge hides under the basin rim.
    hole.absarc(POND_CENTER[0], -POND_CENTER[1], POND_WATER_RADIUS + 0.1, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geometry = new THREE.ShapeGeometry(shape, 64);
    // ShapeGeometry uses raw shape coordinates as UVs; at this radius
    // that would repeat the grass texture hundreds of times. Rewrite
    // them to CircleGeometry's 0..1 convention so the texture looks the
    // same as it did before the hole existed.
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < position.count; i++) {
      uv.setXY(i, position.getX(i) / (GROUND_RADIUS * 2) + 0.5, position.getY(i) / (GROUND_RADIUS * 2) + 0.5);
    }
    uv.needsUpdate = true;
    return geometry;
  }, []);
  useEffect(() => () => groundGeometry.dispose(), [groundGeometry]);
  useEffect(() => () => ground?.dispose(), [ground]);

  // One instanced draw call for every tree, and another for the hills.
  const { trees, treeColors, hills } = useMemo(() => {
    const random = mulberry32(1337);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    const trees: number[] = [];
    const treeColors: number[] = [];
    const tint = new THREE.Color();
    for (let i = 0; i < TREE_COUNT; i++) {
      // Squared interpolation biases trees outward, so the ground nearest
      // the building stays open instead of crowding the windows.
      const t = random() ** 0.6;
      const radius = THREE.MathUtils.lerp(TREE_INNER, TREE_OUTER, t);
      const angle = random() * Math.PI * 2;
      const height = THREE.MathUtils.lerp(4.5, 9, random());
      // The cone's origin is its middle, so lift it half its height and
      // then sink it slightly, or every tree is buried to the waist.
      position.set(Math.cos(angle) * radius, height / 2 - 0.4, Math.sin(angle) * radius);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI);
      scale.set(0.7 + random() * 0.5, height / 6, 0.7 + random() * 0.5);
      matrix.compose(position, quaternion, scale);
      trees.push(...matrix.elements);
      // Nearer trees keep their colour; distant ones wash toward the haze.
      tint.setHSL(0.25 - random() * 0.05, 0.3, THREE.MathUtils.lerp(0.22, 0.4, t * random()));
      treeColors.push(tint.r, tint.g, tint.b);
    }

    const hills: number[] = [];
    for (let i = 0; i < HILL_COUNT; i++) {
      const angle = (i / HILL_COUNT) * Math.PI * 2 + random() * 0.4;
      const radius = 150 + random() * 30;
      position.set(Math.cos(angle) * radius, -4, Math.sin(angle) * radius);
      quaternion.identity();
      const spread = 55 + random() * 70;
      scale.set(spread, 16 + random() * 16, spread);
      matrix.compose(position, quaternion, scale);
      hills.push(...matrix.elements);
    }

    return { trees, treeColors, hills };
  }, []);

  const applyInstances = (mesh: THREE.InstancedMesh | null, elements: number[], colors?: number[]) => {
    if (!mesh) return;
    mesh.instanceMatrix.set(elements);
    mesh.instanceMatrix.needsUpdate = true;
    if (colors) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(colors), 3);
      mesh.instanceColor.needsUpdate = true;
      // The shader only compiles the per-instance colour path if the
      // attribute is there when it builds, and it may already have built.
      (mesh.material as THREE.Material).needsUpdate = true;
    }
    // Instanced meshes compute their bounds from instance 0 only, which
    // would frustum-cull the whole treeline the moment you look away from
    // the first tree.
    mesh.frustumCulled = false;
  };

  return (
    <group userData={{ navIgnore: true }}>
      {/* Ground. Unlit on purpose: it sits far outside the shadow camera,
          so lighting it would only ever come out flat anyway, and this way
          it costs nothing. */}
      <mesh
        geometry={groundGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.06, 0]}
        userData={{ navIgnore: true }}
      >
        <meshBasicMaterial ref={groundMaterial} map={ground ?? undefined} color={ground ? "#ffffff" : "#8d9a5c"} fog />
      </mesh>

      {/* Distant hills, sunk into the ground so only their tops show. */}
      <instancedMesh
        ref={(mesh) => applyInstances(mesh, hills)}
        args={[undefined, undefined, HILL_COUNT]}
        userData={{ navIgnore: true }}
      >
        <coneGeometry args={[1, 1, 7, 1]} />
        <meshBasicMaterial ref={hillMaterial} color="#6c6b58" fog />
      </instancedMesh>

      {/* Treeline. Six-sided cones: from inside a building, that is a tree. */}
      <instancedMesh
        ref={(mesh) => applyInstances(mesh, trees, treeColors)}
        args={[undefined, undefined, TREE_COUNT]}
        userData={{ navIgnore: true }}
      >
        <coneGeometry args={[1.5, 6, 6, 1]} />
        <meshLambertMaterial color="#54683a" fog />
      </instancedMesh>
    </group>
  );
}
