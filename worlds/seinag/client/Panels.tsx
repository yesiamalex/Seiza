// The hypothetical rooftop arrays: one instanced mesh for every module in
// world/solar.json, so hundreds of panels cost one draw call. Each sits on
// a low frame, tilted 15° to the south (+Z).
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import solar from "../world/solar.json";

const TILT = (15 * Math.PI) / 180;
/** The frame lifts a module's low edge this far off the roof. */
const LIFT = 0.25;

export function Panels() {
  const all = useMemo(() => Object.values(solar.arrays).flatMap((a) => a.modules as [number, number, number][]), []);
  const geometry = useMemo(() => new THREE.BoxGeometry(solar.module.width, 0.04, solar.module.depth), []);
  // Dark blue cells under glass: a little gloss, so they catch the sky.
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2f4f8a", roughness: 0.32, metalness: 0.08, emissive: "#0b1426" }), []);
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geometry, material, all.length);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(TILT, 0, 0));
    const scale = new THREE.Vector3(1, 1, 1);
    const position = new THREE.Vector3();
    all.forEach(([x, y, z], i) => {
      position.set(x, y + LIFT + Math.sin(TILT) * (solar.module.depth / 2), z);
      m.setMatrixAt(i, matrix.compose(position, rotation, scale));
    });
    m.castShadow = true;
    m.receiveShadow = true;
    // Not something to walk on or click: leave it out of navigation.
    m.userData.navIgnore = true;
    return m;
  }, [all, geometry, material]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
    [geometry, material, mesh]
  );
  return <primitive object={mesh} />;
}
