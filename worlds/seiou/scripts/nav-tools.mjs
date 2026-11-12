// Checks and fixes on SeiOU's baked navmesh, shared by build-campus.mjs
// (which bakes it from the model) and fix-navmesh.mjs (which reworks the
// committed one without the 100 MB original).
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";

/** Less room than this under a floor, and nobody can stand there. */
const HEADROOM = 1.5;

/** Every polygon: its ref, a few points on it, and its neighbours. */
function allPolys(navMesh) {
  const polys = new Map();
  for (let t = 0; t < navMesh.getMaxTiles(); t++) {
    const tile = navMesh.getTile(t);
    const header = tile.header();
    if (!header) continue;
    const base = navMesh.getPolyRefBase(tile);
    for (let i = 0; i < header.polyCount(); i++) {
      const poly = tile.polys(i);
      if (poly.getType() !== 0) continue; // ground polygons, not off-mesh links
      const points = [];
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let v = 0; v < poly.vertCount(); v++) {
        const k = poly.verts(v) * 3;
        const p = { x: tile.verts(k), y: tile.verts(k + 1), z: tile.verts(k + 2) };
        points.push(p);
        cx += p.x;
        cy += p.y;
        cz += p.z;
      }
      const n = poly.vertCount();
      const centre = { x: cx / n, y: cy / n, z: cz / n };
      // The corners pulled a little toward the middle, so a corner shared
      // with a neighbour on another level doesn't decide it.
      const samples = [centre, ...points.map((p) => ({ x: p.x * 0.7 + centre.x * 0.3, y: p.y * 0.7 + centre.y * 0.3, z: p.z * 0.7 + centre.z * 0.3 }))];
      const links = [];
      // A link index of 0xffffffff (DT_NULL_LINK) ends the list; it can
      // come back signed, as -1.
      for (let l = poly.firstLink() >>> 0, guard = 0; l !== 0xffffffff && guard < 64; guard++) {
        const link = tile.links(l);
        if (link.ref()) links.push(link.ref());
        l = link.next() >>> 0;
      }
      polys.set(base | i, { samples, links, flags: poly.flags() });
    }
  }
  return polys;
}

/** Groups of polygons you can walk between. */
function islands(polys) {
  const seen = new Set();
  const groups = [];
  for (const ref of polys.keys()) {
    if (seen.has(ref)) continue;
    const group = [];
    const stack = [ref];
    seen.add(ref);
    while (stack.length) {
      const r = stack.pop();
      group.push(r);
      for (const next of polys.get(r)?.links ?? []) {
        if (!seen.has(next) && polys.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

/**
 * A ray caster over the model's triangles (world space, as
 * build-campus.mjs's worldTriangles gives them), for asking what's
 * overhead.
 */
export function overhead(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const bvh = new MeshBVH(geometry);
  const ray = new THREE.Ray();
  const up = new THREE.Vector3(0, 1, 0);
  /** Distance to the first surface above (x, y, z), or Infinity. */
  return (x, y, z) => {
    ray.origin.set(x, y, z);
    ray.direction.copy(up);
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
    return hit ? hit.distance : Infinity;
  };
}

/**
 * Turns off the walkable pockets under floors. Recast finds a little
 * standing room between a slab and the ground under it (the Academic
 * Residences' ground floor sits on a 0.9 m void), and those pockets are
 * walled off from everything: a warp that lands in one leaves you under
 * the floor with no way out. A pocket is an island where most of the
 * surface has the model less than HEADROOM above it. `above` is from
 * overhead().
 */
export function dropBuriedIslands(navMesh, above, log = () => {}) {
  const polys = allPolys(navMesh);
  // The navmesh can sit a little below the surface it follows: look up
  // from just above it.
  const LIFT = 0.3;
  let dropped = 0;
  for (const group of islands(polys)) {
    let under = 0;
    let total = 0;
    for (const ref of group)
      for (const p of polys.get(ref).samples) {
        total++;
        if (above(p.x, p.y + LIFT, p.z) < HEADROOM - LIFT) under++;
      }
    if (under / total <= 0.5) continue;
    const at = polys.get(group[0]).samples[0];
    log(`  under a floor, turned off: ${group.length} polygon${group.length === 1 ? "" : "s"} near (${at.x.toFixed(0)}, ${at.y.toFixed(1)}, ${at.z.toFixed(0)})`);
    for (const ref of group) navMesh.setPolyFlags(ref, 0);
    dropped += group.length;
  }
  return { dropped, total: polys.size };
}

/** Flips the triangles from `start` on whose normal points mostly down. */
function faceUp(positions, indices, start) {
  for (let t = start; t + 2 < indices.length; t += 3) {
    const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3];
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const ny = uz * vx - ux * vz;
    const length = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx);
    if (length > 0 && ny / length < -0.7) [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]];
  }
}

/** All triangles in world space, leaving out what `skip(node, material)`
 *  says isn't solid, and turning any facing down to face up where
 *  `floor(material)` says it's a floor. */
export function worldTriangles(doc, skip = () => false, floor = () => false) {
  const positions = [];
  const indices = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue; // triangles only
      if (skip(node.getName(), prim.getMaterial()?.getName() ?? "")) continue;
      const pos = prim.getAttribute("POSITION");
      const base = positions.length / 3;
      const v = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        positions.push(m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]);
      }
      const idx = prim.getIndices();
      const start = indices.length;
      if (idx) for (let i = 0; i < idx.getCount(); i++) indices.push(base + idx.getScalar(i));
      else for (let i = 0; i < pos.getCount(); i++) indices.push(base + i);
      if (floor(prim.getMaterial()?.getName() ?? "")) faceUp(positions, indices, start);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** Spots that must be reachable on foot from the Oblation (the same spots
 *  as client/campus.ts's PLACES). */
export const CHECKS = {
  "Main Building": [118, 0.2, 10],
  "Teaching and Learning Hub": [132, 0.2, 63],
  "TLH pod": [124, 0.5, 70],
  "CCDL auditorium": [277, 1, -96],
  "CCDL stage": [281, 5, -103],
  "WCMPB ground floor": [226, 1, 154],
  "WCMPB second floor": [226, 8.5, 150],
  "WCMPB roof deck": [226, 14.5, 150],
  "Academic Residences": [336, 1.1, -98],
};

export function plazaOf(query) {
  return query.findClosestPoint({ x: 0, y: 0, z: 12 }, { halfExtents: { x: 4, y: 4, z: 4 } }).point;
}

/** Logs whether each CHECKS spot can be walked to; returns the misses. */
export function checkReach(query, log) {
  const plaza = plazaOf(query);
  const misses = [];
  for (const [name, [x, y, z]] of Object.entries(CHECKS)) {
    const goal = query.findClosestPoint({ x, y, z }, { halfExtents: { x: 2, y: 1.5, z: 2 } }).point;
    const path = query.computePath(plaza, goal, { halfExtents: { x: 4, y: 4, z: 4 } });
    const end = path.path?.[path.path.length - 1];
    const short = end ? Math.hypot(end.x - goal.x, end.y - goal.y, end.z - goal.z) : Infinity;
    if (!(short < 0.5)) misses.push(name);
    log(`  plaza → ${name}: ${short < 0.5 ? `reached (y ${goal.y.toFixed(1)})` : `not reached (${short.toFixed(1)} m short)`}`);
  }
  return misses;
}

const BUILDINGS = {
  main: { name: "Main Building", box: [104, 126, -23, 23] },
  tlh: { name: "Teaching and Learning Hub", box: [116, 148, 44, 82] },
  ccdl: { name: "CCDL", box: [263, 291, -113, -79] },
  ar: { name: "Academic Residences", box: [308, 364, -125, -71] },
  wcmpb: { name: "World-Class Multimedia Production Building", box: [192, 258, 120, 184] },
};

/**
 * Each building's floors, for the lifts (client/Lifts.tsx) and the
 * guides: the levels the navmesh has under the building's roof, where to
 * stand on each, and whether you can walk there from the plaza. `above`
 * is from overhead().
 */
export function findFloors(query, above, log) {
  const plaza = plazaOf(query);
  const floors = {};
  for (const [id, { name, box: [x0, x1, z0, z1] }] of Object.entries(BUILDINGS)) {
    const points = [];
    for (let x = x0 + 1; x < x1; x += 1.5)
      for (let z = z0 + 1; z < z1; z += 1.5)
        for (let y = -0.5; y < 25; y += 0.5) {
          const r = query.findClosestPoint({ x, y, z }, { halfExtents: { x: 0.3, y: 0.25, z: 0.3 } });
          if (!r.success || !r.polyRef || Math.abs(r.point.x - x) > 0.05 || Math.abs(r.point.z - z) > 0.05) continue;
          // Indoors, or up on the building (a roof): the ground around the
          // building isn't a floor of it.
          if (r.point.y > 2.5 || above(r.point.x, r.point.y + 0.3, r.point.z) < 30) points.push(r.point);
        }
    // Levels: the heights with the most floor, at least a storey (2.4 m)
    // apart, so a stair landing or a step counts as part of its floor
    // rather than a floor of its own.
    const bins = new Map();
    for (const p of points) {
      const k = Math.round(p.y * 2) / 2;
      bins.set(k, [...(bins.get(k) ?? []), p]);
    }
    const levels = [];
    for (const [y, pts] of [...bins.entries()].sort((a, b) => b[1].length - a[1].length)) {
      // A floor, not a landing or a ledge: at least about 110 m².
      if (pts.length < 50) break;
      if (levels.some((l) => Math.abs(l.y - y) < 2.4)) continue;
      // The level's floor: this height, and the half-metre either side.
      levels.push({ y, points: [...(bins.get(y - 0.5) ?? []), ...pts, ...(bins.get(y + 0.5) ?? [])] });
    }
    levels.sort((a, b) => a.y - b.y);
    floors[id] = {
      name,
      floors: levels.map((l) => {
        // Where to stand: near the middle of the level, and somewhere you
        // can walk to from the plaza if anywhere on this level is.
        const cx = l.points.reduce((a, p) => a + p.x, 0) / l.points.length;
        const cz = l.points.reduce((a, p) => a + p.z, 0) / l.points.length;
        const byMiddle = [...l.points].sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
        const reaches = (p) => {
          const path = query.computePath(plaza, p, { halfExtents: { x: 1, y: 1, z: 1 } });
          const end = path.path?.[path.path.length - 1];
          return !!end && Math.hypot(end.x - p.x, end.y - p.y, end.z - p.z) < 0.6;
        };
        const step = Math.max(1, Math.floor(byMiddle.length / 24));
        let at = byMiddle[0];
        let walk = false;
        for (let i = 0; i < byMiddle.length; i += step) {
          if (reaches(byMiddle[i])) {
            at = byMiddle[i];
            walk = true;
            break;
          }
        }
        return { at: [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)], walk };
      }),
    };
    log(`  ${name}: ${floors[id].floors.map((f, i) => `${i === 0 ? "G" : i + 1} y${f.at[1].toFixed(1)}${f.walk ? "" : " (lift)"}`).join(", ")}`);
  }
  return floors;
}

