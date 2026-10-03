import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

/**
 * Every lamp in the world is a real light, but only a few are lit at once.
 *
 * three.js shades every point light on every pixel of every lit material,
 * wherever the light is: a lamp in the classroom costs as much while you
 * stand in the garden as when you stand under it. So the world's fixtures
 * (PooledLight) don't own lights. They share a fixed pool of POOL_SIZE
 * point lights, handed each frame to the fixtures that matter most to what
 * the camera can see.
 *
 * "Can see" means the light's reach, not the lamp itself. A lantern behind
 * you still lights the floor in front of you, so a fixture counts when the
 * sphere it meaningfully lights touches the view (with a margin), and the
 * nearest, brightest of those win.
 *
 * Three things keep this from being noticed:
 * - The pool never grows or shrinks. A light that isn't needed sits at
 *   intensity 0; adding or removing one would recompile every material's
 *   shader, which is a visible hitch.
 * - Handing a light from one fixture to another fades it out and the next
 *   one in, over a few frames, instead of jumping.
 * - A fixture stays lit for LINGER_SECONDS after it leaves the view, and
 *   the margin brings one in before it enters, so glancing away and back
 *   shows no fade at all.
 */

/** How many fixtures can be lit at once: the per-pixel cost of the whole
 *  world's lamps, whatever the number of lamps. */
const POOL_SIZE = 4;
/** Added to a light's reach for the view test, so a fixture is lit just
 *  before its light comes into view rather than as it does. */
const VIEW_MARGIN = 2.5;
/** How long a fixture keeps its light after its reach leaves the view. */
const LINGER_SECONDS = 2;
/** Light level (intensity over distance squared) taken as the edge of a
 *  light's reach: dimmer than this reads as nothing against the sky light. */
const REACH_THRESHOLD = 0.15;
/** Fade rates, per second, for a fixture gaining and losing its light. */
const FADE_IN = 10;
const FADE_OUT = 12;
/** A fixture already holding a light keeps it against a rival unless the
 *  rival matters this much more, so two near-equal lamps don't trade a
 *  light back and forth every frame. */
const HOLD_BONUS = 1.5;

interface Fixture {
  anchor: THREE.Object3D | null;
  color: THREE.Color;
  intensity: number;
  intensityRef?: MutableRefObject<number>;
  distance: number;
  decay: number;
  /** How lit this fixture currently is, 0..1, eased. */
  weight: number;
  slot: number;
  lastSeen: number;
  position: THREE.Vector3;
}

const fixtures = new Set<Fixture>();

interface PooledLightProps {
  position: [number, number, number];
  color: THREE.ColorRepresentation;
  /** 0 is off: a switched-off fixture never takes a light from the pool. */
  intensity?: number;
  /** For a fixture whose brightness changes every frame (a fade): read
   *  each frame instead of `intensity`. */
  intensityRef?: MutableRefObject<number>;
  distance: number;
  decay?: number;
}

/** Marks where a point light belongs. LightPool decides whether it is lit. */
export function PooledLight({ position, color, intensity = 0, intensityRef, distance, decay = 2 }: PooledLightProps) {
  const anchor = useRef<THREE.Object3D>(null);
  const fixture = useMemo<Fixture>(
    () => ({
      anchor: null,
      color: new THREE.Color(),
      intensity: 0,
      distance,
      decay,
      weight: 0,
      slot: -1,
      lastSeen: -Infinity,
      position: new THREE.Vector3(),
    }),
    // One fixture for the component's life; its fields update below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  fixture.color.set(color);
  fixture.intensity = intensity;
  fixture.intensityRef = intensityRef;
  fixture.distance = distance;
  fixture.decay = decay;

  useEffect(() => {
    fixture.anchor = anchor.current;
    fixtures.add(fixture);
    return () => {
      fixtures.delete(fixture);
      fixture.anchor = null;
    };
  }, [fixture]);

  return <object3D ref={anchor} position={position} />;
}

const frustum = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();
const sphere = new THREE.Sphere();
const cameraPosition = new THREE.Vector3();

/** The pool itself. Mount once, inside the Canvas. */
export function LightPool() {
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const owners = useRef<(Fixture | null)[]>(Array(POOL_SIZE).fill(null));
  const { camera, gl } = useThree();

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime;
    const step = Math.min(delta, 0.1);
    // In a headset, the XR camera's projection covers both eyes.
    const view = gl.xr.isPresenting ? gl.xr.getCamera() : camera;
    viewProjection.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection);
    view.getWorldPosition(cameraPosition);

    // Score every fixture by what its light does for the current view.
    const ranked: { fixture: Fixture; score: number }[] = [];
    for (const fixture of fixtures) {
      if (!fixture.anchor) continue;
      fixture.anchor.getWorldPosition(fixture.position);
      const intensity = fixture.intensityRef ? fixture.intensityRef.current : fixture.intensity;
      if (intensity <= 0) {
        fixture.lastSeen = -Infinity;
        continue;
      }
      const reach = Math.min(fixture.distance, Math.sqrt(intensity / REACH_THRESHOLD));
      sphere.set(fixture.position, reach + VIEW_MARGIN);
      if (frustum.intersectsSphere(sphere)) fixture.lastSeen = now;
      if (now - fixture.lastSeen > LINGER_SECONDS) continue;
      const distanceSq = Math.max(1, fixture.position.distanceToSquared(cameraPosition));
      ranked.push({ fixture, score: (intensity / distanceSq) * (fixture.slot >= 0 ? HOLD_BONUS : 1) });
    }
    ranked.sort((a, b) => b.score - a.score);
    const chosen = new Set(ranked.slice(0, POOL_SIZE).map((r) => r.fixture));

    // Fade every lit fixture toward chosen or not, and free the lights of
    // those that have faded out.
    for (let slot = 0; slot < POOL_SIZE; slot++) {
      const owner = owners.current[slot];
      if (!owner) continue;
      if (!fixtures.has(owner)) {
        owner.slot = -1;
        owners.current[slot] = null;
        continue;
      }
      const target = chosen.has(owner) ? 1 : 0;
      owner.weight += (target - owner.weight) * (1 - Math.exp(-(target ? FADE_IN : FADE_OUT) * step));
      if (target === 0 && owner.weight < 0.01) {
        owner.weight = 0;
        owner.slot = -1;
        owners.current[slot] = null;
      }
    }

    // Give each chosen fixture without a light a free one, if any.
    for (const { fixture } of ranked) {
      if (!chosen.has(fixture) || fixture.slot >= 0) continue;
      const free = owners.current.indexOf(null);
      if (free < 0) break;
      owners.current[free] = fixture;
      fixture.slot = free;
      fixture.weight = 0;
    }

    for (let slot = 0; slot < POOL_SIZE; slot++) {
      const light = lights.current[slot];
      if (!light) continue;
      const owner = owners.current[slot];
      if (!owner) {
        light.intensity = 0;
        continue;
      }
      light.position.copy(owner.position);
      light.color.copy(owner.color);
      light.distance = owner.distance;
      light.decay = owner.decay;
      light.intensity = (owner.intensityRef ? owner.intensityRef.current : owner.intensity) * owner.weight;
    }
  });

  return (
    <>
      {Array.from({ length: POOL_SIZE }, (_, i) => (
        <pointLight
          key={i}
          ref={(light) => {
            lights.current[i] = light;
          }}
          intensity={0}
        />
      ))}
    </>
  );
}
