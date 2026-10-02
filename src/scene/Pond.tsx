import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { POND_CENTER, POND_RADIUS, POND_ROCKS, POND_WATER_RADIUS, POND_WATER_Y, pondDepthAtRadius } from "./layout";
import { pondWaders, takePondRipples } from "./pondActivity";
import { setPondAmbience } from "../audio/sfx";

/**
 * The garden pond: a sunken basin you can wade into, rocks round the rim,
 * koi, lily pads, and a water surface that moves.
 *
 * Everything that makes the water look like water is in one small
 * fragment shader on one flat disc: a few travelling sine waves perturb
 * the surface normal, which drives a Fresnel blend between the pond's own
 * colour (looking down) and the evening sky (at a glancing angle) plus a
 * sun glint. No render targets, no reflection pass, no extra geometry, so
 * it costs about what a textured floor does.
 *
 * Interaction is the same trick. Ripple rings are shader uniforms (up to
 * eight at once), started by clicking the water, by anyone wading through
 * it (pondActivity.ts, fed by every avatar, remote ones included), and now
 * and then by a koi nosing the surface. The koi also drift away from
 * whoever is standing near them.
 *
 * The basin's depth follows pondDepthAtRadius (layout.ts), the same
 * profile floorHeightAt uses, so feet land on the bed you see and the
 * water comes up to about the calf. The garden floor has a matching hole
 * cut in it (OutdoorFloor in BaseEnvironment.tsx).
 */

const WATER_RADIUS = POND_WATER_RADIUS;
const WATER_Y = POND_WATER_Y;
const BASIN_RADIUS = POND_WATER_RADIUS + 0.04;
const MAX_RIPPLES = 8;
/** Same direction as the scene's sun (Scene.tsx), so glints line up with it. */
const SUN_DIRECTION = new THREE.Vector3(-34, 4.6, 14).normalize();
/** How close a wader has to be before the koi move away. */
const KOI_SHY_DISTANCE = 1.1;

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

    // Ripples: an expanding ring that fades as it spreads.
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

    // A little more see-through looking straight down, so legs and koi
    // under the surface read as underwater rather than hidden.
    // Transparent looking down, near-opaque at a glancing angle. That is
    // how water actually behaves — straight down you see the bottom, along
    // the surface you see sky — and it is also the only way the koi are
    // visible at all. A flat 0.74 made the pond a coloured disc with fish
    // hidden somewhere underneath it.
    float alpha = mix(0.16, 0.92, fresnel) * (1.0 - smoothstep(0.96, 1.0, length(vLocal) / uRadius));
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

const BANK_OUTER_RADIUS = POND_RADIUS + 0.04;
const BANK_INNER_RADIUS = BASIN_RADIUS - 0.02;

/** Small seeded RNG, so the painted stone and pebbles are the same for
 *  everyone and every visit. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(size: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paint(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The pond's edge: a band of pale cut-stone coping, the same family of
 * greys as the rocks on it. It started as a dark-moss ring (a black circle
 * on the pale decking) and then a feathered earth fade (mud); a crisp,
 * light stone curb is what a garden pond set into a deck actually has.
 * Its inner edge still covers the cut in the floor.
 *
 * RingGeometry's UVs are planar over the outer radius (centre 0.5, edge at
 * 0/1), so the joints are painted as radial lines from the canvas centre.
 */
function makeCopingTexture(): THREE.Texture | null {
  return canvasTexture(512, (ctx) => {
    const size = 512;
    const random = seeded(2707);
    ctx.fillStyle = "#b5ad9e";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = random() > 0.5 ? "rgba(255,250,240,0.10)" : "rgba(70,64,56,0.10)";
      ctx.fillRect(random() * size, random() * size, 1 + random() * 2.5, 1 + random() * 2.5);
    }
    // Joints between the coping stones.
    const c = size / 2;
    const inner = (BANK_INNER_RADIUS / BANK_OUTER_RADIUS) * c;
    ctx.strokeStyle = "rgba(88,82,74,0.55)";
    ctx.lineWidth = 1.5;
    const stones = 28;
    for (let i = 0; i < stones; i++) {
      const a = (i / stones) * Math.PI * 2 + (random() - 0.5) * 0.04;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
      ctx.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c);
      ctx.stroke();
    }
  });
}

/**
 * The pond bed: river pebbles on pale sand, rather than one flat brown that
 * read as mud through the water. Tiled along the basin lathe (u runs round
 * the pond, v from rim to centre).
 */
function makePebbleTexture(): THREE.Texture | null {
  const texture = canvasTexture(256, (ctx) => {
    const size = 256;
    const random = seeded(4411);
    ctx.fillStyle = "#a89f8a";
    ctx.fillRect(0, 0, size, size);
    const tones = ["#8f8a80", "#b8b0a0", "#7a756c", "#c4b9a2", "#9a8f7c", "#6d6a64"];
    for (let i = 0; i < 260; i++) {
      const x = random() * size;
      const y = random() * size;
      const rx = 3 + random() * 7;
      const ry = rx * (0.6 + random() * 0.35);
      const rotation = random() * Math.PI;
      ctx.fillStyle = tones[Math.floor(random() * tones.length)];
      // Drawn at each wrapped position too, so the tile has no seams.
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          ctx.beginPath();
          ctx.ellipse(x + dx, y + dy, rx, ry, rotation, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  });
  if (texture) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 3);
  }
  return texture;
}

/** The basin: a lathe following the depth profile, from the rim to the middle. */
function basinGeometry() {
  const points: THREE.Vector2[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const r = (BASIN_RADIUS * (steps - i)) / steps;
    points.push(new THREE.Vector2(r, pondDepthAtRadius(r)));
  }
  // Drawn double-sided (see the bed material), so which way the lathe
  // winds its faces doesn't matter.
  return new THREE.LatheGeometry(points.reverse(), 48);
}

export function Pond() {
  const rippleIndex = useRef(0);
  const nextKoiRipple = useRef(4);
  const koiRefs = useRef<Array<THREE.Group | null>>([]);
  const padRefs = useRef<Array<THREE.Mesh | null>>([]);
  /** Each koi's current sideways dodge, eased so they glide aside. */
  const koiDodge = useRef(KOI.map(() => new THREE.Vector2()));

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
          uDeep: { value: new THREE.Color("#1b3d47") },
          uShallow: { value: new THREE.Color("#4a7d68") },
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
      bed: new THREE.MeshStandardMaterial({ map: makePebbleTexture(), roughness: 0.9, side: THREE.DoubleSide }),
      bank: new THREE.MeshStandardMaterial({ map: makeCopingTexture(), roughness: 0.85 }),
      rocks: ["#6f6a63", "#837d73", "#5c5852"].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true })),
      pad: new THREE.MeshStandardMaterial({ color: "#3f7a3a", roughness: 0.7, side: THREE.DoubleSide }),
      lotus: new THREE.MeshStandardMaterial({ color: "#f3a6c0", roughness: 0.6 }),
      koi: KOI.map((k) => new THREE.MeshStandardMaterial({ color: k.color, roughness: 0.5 })),
      koiAccent: KOI.map((k) => new THREE.MeshStandardMaterial({ color: k.accent, roughness: 0.5 })),
    }),
    []
  );
  const basin = useMemo(basinGeometry, []);
  useEffect(
    () => () => {
      water.dispose();
      basin.dispose();
      materials.bank.map?.dispose();
      materials.bed.map?.dispose();
      for (const value of Object.values(materials)) {
        for (const material of Array.isArray(value) ? value : [value]) material.dispose();
      }
    },
    [water, basin, materials]
  );

  const addRipple = (x: number, z: number, strength = 1) => {
    const slot = water.uniforms.uRipples.value[rippleIndex.current % MAX_RIPPLES] as THREE.Vector4;
    slot.set(x, z, water.uniforms.uTime.value, strength);
    rippleIndex.current += 1;
  };

  useFrame((frameState, delta) => {
    const step = Math.min(delta, 0.1);
    const time = (water.uniforms.uTime.value += step);

    // Continuous trickle, loudest at the water's edge. Driven every
    // frame because it is a gain on a running loop, not a new sound.
    setPondAmbience(
      Math.hypot(frameState.camera.position.x - POND_CENTER[0], frameState.camera.position.z - POND_CENTER[1])
    );

    for (const [x, z, strength] of takePondRipples()) addRipple(x, z, strength);
    const waders = pondWaders();

    KOI.forEach((k, i) => {
      const fish = koiRefs.current[i];
      if (!fish) return;
      const a = k.phase + time * k.speed;
      const r = k.radius + Math.sin(time * 0.5 + k.phase) * k.wobble;
      let x = Math.cos(a) * r;
      let z = Math.sin(a) * r;

      // Shy of people: steer away from the nearest wader within reach.
      const dodge = koiDodge.current[i];
      let targetX = 0;
      let targetZ = 0;
      for (const wader of waders) {
        const dx = x - (wader.x - POND_CENTER[0]);
        const dz = z - (wader.z - POND_CENTER[1]);
        const distance = Math.hypot(dx, dz);
        if (distance < KOI_SHY_DISTANCE && distance > 1e-3) {
          const push = (1 - distance / KOI_SHY_DISTANCE) * 0.9;
          targetX += (dx / distance) * push;
          targetZ += (dz / distance) * push;
        }
      }
      const ease = 1 - Math.exp(-3 * step);
      dodge.x += (targetX - dodge.x) * ease;
      dodge.y += (targetZ - dodge.y) * ease;
      x += dodge.x;
      z += dodge.y;
      // Never out through the bank.
      const fromCentre = Math.hypot(x, z);
      if (fromCentre > WATER_RADIUS - 0.35) {
        x *= (WATER_RADIUS - 0.35) / fromCentre;
        z *= (WATER_RADIUS - 0.35) / fromCentre;
      }
      // Halfway between the bed and the surface wherever they are.
      const bed = pondDepthAtRadius(Math.hypot(x, z));
      fish.position.set(x, Math.min(WATER_Y - 0.05, (bed + WATER_Y) / 2), z);
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
    // A tap on the water ripples it; it isn't a walk-to target. Walk in
    // with the movement controls instead.
    event.stopPropagation();
    addRipple(event.point.x, event.point.z);
  };

  return (
    <group position={[POND_CENTER[0], 0, POND_CENTER[1]]}>
      {/* Stone coping, covering the edge of the hole cut in the floor. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} material={materials.bank} receiveShadow userData={{ navIgnore: true }}>
        <ringGeometry args={[BANK_INNER_RADIUS, BANK_OUTER_RADIUS, 64]} />
      </mesh>
      {/* The basin. Left in the navmesh bake, so tap-to-walk can wade. */}
      <mesh geometry={basin} material={materials.bed} receiveShadow />

      {POND_ROCKS.map((rock) => (
        <mesh
          key={rock.i}
          position={[rock.x, rock.size * rock.squash * 0.55, rock.z]}
          rotation={[0, rock.turn, 0]}
          scale={[1, rock.squash, 0.85]}
          material={materials.rocks[rock.material]}
          castShadow
          receiveShadow
        >
          {/* Baked into the navmesh (unlike the bank), now that the rocks
              collide: tap-to-walk routes through the gaps rather than
              into a rock it can't pass. */}
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
    </group>
  );
}
