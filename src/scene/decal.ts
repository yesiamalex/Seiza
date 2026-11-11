import type * as THREE from "three";

/**
 * Material settings for something laid flat on a surface: a pool of light
 * on the floor, a wash on a wall, the scorched ground round the campfire.
 *
 * A few millimetres of real gap isn't enough to keep such a layer in front.
 * The depth buffer's precision falls off with distance, and falls off
 * faster with the 4 cm near plane first person uses (SelfView.tsx). Many
 * Android phones and standalone headsets also have a coarser depth buffer
 * than a desktop, so the floor and the layer on it took turns being in
 * front, pixel by pixel, frame by frame: the glow under the benches and
 * desks flickered as you moved. A polygon offset pulls the layer forward in
 * depth by an amount that scales with that precision, so it always wins
 * against the surface it lies on, and still hides behind anything really in
 * front of it.
 */
export const DECAL: Pick<THREE.MaterialParameters, "polygonOffset" | "polygonOffsetFactor" | "polygonOffsetUnits"> = {
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -4,
};
