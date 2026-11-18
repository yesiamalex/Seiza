/**
 * The season's own touches outdoors (src/sky/seasons.ts): the tree in the
 * meadow (MeadowTree, there in every season and none) blossoms, greens,
 * reddens, and goes bare, with petals or leaves drifting down from it; the same drifting round you wherever you
 * are outdoors, and fireflies on summer nights; and cicadas on summer
 * days. The ground and the treeline change colour in Outdoors.tsx, and
 * snow falls in Rain.tsx.
 *
 * Built-in rooms only, and only while a season is on. Cheap: the tree is
 * two meshes (trunk, canopy), the petals under it and the drift round you
 * one instanced mesh each (a dozen triangles a petal), the fireflies one
 * points mesh, and the cicadas a synthesized loop.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { seasonWeight, skyState } from "../sky/skyState";
import { SEASONS, type Season } from "../sky/seasons";
import { setCicadas } from "../audio/sfx";
import { floorHeightAt, makeObstacle, setSceneryObstacles, sheltered } from "./layout";
import { softDotTexture } from "./softDot";
import { viewerPosition } from "../xr/viewer";

/** Where the meadow tree stands unless a world moves it (world.json
 *  `meadowTree`): out in the open east side of the meadow, clear of the
 *  campsite, the portals, and the steps, and seen from the top of them. */
export const MEADOW_TREE_AT: [number, number] = [14, 47];
const TRUNK_RADIUS = 0.3;
/** Where the canopy is, for petals to fall from. */
const CANOPY_Y = 4.2;
const CANOPY_RADIUS = 2.8;

const CANOPY_COLORS: Record<Season, string> = {
  spring: "#f2b9c8", // sakura
  summer: "#4d7b37",
  autumn: "#c4472c", // momiji
  winter: "#ffffff", // bare: the canopy is hidden
};

/** Petals in spring and leaves in autumn, a few at a time: each one
 *  lies on the grass a while after it lands before another falls. */
const MAX_FALLING = 40;
const FALLING_COLORS: Partial<Record<Season, THREE.Color[]>> = {
  spring: ["#f7c6d3", "#fbe0e7", "#f2aec1"].map((c) => new THREE.Color(c)),
  autumn: ["#c4472c", "#d8752e", "#b8352a", "#d9a03a"].map((c) => new THREE.Color(c)),
};
/** Beyond this the falling petals aren't drawn or moved. */
const FALLING_RANGE = 45;

const scratchEye = new THREE.Vector3();

function buildTree() {
  // Trunk and a few boughs, tapering, merged into one mesh.
  const trunk = new THREE.CylinderGeometry(0.16, TRUNK_RADIUS, 3.4, 7).translate(0, 1.7, 0);
  const boughs = [
    [0.9, 0.5],
    [-0.8, 0.9],
    [0.2, -1],
  ].map(([x, z]) => {
    const bough = new THREE.CylinderGeometry(0.06, 0.12, 1.8, 5).translate(0, 0.9, 0);
    const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, 1.3, z).normalize());
    return bough.applyQuaternion(tilt).translate(0, 2.8, 0);
  });
  const wood = mergeGeometries([trunk, ...boughs].map((g) => g.toNonIndexed()));
  // The canopy: overlapping low-poly puffs, like the treeline's cones.
  const puffs = [
    [0, 4.4, 0, 1.7],
    [1.3, 4.0, 0.5, 1.2],
    [-1.2, 4.1, 0.7, 1.25],
    [0.3, 4.0, -1.3, 1.2],
    [-0.4, 5.0, -0.3, 1.1],
  ].map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 1).translate(x, y, z));
  const canopy = mergeGeometries(puffs);
  [trunk, ...boughs, ...puffs].forEach((g) => g.dispose());
  return { wood, canopy };
}

const canopyColors = Object.fromEntries(Object.entries(CANOPY_COLORS).map(([season, color]) => [season, new THREE.Color(color)])) as Record<Season, THREE.Color>;

/**
 * The tree on the meadow, in every world on Seiza's grounds unless the
 * world turns it off (world.json `meadowTree`). Green with no season; with
 * one, its canopy takes on each season's colour as a change blends in
 * (seasonWeight), and thins away into winter and fills out of it. Cheap
 * either way: two meshes, and a colour mixed once a frame.
 */
export function MeadowTree({ at = MEADOW_TREE_AT }: { at?: [number, number] }) {
  const { wood, canopy } = useMemo(buildTree, []);
  const woodMaterial = useMemo(() => new THREE.MeshLambertMaterial({ color: "#5a4334", flatShading: true }), []);
  const canopyMaterial = useMemo(() => new THREE.MeshLambertMaterial({ color: CANOPY_COLORS.summer, flatShading: true }), []);
  const canopyMesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const mesh = canopyMesh.current;
    if (!mesh) return;
    const bare = seasonWeight("winter");
    mesh.visible = bare < 0.98;
    if (!mesh.visible) return;
    // The leafy seasons' colours, mixed by how much of each is showing, and
    // summer's green for whatever share is no season at all.
    let none = 1 - bare;
    canopyMaterial.color.setRGB(0, 0, 0);
    for (const season of ["spring", "summer", "autumn"] as const) {
      const weight = seasonWeight(season);
      none -= weight;
      if (weight <= 0) continue;
      canopyMaterial.color.r += canopyColors[season].r * weight;
      canopyMaterial.color.g += canopyColors[season].g * weight;
      canopyMaterial.color.b += canopyColors[season].b * weight;
    }
    if (none > 0) {
      canopyMaterial.color.r += canopyColors.summer.r * none;
      canopyMaterial.color.g += canopyColors.summer.g * none;
      canopyMaterial.color.b += canopyColors.summer.b * none;
    }
    const leafy = 1 - bare;
    if (leafy > 0) canopyMaterial.color.multiplyScalar(1 / leafy);
    // Thinning: the canopy draws in toward the branches as it goes bare.
    const fullness = 1 - bare;
    mesh.scale.set(0.35 + 0.65 * fullness, 0.5 + 0.5 * fullness, 0.35 + 0.65 * fullness);
  });
  useEffect(
    () => () => {
      wood.dispose();
      canopy.dispose();
      woodMaterial.dispose();
      canopyMaterial.dispose();
    },
    [wood, canopy, woodMaterial, canopyMaterial]
  );
  // Its trunk is solid while it's there.
  useEffect(() => {
    setSceneryObstacles([makeObstacle(at[0], at[1], TRUNK_RADIUS + 0.05, TRUNK_RADIUS + 0.05)]);
    return () => setSceneryObstacles([]);
  }, [at]);
  const y = floorHeightAt(at[0], at[1]);
  return (
    <group position={[at[0], y, at[1]]}>
      <mesh geometry={wood} material={woodMaterial} castShadow />
      <mesh ref={canopyMesh} geometry={canopy} material={canopyMaterial} castShadow />
    </group>
  );
}

// --- petals and leaves as shapes --------------------------------------------

/**
 * A petal or a leaf, as a flat shape rather than a dot: a cherry petal
 * with the notch at its tip in spring, a maple leaf in autumn. A dozen
 * triangles each, drawn as one instanced mesh, each one tumbling as it
 * falls so it catches the light. A little darker toward the middle, which
 * reads as the vein and keeps a leaf from looking like a cut-out.
 */
function flutterGeometry(season: Season): THREE.BufferGeometry {
  const outline: [number, number][] = [];
  if (season === "spring") {
    // Half a petal, base to notch, mirrored: about 6 cm long.
    const half: [number, number][] = [
      [0, -0.032],
      [0.014, -0.022],
      [0.024, -0.002],
      [0.026, 0.016],
      [0.018, 0.03],
      [0.007, 0.034],
      [0, 0.027],
    ];
    outline.push(...half);
    for (let i = half.length - 2; i > 0; i--) outline.push([-half[i][0], half[i][1]]);
  } else {
    // A five-lobed maple leaf, tips and the dips between them, round from
    // the stem: about 13 cm across.
    const points: [number, number][] = [
      [270, 0.014],
      [318, 0.044],
      [332, 0.05],
      [352, 0.038],
      [18, 0.06],
      [32, 0.064],
      [58, 0.042],
      [82, 0.068],
      [98, 0.068],
      [122, 0.042],
      [148, 0.064],
      [162, 0.06],
      [188, 0.038],
      [208, 0.05],
      [222, 0.044],
    ];
    for (const [deg, r] of points) {
      const a = (deg * Math.PI) / 180;
      outline.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ShapeGeometry(shape);
  // A centre vertex isn't there in a ShapeGeometry, so shade by distance
  // from the middle: the rim lighter, which reads as the midrib's shadow.
  const position = geometry.getAttribute("position");
  let reach = 0;
  for (let i = 0; i < position.count; i++) reach = Math.max(reach, Math.hypot(position.getX(i), position.getY(i)));
  const shade = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const k = 0.72 + 0.28 * (Math.hypot(position.getX(i), position.getY(i)) / reach);
    shade[i * 3] = shade[i * 3 + 1] = shade[i * 3 + 2] = k;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(shade, 3));
  return geometry;
}

const flutterDummy = new THREE.Object3D();

/** One instanced mesh of petals or leaves, coloured from the season's
 *  palette, for Falling and Drift to move. */
function useFlutter(season: Season, count: number) {
  const colors = FALLING_COLORS[season];
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(
      flutterGeometry(season),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true }),
      count
    );
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    if (colors) for (let i = 0; i < count; i++) m.setColorAt(i, colors[i % colors.length]);
    return m;
  }, [season, count, colors]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    },
    [mesh]
  );
  return mesh;
}

/** Puts petal `i` at a spot, tumbling with its own phase; a zero scale
 *  hides it (under a roof). */
function placeFlutter(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, swing: number, phase: number, shown: boolean) {
  flutterDummy.position.set(x, y, z);
  flutterDummy.rotation.set(swing * 1.7 + phase, phase * 2.1 + swing * 0.6, Math.sin(swing * 1.3) * 1.1);
  flutterDummy.scale.setScalar(shown ? 0.85 + 0.3 * Math.sin(phase * 5.7) ** 2 : 0);
  flutterDummy.updateMatrix();
  mesh.setMatrixAt(i, flutterDummy.matrix);
}

/** Petals or leaves drifting down from the tree's canopy and settling. */
function Falling({ season, at }: { season: Season; at: [number, number] }) {
  const mesh = useFlutter(season, MAX_FALLING);
  const ground = useMemo(() => floorHeightAt(at[0], at[1]), [at]);
  const state = useMemo(() => {
    const s = {
      x: new Float32Array(MAX_FALLING),
      y: new Float32Array(MAX_FALLING),
      z: new Float32Array(MAX_FALLING),
      phase: new Float32Array(MAX_FALLING),
      /** Seconds left lying on the grass, once landed (or, hidden, waiting
       *  to fall). */
      rest: new Float32Array(MAX_FALLING),
      /** Not showing: waiting its turn, while this season is blending in
       *  or out. */
      hidden: new Uint8Array(MAX_FALLING),
      time: 0,
    };
    // Arriving with a change of season, they start falling a few at a time
    // rather than appearing in mid-air all at once.
    const arriving = seasonWeight(season) < 0.99;
    for (let i = 0; i < MAX_FALLING; i++) {
      s.x[i] = at[0] + (Math.random() - 0.5) * CANOPY_RADIUS * 2;
      s.z[i] = at[1] + (Math.random() - 0.5) * CANOPY_RADIUS * 2;
      s.y[i] = ground + Math.random() * CANOPY_Y;
      s.phase[i] = Math.random() * Math.PI * 2;
      if (arriving) {
        s.hidden[i] = 1;
        s.rest[i] = Math.random() * 6;
      }
    }
    return s;
  }, [ground, season, at]);

  useFrame(({ camera }, delta) => {
    const eye = viewerPosition(camera, scratchEye);
    mesh.visible = Math.hypot(eye.x - at[0], eye.z - at[1]) < FALLING_RANGE;
    if (!mesh.visible) return;
    const dt = Math.min(delta, 0.1);
    state.time += dt;
    const drift = (skyState.weatherState?.windSpeed() ?? 0) * 0.05;
    // How much of this season is showing: as it fades, fewer leave the
    // canopy, until none do.
    const weight = seasonWeight(season);
    for (let i = 0; i < MAX_FALLING; i++) {
      if (state.rest[i] > 0) {
        // Landed: lying flat on the grass a while, then gone, and another
        // leaves the canopy. Or hidden, waiting its turn.
        state.rest[i] -= dt;
        flutterDummy.position.set(state.x[i], ground + 0.015, state.z[i]);
        flutterDummy.rotation.set(-Math.PI / 2, 0, state.phase[i] * 3);
        flutterDummy.scale.setScalar(state.rest[i] > 0 && !state.hidden[i] ? 1 : 0);
        flutterDummy.updateMatrix();
        mesh.setMatrixAt(i, flutterDummy.matrix);
        if (state.rest[i] <= 0) {
          if (Math.random() < weight) {
            state.hidden[i] = 0;
            state.x[i] = at[0] + (Math.random() - 0.5) * CANOPY_RADIUS * 2;
            state.z[i] = at[1] + (Math.random() - 0.5) * CANOPY_RADIUS * 2;
            state.y[i] = ground + CANOPY_Y - Math.random() * 1.2;
          } else {
            state.hidden[i] = 1;
            state.rest[i] = 1 + Math.random() * 3;
          }
        }
        continue;
      }
      // Petals flutter down slowly, swinging side to side.
      state.y[i] -= (0.35 + 0.25 * Math.sin(state.phase[i] * 3.1)) * dt;
      state.x[i] += drift * dt;
      if (state.y[i] < ground + 0.03) {
        state.rest[i] = 4 + Math.random() * 10;
        continue;
      }
      const swing = state.time * (0.9 + 0.4 * Math.sin(state.phase[i])) + state.phase[i];
      placeFlutter(mesh, i, state.x[i] + Math.sin(swing) * 0.35, state.y[i], state.z[i] + Math.cos(swing * 0.8) * 0.3, swing, state.phase[i], true);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!FALLING_COLORS[season]) return null;
  return <primitive object={mesh} />;
}

/** How many drift round you, and how far out. */
const DRIFT_COUNT = 24;
const DRIFT_RADIUS = 13;

/**
 * The season in the air wherever you are outdoors, not only under the
 * tree: cherry petals in spring and leaves in autumn, a few dozen falling
 * slowly round you and carried by the wind; fireflies blinking low over
 * the grass on summer nights. One points mesh; none under a roof.
 */
function Drift({ season }: { season: Season }) {
  const points = useRef<THREE.Points>(null);
  const fireflies = season === "summer";
  const colors = fireflies ? [new THREE.Color("#d8ff7a")] : FALLING_COLORS[season];
  // Petals and leaves are shapes (useFlutter); only fireflies are dots.
  const leaves = useFlutter(fireflies ? "spring" : season, fireflies ? 1 : DRIFT_COUNT);
  const state = useMemo(
    () => ({
      x: new Float32Array(DRIFT_COUNT),
      y: new Float32Array(DRIFT_COUNT),
      z: new Float32Array(DRIFT_COUNT),
      phase: new Float32Array(DRIFT_COUNT).map(() => Math.random() * Math.PI * 2),
      live: new Uint8Array(DRIFT_COUNT),
      time: 0,
    }),
    []
  );
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(DRIFT_COUNT * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(DRIFT_COUNT * 3), 3).setUsage(THREE.DynamicDrawUsage));
    return g;
  }, []);
  // Fireflies glow (additive, so a dim one is simply a darker colour).
  const material = useMemo(
    () => new THREE.PointsMaterial({ size: 0.07, map: softDotTexture(), vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: true }),
    []
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  useFrame(({ camera }, delta) => {
    const mesh = fireflies ? points.current : leaves;
    if (!mesh || !colors) return;
    const showing = fireflies ? skyState.night > 0.5 && skyState.rain < 0.2 : true;
    mesh.visible = showing;
    if (!showing) return;
    const dt = Math.min(delta, 0.1);
    state.time += dt;
    const eye = viewerPosition(camera, scratchEye);
    const drift = (skyState.weatherState?.windSpeed() ?? 0) * 0.06;
    const p = (geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    const c = (geometry.getAttribute("color") as THREE.BufferAttribute).array as Float32Array;
    const weight = seasonWeight(season);
    const respawn = (i: number, high: boolean) => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * DRIFT_RADIUS;
      state.x[i] = eye.x + Math.cos(a) * r;
      state.z[i] = eye.z + Math.sin(a) * r;
      const floor = floorHeightAt(state.x[i], state.z[i]);
      state.y[i] = fireflies ? floor + 0.3 + Math.random() * 1.6 : high ? eye.y + 4 + Math.random() * 3 : floor + Math.random() * 7;
      // Fewer as this season fades, more as it blends in.
      state.live[i] = sheltered(state.x[i], eye.y, state.z[i]) || Math.random() >= weight ? 0 : 1;
      colors[i % colors.length].toArray(c, i * 3);
    };
    for (let i = 0; i < DRIFT_COUNT; i++) {
      const far = Math.hypot(state.x[i] - eye.x, state.z[i] - eye.z) > DRIFT_RADIUS + 3;
      // Arriving with a change of season, they come down from above rather
      // than appearing all round you.
      if (state.time === dt || far) respawn(i, state.time === dt && weight < 0.99);
      const swing = state.time * (0.8 + 0.4 * Math.sin(state.phase[i])) + state.phase[i];
      if (fireflies) {
        // Wandering low, and blinking: a few seconds' slow pulse each.
        state.x[i] += Math.sin(swing * 0.7) * 0.3 * dt;
        state.z[i] += Math.cos(swing * 0.6) * 0.3 * dt;
        state.y[i] += Math.sin(swing * 1.3) * 0.15 * dt;
        const blink = Math.max(0, Math.sin(state.time * 1.4 + state.phase[i] * 3));
        const k = state.live[i] ? blink * blink * weight : 0;
        c[i * 3] = 0.85 * k;
        c[i * 3 + 1] = 1.0 * k;
        c[i * 3 + 2] = 0.45 * k;
      } else {
        // Fluttering down, swinging side to side, carried downwind.
        state.y[i] -= (0.45 + 0.3 * Math.sin(state.phase[i] * 2.3)) * dt;
        state.x[i] += drift * dt;
        if (state.y[i] < floorHeightAt(state.x[i], state.z[i]) + 0.02) respawn(i, true);
      }
      if (!fireflies) {
        placeFlutter(leaves, i, state.x[i] + Math.sin(swing) * 0.4, state.y[i], state.z[i] + Math.cos(swing * 0.8) * 0.3, swing, state.phase[i], state.live[i] === 1);
        continue;
      }
      const o = i * 3;
      if (!state.live[i]) {
        p[o] = p[o + 1] = p[o + 2] = 0;
        continue;
      }
      p[o] = state.x[i] + (fireflies ? 0 : Math.sin(swing) * 0.4);
      p[o + 1] = state.y[i];
      p[o + 2] = state.z[i] + (fireflies ? 0 : Math.cos(swing * 0.8) * 0.3);
    }
    if (!fireflies) {
      leaves.instanceMatrix.needsUpdate = true;
      return;
    }
    geometry.getAttribute("position").needsUpdate = true;
    geometry.getAttribute("color").needsUpdate = true;
  });

  if (!colors) return null;
  if (!fireflies) return <primitive object={leaves} />;
  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} />;
}

/** Cicadas by day in summer, outdoors, and not in the rain. Checked a few
 *  times a second; the sound eases itself. */
function Cicadas() {
  const since = useRef(1);
  useEffect(() => () => setCicadas(0), []);
  useFrame(({ camera }, delta) => {
    since.current += delta;
    if (since.current < 0.25) return;
    since.current = 0;
    const eye = viewerPosition(camera, scratchEye);
    const day = Math.min(1, skyState.dayness * 1.5) * (1 - skyState.night);
    const dry = 1 - Math.min(1, skyState.rain * 3);
    const outside = sheltered(eye.x, eye.y, eye.z) ? 0.25 : 1;
    setCicadas(day * dry * outside * seasonWeight("summer"));
  });
  return null;
}

/**
 * Everything seasonal that isn't a recolour: mount once, in a moving sky.
 * While a change of season blends in (skyState's seasonWeight), both
 * seasons are mounted: the old one's petals stop falling and its fireflies
 * and cicadas fade as the new one's begin.
 */
export function Seasons({ builtin, tree }: { builtin: boolean; tree: [number, number] | null }) {
  const showing = useSeasons();
  if (showing.length === 0) return null;
  return (
    <>
      {showing.map((season) => (
        <SeasonParts key={season} season={season} builtin={builtin} tree={tree} />
      ))}
    </>
  );
}

function SeasonParts({ season, builtin, tree }: { season: Season; builtin: boolean; tree: [number, number] | null }) {
  return (
    <>
      {builtin && tree && (season === "spring" || season === "autumn") && <Falling season={season} at={tree} />}
      {builtin && season !== "winter" && <Drift season={season} />}
      {season === "summer" && <Cicadas />}
    </>
  );
}

/** How long a season that has blended out stays mounted, in seconds, so
 *  its last petals can land instead of vanishing in mid-air. */
const SEASON_LINGER_SECONDS = 15;

/** The seasons showing (one, or two while a change blends, and one that
 *  has just gone, for a little while), as React state: they change rarely
 *  (a room's pick, or the calendar turning), so checking a few times a
 *  second is plenty. */
function useSeasons(): Season[] {
  const lastSeen = useRef(new Map<Season, number>());
  const read = (now: number) => {
    for (const season of [skyState.seasonFrom, skyState.season]) if (season) lastSeen.current.set(season, now);
    return SEASONS.filter((season) => now - (lastSeen.current.get(season) ?? -Infinity) <= SEASON_LINGER_SECONDS);
  };
  const [showing, setShowing] = useState<Season[]>(() => read(0));
  const clock = useRef(0);
  const since = useRef(0);
  useFrame((_, delta) => {
    clock.current += delta;
    since.current += delta;
    if (since.current < 0.25) return;
    since.current = 0;
    const next = read(clock.current);
    setShowing((current) => (current.length === next.length && current.every((s, i) => s === next[i]) ? current : next));
  });
  return showing;
}
