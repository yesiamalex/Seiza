import * as THREE from "three";
import { FIELD, meadowHeight } from "./layout";

/** Grid spacing of the meadow's ground: fine enough that its banks roll
 *  rather than facet, and that a vertex falls under each end wall. */
const SPACING = 0.5;

/**
 * The sunken meadow's ground, in world coordinates: its floor and the grass
 * banks round it, shaped by meadowHeight (the same function you walk on).
 * Outdoors.tsx draws it as the lawn; BaseEnvironment keeps an invisible
 * copy for click-to-walk and the navigation mesh. `uv` maps a world point
 * to texture coordinates, so the lawn's texture runs on from the ground
 * round it without a seam.
 */
export function buildMeadowGeometry(uv?: (x: number, z: number) => [number, number]): THREE.BufferGeometry {
  const w = FIELD.maxX - FIELD.minX;
  const d = FIELD.maxZ - FIELD.minZ;
  const geometry = new THREE.PlaneGeometry(w, d, Math.round(w / SPACING), Math.round(d / SPACING));
  // Lay it flat: plane (x, y) becomes world (x, -z), facing up.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((FIELD.minX + FIELD.maxX) / 2, 0, (FIELD.minZ + FIELD.maxZ) / 2);
  const position = geometry.attributes.position;
  const uvs = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, meadowHeight(x, z));
    if (uv) uvs.setXY(i, ...uv(x, z));
  }
  position.needsUpdate = true;
  uvs.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
