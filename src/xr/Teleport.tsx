import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { constrainWalker, floorHeightAt } from "../scene/layout";
import { readXrHead } from "./body/xrPose";
import { buzz, xrControls } from "./controls";

/**
 * Teleporting in a headset: an arc from your hand to the floor, a ring
 * where you'd land, and you're there when you let go.
 *
 * - With controllers, when "Moving" is set to Teleport (controls.ts): push
 *   the left stick forward to aim, and let it go to jump.
 * - With tracked hands, always (there's no stick to walk with): pinch your
 *   right thumb and index finger and hold it a moment to aim, and open
 *   them to jump. A quick pinch is still a click on the menu.
 *
 * The landing has to be floor you could walk to: the walls and edges
 * (constrainWalker) mustn't push it away, or the ring goes red and letting
 * go does nothing.
 */

/** How fast the arc leaves the hand, metres a second, and how it falls. */
const LAUNCH = 7.5;
const GRAVITY = 9.8;
const STEP = 0.03;
const STEPS = 70;
/** A pinch: thumb and index fingertips this close, held this long to aim. */
const PINCH = 0.02;
const RELEASE = 0.035;
const PINCH_HOLD = 0.4;
/** The left stick, pushed this far forward to aim, back under this to jump. */
const STICK_AIM = -0.6;
const STICK_LET_GO = -0.25;
/** How far the walls may move a landing before it counts as off the floor. */
const LANDING_SLACK = 0.25;

const rayMatrix = new THREE.Matrix4();
const rayLocal = new THREE.Matrix4();
const head = new THREE.Vector3();
const headQ = new THREE.Quaternion();
const origin = new THREE.Vector3();
const direction = new THREE.Vector3();
const scratchQ = new THREE.Quaternion();
const scratchS = new THREE.Vector3();
const point = new THREE.Vector3();
const next = new THREE.Vector3();
const velocity = new THREE.Vector3();
const checked = new THREE.Vector3();

export function Teleport({ originRef, blocked }: { originRef: RefObject<THREE.Object3D | null>; blocked: boolean }) {
  const gl = useThree((state) => state.gl);
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  /** Which hand is aiming, how, and where it would land. */
  const aim = useRef<{ hand: "left" | "right" | null; by: "stick" | "pinch" | null; pinchSince: number; target: THREE.Vector3 | null }>({ hand: null, by: null, pinchSince: 0, target: null });

  const { line, ring, group } = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(STEPS * 3), 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#8fd3ff", transparent: true, opacity: 0.9, depthTest: false }));
    line.frustumCulled = false;
    line.renderOrder = 10;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#8fd3ff", transparent: true, opacity: 0.85, depthWrite: false }));
    ring.renderOrder = 10;
    const group = new THREE.Group();
    group.add(line, ring);
    group.visible = false;
    for (const o of [line, ring]) o.userData.navIgnore = true;
    return { line, ring, group };
  }, []);
  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
    },
    [line, ring]
  );

  useFrame((state, _delta, frame?: XRFrame) => {
    const session = gl.xr.getSession();
    const space = gl.xr.getReferenceSpace();
    const xrOrigin = originRef.current;
    const a = aim.current;
    if (!session || !frame || !space || !xrOrigin || blockedRef.current) {
      a.hand = a.by = null;
      group.visible = false;
      return;
    }
    const now = state.clock.elapsedTime;
    const teleporting = xrControls().moving === "teleport";
    let aiming: "left" | "right" | null = null;
    let letGo = false;
    let source: XRInputSource | null = null;
    for (const s of session.inputSources) {
      if (s.hand) {
        // Tracked hands: the right hand's pinch.
        if (s.handedness !== "right" || !frame.getJointPose) continue;
        const thumb = s.hand.get("thumb-tip");
        const index = s.hand.get("index-finger-tip");
        const t = thumb && frame.getJointPose(thumb, space);
        const i = index && frame.getJointPose(index, space);
        if (!t || !i) continue;
        const gap = Math.hypot(t.transform.position.x - i.transform.position.x, t.transform.position.y - i.transform.position.y, t.transform.position.z - i.transform.position.z);
        const pinched = a.by === "pinch" ? gap < RELEASE : gap < PINCH;
        if (pinched) {
          if (a.by !== "pinch") {
            if (a.pinchSince === 0) a.pinchSince = now;
            if (now - a.pinchSince >= PINCH_HOLD) a.by = "pinch";
          }
          if (a.by === "pinch") {
            aiming = "right";
            source = s;
          }
        } else {
          a.pinchSince = 0;
          if (a.by === "pinch") {
            letGo = true;
            source = s;
          }
        }
      } else if (teleporting && s.handedness === "left" && s.gamepad) {
        // Controllers: the left stick forward.
        const y = s.gamepad.axes[3] ?? 0;
        if (a.by === "stick" ? y < STICK_LET_GO : y < STICK_AIM) {
          a.by = "stick";
          aiming = "left";
          source = s;
        } else if (a.by === "stick") {
          letGo = true;
          source = s;
        }
      }
    }

    if (letGo) {
      const target = a.target;
      a.by = a.hand = null;
      a.target = null;
      group.visible = false;
      if (target && readXrHead(gl, head, headQ)) {
        // The head onto the spot, as the admin's gather does: moving the
        // origin there would leave a roomscale player off it by however far
        // they stand from their room's centre.
        xrOrigin.position.x += target.x - head.x;
        xrOrigin.position.z += target.z - head.z;
        xrOrigin.position.y = target.y;
        buzz(gl, "left", 0.3, 30);
      }
      return;
    }
    if (!aiming || !source) {
      group.visible = false;
      a.hand = null;
      a.target = null;
      return;
    }
    a.hand = aiming;

    // The arc, from the hand's pointing ray.
    const pose = frame.getPose(source.targetRaySpace, space);
    if (!pose) return;
    rayLocal.fromArray(pose.transform.matrix);
    xrOrigin.updateWorldMatrix(true, false);
    rayMatrix.multiplyMatrices(xrOrigin.matrixWorld, rayLocal);
    rayMatrix.decompose(origin, scratchQ, scratchS);
    direction.set(0, 0, -1).applyQuaternion(scratchQ).normalize();
    velocity.copy(direction).multiplyScalar(LAUNCH);
    point.copy(origin);
    const positions = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    let landed: THREE.Vector3 | null = null;
    let count = 0;
    for (let k = 0; k < STEPS; k++) {
      positions.setXYZ(k, point.x, point.y, point.z);
      count = k + 1;
      next.copy(point).addScaledVector(velocity, STEP);
      velocity.y -= GRAVITY * STEP;
      const floor = floorHeightAt(next.x, next.z);
      if (next.y <= floor) {
        landed = new THREE.Vector3(next.x, floor, next.z);
        positions.setXYZ(k + 1 < STEPS ? k + 1 : k, next.x, floor, next.z);
        count = Math.min(STEPS, k + 2);
        break;
      }
      point.copy(next);
    }
    positions.needsUpdate = true;
    line.geometry.setDrawRange(0, count);
    let valid = false;
    if (landed) {
      checked.set(landed.x, landed.y + 1.6, landed.z);
      const y = constrainWalker(checked);
      valid = Math.hypot(checked.x - landed.x, checked.z - landed.z) < LANDING_SLACK;
      landed.y = y;
      ring.position.copy(landed).setY(y + 0.02);
    }
    ring.visible = landed !== null;
    const color = valid ? "#8fd3ff" : "#ff7a7a";
    (line.material as THREE.LineBasicMaterial).color.set(color);
    (ring.material as THREE.MeshBasicMaterial).color.set(color);
    a.target = valid ? landed : null;
    group.visible = true;
  }, -0.5);

  return <primitive object={group} />;
}
