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
 * Five things keep this from being noticed:
 * - The pool never grows or shrinks. A light that isn't needed sits at
 *   intensity 0; adding or removing one would recompile every material's
 *   shader, which is a visible hitch.
 * - Handing a light from one fixture to another fades it out and the next
 *   one in, over about a third of a second, instead of jumping.
 * - Fixtures are ranked on their brightness smoothed over a second or so,
 *   not this frame's: a campfire's flicker would otherwise reshuffle the
 *   ranking every frame against the lamps round it, and the lights would
 *   trade back and forth, which reads as the whole place flickering.
 * - A fixture keeps its light for at least MIN_HOLD_SECONDS once it has
 *   it, and against a rival unless the rival matters HOLD_BONUS times
 *   more, so walking or turning past two lamps of similar weight doesn't
 *   swap them back and forth.
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
const FADE_IN = 4;
const FADE_OUT = 4;
/** A fixture already holding a light keeps it against a rival unless the
 *  rival matters this much more, so two near-equal lamps don't trade a
 *  light back and forth. */
const HOLD_BONUS = 2;
/** Once lit, a fixture keeps its light at least this long while it's
 *  still in (or lingering near) the view and switched on. */
const MIN_HOLD_SECONDS = 3;
/** How quickly the brightness used for ranking follows the real one, in
 *  seconds: slow enough to ignore a fire's flicker, quick enough for a
 *  switch. */
const RANK_SMOOTHING = 0.8;

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
  /** When it last got a light, for MIN_HOLD_SECONDS. */
  heldSince: number;
  /** Its brightness, smoothed, for ranking (RANK_SMOOTHING). */
  smoothed: number;
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
      heldSince: -Infinity,
      smoothed: -1,
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
        fixture.smoothed = 0;
        continue;
      }
      fixture.smoothed = fixture.smoothed < 0 ? intensity : fixture.smoothed + (intensity - fixture.smoothed) * (1 - Math.exp(-step / RANK_SMOOTHING));
      const reach = Math.min(fixture.distance, Math.sqrt(intensity / REACH_THRESHOLD));
      sphere.set(fixture.position, reach + VIEW_MARGIN);
      if (frustum.intersectsSphere(sphere)) fixture.lastSeen = now;
      if (now - fixture.lastSeen > LINGER_SECONDS) continue;
      const distanceSq = Math.max(1, fixture.position.distanceToSquared(cameraPosition));
      ranked.push({ fixture, score: (fixture.smoothed / distanceSq) * (fixture.slot >= 0 ? HOLD_BONUS : 1) });
    }
    ranked.sort((a, b) => b.score - a.score);
    // Fixtures that got their light only moments ago keep it; the rest of
    // the pool goes by rank.
    const chosen = new Set<Fixture>();
    for (const { fixture } of ranked) if (fixture.slot >= 0 && now - fixture.heldSince < MIN_HOLD_SECONDS && chosen.size < POOL_SIZE) chosen.add(fixture);
    for (const { fixture } of ranked) {
      if (chosen.size >= POOL_SIZE) break;
      chosen.add(fixture);
    }

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
      fixture.heldSince = now;
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
