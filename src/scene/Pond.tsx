import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { POND_CENTER, POND_RADIUS } from "./layout";

/**
 * The garden pond: rocks round the rim, a dark bed, koi, lily pads, and a
 * water surface that moves.
 *
 * Everything that makes the water look like water is in one small
 * fragment shader on one flat disc: a few travelling sine waves perturb
 * the surface normal, which drives a Fresnel blend between the pond's own
 * colour (looking down) and the evening sky (at a glancing angle) plus a
 * sun glint. No render targets, no reflection pass, no extra geometry, so
 * it costs about what a textured floor does.
 *
 * Interaction is the same trick: clicking the water starts a ripple ring
 * at that point (up to four at once, as shader uniforms), and the koi
 * occasionally nose the surface and leave one of their own.
 */

const WATER_RADIUS = POND_RADIUS - 0.32;
const WATER_Y = 0.1;
const MAX_RIPPLES = 4;
/** Same direction as the scene's sun (Scene.tsx), so glints line up with it. */
const SUN_DIRECTION = new THREE.Vector3(-34, 4.6, 14).normalize();

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vLocal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vLocal = position.xy;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uRadius;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  uniform vec4 uRipples[${MAX_RIPPLES}];
  varying vec3 vWorld;
  varying vec2 vLocal;

  // Gradient of one travelling wave, A * sin(dot(k, p) - w t).
  vec2 wave(vec2 p, vec2 k, float a, float w) {
    return a * k * cos(dot(k, p) - w * uTime);
  }

  void main() {
    vec2 p = vWorld.xz;
    vec2 grad = wave(p, vec2(1.7, 0.6), 0.018, 1.3)
              + wave(p, vec2(-0.9, 2.3), 0.012, 1.7)
              + wave(p, vec2(3.1, -2.2), 0.006, 2.6);

    // Click and koi ripples: an expanding ring that fades as it spreads.
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 r = uRipples[i];
      float age = uTime - r.z;
      if (r.w <= 0.0 || age < 0.0 || age > 3.0) continue;
      vec2 d = p - r.xy;
      float dist = length(d) + 1e-4;
      float front = age * 0.85;
      float envelope = exp(-abs(dist - front) * 7.0) * (1.0 - age / 3.0) * r.w;
      grad += (d / dist) * cos(dist * 22.0 - age * 11.0) * 0.09 * envelope;
    }

    vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
    vec3 v = normalize(cameraPosition - vWorld);
    float facing = max(dot(n, v), 0.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 4.0);

    // Shallower (lighter, greener) toward the rim, deep in the middle.
    float edge = smoothstep(0.35, 1.0, length(vLocal) / uRadius);
    vec3 body = mix(uDeep, uShallow, edge);

    // What the water reflects: the sky, warmer the lower the angle.
    vec3 r = reflect(-v, n);
    vec3 sky = mix(uSkyHorizon, uSky, smoothstep(0.0, 0.6, r.y));
    vec3 color = mix(body, sky, fresnel * 0.85);

    // Sun glint, broken up by the waves.
    float glint = pow(max(dot(r, uSunDir), 0.0), 120.0);
    color += uSun * glint * 1.6;

    // Soft edge where the water meets the bank.
    float alpha = mix(0.86, 0.96, fresnel) * (1.0 - smoothstep(0.96, 1.0, length(vLocal) / uRadius));
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const KOI = [
  { color: "#f2762e", accent: "#f7f1e6", radius: 1.35, speed: 0.32, phase: 0, wobble: 0.35 },
  { color: "#f7f1e6", accent: "#e0452b", radius: 0.9, speed: -0.42, phase: 2.1, wobble: 0.25 },
  { color: "#e8a23a", accent: "#2a2420", radius: 1.7, speed: 0.24, phase: 4.2, wobble: 0.4 },
];

const LILY_PADS: Array<[number, number, number, number]> = [
  // x, z (relative to centre), radius, rotation
  [-0.95, -0.55, 0.34, 0.4],
  [1.1, 0.6, 0.3, 2.2],
  [0.35, -1.35, 0.26, 4.1],
  [-1.5, 0.9, 0.24, 5.3],
];

export function Pond() {
  const rippleIndex = useRef(0);
  const nextKoiRipple = useRef(4);
  const koiRefs = useRef<Array<THREE.Group | null>>([]);
  const padRefs = useRef<Array<THREE.Mesh | null>>([]);

  const water = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uRadius: { value: WATER_RADIUS },
          uDeep: { value: new THREE.Color("#0f2a33") },
          uShallow: { value: new THREE.Color("#2f5a4a") },
          uSky: { value: new THREE.Color("#2a2456") },
          uSkyHorizon: { value: new THREE.Color("#e39a72") },
          uSun: { value: new THREE.Color("#ffd9a8") },
          uSunDir: { value: SUN_DIRECTION.clone() },
          uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)) },
        },
      }),
    []
  );

  const materials = useMemo(
    () => ({
      bed: new THREE.MeshStandardMaterial({ color: "#1b2622", roughness: 1 }),
      bank: new THREE.MeshStandardMaterial({ color: "#3f4a2c", roughness: 1 }),
      rocks: ["#6f6a63", "#837d73", "#5c5852"].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true })),
      pad: new THREE.MeshStandardMaterial({ color: "#3f7a3a", roughness: 0.7, side: THREE.DoubleSide }),
      lotus: new THREE.MeshStandardMaterial({ color: "#f3a6c0", roughness: 0.6 }),
      koi: KOI.map((k) => new THREE.MeshStandardMaterial({ color: k.color, roughness: 0.5 })),
      koiAccent: KOI.map((k) => new THREE.MeshStandardMaterial({ color: k.accent, roughness: 0.5 })),
      // Invisible, but solid to the navmesh bake, so tap-to-walk routes
      // round the pond instead of across it.
      navBlocker: new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    }),
    []
  );

  const rocks = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2 + Math.sin(i * 7.3) * 0.08;
        const size = 0.3 + ((i * 37) % 10) / 70;
        return { angle, size, squash: 0.5 + ((i * 13) % 5) / 25, turn: i * 1.7, material: i % 3 };
      }),
    []
  );

  const addRipple = (x: number, z: number, strength = 1) => {
    const slot = water.uniforms.uRipples.value[rippleIndex.current % MAX_RIPPLES] as THREE.Vector4;
    slot.set(x, z, water.uniforms.uTime.value, strength);
    rippleIndex.current += 1;
  };

  useFrame((_, delta) => {
    const time = (water.uniforms.uTime.value += Math.min(delta, 0.1));
    KOI.forEach((k, i) => {
      const fish = koiRefs.current[i];
      if (!fish) return;
      const a = k.phase + time * k.speed;
      const r = k.radius + Math.sin(time * 0.5 + k.phase) * k.wobble;
      fish.position.set(Math.cos(a) * r, 0.055, Math.sin(a) * r);
      // Face along the direction of travel, with a lazy tail sway.
      fish.rotation.y = -a + (k.speed > 0 ? Math.PI : 0) + Math.sin(time * 6 + i) * 0.12;
    });
    padRefs.current.forEach((pad, i) => {
      if (pad) pad.position.y = WATER_Y + 0.006 + Math.sin(time * 0.9 + i * 1.7) * 0.004;
    });
    // Now and then a koi comes up under the surface.
    if (time > nextKoiRipple.current) {
      const fish = koiRefs.current[Math.floor(time) % KOI.length];
      if (fish) addRipple(POND_CENTER[0] + fish.position.x, POND_CENTER[1] + fish.position.z, 0.45);
      nextKoiRipple.current = time + 5 + (Math.sin(time * 3.1) + 1) * 3;
    }
  });

  const onWaterClick = (event: ThreeEvent<MouseEvent>) => {
    // A tap on the water ripples it; it isn't a walk-to target.
    event.stopPropagation();
    addRipple(event.point.x, event.point.z);
  };

  return (
    <group position={[POND_CENTER[0], 0, POND_CENTER[1]]}>
      {/* Mossy bank and the dark pond bed beneath the water. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} material={materials.bank} receiveShadow userData={{ navIgnore: true }}>
        <ringGeometry args={[WATER_RADIUS - 0.05, POND_RADIUS + 0.12, 48]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} material={materials.bed} userData={{ navIgnore: true }}>
        <circleGeometry args={[WATER_RADIUS, 48]} />
      </mesh>

      {rocks.map((rock, i) => (
        <mesh
          key={i}
          position={[Math.cos(rock.angle) * (POND_RADIUS - 0.12), rock.size * rock.squash * 0.55, Math.sin(rock.angle) * (POND_RADIUS - 0.12)]}
          rotation={[0, rock.turn, 0]}
          scale={[1, rock.squash, 0.85]}
          material={materials.rocks[rock.material]}
          castShadow
          receiveShadow
          userData={{ navIgnore: true }}
        >
          <dodecahedronGeometry args={[rock.size, 0]} />
        </mesh>
      ))}

      {KOI.map((k, i) => (
        <group key={i} ref={(node) => (koiRefs.current[i] = node)} userData={{ navIgnore: true }}>
          <mesh scale={[0.07, 0.035, 0.2]} material={materials.koi[i]}>
            <sphereGeometry args={[1, 12, 8]} />
          </mesh>
          <mesh position={[0, 0.012, -0.03]} scale={[0.045, 0.02, 0.09]} material={materials.koiAccent[i]}>
            <sphereGeometry args={[1, 10, 6]} />
          </mesh>
          <mesh position={[0, 0, 0.21]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.3]} material={materials.koi[i]}>
            <coneGeometry args={[0.06, 0.1, 8]} />
          </mesh>
        </group>
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y, 0]} material={water} onClick={onWaterClick} userData={{ navIgnore: true }}>
        <circleGeometry args={[WATER_RADIUS, 64]} />
      </mesh>

      {LILY_PADS.map(([x, z, radius, turn], i) => (
        <mesh
          key={i}
          ref={(node) => (padRefs.current[i] = node)}
          rotation={[-Math.PI / 2, 0, turn]}
          position={[x, WATER_Y + 0.006, z]}
          material={materials.pad}
          userData={{ navIgnore: true }}
        >
          {/* The notch cut out of each pad is what makes it read as a lily pad. */}
          <circleGeometry args={[radius, 20, 0.35, Math.PI * 2 - 0.35]} />
        </mesh>
      ))}
      <mesh position={[-0.95, WATER_Y + 0.06, -0.55]} material={materials.lotus} userData={{ navIgnore: true }}>
        <coneGeometry args={[0.08, 0.12, 6]} />
      </mesh>

      {/* Navmesh blocker: tall enough that recast treats it as a wall. */}
      <mesh position={[0, 0.5, 0]} material={materials.navBlocker} raycast={() => {}}>
        <cylinderGeometry args={[POND_RADIUS, POND_RADIUS, 1, 16]} />
      </mesh>
    </group>
  );
}
