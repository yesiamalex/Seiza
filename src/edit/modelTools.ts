// What a placed model costs to draw, and making it cost less without
// changing how it looks.
//
// A model's frame cost is mostly its triangles and its draw calls (one per
// mesh, per material). The triangles are the model's own: there's no
// lossless way to have fewer, so the editor says how many there are and
// warns past a budget. The draw calls can come down losslessly: a static
// model's meshes that share a material are merged into one mesh, with
// each part's position baked in, so it looks exactly the same and draws in
// a fraction of the calls. Models that move (skinned, morphing, animated)
// are left alone, as are meshes with more than one material.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/** Past this many triangles a placed model is heavy: a whole room of avatars is about this. */
export const MODEL_TRIANGLE_BUDGET = 150_000;

export interface ModelStats {
  triangles: number;
  meshes: number;
  materials: number;
}

export function statsOf(root: THREE.Object3D): ModelStats {
  let triangles = 0;
  let meshes = 0;
  const materials = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    const g = mesh.geometry;
    const count = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
    triangles += (count / 3) * ((mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1);
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m);
  });
  return { triangles: Math.round(triangles), meshes, materials: materials.size };
}

/** A model file's cost, read in the browser (null if it can't be read here). */
export async function modelStats(data: ArrayBuffer): Promise<ModelStats | null> {
  try {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(data, "");
    const stats = statsOf(gltf.scene);
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
        m.dispose();
      }
    });
    return stats;
  } catch {
    return null;
  }
}

const merged = new WeakSet<THREE.Object3D>();

/** Every setting of a material that changes how it looks, as text: two with the
 *  same are drawn identically (exporters often give each part its own copy). */
export function lookOf(m: THREE.Material): string | null {
  // Custom shader code can't be compared: such a material stays its own.
  if (m.onBeforeCompile.toString() !== THREE.Material.prototype.onBeforeCompile.toString()) return null;
  const skip = new Set(["uuid", "name", "id", "userData", "version", "uniformsNeedUpdate", "needsUpdate"]);
  const parts: string[] = [m.type];
  for (const key of Object.keys(m).sort()) {
    if (skip.has(key) || key.startsWith("_")) continue;
    const v = (m as unknown as Record<string, unknown>)[key];
    if (v === null || v === undefined || typeof v === "function") parts.push(`${key}=-`);
    else if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") parts.push(`${key}=${v}`);
    else if (v instanceof THREE.Color) parts.push(`${key}=${v.getHexString()}`);
    else if (v instanceof THREE.Vector2) parts.push(`${key}=${v.x},${v.y}`);
    else if (v instanceof THREE.Texture)
      parts.push(`${key}=${v.source.uuid}|${v.offset.toArray()}|${v.repeat.toArray()}|${v.rotation}|${v.center.toArray()}|${v.wrapS},${v.wrapT}|${v.flipY}|${v.channel}|${v.colorSpace}`);
    else if (v instanceof THREE.Euler) parts.push(`${key}=${v.toArray()}`);
    else if (Array.isArray(v) && v.length === 0) parts.push(`${key}=[]`);
    // An empty defines is nothing; anything else (clipping planes, real
    // defines) we can't be sure of, so that material isn't shared.
    else if (key === "defines" && typeof v === "object") {
      const entries = Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
      if (entries.some(([, d]) => typeof d === "object" && d !== null)) return null;
      parts.push(`${key}=${JSON.stringify(entries)}`);
    } else return null;
  }
  return parts.join(";");
}

/**
 * Merges a static model's meshes that share a material into one each, in
 * place, once per model. Returns how many meshes it took away (0 when it
 * left the model alone).
 */
export function mergeStaticMeshes(root: THREE.Object3D, animations: readonly THREE.AnimationClip[] = []): number {
  if (merged.has(root)) return 0;
  merged.add(root);
  if (animations.length) return 0;
  let moves = false;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if ((o as THREE.SkinnedMesh).isSkinnedMesh || (mesh.isMesh && mesh.geometry.morphAttributes && Object.keys(mesh.geometry.morphAttributes).length)) moves = true;
  });
  if (moves) return 0;

  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  // Meshes by what they'd merge as: the same material, the same attributes.
  const groups = new Map<string, THREE.Mesh[]>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material) || !mesh.visible) return;
    const attrs = Object.entries(mesh.geometry.attributes)
      .map(([name, a]) => `${name}:${a.itemSize}:${(a as THREE.BufferAttribute).normalized ? 1 : 0}:${(a as THREE.BufferAttribute).array?.constructor.name}`)
      .sort()
      .join(",");
    const look = lookOf(mesh.material) ?? mesh.material.uuid;
    const key = `${look}|${attrs}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}|${mesh.renderOrder}`;
    const list = groups.get(key) ?? [];
    list.push(mesh);
    groups.set(key, list);
  });

  let removed = 0;
  const dropped = new Set<THREE.BufferGeometry>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const parts: THREE.BufferGeometry[] = [];
    for (const mesh of list) {
      const g = mesh.geometry.clone();
      // Its place in the model, baked in (a mirrored part's faces flip back the right way round).
      const m = new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld);
      g.applyMatrix4(m);
      if (m.determinant() < 0) flipWinding(g);
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      parts.push(g);
    }
    const geometry = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!geometry) continue;
    const first = list[0];
    const one = new THREE.Mesh(geometry, first.material);
    one.name = `${first.name || "merged"}+${list.length - 1}`;
    one.castShadow = first.castShadow;
    one.receiveShadow = first.receiveShadow;
    one.renderOrder = first.renderOrder;
    one.userData = { ...first.userData };
    for (const mesh of list) {
      mesh.removeFromParent();
      dropped.add(mesh.geometry);
    }
    root.add(one);
    removed += list.length - 1;
  }
  // Free what nothing in it draws any more (glTF can share one geometry between meshes).
  root.traverse((o) => dropped.delete((o as THREE.Mesh).geometry));
  for (const g of dropped) g.dispose();
  return removed;
}

function flipWinding(g: THREE.BufferGeometry) {
  if (g.index) {
    const index = g.index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    g.index.needsUpdate = true;
    return;
  }
  for (const attribute of Object.values(g.attributes)) {
    const a = attribute as THREE.BufferAttribute;
    const size = a.itemSize;
    const arr = a.array as Float32Array;
    for (let v = 0; v + 2 < a.count; v += 3)
      for (let k = 0; k < size; k++) [arr[(v + 1) * size + k], arr[(v + 2) * size + k]] = [arr[(v + 2) * size + k], arr[(v + 1) * size + k]];
    a.needsUpdate = true;
  }
}
