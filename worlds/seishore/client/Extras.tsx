// The town's extras: people sitting (customers at their tables, drivers at
// their wheels, passengers), and steam rising off coffee, pots, and incense.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { VrmAvatar } from "../../../src/avatar/VrmAvatar";
import { AvatarAnimator } from "../../../src/avatar/AvatarAnimator";
import { buildGestureRegistry, findGesture, SEIZA_GESTURE_NAME, SIT_GESTURE_NAME } from "../../../src/avatar/gestures";
import { bubbleTexture, type Chatter } from "../../../src/guides/Guide";
import { noRaycast } from "../../seisugbo/client/kit";

const GESTURES = buildGestureRegistry({});
const SIT = findGesture(GESTURES, SIT_GESTURE_NAME);
/** Kneeling, as a rakugo teller does on the stage. */
const SEIZA = findGesture(GESTURES, SEIZA_GESTURE_NAME);
const STILL = new THREE.Vector3();

/**
 * Someone sitting: a customer, a driver, a passenger. A designed avatar
 * (built in code), seated as visitors sit, at `position` (the seat's floor
 * spot, as Seiza's seats give it) facing `rotationY`. Not someone to talk
 * to; now and then, if they have lines and you're near, one in a bubble.
 * Placed inside a moving group, they ride along with it.
 */
export function Sitter({ avatar, position, rotationY, chatter, near = () => Infinity, kneel = false, bubbleSeconds = 5 }: { avatar: string; position: [number, number, number]; rotationY: number; chatter?: Chatter[]; near?: () => number; kneel?: boolean; bubbleSeconds?: number }) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const bubble = useRef<THREE.Sprite>(null);
  const material = useMemo(() => new THREE.SpriteMaterial({ depthWrite: false, transparent: true, opacity: 0 }), []);
  const say = useRef({ next: 6 + Math.random() * 14, shown: -1, line: 0 });
  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material]
  );
  useFrame((_, delta) => {
    if (!chatter?.length || !bubble.current) return;
    const s = say.current;
    s.next -= delta;
    if (s.shown >= 0) s.shown += delta;
    if (s.shown < 0 && s.next <= 0 && near() < 8) {
      s.line = (s.line + 1) % chatter.length;
      material.map?.dispose();
      material.map = bubbleTexture(chatter[s.line]);
      material.needsUpdate = true;
      s.shown = 0;
    }
    if (s.shown >= bubbleSeconds) {
      s.shown = -1;
      s.next = 14 + Math.random() * 16;
    }
    material.opacity = s.shown < 0 ? 0 : Math.min(1, s.shown / 0.3, (bubbleSeconds - s.shown) / 0.5);
    bubble.current.visible = s.shown >= 0;
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <VrmAvatar url={avatar} onLoaded={setVrm} updateEvery={() => 2} />
      <AvatarAnimator vrm={vrm} updateEvery={() => 2} getPosition={() => STILL} posture={kneel ? SEIZA : SIT} gesture={null} gestureSeq={0} />
      {chatter?.length ? <sprite ref={bubble} material={material} position={[0, 1.75, 0]} scale={[1.15, 0.3, 1]} visible={false} raycast={noRaycast} userData={{ navIgnore: true }} /> : null}
    </group>
  );
}

let puffTexture: THREE.Texture | null = null;
function puff() {
  if (puffTexture) return puffTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  puffTexture = new THREE.CanvasTexture(c);
  return puffTexture;
}

/**
 * Steam (or incense smoke) rising from points: a few soft puffs each,
 * drifting up, spreading, fading. One draw call for all of them.
 */
export function Steam({ at, rise = 0.5, size = 0.12, color = "#ffffff", opacity = 0.35, rate = 1 }: { at: [number, number, number][]; rise?: number; size?: number; color?: string; opacity?: number; rate?: number }) {
  const PER = 5;
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(at.length * PER * 3), 3));
    return g;
  }, [at.length]);
  const material = useMemo(
    () => new THREE.PointsMaterial({ map: puff(), color, size: size * 2.2, transparent: true, opacity, depthWrite: false, sizeAttenuation: true }),
    [color, size, opacity]
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * rate;
    const p = geometry.attributes.position as THREE.BufferAttribute;
    at.forEach(([x, y, z], i) => {
      for (let k = 0; k < PER; k++) {
        const life = (t * 0.45 + k / PER + i * 0.37) % 1;
        const sway = Math.sin(t * 1.3 + k * 2 + i) * 0.04 * life;
        p.setXYZ(i * PER + k, x + sway, y + life * rise, z + sway * 0.6);
      }
    });
    p.needsUpdate = true;
  });
  return <points geometry={geometry} material={material} raycast={noRaycast} userData={{ navIgnore: true }} frustumCulled={false} />;
}
