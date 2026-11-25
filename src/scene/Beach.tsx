/**
 * A beach and the sea, past the meadow's east side, where the treeline
 * would be, in every world on Seiza's grounds: what you see across the meadow from where
 * you arrive. You can walk out of the meadow, down the sand, and into
 * the shallows (layout.ts's shore, opened while this is mounted).
 *
 * Cheap, and following the weather:
 * - **The sand** is one lit mesh, dry above the waterline and darker where
 *   the waves wet it.
 * - **The sea** is one plane and a small shader. Waves are a few sines,
 *   higher in a strong wind; near the shore the water rises and falls, so
 *   the waterline runs up the sand and back, with foam where it's shallow.
 *   It reflects the sky's colour at a glancing angle, glints toward the sun
 *   (or the moon), sparkles where the glint is, greys and roughens under
 *   cloud, darkens at night, and lights up with lightning.
 * - **The sound** of the surf, louder the nearer you are and the windier it
 *   is (audio/sfx.ts).
 *
 * The grass ends at the sand (Outdoors.tsx clips its ground to coastX), and
 * no trees or hills stand in the way of the sea.
 */
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { skyState } from "../sky/skyState";
import { setSeaAmbience } from "../audio/sfx";
import { coastX, setShore, sheltered, SHORE, shoreY } from "./layout";
import { viewerPosition } from "../xr/viewer";

/** The sea's level, and how far down the sand it meets it (layout.ts). */
const SEA_Y = SHORE.seaY;
const BEACH_TO_WATER = SHORE.toWater;
const Z_FROM = -220;
const Z_TO = 280;

const scratchEye = new THREE.Vector3();

function buildSand(): THREE.BufferGeometry {
  const ACROSS = 16;
  // Down to the swimmers' depth and past it, so legs never show through.
  const DEPTH = 45;
  const rows = Math.ceil((Z_TO - Z_FROM) / 4);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const dry = new THREE.Color("#cdb582");
  const wet = new THREE.Color("#8f784f");
  const c = new THREE.Color();
  for (let r = 0; r <= rows; r++) {
    const z = Z_FROM + (r / rows) * (Z_TO - Z_FROM);
    for (let i = 0; i <= ACROSS; i++) {
      const d = (i / ACROSS) * DEPTH;
      const y = shoreY(d) + (i > 0 && i < 6 ? 0.025 * Math.sin(z * 0.31 + i) : 0);
      positions.push(coastX(z) + d, y, z);
      c.copy(dry).lerp(wet, THREE.MathUtils.smoothstep(d, BEACH_TO_WATER - 3, BEACH_TO_WATER));
      colors.push(c.r, c.g, c.b);
    }
  }
  const w = ACROSS + 1;
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < ACROSS; i++) {
      const a = r * w + i;
      // Wound to face up (x runs across, z along).
      indices.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function buildSea(): THREE.BufferGeometry {
  // Finer near the shore, where the waves and the waterline are seen; the
  // far sea is flat under the fog anyway.
  const xs: number[] = [];
  for (let x = 30; x < 70; x += 1.5) xs.push(x);
  for (let x = 70; x <= 380; x += 10) xs.push(x);
  const rows = Math.ceil((Z_TO - Z_FROM) / 3);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const z = Z_FROM + (r / rows) * (Z_TO - Z_FROM);
    for (const x of xs) positions.push(x, SEA_Y, z);
  }
  const w = xs.length;
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < w - 1; i++) {
      const a = r * w + i;
      indices.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  return g;
}

// coastX and shoreY again, for the shader: keep them in step with layout.ts.
const COAST_GLSL = /* glsl */ `
  float coastX(float z) { return 34.0 + 4.0 * sin(z * 0.021) + 2.0 * sin(z * 0.057 + 1.3); }
  float sandY(float d) {
    if (d <= ${BEACH_TO_WATER.toFixed(1)}) return ${shoreY(0).toFixed(3)} - ${(shoreY(0) - SEA_Y).toFixed(3)} * d / ${BEACH_TO_WATER.toFixed(1)};
    float o = d - ${BEACH_TO_WATER.toFixed(1)};
    return o <= ${SHORE.shelf.toFixed(1)} ? ${SEA_Y.toFixed(3)} - 0.025 * o : ${(SEA_Y - 0.025 * SHORE.shelf).toFixed(3)} - 0.1 * (o - ${SHORE.shelf.toFixed(1)});
  }
`;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWave;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vDepth;
  ${COAST_GLSL}
  #include <fog_pars_vertex>

  void main() {
    vec3 p = position;
    float d = p.x - coastX(p.z);
    // Waves rolling in toward the shore (-x), smaller in the shallows.
    float amp = uWave * smoothstep(${BEACH_TO_WATER.toFixed(1)}, ${(BEACH_TO_WATER + 14).toFixed(1)}, d);
    vec2 g = vec2(0.0);
    float h = 0.0;
    vec3 k = vec3(0.23, 0.11, 0.57);
    vec3 w = vec3(1.2, 0.8, 2.1);
    vec3 a = vec3(0.55, 0.3, 0.15) * amp;
    vec2 d1 = normalize(vec2(1.0, 0.18)), d2 = normalize(vec2(1.0, -0.4)), d3 = normalize(vec2(0.6, 1.0));
    float s1 = dot(d1, p.xz) * k.x + uTime * w.x;
    float s2 = dot(d2, p.xz) * k.y + uTime * w.y;
    float s3 = dot(d3, p.xz) * k.z + uTime * w.z;
    h = a.x * sin(s1) + a.y * sin(s2) + a.z * sin(s3);
    g = a.x * k.x * cos(s1) * d1 + a.y * k.y * cos(s2) * d2 + a.z * k.z * cos(s3) * d3;
    // The swash: the water by the shore rising and falling, so the
    // waterline runs up the sand and back.
    h += 0.055 * sin(uTime * 0.55 + p.z * 0.03) * (1.0 - smoothstep(${BEACH_TO_WATER.toFixed(1)}, ${(BEACH_TO_WATER + 8).toFixed(1)}, d));
    p.y += h;
    vWorld = p;
    vNormal = normalize(vec3(-g.x, 1.0, -g.y));
    vDepth = p.y - sandY(d);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uCloud;
  uniform float uNight;
  uniform float uRain;
  uniform float uFlash;
  uniform float uSunVisible;
  uniform float uMoonVisible;
  uniform vec3 uSunDirection;
  uniform vec3 uMoonDirection;
  uniform vec3 uSky;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vDepth;
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(cameraPosition - vWorld);
    // Shallow by the shore, deep further out; greyer under cloud.
    vec3 deep = mix(vec3(0.012, 0.09, 0.16), vec3(0.06, 0.08, 0.09), uCloud * 0.7);
    vec3 shallow = mix(vec3(0.05, 0.32, 0.30), vec3(0.12, 0.16, 0.15), uCloud * 0.6);
    vec3 color = mix(shallow, deep, smoothstep(0.02, 0.45, vDepth));
    // The sky in it, at a glancing angle.
    float fresnel = pow(1.0 - max(dot(n, v), 0.0), 4.0);
    // Not too much: from the meadow you see the sea at a glancing angle,
    // where water that's all sky reads as more sky.
    color = mix(color, uSky, fresnel * 0.4);
    // Night: dark water, a little of the sky's blue left.
    color *= mix(1.0, 0.18, uNight);
    // Glints: the sun's, or by night the moon's, with sparkles in it.
    vec3 r = reflect(-v, n);
    float calm = 1.0 - 0.7 * uRain;
    float sun = max(dot(r, uSunDirection), 0.0);
    float moon = max(dot(r, uMoonDirection), 0.0);
    float sparkleCell = hash(floor(vWorld.xz * 2.5) + floor(uTime * 7.0));
    float sparkle = step(0.93, sparkleCell);
    float glint = (pow(sun, 260.0) * 2.5 + pow(sun, 30.0) * sparkle * 1.6) * uSunVisible * calm;
    glint += (pow(moon, 300.0) * 1.2 + pow(moon, 40.0) * sparkle * 0.6) * uMoonVisible * uNight * calm;
    color += vec3(1.0, 0.95, 0.85) * glint;
    // Foam where the water runs thin over the sand, and on high crests.
    float foam = 1.0 - smoothstep(0.0, 0.025, vDepth);
    foam *= 0.55 + 0.45 * sin(vWorld.z * 1.7 + uTime * 0.8) * sin(vWorld.x * 2.3 - uTime * 0.5);
    color = mix(color, vec3(0.85, 0.88, 0.9) * mix(1.0, 0.12, uNight), clamp(foam, 0.0, 1.0) * 0.6);
    color += vec3(0.75, 0.8, 1.0) * uFlash * 0.35;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function Beach() {
  const sand = useMemo(buildSand, []);
  const sea = useMemo(buildSea, []);
  const sandMaterial = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), []);
  const seaMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        fog: true,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uTime: { value: 0 },
            uWave: { value: 0.12 },
            uCloud: { value: 0 },
            uNight: { value: 0 },
            uRain: { value: 0 },
            uFlash: { value: 0 },
            uSunVisible: { value: 1 },
            uMoonVisible: { value: 0 },
            uSunDirection: { value: new THREE.Vector3(-0.92, 0.12, 0.38) },
            uMoonDirection: { value: new THREE.Vector3(0, 1, 0) },
            uSky: { value: new THREE.Color("#c99a8a") },
          },
        ]),
      }),
    []
  );
  // Open the beach to walking while it's here.
  useEffect(() => {
    setShore(true);
    return () => setShore(false);
  }, []);
  useEffect(
    () => () => {
      sand.dispose();
      sea.dispose();
      sandMaterial.dispose();
      seaMaterial.dispose();
      setSeaAmbience(0, 0);
    },
    [sand, sea, sandMaterial, seaMaterial]
  );

  useFrame(({ camera }, delta) => {
    const u = seaMaterial.uniforms;
    u.uTime.value = (u.uTime.value + Math.min(delta, 0.1)) % 3600;
    const wind = skyState.weatherState?.windSpeed() ?? 5;
    // Gentle on a calm day, rough in a typhoon.
    u.uWave.value = THREE.MathUtils.clamp(0.06 + wind * 0.012, 0.06, 0.45);
    if (skyState.active) {
      u.uCloud.value = skyState.cloud;
      u.uNight.value = skyState.night;
      u.uRain.value = skyState.rain;
      u.uFlash.value = skyState.flash;
      u.uSunVisible.value = skyState.sunVisible;
      u.uMoonVisible.value = skyState.moonVisible;
      u.uSunDirection.value.copy(skyState.sunDirection);
      u.uMoonDirection.value.copy(skyState.moonDirection);
      u.uSky.value.copy(skyState.dayHorizon).lerp(new THREE.Color(0.02, 0.025, 0.06), skyState.night);
    }
    // The surf, from where you stand: distance to the waterline.
    const eye = viewerPosition(camera, scratchEye);
    const toWater = Math.max(0, coastX(eye.z) + BEACH_TO_WATER - eye.x);
    const near = Math.max(0, 1 - toWater / 85);
    setSeaAmbience(near * near * (sheltered(eye.x, eye.y, eye.z) ? 0.35 : 1), wind);
  });

  return (
    <group userData={{ navIgnore: true }}>
      <mesh geometry={sand} material={sandMaterial} receiveShadow userData={{ navIgnore: true }} />
      <mesh geometry={sea} material={seaMaterial} frustumCulled={false} userData={{ navIgnore: true }} />
    </group>
  );
}
