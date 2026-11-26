// Seishore's surfaces with something to them: the konbini's floor tiles,
// the café's and the restaurant's floorboards, plaster on the walls, the
// restaurant's vinyl booths with their stitched channels, and the grain of
// wood on benches, chairs, tables and counters. Drawn in the shader from
// where each point is in the world (no images: no texture memory, nothing
// to load), over the colour each part already has, so a pattern lines up
// across neighbouring parts and never stretches on a long one.
import * as THREE from "three";
import { Builder } from "../../seisugbo/client/kit";

export type Surface = "tile" | "plank" | "plaster" | "vinyl" | "grain";
const KIND: Record<Surface, number> = { tile: 0, plank: 1, plaster: 2, vinyl: 3, grain: 4 };

const PATTERN = /* glsl */ `
varying vec3 vSurfWorld;
varying vec3 vSurfNormal;
float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// The face's own plane: a floor's x and z, a wall's along and up.
vec2 sPlane(vec3 p, vec3 n) {
  vec3 a = abs(n);
  if (a.y > a.x && a.y > a.z) return p.xz;
  return a.x > a.z ? vec2(p.z, p.y) : vec2(p.x, p.y);
}
float sEdge(vec2 uv, float width) {
  vec2 f = fract(uv);
  float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  return smoothstep(0.0, width, e);
}
float surfPattern(vec3 p, vec3 n) {
  bool up = abs(n.y) > 0.7;
  vec2 uv = sPlane(p, n);
#if SURFACE_KIND == 0
  // Floor tiles, 30 cm, a grey grout line, each tile a shade of its own.
  if (!up) return 1.0;
  vec2 t = p.xz / 0.3;
  return mix(0.78, 1.0, sEdge(t, 0.035)) * (0.96 + 0.06 * sHash(floor(t)));
#elif SURFACE_KIND == 1
  // Floorboards 14 cm wide, their ends staggered, the grain along them.
  if (!up) return 1.0;
  float row = floor(p.z / 0.14);
  float along = (p.x + sHash(vec2(row, 1.0)) * 1.3) / 1.2;
  float seam = sEdge(vec2(along, p.z / 0.14), 0.02);
  float grain = 0.92 + 0.08 * sNoise(vec2(p.x * 3.0, p.z * 45.0));
  return mix(0.7, 1.0, seam) * grain * (0.9 + 0.14 * sHash(vec2(row, floor(along))));
#elif SURFACE_KIND == 2
  // Plaster: a soft unevenness, nothing more.
  return 0.95 + 0.04 * sNoise(uv * 5.0) + 0.02 * sNoise(uv * 23.0);
#elif SURFACE_KIND == 3
  // Vinyl, in rounded channels 18 cm apart, a stitch between each.
  float c = abs(sin(uv.x * 3.14159 / 0.18));
  float stitch = smoothstep(0.0, 0.08, c);
  return (0.84 + 0.16 * sqrt(c)) * mix(0.8, 1.0, stitch) * (0.97 + 0.03 * sNoise(uv * 30.0));
#else
  // Wood: its grain, long along the piece, with a ring or two.
  float g = sNoise(vec2(uv.x * 2.0, uv.y * 38.0));
  return 0.86 + 0.14 * g + 0.04 * sin(uv.y * 90.0 + g * 6.0);
#endif
}
`;

/** A vertex-coloured material, lit or not, with one of the surfaces over its colours. */
export function surfaceMaterial(kind: Surface, lit: boolean): THREE.Material {
  const material = lit ? new THREE.MeshLambertMaterial({ vertexColors: true }) : new THREE.MeshBasicMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.defines = { ...(shader.defines ?? {}), SURFACE_KIND: KIND[kind] };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSurfWorld;\nvarying vec3 vSurfNormal;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvSurfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSurfNormal = normalize(mat3(modelMatrix) * normal);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${PATTERN}`)
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= surfPattern(vSurfWorld, normalize(vSurfNormal));");
  };
  material.customProgramCacheKey = () => `seishore-surface-${kind}-${lit ? 1 : 0}`;
  return material;
}

/**
 * A Builder that hands some of what it's given to others by colour: a box
 * or a plane painted a wood colour goes to the wood-grain builder, a wall
 * colour to plaster. So the town's code paints as it always did, and the
 * right parts come out with their surface.
 */
export class RoutedBuilder extends Builder {
  constructor(private readonly routes: Map<string, Builder>) {
    super();
  }
  private route(color: string | THREE.Color) {
    return typeof color === "string" ? this.routes.get(color.toLowerCase()) : undefined;
  }
  box(size: [number, number, number], at: [number, number, number], color: string | THREE.Color, rotation?: [number, number, number]) {
    const to = this.route(color);
    if (to) {
      to.box(size, at, color, rotation);
      return this;
    }
    return super.box(size, at, color, rotation);
  }
  plane(w: number, h: number, at: [number, number, number], color: string | THREE.Color, rotation?: [number, number, number]) {
    const to = this.route(color);
    if (to) {
      to.plane(w, h, at, color, rotation);
      return this;
    }
    return super.plane(w, h, at, color, rotation);
  }
}
