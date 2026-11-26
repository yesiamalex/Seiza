import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useProgress } from "@react-three/drei";
import { L, useLang } from "../i18n/lang";
import { swirl } from "../worlds/Portals";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import { loadVrmAnimation } from "../avatar/AvatarAnimator";
import { BUILTIN_GESTURES, LOCOMOTION_CLIPS } from "../avatar/builtinMotions.generated";
import { decodeAvatarSpec, isDesignerAvatarUrl } from "../avatar/designer/avatarSpec";
import { buildDesignerVrm } from "../avatar/designer/buildDesignerVrm";

/**
 * Arriving in a world: your avatar kneels in seiza on a dark meadow at
 * night, facing you, and you breathe, slowly, while the world loads. Overhead, a line at a breath,
 * the world's own constellation draws itself in the stars (seiza is also
 * the word for a constellation). When the world is ready its stars come
 * down, gather in front of you, and open into a portal in the world's
 * colour, as Seiza's portals between worlds look; your avatar stands,
 * turns, and walks through it, you following, a flash of its colour, and
 * you're there. (Until your avatar has loaded, or if it can't, the walk
 * is yours alone, toward the ring.)
 *
 * Your avatar comes from the browser's cache (the join screen fetched it)
 * and is built a moment into the first breath, so the brief work of
 * decoding it falls in the quiet part, not in the walk.
 *
 * Sitting still suits a wait of any length (a walk would have to slow
 * down not to arrive early), and the breathing gives it a rhythm. Its own
 * small renderer, a few thousand triangles, so it keeps its pace while the
 * world's renderer is busy building and compiling. Once the world is
 * ready, a tap or any key skips straight in.
 *
 * Reduced motion: no breathing sway, no walking: the portal forms and the
 * screen fades.
 */

/** Each world's portal colour (as Seiza's portals show it). */
const WORLD_COLORS: Record<string, string> = {
  default: "#f2d16b",
  seizora: "#ffb35c",
  seizorai: "#ffd27a",
  seilaya: "#c8607a",
  seisugbo: "#3fb6a8",
  seiou: "#d8c98a",
  seinag: "#7fa7ff",
  tulay: "#e07a3f",
  iscolab: "#5fc4e8",
  seishore: "#ff9e7a",
};
/** Where the portal opens, in front of where you kneel. */
const PORTAL_Z = -5.5;
const PORTAL_Y = 1.75;
/** Where the camera watches from: a little behind and above your avatar. */
const VIEW = { y: 1.2, z: 3.6 };
/** One breath: in, then a longer out. */
const BREATH_IN = 4;
const BREATH_OUT = 5;
/** At least one breath in, so a quick load still reads as arriving. */
const MIN_SECONDS = 2.2;
/** After ready: the stars coming down into the ring, standing, the steps through. */
const SUMMON_SECONDS = 1.1;
/** Getting up out of seiza (its clip, played back), and turning to the portal. */
const STAND_SECONDS = 1.1;
const TURN_SECONDS = 0.5;
/** Walking to the ring, and through it. */
const WALK_SECONDS = 2.0;
/** A moment into the first breath, the avatar is built. */
const AVATAR_AFTER_MS = 700;
const SEIZA_URL = BUILTIN_GESTURES.find((g) => g.name === "seiza")?.url ?? null;
const FADE_SECONDS = 0.7;

const TIPS: [string, string][] = [
  ["Click a seat to sit; click the floor twice to walk there.", "席をクリックで座れます。床をダブルクリックでそこへ歩きます。"],
  ["Press T on a ride to change it; S brakes.", "乗り物ではTで切り替え、Sでブレーキ。"],
  ["Hot out? Find shade, or drink some water.", "暑いときは日陰へ。水を飲むのも忘れずに。"],
  ["Ask a guide anything: click them.", "ガイドをクリックすると、何でも質問できます。"],
  ["Near a pet, press P to pat it.", "ペットの近くでPを押すと、なでられます。"],
];

/** A world's own colour, or one made from its id. */
export function worldColor(id: string): string {
  if (WORLD_COLORS[id]) return WORLD_COLORS[id];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360}, 70%, 65%)`;
}

/** A small seeded random, so a world's constellation is always the same. */
function seeded(id: string) {
  let s = 2166136261;
  for (const ch of id) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The world's constellation: seven stars ahead and high, joined in a
 *  line with one branch, made from the world's id. */
export function constellation(id: string): { stars: THREE.Vector3[]; lines: [number, number][] } {
  const rand = seeded(id);
  const stars: THREE.Vector3[] = [];
  for (let i = 0; i < 7; i++) {
    const az = -0.7 + (i / 6) * 1.4 + (rand() - 0.5) * 0.22;
    const el = 0.28 + rand() * 0.3;
    stars.push(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(70));
  }
  const lines: [number, number][] = [];
  for (let i = 0; i < 6; i++) lines.push([i, i + 1]);
  lines.push([2, 4 + Math.floor(rand() * 2)]);
  return { stars, lines };
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** The night sky: deep at the top, lighter at the horizon, warmed by the world's colour ahead. */
function skyDome(color: THREE.Color): THREE.Mesh {
  const g = new THREE.SphereGeometry(90, 32, 16);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color("#060a1c");
  const horizon = new THREE.Color("#1d2147");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 90;
    const ahead = Math.max(0, -pos.getZ(i) / 90);
    c.copy(horizon).lerp(top, Math.min(1, Math.max(0, y * 1.6)));
    c.lerp(color, 0.22 * ahead * Math.max(0, 1 - Math.abs(y) * 3.5));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

const smooth = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

interface Self {
  vrm: VRM;
  mixer: THREE.AnimationMixer;
  seiza: THREE.AnimationAction | null;
  walk: THREE.AnimationAction | null;
  rising: boolean;
  walking: boolean;
}

/** Your avatar, for the arrival: built from its spec, or decoded from the
 *  file the join screen already fetched; and its seiza and walk. */
async function loadSelf(url: string): Promise<Self | null> {
  let vrm: VRM | null = null;
  if (isDesignerAvatarUrl(url)) {
    const spec = decodeAvatarSpec(url);
    if (spec) vrm = buildDesignerVrm(spec);
  } else {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    vrm = (gltf.userData.vrm as VRM | undefined) ?? null;
    if (vrm) {
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
    }
  }
  if (!vrm) return null;
  vrm.scene.traverse((o) => (o.frustumCulled = false));
  const mixer = new THREE.AnimationMixer(vrm.scene);
  const [seizaAnim, walkAnim] = await Promise.all([SEIZA_URL ? loadVrmAnimation(SEIZA_URL).catch(() => null) : null, loadVrmAnimation(LOCOMOTION_CLIPS.walk).catch(() => null)]);
  const seiza = seizaAnim ? mixer.clipAction(createVRMAnimationClip(seizaAnim, vrm)) : null;
  if (seiza) {
    // Down into seiza, then held there.
    seiza.setLoop(THREE.LoopOnce, 1);
    seiza.clampWhenFinished = true;
    seiza.play();
  }
  const walk = walkAnim ? mixer.clipAction(createVRMAnimationClip(walkAnim, vrm)) : null;
  return { vrm, mixer, seiza, walk, rising: false, walking: false };
}

export function Arrival({ ready, worldId, worldName, avatarUrl, onDone }: { ready: boolean; worldId: string; worldName: string; avatarUrl?: string | null; onDone: () => void }) {
  useLang();
  const host = useRef<HTMLDivElement>(null);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const skipRef = useRef(false);
  const [fading, setFading] = useState(false);
  const [breath, setBreath] = useState<"in" | "out">("in");
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const { loaded, total } = useProgress();
  const color = worldColor(worldId);

  // Once the world's there, a tap or a key goes straight in.
  useEffect(() => {
    const skip = () => {
      if (readyRef.current) skipRef.current = true;
    };
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    } catch {
      // No second context to be had: the plain dark screen does the job.
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";

    const tint = new THREE.Color(color);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#0d1124", 6, 40);
    const camera = new THREE.PerspectiveCamera(64, 1, 0.05, 200);
    const disposables: { dispose: () => void }[] = [];
    const keep = <T extends { dispose: () => void }>(x: T) => {
      disposables.push(x);
      return x;
    };

    const dome = skyDome(tint);
    keep(dome.geometry);
    keep(dome.material as THREE.Material);
    scene.add(dome);
    scene.add(new THREE.HemisphereLight("#5a6aa8", "#0a0c14", 0.6));
    // Moonlight on your avatar, from behind the camera.
    const moon = new THREE.DirectionalLight("#c9d4ff", 0.9);
    moon.position.set(1.5, 4, 6);
    scene.add(moon);
    const portalLight = new THREE.PointLight(tint, 0, 12, 1.6);
    portalLight.position.set(0, 1.4, PORTAL_Z + 0.8);
    scene.add(portalLight);

    // Stars, the sky full of them.
    const starCount = 900;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = Math.random() * 0.95 + 0.04;
      const r = Math.sqrt(1 - y * y);
      starPos.set([Math.cos(a) * r * 80, y * 80, Math.sin(a) * r * 80], i * 3);
    }
    const starGeometry = keep(new THREE.BufferGeometry());
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeometry, keep(new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, color: "#dfe6ff", fog: false, transparent: true, opacity: 0.85 }))));

    // The world's constellation: brighter stars, the lines between them
    // drawn a breath at a time. Each star later comes down into the ring.
    const { stars: points, lines } = constellation(worldId);
    const glowMap = keep(glowTexture());
    const ringAt = (i: number) => new THREE.Vector3(Math.sin((i / points.length) * Math.PI * 2) * 1.5, PORTAL_Y + Math.cos((i / points.length) * Math.PI * 2) * 1.5, PORTAL_Z);
    const bright = points.map((p) => {
      const s = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowMap, color: "#fff6dc", fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      s.position.copy(p);
      s.scale.setScalar(2.6);
      scene.add(s);
      return s;
    });
    const linePos = new Float32Array(lines.length * 6);
    lines.forEach(([a, b], i) => linePos.set([...points[a].toArray(), ...points[b].toArray()], i * 6));
    const lineGeometry = keep(new THREE.BufferGeometry());
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
    const lineMaterial = keep(new THREE.LineBasicMaterial({ color: tint.clone().lerp(new THREE.Color("#ffffff"), 0.5), fog: false, transparent: true, opacity: 0.75 }));
    lineGeometry.setDrawRange(0, 0);
    scene.add(new THREE.LineSegments(lineGeometry, lineMaterial));

    // The meadow, a few stepping stones to where the portal will open, and
    // low grass either side.
    const ground = new THREE.Mesh(keep(new THREE.CircleGeometry(70, 48)), keep(new THREE.MeshStandardMaterial({ color: "#16201c", roughness: 1 })));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const stoneMaterial = keep(new THREE.MeshStandardMaterial({ color: "#6b6f78", roughness: 0.9, emissive: tint, emissiveIntensity: 0.04 }));
    const stoneGeometry = keep(new THREE.CylinderGeometry(0.32, 0.36, 0.08, 9));
    for (let i = 0; i * 0.85 < -PORTAL_Z + 1.5; i++) {
      const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
      stone.position.set(Math.sin(i * 1.7) * 0.15, 0.02, 0.4 - i * 0.85);
      stone.rotation.y = i * 0.9;
      stone.scale.set(1 + 0.15 * Math.sin(i * 2.3), 1, 0.85 + 0.15 * Math.cos(i * 1.1));
      scene.add(stone);
    }
    const tuftGeometry = keep(new THREE.ConeGeometry(0.08, 0.35, 4));
    const tuftMaterial = keep(new THREE.MeshStandardMaterial({ color: "#21342a", roughness: 1 }));
    const tufts = new THREE.InstancedMesh(tuftGeometry, tuftMaterial, 500);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 500; i++) {
      const side = i % 2 ? 1 : -1;
      m.compose(
        new THREE.Vector3(side * (0.7 + Math.random() * 9), 0.15, 2 - Math.random() * 30),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.4, Math.random() * 3, 0)),
        new THREE.Vector3(1, 0.6 + Math.random() * 0.8, 1)
      );
      tufts.setMatrixAt(i, m);
    }
    scene.add(tufts);

    // The portal, not there yet: a ring in the world's colour round its
    // turning swirl, as Seiza's portals are, opening as the stars arrive.
    const portal = new THREE.Group();
    portal.position.set(0, PORTAL_Y, PORTAL_Z);
    portal.scale.setScalar(0.001);
    const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(1.5, 0.08, 12, 64)), keep(new THREE.MeshBasicMaterial({ color: tint, toneMapped: false })));
    const swirlMap = keep(swirl());
    const disc = new THREE.Mesh(keep(new THREE.CircleGeometry(1.46, 48)), keep(new THREE.MeshBasicMaterial({ map: swirlMap, color: tint, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false })));
    const haloMaterial = keep(new THREE.SpriteMaterial({ map: glowMap, color: tint, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 }));
    const halo = new THREE.Sprite(haloMaterial);
    halo.scale.setScalar(7);
    portal.add(ring, disc);
    scene.add(portal);
    halo.position.set(0, PORTAL_Y, PORTAL_Z);
    scene.add(halo);

    // Fireflies in the world's colour, drifting over the meadow.
    const flies = 60;
    const flyPos = new Float32Array(flies * 3);
    const flyBase = new Float32Array(flies * 3);
    for (let i = 0; i < flies; i++) flyBase.set([(Math.random() - 0.5) * 10, 0.3 + Math.random() * 1.8, 1 - Math.random() * 16], i * 3);
    const flyGeometry = keep(new THREE.BufferGeometry());
    flyGeometry.setAttribute("position", new THREE.BufferAttribute(flyPos, 3));
    scene.add(new THREE.Points(flyGeometry, keep(new THREE.PointsMaterial({ size: 0.09, map: glowMap, color: tint.clone().lerp(new THREE.Color("#fff6c8"), 0.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))));

    const resize = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    let self: Self | null = null;
    let cancelled = false;
    const avatarTimer = window.setTimeout(() => {
      if (!avatarUrl) return;
      loadSelf(avatarUrl)
        .then((loaded) => {
          if (!loaded) return;
          if (cancelled) {
            VRMUtils.deepDispose(loaded.vrm.scene);
            return;
          }
          self = loaded;
          scene.add(loaded.vrm.scene);
        })
        .catch(() => {});
    }, AVATAR_AFTER_MS);

    const start = performance.now();
    let last = start;
    let readyAt: number | null = null;
    let gone = false;
    let frame = 0;
    let breathing: "in" | "out" = "in";
    const breathLength = BREATH_IN + BREATH_OUT;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - start) / 1000;
      if (readyAt === null && readyRef.current && t > MIN_SECONDS) readyAt = now;
      // A tap once ready: straight to the last step.
      if (readyAt !== null && skipRef.current) {
        readyAt = Math.min(readyAt, now - (SUMMON_SECONDS * 0.8 + STAND_SECONDS + TURN_SECONDS + WALK_SECONDS * 0.6) * 1000);
        skipRef.current = false;
      }
      const after = readyAt === null ? -1 : (now - readyAt) / 1000;
      const summon = smooth(after / SUMMON_SECONDS);
      const riseAt = SUMMON_SECONDS * 0.8;
      const turnAt = riseAt + STAND_SECONDS;
      const walkAt = turnAt + TURN_SECONDS * 0.6;
      const turn = smooth((after - turnAt) / TURN_SECONDS);
      const walk = Math.max(0, Math.min(1, (after - walkAt) / WALK_SECONDS));

      // Breathing: the view rises a little on the in-breath, settles on the out.
      const inBreath = t % breathLength < BREATH_IN;
      const phase = inBreath ? (t % breathLength) / BREATH_IN : 1 - ((t % breathLength) - BREATH_IN) / BREATH_OUT;
      const lift = still ? 0 : 0.02 * smooth(phase) * (1 - walk);
      const now2: "in" | "out" = inBreath ? "in" : "out";
      if (now2 !== breathing) {
        breathing = now2;
        setBreath(now2);
      }
      // Your avatar: kneeling, facing you; once the portal's open, up out
      // of seiza, a turn, and the walk to the ring and into it.
      const walkTo = PORTAL_Z + 0.3;
      if (self) {
        const a = self;
        if (after >= riseAt && !a.rising && a.seiza) {
          a.rising = true;
          a.seiza.paused = false;
          a.seiza.timeScale = -a.seiza.getClip().duration / STAND_SECONDS;
          a.seiza.time = a.seiza.getClip().duration;
          a.seiza.setLoop(THREE.LoopOnce, 1);
          a.seiza.play();
        }
        if (after >= turnAt && !a.walking && a.walk) {
          a.walking = true;
          a.walk.reset().play();
          a.walk.timeScale = 1.5;
          a.walk.fadeIn(0.3);
          a.seiza?.fadeOut(0.3);
        }
        a.vrm.scene.rotation.y = Math.PI * turn;
        a.vrm.scene.position.z = still ? 0 : smooth(walk) * walkTo;
        a.mixer.update(dt);
        a.vrm.update(dt);
      }
      // Watching from behind and above it, following it in.
      const follow = still ? 0 : smooth(walk);
      const z = VIEW.z + follow * (walkTo - VIEW.z + 1.6);
      camera.position.set(0.05 * Math.sin(t * 0.4), VIEW.y + lift, z);
      const gaze = 1 - summon;
      camera.lookAt(0, 1.0 + 0.9 * gaze + (PORTAL_Y - 1.0) * (1 - gaze) * 0.9, z - 7);

      // The constellation: a line every breath and a bit, all drawn by the
      // time the stars come down.
      const drawn = Math.min(lines.length, Math.floor(t / 1.2) + 1 + Math.round(summon * lines.length));
      lineGeometry.setDrawRange(0, drawn * 2);
      lineMaterial.opacity = 0.75 * (1 - summon);
      bright.forEach((s, i) => {
        s.position.copy(points[i]).lerp(ringAt(i), summon);
        s.scale.setScalar(2.6 - 2.1 * summon);
        s.material.opacity = (i <= drawn ? 0.95 : 0.35) * (0.85 + 0.15 * Math.sin(t * 3 + i));
      });
      // The portal opens as the stars arrive; the swirl turns; light spills.
      portal.scale.setScalar(Math.max(0.001, smooth((after - SUMMON_SECONDS * 0.5) / (SUMMON_SECONDS * 0.6))));
      if (!still) disc.rotation.z -= dt * 0.9;
      haloMaterial.opacity = 0.5 * summon + 0.1 * summon * Math.sin(t * 2.1) + 0.4 * walk;
      portalLight.intensity = 7 * summon + 14 * walk;
      // Fireflies wander.
      const fp = flyGeometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < flies; i++) fp.setXYZ(i, flyBase[i * 3] + 0.3 * Math.sin(t * 0.7 + i), flyBase[i * 3 + 1] + 0.2 * Math.sin(t * 1.1 + i * 1.7), flyBase[i * 3 + 2] + 0.3 * Math.cos(t * 0.6 + i * 0.5));
      fp.needsUpdate = true;
      renderer.toneMappingExposure = 1 + 2.5 * walk * walk;
      renderer.render(scene, camera);
      if ((walk >= 0.8 || (still && summon >= 1)) && !gone) {
        gone = true;
        setFading(true);
        window.setTimeout(() => doneRef.current(), FADE_SECONDS * 1000);
      }
    };
    loop();
    return () => {
      cancelAnimationFrame(frame);
      cancelled = true;
      window.clearTimeout(avatarTimer);
      if (self) {
        scene.remove(self.vrm.scene);
        VRMUtils.deepDispose(self.vrm.scene);
      }
      window.removeEventListener("resize", resize);
      tufts.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
    // The avatar is read once, at the start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, color]);

  const share = total > 0 ? Math.min(1, loaded / total) : 0;
  return (
    <div
      ref={host}
      role="status"
      aria-label={L(`Entering ${worldName}`, `${worldName}へ移動中`)}
      // The flash: the portal's own colour, fading out to the world.
      style={{ position: "fixed", inset: 0, zIndex: 80, background: fading ? color : "#0b0f20", opacity: fading ? 0 : 1, transition: `opacity ${FADE_SECONDS}s ease, background ${FADE_SECONDS / 2}s ease`, pointerEvents: fading ? "none" : "auto", overflow: "hidden" }}
    >
      <div style={{ position: "absolute", zIndex: 1, left: 0, right: 0, bottom: 34, display: "grid", justifyItems: "center", gap: 8, color: "#fff", fontFamily: "system-ui, sans-serif", textShadow: "0 1px 6px rgba(0,0,0,0.7)", pointerEvents: "none", padding: "0 16px", textAlign: "center", opacity: fading ? 0 : 1, transition: "opacity 300ms" }}>
        <span style={{ fontSize: 14, opacity: 0.85, letterSpacing: 1, transition: "opacity 600ms" }}>{ready ? L("Tap to go in", "タップで入る") : breath === "in" ? L("Breathe in…", "吸って…") : L("…and out", "…吐いて")}</span>
        <strong style={{ fontSize: 18, letterSpacing: 0.3 }}>{L(`Entering ${worldName}`, `${worldName}へ`)}</strong>
        <span aria-hidden style={{ width: 160, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.18)", overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${Math.round((ready ? 1 : 0.1 + 0.85 * share) * 100)}%`, background: color, transition: "width 400ms" }} />
        </span>
        <span style={{ fontSize: 13, opacity: 0.75 }}>{L(...tip)}</span>
      </div>
    </div>
  );
}
