// The hypothetical rooftop arrays: every module in world/solar.json, as
// real modules (module.ts): cells under glass, an aluminium frame, and
// rear legs holding each at 15° to the south.
import { useEffect, useMemo } from "react";
import solar from "../world/solar.json";
import { moduleMeshes } from "./module";

export function Panels() {
  const meshes = useMemo(() => moduleMeshes(Object.values(solar.arrays).flatMap((a) => a.modules as [number, number, number][])), []);
  useEffect(() => () => meshes.dispose(), [meshes]);
  return (
    <>
      <primitive object={meshes.face} />
      <primitive object={meshes.frame} />
      <primitive object={meshes.legs} />
    </>
  );
}
