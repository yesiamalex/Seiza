import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { VrmAvatar } from "../avatar/VrmAvatar";
import { AvatarAnimator } from "../avatar/AvatarAnimator";
import { pillButtonStyle } from "./styles";
import { L, useLang } from "../i18n/lang";

interface AvatarPreviewProps {
  url: string;
  /** CSS height; fluid by default. */
  height?: string;
  /** Hold this expression instead of a neutral face — the designer uses
   *  it so a face can be judged directly rather than by triggering a
   *  gesture that happens to carry one. */
  expression?: string | null;
}

/**
 * Standalone 3D viewport for looking at an avatar before joining or while
 * designing one. Drag to orbit, scroll or pinch to zoom, and right-drag
 * (or two fingers) to move the camera, so a face or a sleeve can be looked
 * at up close instead of only the whole figure from the middle. The Face
 * and Body buttons frame those directly.
 *
 * Plays the same idle animation the avatar will use in the world, so what
 * you see is what others will see. The T-pose toggle is there for
 * inspecting a model's proportions and rig.
 *
 * The camera sits on the -Z side because every avatar is normalized to
 * face -Z (see VrmAvatar.tsx) — this is looking at its front.
 */
export function AvatarPreview({ url, height = "clamp(260px, 46vh, 460px)", expression = null }: AvatarPreviewProps) {
  useLang();
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [holdTPose, setHoldTPose] = useState(false);
  // A counter rather than a plain value, so pressing the same button again
  // after moving the camera away still re-frames.
  const [framing, setFraming] = useState<{ focus: Focus; seq: number }>({ focus: "body", seq: 0 });
  const frame = (focus: Focus) => setFraming((f) => ({ focus, seq: f.seq + 1 }));

  return (
    <div style={{ position: "relative", width: "100%", height, borderRadius: 12, overflow: "hidden", background: "radial-gradient(90% 80% at 50% 30%, #1a1d28 0%, #0b0b0e 70%)" }}>
      {/* A second WebGL context alongside the world's, so it's kept light:
          capped pixel ratio and low-power GPU preference, so a phone isn't
          pushed into dropping a context. (When this preview closes, the
          browser logs "Context Lost" for *this* canvas; that is just its
          teardown, not the world's.) */}
      <Canvas camera={{ position: [0, 1.15, -2.9], fov: 36 }} shadows dpr={[1, 1.5]} gl={{ powerPreference: "low-power" }}>
        <ambientLight intensity={0.75} />
        <directionalLight position={[-2, 4, -3]} intensity={1.35} castShadow />
        <directionalLight position={[2, 2, 3]} intensity={0.35} />
        <Suspense fallback={null}>
          <VrmAvatar url={url} onLoaded={setVrm} />
        </Suspense>
        <AvatarAnimator vrm={vrm} holdTPose={holdTPose} expression={expression} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[0.7, 40]} />
          <meshStandardMaterial color="#20232e" roughness={1} />
        </mesh>
        <OrbitControls
          makeDefault
          target={BODY_TARGET}
          screenSpacePanning
          zoomToCursor
          minDistance={0.3}
          maxDistance={6}
          maxPolarAngle={Math.PI * 0.62}
        />
        <PreviewCamera vrm={vrm} focus={framing.focus} seq={framing.seq} />
      </Canvas>
      <div style={{ position: "absolute", right: 10, top: 10, display: "flex", gap: 5 }}>
        <button type="button" onClick={() => frame("face")} style={smallPill}>
          {L("Face", "顔")}
        </button>
        <button type="button" onClick={() => frame("body")} style={smallPill}>
          {L("Body", "全身")}
        </button>
      </div>
      <button
        type="button"
        onClick={() => setHoldTPose((v) => !v)}
        style={{ ...smallPill, position: "absolute", right: 10, bottom: 10 }}
        aria-pressed={holdTPose}
      >
        {holdTPose ? L("Show idle", "通常ポーズ") : L("T-pose", "Tポーズ")}
      </button>
      <span style={{ position: "absolute", left: 12, right: 96, bottom: 14, fontSize: 11, opacity: 0.55, pointerEvents: "none" }}>
        {hasFinePointer()
          ? L("Drag to rotate · right-drag to move · scroll to zoom", "ドラッグで回転・右ドラッグで移動・スクロールでズーム")
          : L("Drag to rotate · two fingers to move and zoom", "ドラッグで回転・2本指で移動とズーム")}
      </span>
    </div>
  );
}

type Focus = "face" | "body";

const smallPill = { ...pillButtonStyle, padding: "6px 12px", fontSize: 12 };
const BODY_TARGET: [number, number, number] = [0, 0.9, 0];
const BODY_DISTANCE = 2.9;
const FACE_DISTANCE = 0.75;
// The camera may be moved, but not so far that the avatar is lost off
// screen with no way back short of the Body button.
const TARGET_BOUNDS = new THREE.Box3(new THREE.Vector3(-0.8, 0.05, -0.8), new THREE.Vector3(0.8, 2.2, 0.8));

const hasFinePointer = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

/**
 * Keeps the orbit target inside TARGET_BOUNDS and glides to a framing when
 * Face or Body is pressed. The glide keeps the current viewing angle and
 * only changes what is looked at and from how far; grabbing the view
 * mid-glide hands control straight back.
 */
function PreviewCamera({ vrm, focus, seq }: { vrm: VRM | null; focus: Focus; seq: number }) {
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  const goal = useRef<{ target: THREE.Vector3; distance: number } | null>(null);

  useEffect(() => {
    if (seq === 0) return;
    const target = new THREE.Vector3(...BODY_TARGET);
    let distance = BODY_DISTANCE;
    if (focus === "face") {
      // Bone positions rather than a fixed height: avatars range from
      // chibi to very tall, and a fixed y would frame a chest or a ceiling.
      const head = vrm?.humanoid.getRawBoneNode("head") ?? vrm?.humanoid.getNormalizedBoneNode("head");
      if (head) head.getWorldPosition(target);
      else target.set(0, 1.45, 0);
      target.y += 0.06;
      distance = FACE_DISTANCE;
    } else if (vrm) {
      // Frame the middle of the avatar's own height, not a fixed 0.9 m.
      const head = vrm.humanoid.getRawBoneNode("head");
      if (head) target.y = Math.max(0.4, head.getWorldPosition(new THREE.Vector3()).y * 0.6);
    }
    goal.current = { target, distance };
  }, [focus, seq, vrm]);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => (goal.current = null);
    const clamp = () => {
      const clamped = controls.target.clone().clamp(TARGET_BOUNDS.min, TARGET_BOUNDS.max);
      if (clamped.equals(controls.target)) return;
      // Move the camera by the same amount so the clamp reads as a wall,
      // not a sudden change of angle.
      controls.object.position.add(clamped.clone().sub(controls.target));
      controls.target.copy(clamped);
    };
    controls.addEventListener("start", cancel);
    controls.addEventListener("change", clamp);
    return () => {
      controls.removeEventListener("start", cancel);
      controls.removeEventListener("change", clamp);
    };
  }, [controls]);

  useFrame((_, delta) => {
    const g = goal.current;
    if (!g || !controls) return;
    const camera = controls.object;
    const t = 1 - Math.exp(-delta * 8);
    const offset = camera.position.clone().sub(controls.target);
    const distance = THREE.MathUtils.lerp(offset.length(), g.distance, t);
    controls.target.lerp(g.target, t);
    camera.position.copy(controls.target).add(offset.setLength(distance));
    controls.update();
    if (controls.target.distanceTo(g.target) < 0.002 && Math.abs(distance - g.distance) < 0.002) goal.current = null;
  });

  return null;
}
