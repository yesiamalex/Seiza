import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { lookOf, mergeStaticMeshes, statsOf } from "./modelTools";

const model = (materials: THREE.Material[]) => {
  const root = new THREE.Group();
  materials.forEach((m, i) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m);
    mesh.position.x = i * 2;
    root.add(mesh);
  });
  return root;
};

describe("merging a placed model's meshes", () => {
  it("merges meshes that look the same into one, keeping every triangle", () => {
    const red = new THREE.MeshStandardMaterial({ color: "#c8402f" });
    const copy = new THREE.MeshStandardMaterial({ color: "#c8402f" });
    const blue = new THREE.MeshStandardMaterial({ color: "#2f6fd0" });
    const root = model([red, copy, red, blue]);
    const before = statsOf(root);
    expect(mergeStaticMeshes(root)).toBe(2);
    const after = statsOf(root);
    expect(after.meshes).toBe(2);
    expect(after.triangles).toBe(before.triangles);
  });
  it("tells materials apart by any setting, not just their colour", () => {
    expect(lookOf(new THREE.MeshStandardMaterial({ color: "#fff", roughness: 0.2 }))).not.toBe(lookOf(new THREE.MeshStandardMaterial({ color: "#fff", roughness: 0.8 })));
    expect(lookOf(new THREE.MeshStandardMaterial({ color: "#fff" }))).toBe(lookOf(new THREE.MeshStandardMaterial({ color: "#fff" })));
  });
  it("leaves animated and skinned models, and does each model once", () => {
    const m = new THREE.MeshStandardMaterial();
    expect(mergeStaticMeshes(model([m, m]), [new THREE.AnimationClip("wave", 1, [])])).toBe(0);
    const skinned = model([m, m]);
    const bone = new THREE.Bone();
    const skin = new THREE.SkinnedMesh(new THREE.BoxGeometry(), m);
    skin.add(bone);
    skin.bind(new THREE.Skeleton([bone]));
    skinned.add(skin);
    expect(mergeStaticMeshes(skinned)).toBe(0);
    const once = model([m, m]);
    expect(mergeStaticMeshes(once)).toBe(1);
    expect(mergeStaticMeshes(once)).toBe(0);
  });
});
