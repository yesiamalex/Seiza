import { useMemo } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { TextureLoader } from "three";
import * as THREE from "three";
import { skyState } from "../sky/skyState";

/**
 * The built-in sky: a single moment of twilight, held still.
 *
 * This replaced drei's `<Sky>`, a physically based scattering model. It's
 * a good model, which was the problem: it only turns orange when the sun is
 * right at the horizon, and anywhere short of that it produces a perfectly
 * correct pale blue afternoon — which is what the room actually showed,
 * with a warm light coming from a sky that wasn't warm. Rather than tune a
 * simulation into a mood, this paints the mood directly.
 *
 * It is one sphere and one fragment shader. Turn toward the sun and it is
 * a sunset: orange at the horizon, a rose band above it, the sun's own
 * disc and glow. Turn away and the same sky becomes night — violet, then
 * indigo, with stars. The two are blended by how far the view direction is
 * from the sun, so there is no seam anywhere, just a magenta band where
 * one becomes the other.
 *
 * That band is the whole point. The app is called Seiza (星座,
 * "constellation"), so the sky has to actually have stars in it, and a sky
 * that is only ever a sunset never earns the name. Doing it in one shader
 * rather than layering a separate star mesh over a sunset dome is what
 * keeps the transition continuous — a star field drawn as its own object
 * would pop against this gradient and ignore the fog.
 *
 * The sun disc sits in the same direction as the directional light in
 * Scene.tsx, so the shadows fall away from the thing that's casting them.
 * Tone mapping is applied like any other material, so the horizon matches
 * the fog on the treeline instead of glowing a shade brighter than it.
 *
 * Still costs no download: it's a shader, not a cubemap.
 */

// Authored as sRGB hex and converted to linear by THREE.Color, like every
// other colour in the scene.
const ZENITH = "#3b3a6e";
const MID = "#b86a7a";
const HORIZON = "#ff9448";
const BELOW = "#6a4238";
const GLOW = "#ffb25e";
const SUN = "#fff1d0";
// The night half. NIGHT_HORIZON is deliberately violet rather than blue:
// it is what the orange horizon is blended *through*, and a violet
// meeting an orange is what produces the magenta twilight band. A blue
// there would turn muddy on the way across.
const NIGHT_ZENITH = "#080d2a";
const NIGHT_HORIZON = "#4b2a66";
const STAR_WARM = "#fff3dd";
const STAR_COOL = "#bcd2ff";

const vertexShader = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    // Direction from the sphere's centre, so the sky looks the same from
    // anywhere in the (small) world rather than depending on where you stand.
    vDirection = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uBelow;
  uniform vec3 uGlow;
  uniform vec3 uSun;
  uniform vec3 uNightZenith;
  uniform vec3 uNightHorizon;
  uniform vec3 uStarWarm;
  uniform vec3 uStarCool;
  uniform vec3 uSunDirection;
  uniform float uTime;
  // The moving sky (src/sky/skyState.ts). All four at their defaults
  // (0, 0, 1, 0) leave the shader exactly the original still sunset.
  uniform vec3 uDayZenith;
  uniform vec3 uDayHorizon;
  uniform float uDayness;
  uniform float uNight;
  uniform float uSunVisible;
  uniform float uCloud;
  varying vec3 vDirection;

  // Cheap deterministic hash. No texture: the same star is in the same
  // place on every client and on every frame, which is what a shared world
  // needs — people point at constellations. Time only modulates brightness.
  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  /**
   * One layer of stars.
   *
   * The direction vector is chopped into a grid of cells; each cell either
   * holds one star or doesn't. Only the star in the fragment's own cell is
   * tested — not the 26 neighbours a full Worley pass would visit — which
   * costs a 27th of the work and is invisible at this star radius, since a
   * star close enough to a cell wall to be clipped is already fainter than
   * the dither in the gradient behind it. This runs on a phone GPU behind
   * every other pixel in the scene, so that trade is the right way round.
   *
   * Pixel-aware size: at these scales a star is only a fraction of a
   * pixel across, so whether a pixel's single sample happened to land on
   * it flipped with the smallest camera movement, which made the whole
   * field sparkle on every step. Each star is now drawn at least about a
   * pixel wide (fwidth gives the pixel's size in cell units). Dimming it
   * by the full area it grew by is physically right but made the field
   * all but vanish, so it gives back only part of that: steady, and still
   * clearly visible.
   */
  float starLayer(vec3 d, float scale, float density, float radius) {
    vec3 p = d * scale;
    vec3 cell = floor(p);
    vec3 f = p - cell;

    if (hash31(cell) > density) return 0.0;

    vec3 offset = vec3(hash31(cell + 11.3), hash31(cell + 23.7), hash31(cell + 41.1));
    float dist = length(f - offset);

    float pixel = length(fwidth(p)) * 0.6;
    float r = max(radius, pixel);
    float energy = pow(radius / r, 0.45);

    // A soft point, then a magnitude: most stars are faint and a few are
    // bright, which is what stops a uniform grid reading as noise.
    float point = smoothstep(r, 0.0, dist) * energy;
    float magnitude = hash31(cell + 67.9);

    // A gentle, slow twinkle: each star on its own phase and rate. Two
    // sines at unrelated rates so it never looks like a metronome; it
    // dips to about half brightness at most, so it shimmers, not blinks.
    float phase = hash31(cell + 91.7) * 6.2831;
    float rate = 0.7 + hash31(cell + 13.9) * 1.6;
    float wave = sin(uTime * rate + phase) * 0.6 + sin(uTime * rate * 2.37 + phase * 1.7) * 0.4;
    float twinkle = 0.75 + 0.25 * wave;

    // Steep magnitude curve: most stars faint, a handful clearly bright.
    // A flat one gave every cell the same middling dot, which read as sand.
    return point * (0.12 + magnitude * magnitude * magnitude * 2.2) * twinkle;
  }

  void main() {
    vec3 d = normalize(vDirection);
    float h = d.y;
    float toward = max(dot(d, uSunDirection), 0.0);

    // --- the sunset half -------------------------------------------------
    // Horizon to zenith, through a rose band — the part that makes it read
    // as evening rather than as a blue sky with an orange stripe.
    vec3 day = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
    day = mix(day, uZenith, smoothstep(0.18, 0.75, h));
    // Daytime: as the sun climbs past the original sunset, the painted
    // sunset hands over to the weather engine's sky gradient.
    vec3 daylit = mix(uDayHorizon, uDayZenith, smoothstep(0.0, 0.7, h));
    day = mix(day, daylit, uDayness);

    // --- the night half --------------------------------------------------
    vec3 night = mix(uNightHorizon, uNightZenith, smoothstep(-0.05, 0.55, h));

    // How much of this direction is night. Signed alignment, not the
    // clamped "toward" above: the whole point is to keep resolving past
    // the terminator, out to the anti-sun point at -1.
    // Wide on purpose: a narrow range put a visible vertical seam in the
    // sky where the two halves met. Spread across most of the hemisphere
    // it becomes the gradual sweep it should be.
    float nightAmount = smoothstep(0.72, -0.62, dot(d, uSunDirection));
    // Overhead goes to night sooner than the horizon does — the warm band
    // hugs the skyline, exactly as it does at real dusk, instead of
    // climbing the dome with the sun's azimuth.
    nightAmount = max(nightAmount, smoothstep(0.25, 0.85, h) * 0.85);
    // In full day there is no night side; after dusk the whole dome turns
    // to the night half, stars and all.
    nightAmount = max(nightAmount * (1.0 - uDayness), uNight);

    vec3 sky = mix(day, night, nightAmount);

    // --- stars -----------------------------------------------------------
    // Two scales so the field has depth instead of one uniform sprinkle.
    // Gated on nightAmount (none in the bright part) and on height (none
    // below the skyline, where the ground will cover them anyway).
    float starVisibility = nightAmount * nightAmount * smoothstep(-0.01, 0.22, h) * (1.0 - 0.9 * uCloud);
    if (starVisibility > 0.001) {
      // Sparse on purpose: a sky with fewer stars, some of them bright,
      // reads as a night sky; a dense even field reads as noise.
      float far = starLayer(d, 240.0, 0.08, 0.055);
      float near = starLayer(d, 110.0, 0.12, 0.055);
      float bright = starLayer(d, 42.0, 0.2, 0.04);
      float star = far * 0.55 + near + bright * 1.6;
      // Cool and warm stars in roughly the proportion the eye expects.
      vec3 tint = mix(uStarCool, uStarWarm, hash31(floor(d * 120.0) + 3.1));
      sky += tint * star * starVisibility;
    }

    // --- the sun ---------------------------------------------------------
    // Brighter and warmer on the sun's side of the sky, fading round the
    // back. Added after the night blend so the glow still burns through
    // the near edge of the twilight band rather than being tinted by it.
    // By day the glow whitens and narrows: a high sun has no orange halo.
    vec3 glow = mix(uGlow, vec3(1.0, 0.97, 0.9), uDayness);
    sky += glow * (pow(toward, 6.0) * 0.55 * (1.0 - 0.6 * uDayness) + pow(toward, 48.0) * 0.6) * uSunVisible;

    // The sun itself: a hard-ish disc with a thin soft edge.
    float disc = smoothstep(0.9985, 0.9993, toward);
    sky = mix(sky, uSun * 1.6, disc * uSunVisible);

    // Cloud over the painted sunset and the night: greyer and dimmer. By
    // day the engine's colours are already greyed for cloud.
    float lum = dot(sky, vec3(0.299, 0.587, 0.114));
    sky = mix(sky, vec3(lum) * 0.85, uCloud * 0.5 * (1.0 - uDayness));

    // Below the horizon only shows past the edge of the outdoor ground;
    // keep it dark and warm so it reads as land in shadow, not as sky.
    sky = mix(uBelow, sky, smoothstep(-0.04, 0.02, h));

    gl_FragColor = vec4(sky, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface SunsetSkyProps {
  /** Where the sun is, as a position; only its direction matters. */
  sunPosition: [number, number, number];
  /** Follow the moving sky (skyState) instead of holding still. */
  dynamic?: boolean;
  /** Must stay inside the camera's far plane (App.tsx sets it to 260). */
  radius?: number;
}

export function SunsetSky({ sunPosition, dynamic = false, radius = 200 }: SunsetSkyProps) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uZenith: { value: new THREE.Color(ZENITH) },
          uMid: { value: new THREE.Color(MID) },
          uHorizon: { value: new THREE.Color(HORIZON) },
          uBelow: { value: new THREE.Color(BELOW) },
          uGlow: { value: new THREE.Color(GLOW) },
          uSun: { value: new THREE.Color(SUN) },
          uNightZenith: { value: new THREE.Color(NIGHT_ZENITH) },
          uNightHorizon: { value: new THREE.Color(NIGHT_HORIZON) },
          uStarWarm: { value: new THREE.Color(STAR_WARM) },
          uStarCool: { value: new THREE.Color(STAR_COOL) },
          uSunDirection: { value: new THREE.Vector3(...sunPosition).normalize() },
          uTime: { value: 0 },
          uDayZenith: { value: new THREE.Color() },
          uDayHorizon: { value: new THREE.Color() },
          uDayness: { value: 0 },
          uNight: { value: 0 },
          uSunVisible: { value: 1 },
          uCloud: { value: 0 },
        },
        side: THREE.BackSide,
        // Drawn first and never occludes anything: it's the backdrop.
        depthWrite: false,
      }),
    // The sun doesn't move; rebuilding on a new array identity would only
    // recompile the shader for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sunPosition[0], sunPosition[1], sunPosition[2]]
  );

  // Drives the twinkle. One uniform write per frame; wrapped so float
  // precision on mobile GPUs never degrades over a long session.
  useFrame((_, delta) => {
    const u = material.uniforms;
    u.uTime.value = (u.uTime.value + delta) % 3600;
    if (dynamic && skyState.active) {
      u.uSunDirection.value.copy(skyState.sunDirection);
      u.uDayZenith.value.copy(skyState.dayZenith);
      u.uDayHorizon.value.copy(skyState.dayHorizon);
      u.uDayness.value = skyState.dayness;
      u.uNight.value = skyState.night;
      u.uSunVisible.value = skyState.sunVisible;
      u.uCloud.value = skyState.cloud;
    }
  });

  return (
    <mesh material={material} renderOrder={-1000} frustumCulled={false} userData={{ navIgnore: true }}>
      {/* Low tessellation is plenty: the gradient is per-pixel. */}
      <sphereGeometry args={[radius, 32, 16]} />
    </mesh>
  );
}

/** The sunset's horizon colour, for fog that fades the treeline into it. */
export const SUNSET_HORIZON_COLOR = HORIZON;
/** The night sky's horizon colour, for fog after dusk. */
export const NIGHT_HORIZON_COLOR = NIGHT_HORIZON;

/** Displays an uploaded equirectangular panorama as the room's sky. */
export function ImageSkybox({ url, radius = 200 }: { url: string; radius?: number }) {
  const texture = useLoader(TextureLoader, url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return (
    <mesh scale={[-1, 1, 1]} renderOrder={-1000} frustumCulled={false} userData={{ navIgnore: true }}>
      <sphereGeometry args={[radius, 48, 32]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}
