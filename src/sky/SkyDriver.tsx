import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SkyClock, skyState, type SkyConfig } from "./skyState";
import type { RoomSky } from "../multiplayer/types";
import { NIGHT_HORIZON_COLOR, SUNSET_HORIZON_COLOR } from "../scene/SunsetSky";

/** How often the clock recomputes the sky, in seconds of real time. The sun
 *  moves a quarter of a degree a minute, so twice a second is plenty even
 *  for a sped-up demonstration. */
const UPDATE_INTERVAL = 0.5;
/** Distance of the directional light from the origin, as in the fixed sky. */
const SUN_DISTANCE = 37;

// The original fixed sunset's lights, kept exactly: the moving sky passes
// through them at the original sun angle.
const SUNSET = {
  hemiSky: new THREE.Color("#ffe3c2"),
  hemiGround: new THREE.Color("#d9b48a"),
  hemi: 1.05,
  ambientColor: new THREE.Color("#ffeada"),
  ambient: 0.42,
  sunColor: new THREE.Color("#ffcd96"),
  sun: 0.95,
};
const DAY = {
  hemiSky: new THREE.Color("#e6f0ff"),
  hemiGround: new THREE.Color("#cdb28c"),
  hemi: 1.1,
  ambientColor: new THREE.Color("#fff8ef"),
  ambient: 0.45,
  sunColor: new THREE.Color("#fff3e0"),
  sun: 1.2,
};
// Night stays readable: dim and blue, with the lamps doing the rest.
const NIGHT = {
  hemiSky: new THREE.Color("#4a5784"),
  hemiGround: new THREE.Color("#2e2636"),
  hemi: 0.5,
  ambientColor: new THREE.Color("#9aa6d6"),
  ambient: 0.3,
  moonColor: new THREE.Color("#a9bcff"),
  moon: 0.22,
};
const OVERCAST_SKY = new THREE.Color("#c9ced6");

/**
 * Drives the moving sky: advances the clock, and sets the scene's lights
 * and fog from it each frame. Renders the lights itself so a fixed-sky
 * world keeps Scene.tsx's original ones untouched.
 */
export function SkyDriver({ config, room = null }: { config: SkyConfig; room?: RoomSky | null }) {
  // A new room sky restarts the clock, so a change shows straight away.
  const clock = useMemo(() => new SkyClock(config, room), [config, room]);
  const since = useRef(UPDATE_INTERVAL);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((state) => state.scene);
  const scratch = useMemo(
    () => ({ a: new THREE.Color(), b: new THREE.Color(), fogSunset: new THREE.Color(SUNSET_HORIZON_COLOR), fogNight: new THREE.Color(NIGHT_HORIZON_COLOR) }),
    []
  );

  useEffect(() => {
    clock.update();
    return () => {
      skyState.active = false;
    };
  }, [clock]);

  useFrame((_, delta) => {
    since.current += delta;
    if (since.current >= UPDATE_INTERVAL) {
      since.current = 0;
      clock.update();
    }
    const { dayness, night, cloud, rain, sunVisible } = skyState;
    const lit = 1 - 0.3 * rain;

    // Sunset to day by dayness, then toward night by night.
    if (hemi.current) {
      const h = hemi.current;
      h.color.copy(SUNSET.hemiSky).lerp(DAY.hemiSky, dayness).lerp(OVERCAST_SKY, cloud * 0.5 * dayness).lerp(NIGHT.hemiSky, night);
      h.groundColor.copy(SUNSET.hemiGround).lerp(DAY.hemiGround, dayness).lerp(NIGHT.hemiGround, night);
      h.intensity = THREE.MathUtils.lerp(THREE.MathUtils.lerp(SUNSET.hemi, DAY.hemi, dayness), NIGHT.hemi, night) * lit;
    }
    if (ambient.current) {
      const a = ambient.current;
      a.color.copy(SUNSET.ambientColor).lerp(DAY.ambientColor, dayness).lerp(NIGHT.ambientColor, night);
      a.intensity = THREE.MathUtils.lerp(THREE.MathUtils.lerp(SUNSET.ambient, DAY.ambient, dayness), NIGHT.ambient, night);
    }
    if (sun.current) {
      const s = sun.current;
      // Moonlight comes from opposite the sun once it has set, kept high
      // enough to light the garden rather than skim it.
      if (night > 0.5) {
        s.position.copy(skyState.sunDirection).negate();
        s.position.y = Math.max(s.position.y, 0.45);
        s.position.normalize().multiplyScalar(SUN_DISTANCE);
        s.color.copy(NIGHT.moonColor);
        s.intensity = NIGHT.moon * (1 - 0.8 * cloud) * (night - 0.5) * 2;
      } else {
        s.position.copy(skyState.sunDirection).multiplyScalar(SUN_DISTANCE);
        s.color.copy(SUNSET.sunColor).lerp(DAY.sunColor, dayness);
        s.intensity = THREE.MathUtils.lerp(SUNSET.sun, DAY.sun, dayness) * sunVisible * (1 - 2 * night);
      }
    }

    // Fog takes the horizon colour, so the treeline fades into the sky.
    if (scene.fog instanceof THREE.Fog) {
      scratch.a.copy(scratch.fogSunset).lerp(skyState.dayHorizon, dayness);
      scratch.b.copy(scratch.fogNight);
      scene.fog.color.copy(scratch.a.lerp(scratch.b, night));
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={["#ffe3c2", "#d9b48a", 1.05]} />
      <ambientLight ref={ambient} intensity={0.42} color="#ffeada" />
      <directionalLight
        ref={sun}
        position={[-34, 4.6, 14]}
        intensity={0.95}
        color="#ffcd96"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
    </>
  );
}
