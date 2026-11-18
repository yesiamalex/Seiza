import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { seasonWeight, skyState } from "../sky/skyState";
import { SEASONS, type Season } from "../sky/seasons";
import { coastX, FIELD, POND_CENTER, POND_WATER_RADIUS } from "./layout";
import { buildMeadowGeometry } from "./meadow";
import { getWorldTheme } from "./materials";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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
/** How far past the meadow's edge trees stay away. */
const FIELD_TREE_MARGIN = 2;

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

/** The ground under snow, painted the same way: white, with grass
 *  showing through in patches and blue-grey drifts. */
function makeSnowTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.5);
  gradient.addColorStop(0, "#eef2f6");
  gradient.addColorStop(0.6, "#e4eaf1");
  gradient.addColorStop(1, "#d6dce4");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const random = mulberry32(4242);
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = random() > 0.7 ? "rgba(120,132,92,0.22)" : "rgba(176,190,212,0.28)";
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, 2 + random() * 11, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** How each season tints the grass and hills (multiplied in); winter swaps
 *  in snow instead. */
const SEASON_GROUND: Record<Season, THREE.Color> = {
  spring: new THREE.Color(1.0, 1.05, 0.95),
  summer: new THREE.Color(0.9, 1.1, 0.82),
  autumn: new THREE.Color(1.15, 0.92, 0.66),
  winter: new THREE.Color(1, 1, 1),
};
const SEASON_HILLS: Record<Season, THREE.Color> = {
  spring: new THREE.Color(0.98, 1.05, 0.96),
  summer: new THREE.Color(0.9, 1.08, 0.86),
  autumn: new THREE.Color(1.22, 0.86, 0.62),
  winter: new THREE.Color(1, 1, 1),
};
/** In autumn some of the treeline turns (the rest are evergreens), and in
 *  spring a few trees are in blossom. */
const AUTUMN_COLORS = ["#b8442a", "#d4732a", "#c99a2e", "#9c3524"].map((c) => new THREE.Color(c));
const BLOSSOM = new THREE.Color("#f0bccb");
const SNOW_DUST = new THREE.Color("#dfe6ee");
/** The treeline material's own colour, which every tree's colour is
 *  multiplied by: a seasonal colour is divided by it first, so it comes
 *  out as itself rather than darkened to the pines' green. */
const TREE_MATERIAL = "#54683a";

/**
 * A tropical treeline's tree, for the Filipino theme (materials.ts): a
 * short trunk under a broad, lumpy crown, the shape of a mango or an
 * acacia, where the Japanese default is a cone. Built in the cone's own
 * frame (6 m tall, its origin at the middle) so the same instances fit.
 * The trunk is darkened with a vertex colour; the crown takes each
 * instance's tint as the cone does.
 */
function broadleafTree(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.18, 0.3, 3, 6, 1, true).translate(0, -1.5, 0);
  const crown = [
    new THREE.IcosahedronGeometry(2.1, 1).scale(1, 0.62, 1).translate(0, 0.9, 0),
    new THREE.IcosahedronGeometry(1.35, 0).scale(1, 0.7, 1).translate(1.2, 0.45, 0.5),
    new THREE.IcosahedronGeometry(1.25, 0).scale(1, 0.7, 1).translate(-1.0, 0.55, -0.6),
    new THREE.IcosahedronGeometry(1.1, 0).scale(1, 0.75, 1).translate(0.2, 1.8, -0.2),
  ];
  const paint = (g: THREE.BufferGeometry, r: number, gr: number, b: number) => {
    const plain = g.index ? g.toNonIndexed() : g;
    plain.deleteAttribute("uv");
    const count = plain.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([r, gr, b], i * 3);
    plain.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return plain;
  };
  const parts = [paint(trunk, 0.55, 0.42, 0.3), ...crown.map((g) => paint(g, 1, 1, 1))];
  const merged = mergeGeometries(parts) ?? new THREE.BufferGeometry();
  merged.computeVertexNormals();
  return merged;
}
const treeMaterialColor = new THREE.Color(TREE_MATERIAL);
const treeMaterialInverse = new THREE.Color(1 / treeMaterialColor.r, 1 / treeMaterialColor.g, 1 / treeMaterialColor.b);

/** A season-by-season tint, mixed by how much of each season is showing
 *  (seasonWeight), with no tint for whatever share is no season at all. */
function blendSeasonTint(table: Record<Season, THREE.Color>, out: THREE.Color): THREE.Color {
  out.setRGB(0, 0, 0);
  let total = 0;
  for (const season of SEASONS) {
    const weight = seasonWeight(season);
    if (weight <= 0) continue;
    out.r += table[season].r * weight;
    out.g += table[season].g * weight;
    out.b += table[season].b * weight;
    total += weight;
  }
  out.r += 1 - total;
  out.g += 1 - total;
  out.b += 1 - total;
  return out;
}
const seasonTint = new THREE.Color();
const WINTER_HILLS = new THREE.Color("#bcc4ce");

/** The treeline's colours for a season, from its own colours. */
function seasonalTreeColors(base: number[], season: Season | null): Float32Array {
  const out = new Float32Array(base);
  if (!season) return out;
  const random = mulberry32(777);
  const c = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  for (let i = 0; i < base.length / 3; i++) {
    const pick = random();
    const which = random();
    c.setRGB(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
    // How light this tree is (0.22 near to 0.4 far): distant ones are
    // hazier, and keep it.
    const haze = (c.getHSL(hsl).l - 0.22) / 0.18;
    const shade = 0.55 + 0.5 * haze;
    if (season === "summer") c.multiply(SEASON_GROUND.summer);
    else {
      let target: THREE.Color | null = null;
      if (season === "autumn" && pick < 0.35) target = AUTUMN_COLORS[Math.floor(which * AUTUMN_COLORS.length)];
      else if (season === "spring" && pick < 0.1) target = BLOSSOM;
      if (target) c.copy(target).multiplyScalar(shade).multiply(treeMaterialInverse);
      else if (season === "winter") c.multiply(treeMaterialColor).lerp(SNOW_DUST, 0.45).multiply(treeMaterialInverse);
    }
    out[i * 3] = c.r;
    out[i * 3 + 1] = c.g;
    out[i * 3 + 2] = c.b;
  }
  return out;
}

/** How dark the unlit ground and hills get in full night, and the cool
 *  tint they take on: moonlit rather than black. */
const NIGHT_BRIGHTNESS = 0.22;
const NIGHT_TINT = new THREE.Color(0.75, 0.82, 1.0);

export function Outdoors() {
  const ground = useMemo(makeGroundTexture, []);
  // The treeline's trees: cones, or broadleaf trees in a Filipino world.
  const tropical = getWorldTheme() === "filipino";
  const tropicalTree = useMemo(() => (tropical ? broadleafTree() : null), [tropical]);
  useEffect(() => () => tropicalTree?.dispose(), [tropicalTree]);
  const snow = useMemo(makeSnowTexture, []);
  const treeMesh = useRef<THREE.InstancedMesh | null>(null);
  /** The season blend the treeline's colours were last set for. */
  const shownBlend = useRef("");
  /** The treeline's colours for each season, worked out once each. */
  const treeColorsBySeason = useRef(new Map<Season | "none", Float32Array>());
  const groundMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const meadowMaterial = useRef<THREE.MeshBasicMaterial>(null);
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
    // A change of season blends in over a few seconds (skyState's
    // seasonWeight): the tints mix, and the grass and snow textures, which
    // can't mix, swap at the middle of it, behind the grass going pale
    // toward it and the snow coming up out of grey after it.
    const snowShare = snow ? seasonWeight("winter") : 0;
    const swap = snowShare <= 0 || snowShare >= 1 ? 1 : snowShare <= 0.5 ? 1 + 0.9 * (snowShare / 0.5) : 0.55 + 0.45 * ((snowShare - 0.5) / 0.5);
    blendSeasonTint(SEASON_GROUND, seasonTint);
    for (const material of [groundMaterial.current, meadowMaterial.current]) {
      if (!material) continue;
      material.color.set(ground ? "#ffffff" : "#8d9a5c").multiply(tint).multiply(seasonTint).multiplyScalar(swap);
      // The same kind of texture either way, so swapping needs no new shader.
      const map = snowShare > 0.5 ? snow : ground;
      if (map && material.map !== map) material.map = map;
    }
    if (hillMaterial.current) {
      blendSeasonTint(SEASON_HILLS, seasonTint);
      hillMaterial.current.color.set("#6c6b58").multiply(seasonTint).lerp(WINTER_HILLS, snowShare).multiply(tint);
    }
    // The treeline's colours change only while the season does.
    const mesh = treeMesh.current;
    const from = skyState.seasonFrom;
    const to = skyState.season;
    const mix = skyState.seasonMix;
    const blend = `${from}|${to}|${mix.toFixed(3)}`;
    if (mesh?.instanceColor && blend !== shownBlend.current) {
      shownBlend.current = blend;
      const colorsFor = (season: Season | null) => {
        const key = season ?? "none";
        let colors = treeColorsBySeason.current.get(key);
        if (!colors) treeColorsBySeason.current.set(key, (colors = seasonalTreeColors(treeColors, season)));
        return colors;
      };
      const target = mesh.instanceColor.array as Float32Array;
      const end = colorsFor(to);
      if (mix >= 1) target.set(end);
      else {
        const start = colorsFor(from);
        for (let i = 0; i < target.length; i++) target[i] = start[i] + (end[i] - start[i]) * mix;
      }
      mesh.instanceColor.needsUpdate = true;
    }
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
    // The grass stops where the sand starts (Beach.tsx): the disc's edge
    // follows the shore on its east side instead of the circle.
    const SEGMENTS = 160;
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      const x = Math.cos(a) * GROUND_RADIUS;
      const y = Math.sin(a) * GROUND_RADIUS;
      const point: [number, number] = [Math.min(x, coastX(-y)), y];
      if (i === 0) shape.moveTo(...point);
      else shape.lineTo(...point);
    }
    const hole = new THREE.Path();
    // The mesh is rotated -90 degrees about X, which maps shape (x, y)
    // onto world (x, 0, -y) — hence the negated pond Z. Slightly wider
    // than the water so the cut edge hides under the basin rim.
    hole.absarc(POND_CENTER[0], -POND_CENTER[1], POND_WATER_RADIUS + 0.1, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    // And the sunken meadow, which has its own ground (meadowGeometry
    // below), its edges meeting this one's level all the way round.
    const field = new THREE.Path();
    field.moveTo(FIELD.minX, -FIELD.minZ);
    field.lineTo(FIELD.minX, -FIELD.maxZ);
    field.lineTo(FIELD.maxX, -FIELD.maxZ);
    field.lineTo(FIELD.maxX, -FIELD.minZ);
    field.closePath();
    shape.holes.push(field);
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
  // The meadow's ground, textured to run on from the disc's: the disc's
  // UVs are its shape coordinates (x, -z) scaled into 0..1.
  const meadowGeometry = useMemo(
    () => buildMeadowGeometry((x, z) => [x / (GROUND_RADIUS * 2) + 0.5, -z / (GROUND_RADIUS * 2) + 0.5]),
    []
  );
  useEffect(() => () => meadowGeometry.dispose(), [meadowGeometry]);
  useEffect(() => () => ground?.dispose(), [ground]);
  useEffect(() => () => snow?.dispose(), [snow]);

  // One instanced draw call for every tree, and another for the hills.
  const { trees, treeColors, hills, treeCount, hillCount } = useMemo(() => {
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
      // None on the meadow you can walk out onto (or so close that a
      // branch would hang over its edge): the trees beyond it mark where
      // it ends instead.
      // Nor on the beach or in the sea, nor right at the top of the sand.
      if (
        (position.x > FIELD.minX - FIELD_TREE_MARGIN &&
          position.x < FIELD.maxX + FIELD_TREE_MARGIN &&
          position.z > FIELD.minZ - FIELD_TREE_MARGIN &&
          position.z < FIELD.maxZ + FIELD_TREE_MARGIN) ||
        position.x > coastX(position.z) - 5 ||
        // nor on the way from the meadow down to the beach.
        (position.x > FIELD.maxX - 2 && position.z > FIELD.minZ && position.z < FIELD.maxZ)
      ) {
        // Draw the rest of this tree's randoms anyway, so every other tree
        // stays exactly where it was.
        for (let skip = 0; skip < 5; skip++) random();
        continue;
      }
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
      // Over the sea, a hill would be an island in the way of the horizon.
      if (position.x > coastX(position.z) - spread * 0.6) continue;
      matrix.compose(position, quaternion, scale);
      hills.push(...matrix.elements);
    }

    return { trees, treeColors, hills, treeCount: trees.length / 16, hillCount: hills.length / 16 };
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
      <mesh geometry={meadowGeometry} userData={{ navIgnore: true }}>
        <meshBasicMaterial ref={meadowMaterial} map={ground ?? undefined} color={ground ? "#ffffff" : "#8d9a5c"} fog />
      </mesh>

      {/* Distant hills, sunk into the ground so only their tops show. */}
      <instancedMesh
        ref={(mesh) => applyInstances(mesh, hills)}
        args={[undefined, undefined, Math.max(1, hillCount)]}
        userData={{ navIgnore: true }}
      >
        <coneGeometry args={[1, 1, 7, 1]} />
        <meshBasicMaterial ref={hillMaterial} color="#6c6b58" fog />
      </instancedMesh>

      {/* Treeline. Six-sided cones: from inside a building, that is a tree. */}
      <instancedMesh
        ref={(mesh) => {
          treeMesh.current = mesh;
          shownBlend.current = "";
          applyInstances(mesh, trees, treeColors);
        }}
        args={[undefined, undefined, treeCount]}
        userData={{ navIgnore: true }}
      >
        {tropicalTree ? (
          <primitive object={tropicalTree} attach="geometry" />
        ) : (
          <coneGeometry args={[1.5, 6, 6, 1]} />
        )}
        <meshLambertMaterial color={tropical ? "#7f9a5a" : TREE_MATERIAL} vertexColors={tropical} fog />
      </instancedMesh>
    </group>
  );
}
