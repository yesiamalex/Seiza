import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useVrmLoader } from "./useVrmLoader";
import { stirPond } from "../scene/pondActivity";
import { extendHairCollision } from "./springColliders";
import { markForMirrors } from "../scene/Mirror";
import type { VRM } from "@pixiv/three-vrm";
import { avatarDetail, type AvatarDetail } from "../multiplayer/avatarDetail";

export interface VrmAvatarProps {
  url: string;
  position?: [number, number, number];
  rotationY?: number;
  onLoaded?: (vrm: VRM | null) => void;
  /** Update every Nth frame (see AvatarAnimator's prop of the same name). */
  updateEvery?: () => number;
  /** Lower its detail when it's far away or out of view (avatarDetail.ts).
   *  On for everyone else's avatar, a guide, a townsperson; off for your
   *  own and a preview, which are always right in front of you. */
  lod?: boolean;
}

/** Every avatar with level of detail on, for how crowded the scene is. */
const crowd = new Set<object>();
/** How often each avatar rechecks where it is, seconds. */
const LOD_CHECK = 0.25;
/** An avatar's size for the view test: a sphere round its middle. */
const BODY_RADIUS = 1.1;
const FULL: AvatarDetail = { every: 1, springs: true, outlines: true };
/** For three.js's own frustum culling of an avatar's skinned meshes: a
 *  sphere round its middle, big enough for any pose (arms out, a kick,
 *  lying down), so it's skipped only when it's really off screen. */
const CULL_CENTRE = new THREE.Vector3(0, 1.0, 0);
const CULL_RADIUS = 2.2;
const scratchFrustum = new THREE.Frustum();
const scratchMatrix = new THREE.Matrix4();
const scratchSphere = new THREE.Sphere();
const scratchEye = new THREE.Vector3();

/** Its outlines, each a second pass over the avatar: an uploaded VRM's MToon
 *  outline materials (its own, per avatar), or a designed avatar's outline
 *  meshes (whose materials are shared between avatars, so the meshes). */
function outlinesOf(vrm: VRM): { visible: boolean }[] {
  const found: { visible: boolean }[] = [];
  vrm.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name === "SeizaDesignerOutline") {
      found.push(mesh);
      return;
    }
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if ((m as { isOutline?: boolean }).isOutline) found.push(m);
  });
  return found;
}

// Beyond this much movement in one frame, treat it as a teleport and let
// the spring bones start fresh instead of whipping across the gap.
const TELEPORT_DISTANCE = 1.5;
const SHADOW_RADIUS = 0.34;

/**
 * Soft blob shadow under every avatar.
 *
 * Avatars deliberately don't cast real shadows: a skinned mesh has to be
 * re-rendered into the shadow map every frame it moves, which is exactly the
 * per-frame cost the rest of the world avoids (see Scene.tsx). A single
 * textured disc costs one draw call, always points the right way, and does
 * the job a contact shadow actually does — telling you where someone's feet
 * are.
 */
let shadowTexture: THREE.Texture | null | undefined;
function getShadowTexture(): THREE.Texture | null {
  if (shadowTexture !== undefined) return shadowTexture;
  if (typeof document === "undefined") return (shadowTexture = null);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return (shadowTexture = null);
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, "rgba(0,0,0,0.55)");
  gradient.addColorStop(0.55, "rgba(0,0,0,0.28)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  shadowTexture = new THREE.CanvasTexture(canvas);
  return shadowTexture;
}
// Spring-bone integration explodes on long frames (tab switch, hitch).
const MAX_SPRING_DELTA = 1 / 30;

/**
 * Renders one avatar — local, remote, or preview — from any avatar URL
 * useVrmLoader understands (a .vrm file or a designer spec).
 *
 * Orientation: VRM 0.x models face -Z and VRM 1.0 models face +Z (the two
 * specs convert from Unity's axes differently). Seiza's convention is that
 * an avatar at rotationY 0 faces -Z — the direction the camera looks by
 * default — so VRM 1.0 models (including designer avatars) get an extra
 * half turn here. Without it, every VRM 1.0 upload walked backwards.
 *
 * Spring bones (hair, skirts): three-vrm simulates them in world space, so
 * any instant jump in the model's world position flings them. Two guards:
 * the update delta is capped, and a teleport resets the simulation.
 */
export function VrmAvatar({ url, position = [0, 0, 0], rotationY = 0, onLoaded, updateEvery, lod = true }: VrmAvatarProps) {
  const { vrm, error } = useVrmLoader(url || null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const lastWorld = useRef<THREE.Vector3 | null>(null);
  const scratch = useRef(new THREE.Vector3());
  const updateEveryRef = useRef(updateEvery);
  updateEveryRef.current = updateEvery;
  const throttle = useRef({ frame: 0, pending: 0 });
  const root = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const detail = useRef<{ now: AvatarDetail; checked: number; outlines: { visible: boolean }[]; outlinesShown: boolean; springsOn: boolean }>({ now: FULL, checked: Infinity, outlines: [], outlinesShown: true, springsOn: true });
  useEffect(() => {
    if (!lod) return;
    const token = {};
    crowd.add(token);
    return () => {
      crowd.delete(token);
    };
  }, [lod]);
  useEffect(() => {
    const d = detail.current;
    d.outlines = vrm ? outlinesOf(vrm) : [];
    // Culled frame by frame by three.js when it's off screen, with a sphere
    // generous enough that no pose is ever clipped (the loader turns culling
    // off, because a skinned mesh's own bounds are its rest pose). Your own
    // avatar and previews stay as they are.
    if (vrm && lod) {
      // In each mesh's own space, measured from the avatar's root, so a
      // model whose meshes sit under scaled or moved nodes still gets a
      // sphere round the whole body.
      vrm.scene.updateMatrixWorld(true);
      const rootInverse = new THREE.Matrix4().copy(vrm.scene.matrixWorld).invert();
      const relative = new THREE.Matrix4();
      vrm.scene.traverse((node) => {
        const mesh = node as THREE.SkinnedMesh;
        if (!mesh.isSkinnedMesh) return;
        relative.multiplyMatrices(rootInverse, mesh.matrixWorld);
        const scale = relative.getMaxScaleOnAxis();
        if (!Number.isFinite(scale) || scale <= 0) return;
        const centre = CULL_CENTRE.clone().applyMatrix4(relative.clone().invert());
        mesh.boundingSphere = new THREE.Sphere(centre, CULL_RADIUS / scale);
        mesh.frustumCulled = true;
      });
    }
    d.outlinesShown = true;
    d.springsOn = true;
    d.now = FULL;
    d.checked = Infinity;
  }, [vrm, lod]);

  useEffect(() => {
    // Once per model: lets long hair collide with the hips and thighs, not
    // just the torso, so crouching and kneeling don't pass it through the
    // legs (see springColliders.ts).
    if (vrm) extendHairCollision(vrm);
    // People are what mirrors reflect (scene/Mirror.tsx).
    if (vrm) markForMirrors(vrm.scene);
    onLoadedRef.current?.(vrm);
    lastWorld.current = null;
  }, [vrm]);

  useEffect(() => {
    if (error) console.error("VRM load failed:", error);
  }, [error]);

  useFrame(({ camera }, frameDelta) => {
    if (!vrm) return;
    // Where it is, a few times a second: in view or not, how far, how crowded.
    const d = detail.current;
    d.checked += frameDelta;
    if (lod && d.checked > LOD_CHECK) {
      d.checked = 0;
      const view = gl.xr.isPresenting ? gl.xr.getCamera() : camera;
      scratchMatrix.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse);
      scratchFrustum.setFromProjectionMatrix(scratchMatrix);
      vrm.scene.getWorldPosition(scratchSphere.center);
      scratchSphere.center.y += 0.9;
      scratchSphere.radius = BODY_RADIUS;
      view.getWorldPosition(scratchEye);
      d.now = avatarDetail({ inView: scratchFrustum.intersectsSphere(scratchSphere), distance: scratchSphere.center.distanceTo(scratchEye), crowd: crowd.size });
      if (d.now.outlines !== d.outlinesShown) {
        d.outlinesShown = d.now.outlines;
        for (const m of d.outlines) m.visible = d.now.outlines;
      }
    }
    const every = Math.max(1, Math.round(updateEveryRef.current?.() ?? 1), d.now.every);
    const t = throttle.current;
    t.frame += 1;
    t.pending += frameDelta;
    if (every > 1 && t.frame % every !== 0) return;
    const delta = t.pending;
    t.pending = 0;
    const world = vrm.scene.getWorldPosition(scratch.current);
    if (lastWorld.current && world.distanceTo(lastWorld.current) > TELEPORT_DISTANCE) {
      vrm.springBoneManager?.reset();
    }
    lastWorld.current = (lastWorld.current ?? new THREE.Vector3()).copy(world);
    if (d.now.springs) {
      // Hair back on after a while still: from where it is, not a fling.
      if (!d.springsOn) vrm.springBoneManager?.reset();
      d.springsOn = true;
      vrm.update(Math.min(delta, MAX_SPRING_DELTA));
    } else {
      // Far away: everything VRM.update does but the hair and clothes physics.
      d.springsOn = false;
      vrm.humanoid.update();
      vrm.lookAt?.update(delta);
      vrm.expressionManager?.update();
      vrm.nodeConstraintManager?.update();
    }
    // Wading ripples (pondActivity.ts): a distance check, and only does
    // anything for an avatar actually standing in the pond.
    stirPond(vrm.scene.uuid, world.x, world.z);
  });

  if (!vrm) {
    // No avatar URL, or it failed to load — a neutral stand-in rather than
    // an invisible player.
    return (
      <group position={position} rotation={[0, rotationY, 0]}>
        <mesh position={[0, 0.9, 0]} castShadow>
          <capsuleGeometry args={[0.28, 1.0, 6, 12]} />
          <meshStandardMaterial color="#9aa0aa" roughness={0.7} />
        </mesh>
      </group>
    );
  }

  const facingOffset = vrm.meta.metaVersion === "1" ? Math.PI : 0;
  const shadow = getShadowTexture();
  return (
    <group ref={root} position={position} rotation={[0, rotationY, 0]}>
      <primitive object={vrm.scene} rotation={[0, facingOffset, 0]} />
      {shadow && (
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} userData={{ navIgnore: true }} renderOrder={-1}>
          <circleGeometry args={[SHADOW_RADIUS, 20]} />
          <meshBasicMaterial map={shadow} transparent depthWrite={false} opacity={0.75} />
        </mesh>
      )}
    </group>
  );
}
