import { useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { TextureLoader } from "three";
import * as THREE from "three";

/**
 * The built-in sky: a sunset that is always a sunset.
 *
 * This replaced drei's `<Sky>`, a physically based scattering model. It's
 * a good model, which was the problem: it only turns orange when the sun is
 * right at the horizon, and anywhere short of that it produces a perfectly
 * correct pale blue afternoon — which is what the room actually showed,
 * with a warm light coming from a sky that wasn't warm. Rather than tune a
 * simulation into a mood, this paints the mood directly.
 *
 * It's one sphere and a fragment shader of a few lines: a vertical gradient
 * from a dusky violet zenith down to a bright orange horizon, a soft glow
 * that spreads around the sun, and the sun's own disc. The disc sits in the
 * same direction as the directional light in Scene.tsx, so the shadows fall
 * away from the thing in the sky that's casting them.
 *
 * Tone mapping is applied like any other material, so the horizon matches
 * the fog on the treeline instead of glowing a shade brighter than it.
 */

// Authored as sRGB hex and converted to linear by THREE.Color, like every
// other colour in the scene.
const ZENITH = "#3b3a6e";
const MID = "#b86a7a";
const HORIZON = "#ff9448";
const BELOW = "#6a4238";
const GLOW = "#ffb25e";
const SUN = "#fff1d0";

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
  uniform vec3 uSunDirection;
  varying vec3 vDirection;

  void main() {
    vec3 d = normalize(vDirection);
    float h = d.y;

    // Horizon to zenith, through a rose band — the part that makes it read
    // as evening rather than as a blue sky with an orange stripe.
    vec3 sky = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
    sky = mix(sky, uZenith, smoothstep(0.18, 0.75, h));

    // Brighter and warmer on the sun's side of the sky, fading round the back.
    float toward = max(dot(d, uSunDirection), 0.0);
    sky += uGlow * (pow(toward, 6.0) * 0.55 + pow(toward, 48.0) * 0.6);

    // The sun itself: a hard-ish disc with a thin soft edge.
    float disc = smoothstep(0.9985, 0.9993, toward);
    sky = mix(sky, uSun * 1.6, disc);

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
  /** Must stay inside the camera's far plane (App.tsx sets it to 260). */
  radius?: number;
}

export function SunsetSky({ sunPosition, radius = 200 }: SunsetSkyProps) {
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
          uSunDirection: { value: new THREE.Vector3(...sunPosition).normalize() },
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

  return (
    <mesh material={material} renderOrder={-1000} frustumCulled={false} userData={{ navIgnore: true }}>
      {/* Low tessellation is plenty: the gradient is per-pixel. */}
      <sphereGeometry args={[radius, 32, 16]} />
    </mesh>
  );
}

/** The sunset's horizon colour, for fog that fades the treeline into it. */
export const SUNSET_HORIZON_COLOR = HORIZON;

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
