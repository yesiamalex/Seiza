import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useProgress } from "@react-three/drei";
import { L, useLang } from "../i18n/lang";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import { loadVrmAnimation } from "../avatar/AvatarAnimator";
import { BUILTIN_GESTURES, LOCOMOTION_CLIPS } from "../avatar/builtinMotions.generated";
import { decodeAvatarSpec, isDesignerAvatarUrl } from "../avatar/designer/avatarSpec";
import { buildDesignerVrm } from "../avatar/designer/buildDesignerVrm";
import { noiseHit, toneHit, voice } from "../addons/sound";
import { speak } from "../guides/speech";
import { stationReading } from "../guides/reading";

/**
 * Arriving in a world, by the Seikansen (星環線), the train that links
 * the EcoSeiztem's worlds: you sit on its long seat at night, facing us,
 * and breathe, slowly, while the world loads. Through the
 * window behind you the night streams past (near poles fast, the hills
 * slow, the stars slower), and hung still in the sky is the world's own
 * constellation, drawing itself a line at a breath (seiza is also the
 * word for a constellation). When the world is ready the train slows into
 * its station, the sign with its name sliding into the window; the doors
 * chime open, the conductor says where you are, and your avatar stands,
 * turns, walks to the door and steps out, and you're there.
 *
 * While you wait, tap things: the window for a shooting star (and the next
 * line of the constellation), the straps to set them swinging, the
 * speaker for the next-station announcement, yourself for a little bow.
 * Once the world's there, a tap or any key goes straight in.
 *
 * Its own small renderer, a few thousand triangles, so it keeps its pace
 * while the world's renderer is busy. Reduced motion: no rocking, no
 * walking; the train arrives and the screen fades.
 */

/** Each world's colour (its station's stripe, its sign). */
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
/** One breath: in, then a longer out. */
const BREATH_IN = 4;
const BREATH_OUT = 5;
/** At least one breath in, so a quick load still reads as arriving. */
const MIN_SECONDS = 2.2;
/** After ready: slowing into the station; the doors; getting up; the turn; the walk out. */
const BRAKE = 2.8;
const DOORS_AT = 2.8;
const RISE_AT = 3.3;
const STAND_SECONDS = 1.1;
const TURN_SECONDS = 0.5;
const WALK_SECONDS = 1.5;
const STEP_OUT_SECONDS = 1.1;
/** A moment into the first breath, the avatar is built. */
const AVATAR_AFTER_MS = 700;
const SIT_URL = BUILTIN_GESTURES.find((g) => g.name === "sit")?.url ?? null;
const FADE_SECONDS = 0.7;
/** The carriage: its window wall, where you kneel, the door you leave by. */
const WALL_Z = -1.15;
const KNEEL: [number, number] = [-0.5, -0.35];
/** Where you sit on the long seat (its cushion's top is 0.5 m up), and the
 *  aisle you stand up into. */
const SEAT = { y: 0.05, z: -0.8 };
const DOOR_X = 2.4;
/** The night sky without WebGL: a few stars and the glow of the horizon. */
const FLAT_SKY = [
  "radial-gradient(1.5px 1.5px at 12% 18%, #fff 50%, transparent 51%)",
  "radial-gradient(1px 1px at 27% 42%, #dfe6ff 50%, transparent 51%)",
  "radial-gradient(1.5px 1.5px at 41% 12%, #fff 50%, transparent 51%)",
  "radial-gradient(1px 1px at 58% 30%, #dfe6ff 50%, transparent 51%)",
  "radial-gradient(2px 2px at 66% 16%, #fff6dc 50%, transparent 51%)",
  "radial-gradient(1px 1px at 79% 38%, #fff 50%, transparent 51%)",
  "radial-gradient(1.5px 1.5px at 88% 22%, #dfe6ff 50%, transparent 51%)",
  "radial-gradient(1px 1px at 8% 52%, #fff 50%, transparent 51%)",
  "radial-gradient(1px 1px at 47% 56%, #dfe6ff 50%, transparent 51%)",
  "radial-gradient(1.5px 1.5px at 93% 58%, #fff 50%, transparent 51%)",
  "radial-gradient(120% 60% at 50% 110%, #1d2b4a 0%, #0b0f20 60%)",
].join(", ");

const TIPS: [string, string][] = [
  ["Click a seat to sit; click the floor twice to walk there.", "席をクリックで座れます。床をダブルクリックでそこへ歩きます。"],
  ["Press T on a ride to change it; S brakes.", "乗り物ではTで切り替え、Sでブレーキ。"],
  ["Hot out? Find shade, or drink some water.", "暑いときは日陰へ。水を飲むのも忘れずに。"],
  ["Talk to anyone in a world: click them.", "ワールドの人をクリックすると、話しかけられます。"],
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

/** The world's constellation, made from its id: seven stars in a line with one branch,
 *  placed in the patch of sky the carriage's big window looks onto. */
export function constellation(id: string): { stars: THREE.Vector3[]; lines: [number, number][] } {
  const rand = seeded(id);
  const stars: THREE.Vector3[] = [];
  for (let i = 0; i < 7; i++) stars.push(new THREE.Vector3(-21 + (i / 6) * 24 + (rand() - 0.5) * 3, 4.5 + rand() * 6, -70));
  const lines: [number, number][] = [];
  for (let i = 0; i < 6; i++) lines.push([i, i + 1]);
  lines.push([2, 4 + Math.floor(rand() * 2)]);
  return { stars, lines };
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  return canvasTexture(64, 64, (ctx) => {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  });
}

const FONT = "system-ui, -apple-system, 'Segoe UI', 'Hiragino Sans', 'Noto Sans CJK JP', sans-serif";

/** The station's name board (ekimeihyō): its name in Japanese, large, the
 *  English under, the line's colour along the foot, the line named. */
function stationSign(nameJa: string, nameEn: string, color: string) {
  return canvasTexture(1024, 336, (ctx) => {
    ctx.fillStyle = "#f7f7f2";
    ctx.fillRect(0, 0, 1024, 336);
    ctx.fillStyle = color;
    ctx.fillRect(0, 236, 1024, 44);
    ctx.fillStyle = "#1d2433";
    ctx.textAlign = "center";
    ctx.font = `800 120px ${FONT}`;
    ctx.fillText(nameJa, 512, 140, 960);
    ctx.font = `600 46px ${FONT}`;
    ctx.fillText(nameEn, 512, 210, 960);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText("星環線  SEIKANSEN  ·  EcoSeiztem", 512, 267);
    ctx.fillStyle = "#1d2433";
    ctx.font = `500 26px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText("◀ 星座 Seiza", 28, 318);
    ctx.textAlign = "right";
    ctx.fillText("EcoSeiztem ▶", 996, 318);
  });
}

/** An ad hung over the aisle, as on every Japanese train: the line itself. */
function lineAd(color: string) {
  return canvasTexture(512, 320, (ctx) => {
    ctx.fillStyle = "#0e1430";
    ctx.fillRect(0, 0, 512, 320);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 14);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText("星環線", 256, 92);
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText("SEIKANSEN", 256, 136);
    ctx.font = `500 24px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText("Every world of the EcoSeiztem, one line", 256, 180);
    // The line map: stations as dots along a line.
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(60, 250);
    ctx.lineTo(452, 250);
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i === 3 ? color : "#fff";
      ctx.beginPath();
      ctx.arc(60 + i * 65.3, 250, i === 3 ? 13 : 9, 0, Math.PI * 2);
      ctx.fill();
    }
  });
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
 *  file the join screen already fetched; and its sitting (held in `seiza`,
 *  played back to stand) and walk. */
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
  const [seizaAnim, walkAnim] = await Promise.all([SIT_URL ? loadVrmAnimation(SIT_URL).catch(() => null) : null, loadVrmAnimation(LOCOMOTION_CLIPS.walk).catch(() => null)]);
  const seiza = seizaAnim ? mixer.clipAction(createVRMAnimationClip(seizaAnim, vrm)) : null;
  if (seiza) {
    // Down onto the seat, then held there.
    seiza.setLoop(THREE.LoopOnce, 1);
    seiza.clampWhenFinished = true;
    seiza.play();
  }
  const walk = walkAnim ? mixer.clipAction(createVRMAnimationClip(walkAnim, vrm)) : null;
  return { vrm, mixer, seiza, walk, rising: false, walking: false };
}

// --- its sounds ---------------------------------------------------------------------------

/** The wheels over a rail joint: ta-tan. */
function clack(level: number) {
  const v = voice(0.35 * level, undefined, 10, 0.5);
  if (!v) return;
  noiseHit(v, { frequency: 260, duration: 0.06, gain: 0.22, q: 1.2 });
  noiseHit(v, { frequency: 240, duration: 0.06, gain: 0.18, q: 1.2, delay: 0.13 });
}
/** The doors' chime: two soft tones, up. */
function chime() {
  const v = voice(0.6, undefined, 10, 1.6);
  if (!v) return;
  toneHit(v, { frequency: 880, duration: 0.6, gain: 0.08, type: "sine", attack: 0.01 });
  toneHit(v, { frequency: 1175, duration: 0.8, gain: 0.07, type: "sine", attack: 0.01, delay: 0.32 });
}
/** A shooting star: a bright little glissando. */
function sparkle() {
  const v = voice(0.5, undefined, 10, 1.2);
  if (!v) return;
  for (let i = 0; i < 4; i++) toneHit(v, { frequency: 1500 + i * 380, duration: 0.35, gain: 0.03, type: "sine", delay: i * 0.06 });
}
/** A strap's swing: a creak and a soft tap of the ring. */
function strapSound() {
  const v = voice(0.4, undefined, 10, 0.6);
  if (!v) return;
  noiseHit(v, { frequency: 1800, duration: 0.08, gain: 0.05, q: 3 });
  toneHit(v, { frequency: 2400, duration: 0.15, gain: 0.02, type: "triangle", delay: 0.05 });
}

export function Arrival({
  ready,
  worldId,
  worldName,
  nameEn,
  nameJa,
  avatarUrl,
  onDone,
}: {
  ready: boolean;
  worldId: string;
  worldName: string;
  /** The world's name in each language, for its station's sign. */
  nameEn?: string;
  nameJa?: string;
  avatarUrl?: string | null;
  onDone: () => void;
}) {
  useLang();
  const host = useRef<HTMLDivElement>(null);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const skipRef = useRef(false);
  const [fading, setFading] = useState(false);
  const [breath, setBreath] = useState<"in" | "out">("in");
  // Without its 3D view (no second WebGL context to be had, or the browser
  // took it back while the world loaded behind it): stars drawn in CSS, and
  // in once the world's ready.
  const [flat, setFlat] = useState(false);
  const [tapped, setTapped] = useState(false);
  const goneRef = useRef(false);
  const finish = () => {
    if (goneRef.current) return;
    goneRef.current = true;
    setFading(true);
    window.setTimeout(() => doneRef.current(), FADE_SECONDS * 1000);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (!flat || !ready) return;
    const timer = window.setTimeout(() => finishRef.current(), 1200);
    return () => window.clearTimeout(timer);
  }, [flat, ready]);
  // And whatever happens, in at most 12 s after the world's ready.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => finishRef.current(), 12_000);
    return () => window.clearTimeout(timer);
  }, [ready]);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const { loaded, total } = useProgress();
  const color = worldColor(worldId);
  const en = nameEn ?? worldName;
  const ja = nameJa ?? worldName;

  // Once the world's there, a key goes straight in (a tap does too: below).
  useEffect(() => {
    const skip = () => {
      if (readyRef.current) skipRef.current = true;
    };
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    } catch {
      setFlat(true);
      return;
    }
    let lost = false;
    const onLost = () => {
      lost = true;
      setFlat(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", onLost);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";

    const tint = new THREE.Color(color);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 200);
    const disposables: { dispose: () => void }[] = [];
    const keep = <T extends { dispose: () => void }>(x: T) => {
      disposables.push(x);
      return x;
    };
    const lambert = (c: string) => keep(new THREE.MeshLambertMaterial({ color: c }));
    const basic = (c: string | THREE.Color, extra: THREE.MeshBasicMaterialParameters = {}) => keep(new THREE.MeshBasicMaterial({ color: c, ...extra }));
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, at: [number, number, number], parent: THREE.Object3D = scene) => {
      const mesh = new THREE.Mesh(keep(geometry), material);
      mesh.position.set(...at);
      parent.add(mesh);
      return mesh;
    };
    const box = (size: [number, number, number], at: [number, number, number], material: THREE.Material, parent?: THREE.Object3D) => add(new THREE.BoxGeometry(...size), material, at, parent);

    // --- outside: the sky, the stars, the hills, the poles going by ----------------------------
    const sky = canvasTexture(4, 256, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "#050817");
      g.addColorStop(0.62, "#141a3c");
      g.addColorStop(1, `#${tint.clone().lerp(new THREE.Color("#1d2147"), 0.6).getHexString()}`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 4, 256);
    });
    keep(sky);
    add(new THREE.PlaneGeometry(400, 120), basic("#ffffff", { map: sky, fog: false }), [0, 40, -90]);
    const starCount = 500;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) starPos.set([(Math.random() - 0.5) * 160, -2 + Math.random() * 40, -40 - Math.random() * 40], i * 3);
    const starGeometry = keep(new THREE.BufferGeometry());
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeometry, keep(new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, color: "#dfe6ff", transparent: true, opacity: 0.85 }))));
    // The hills: a long dark line, repeating every 80 m, two of them side by side.
    const hillShape = new THREE.Shape();
    hillShape.moveTo(-40, -6);
    for (let x = -40; x <= 40; x += 2) hillShape.lineTo(x, 1.5 + 1.6 * Math.sin((x / 80) * Math.PI * 2 * 3) + 0.9 * Math.sin((x / 80) * Math.PI * 2 * 7 + 1));
    hillShape.lineTo(40, -6);
    const hillGeometry = keep(new THREE.ShapeGeometry(hillShape));
    const hillMaterial = basic("#0b1024");
    const hills = new THREE.Group();
    for (const dx of [-80, 0, 80]) add(hillGeometry, hillMaterial, [dx, 0, -50], hills);
    scene.add(hills);
    // Poles along the line, a dark post and its arm every 9 m: beyond the
    // platform, so the station's name board is never behind one when the train stops.
    const poleMaterial = basic("#151a2c");
    const poles = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Group();
      box([0.16, 7, 0.16], [0, 1.5, 0], poleMaterial, p);
      box([1.4, 0.08, 0.08], [0.2, 4.6, 0], poleMaterial, p);
      p.position.set(-27 + i * 9, 0, WALL_Z - 4.4);
      poles.add(p);
    }
    scene.add(poles);

    // The world's constellation, still in the sky: its stars, and the lines between, drawn a breath at a time.
    const { stars: points, lines } = constellation(worldId);
    const glowMap = keep(glowTexture());
    const bright = points.map((p) => {
      const s = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowMap, color: "#fff6dc", fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      s.position.copy(p);
      s.scale.setScalar(3.2);
      scene.add(s);
      return s;
    });
    const linePos = new Float32Array(lines.length * 6);
    lines.forEach(([a, b], i) => linePos.set([...points[a].toArray(), ...points[b].toArray()], i * 6));
    const lineGeometry = keep(new THREE.BufferGeometry());
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
    const lineMaterial = keep(new THREE.LineBasicMaterial({ color: tint.clone().lerp(new THREE.Color("#ffffff"), 0.5), transparent: true, opacity: 0.8 }));
    lineGeometry.setDrawRange(0, 0);
    scene.add(new THREE.LineSegments(lineGeometry, lineMaterial));
    // A shooting star, when you tap the window.
    const shootingMaterial = keep(new THREE.SpriteMaterial({ map: glowMap, color: "#fff6dc", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    const shooting = new THREE.Sprite(shootingMaterial);
    shooting.scale.set(5, 0.6, 1);
    scene.add(shooting);
    let shootingAt = -10;
    const shootingFrom = new THREE.Vector3();

    // --- the station, sliding in when you arrive -------------------------------------------------
    const station = new THREE.Group();
    station.visible = false;
    box([60, 0.3, 3.2], [0, -0.15, WALL_Z - 1.75], lambert("#bdb9b0"), station);
    box([60, 0.02, 0.22], [0, 0.01, WALL_Z - 0.4], basic("#f2c42e"), station);
    box([60, 0.12, 2.6], [0, 3.0, WALL_Z - 2.0], lambert("#3f4652"), station);
    for (let x = -28; x <= 28; x += 7) box([0.14, 3.0, 0.14], [x, 1.5, WALL_Z - 3.0], lambert("#7d7f82"), station);
    for (let x = -24; x <= 24; x += 8) box([1.2, 0.06, 0.18], [x, 2.92, WALL_Z - 1.6], basic("#fff3d6"), station);
    const signMap = keep(stationSign(ja, en, color));
    add(new THREE.PlaneGeometry(2.7, 0.89), basic("#ffffff", { map: signMap }), [KNEEL[0], 1.55, WALL_Z - 2.9], station);
    // Its legs, up to its foot (behind it, never over its name).
    for (const dx of [-1.2, 1.2]) box([0.07, 1.12, 0.07], [KNEEL[0] + dx, 0.56, WALL_Z - 2.96], lambert("#7d7f82"), station);
    scene.add(station);

    // --- the carriage --------------------------------------------------------------------------
    scene.add(new THREE.HemisphereLight("#fff4e0", "#3a3040", 1.0));
    const lamp = new THREE.DirectionalLight("#fff1d6", 0.8);
    lamp.position.set(0, 4, 3);
    scene.add(lamp);
    const wallMaterial = lambert("#ece7da");
    const H = 2.4;
    box([16, 0.04, 3.4], [0, -0.02, 0.5], lambert("#8e8374"));
    box([16, 0.06, 3.4], [0, H, 0.5], basic("#e9e5da"));
    for (const x of [-4, 0, 4]) box([0.16, 0.03, 2.2], [x, H - 0.05, 0.5], basic("#ffffff"));
    // The window wall: big windows, the door, the panels between.
    const openings: { x0: number; x1: number; y0: number; y1: number; door?: boolean }[] = [
      { x0: -4.6, x1: -2.6, y0: 0.95, y1: 1.95 },
      { x0: -1.75, x1: 0.75, y0: 0.95, y1: 1.95 },
      { x0: DOOR_X - 0.6, x1: DOOR_X + 0.6, y0: 0, y1: 2.05, door: true },
      { x0: 3.8, x1: 5.8, y0: 0.95, y1: 1.95 },
    ];
    let x = -8;
    for (const o of openings) {
      if (o.x0 > x) box([o.x0 - x, H, 0.08], [(x + o.x0) / 2, H / 2, WALL_Z], wallMaterial);
      if (o.y0 > 0) box([o.x1 - o.x0, o.y0, 0.08], [(o.x0 + o.x1) / 2, o.y0 / 2, WALL_Z], wallMaterial);
      box([o.x1 - o.x0, H - o.y1, 0.08], [(o.x0 + o.x1) / 2, (H + o.y1) / 2, WALL_Z], wallMaterial);
      if (!o.door) for (const y of [o.y0, o.y1]) box([o.x1 - o.x0, 0.04, 0.12], [(o.x0 + o.x1) / 2, y, WALL_Z], lambert("#9da3a8"));
      x = o.x1;
    }
    box([8 - x, H, 0.08], [(x + 8) / 2, H / 2, WALL_Z], wallMaterial);
    // The door's leaves, sliding apart on arrival.
    const leafMaterial = lambert("#c9ccd0");
    const leaves = [-1, 1].map((s) => box([0.6, 2.05, 0.04], [DOOR_X + s * 0.3, 1.025, WALL_Z + 0.03], leafMaterial));
    for (const leaf of leaves) box([0.36, 0.7, 0.01], [0, 0.35, 0.025], basic("#1a2140"), leaf);
    // The long seat under the windows, and its back.
    const seatMaterial = lambert("#2f6fd0");
    for (const [a, b] of [
      [-8, DOOR_X - 0.75],
      [DOOR_X + 0.75, 8],
    ]) {
      box([b - a, 0.42, 0.46], [(a + b) / 2, 0.21, WALL_Z + 0.27], lambert("#5f6670"));
      box([b - a, 0.1, 0.5], [(a + b) / 2, 0.45, WALL_Z + 0.27], seatMaterial);
      box([b - a, 0.42, 0.08], [(a + b) / 2, 0.72, WALL_Z + 0.08], seatMaterial);
    }
    // Straps on a rail over the aisle, rocking with the train.
    box([16, 0.03, 0.03], [0, 2.08, 0.15], lambert("#c9ccd0"));
    const strapMaterial = lambert("#ece4d2");
    const straps: { group: THREE.Group; swing: number; speed: number }[] = [];
    for (let sx = -5.5; sx <= 5.5; sx += 0.62) {
      const group = new THREE.Group();
      group.position.set(sx, 2.08, 0.15);
      box([0.025, 0.24, 0.025], [0, -0.12, 0], strapMaterial, group);
      add(new THREE.TorusGeometry(0.055, 0.012, 6, 16), strapMaterial, [0, -0.3, 0], group);
      const target = box([0.16, 0.42, 0.16], [0, -0.2, 0], basic("#ffffff", { visible: false }), group);
      target.userData.tap = "strap";
      scene.add(group);
      straps.push({ group, swing: 0, speed: 0 });
    }
    // The ad over the aisle, and the speaker in the ceiling.
    add(new THREE.PlaneGeometry(0.9, 0.56), basic("#ffffff", { map: keep(lineAd(color)), side: THREE.DoubleSide }), [-2.2, 1.95, 0.9]);
    const speaker = box([0.34, 0.06, 0.34], [1.0, H - 0.03, 0.9], lambert("#d9d6cc"));
    speaker.userData.tap = "speaker";
    box([0.22, 0.01, 0.22], [1.0, H - 0.065, 0.9], basic("#4a4e58"));
    // The windows, as places to tap.
    for (const o of openings.filter((o) => !o.door)) {
      const pane = add(new THREE.PlaneGeometry(o.x1 - o.x0, o.y1 - o.y0), basic("#ffffff", { visible: false }), [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, WALL_Z]);
      pane.userData.tap = "window";
    }
    const selfTarget = box([0.6, 1.1, 0.7], [KNEEL[0], 0.75, SEAT.z + 0.1], basic("#ffffff", { visible: false }));
    selfTarget.userData.tap = "self";

    let portrait = false;
    const resize = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // A phone held upright sees less across: step back to keep you and the window in view.
      portrait = w < h;
      camera.fov = portrait ? 74 : 58;
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
          loaded.vrm.scene.position.set(KNEEL[0], SEAT.y, SEAT.z);
          // Its shaders built off to the side first, so it appearing isn't one long frame.
          const show = () => {
            if (cancelled) return;
            self = loaded;
            scene.add(loaded.vrm.scene);
          };
          renderer.compileAsync(loaded.vrm.scene, camera, scene).then(show, show);
        })
        .catch(() => {});
    }, AVATAR_AFTER_MS);

    // Its own clock, not the wall's: a frame much longer than lately (the
    // world loading behind this screen held it up) counts as a usual one, so
    // a hitch slows the scene a moment rather than jumping it ahead; a device
    // that's simply slow runs in real time.
    let last = performance.now();
    let clock = 0;
    let usual = 1 / 60;
    let readyAt: number | null = null;
    let gone = false;
    let frame = 0;
    let breathing: "in" | "out" = "in";
    const breathLength = BREATH_IN + BREATH_OUT;
    let extraLines = 0;
    let bow = 0;
    let lastClack = 0;
    let announced = false;
    let chimed = false;
    let lastAnnouncement = -10;
    const announce = () => {
      const said = stationReading(ja);
      speak(`次は、${said}。${said}です。`, "ja-JP", { volume: 0.8, rate: 1.05 });
      speak(`The next station is ${en}.`, "en-US", { volume: 0.8 });
    };

    // Tapping: what's under the finger.
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const onTap = (event: PointerEvent) => {
      if (readyRef.current) {
        skipRef.current = true;
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.userData.tap);
      if (!hit) return;
      setTapped(true);
      const what = hit.object.userData.tap as string;
      if (what === "window") {
        // A shooting star across the sky behind, and the next line of the constellation.
        shootingAt = clock;
        shootingFrom.set(hit.point.x * 14 + 10, 9 + Math.random() * 4, -60);
        extraLines++;
        sparkle();
      } else if (what === "strap") {
        for (const s of straps) {
          const d = Math.abs(s.group.position.x - hit.point.x);
          if (d < 1.4) s.speed += (1.4 - d) * 2.6 * (Math.random() < 0.5 ? -1 : 1);
        }
        strapSound();
      } else if (what === "speaker") {
        if (clock - lastAnnouncement > 4) {
          lastAnnouncement = clock;
          announce();
        }
      } else if (what === "self") {
        bow = 1;
      }
    };
    // Dragging looks round the carriage (a turn of the head, not a walk); a
    // press that doesn't move is a tap, acted on as it lifts. Let go, and the
    // view drifts back to where it was a few seconds later.
    const look = { yaw: 0, pitch: 0, toYaw: 0, toPitch: 0, from: null as null | { x: number; y: number; yaw: number; pitch: number; moved: boolean }, idle: 0 };
    const onDown = (event: PointerEvent) => {
      look.from = { x: event.clientX, y: event.clientY, yaw: look.toYaw, pitch: look.toPitch, moved: false };
      el.setPointerCapture?.(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      const from = look.from;
      if (!from) return;
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (!from.moved && Math.hypot(dx, dy) < 7) return;
      from.moved = true;
      const across = Math.max(320, el.clientWidth || window.innerWidth);
      look.toYaw = THREE.MathUtils.clamp(from.yaw + (dx / across) * 2.4, -1.0, 1.0);
      look.toPitch = THREE.MathUtils.clamp(from.pitch + (dy / across) * 1.6, -0.35, 0.45);
      look.idle = 0;
    };
    const onUp = (event: PointerEvent) => {
      const from = look.from;
      look.from = null;
      if (from && !from.moved) onTap(event);
    };
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = performance.now();
      const real = Math.min(0.25, (now - last) / 1000);
      last = now;
      const dt = Math.min(real, Math.max(1 / 30, usual * 1.6), 0.1);
      usual += (Math.min(real, 0.1) - usual) * 0.1;
      clock += dt;
      const t = clock;
      if (readyAt === null && readyRef.current && t > MIN_SECONDS) readyAt = t;
      // A tap once ready: straight to the doors.
      if (readyAt !== null && skipRef.current) {
        readyAt = Math.min(readyAt, t - RISE_AT);
        skipRef.current = false;
      }
      // In development only: a moment pinned, to look at (window.__arrivalAfter).
      const pinned = import.meta.env.DEV ? (window as unknown as { __arrivalAfter?: number }).__arrivalAfter : undefined;
      const after = typeof pinned === "number" ? pinned : readyAt === null ? -1 : t - readyAt;

      // The train's speed: full, then braking into the station.
      const speed = after < 0 ? 1 : 1 - smooth(after / BRAKE);
      const pace = 14 * speed;
      for (const pole of poles.children) {
        pole.position.x -= pace * dt;
        if (pole.position.x < -27) pole.position.x += 54;
      }
      hills.position.x -= pace * 0.04 * dt;
      if (hills.position.x < -80) hills.position.x += 80;
      const sp = starGeometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < starCount; i++) {
        let sx = sp.getX(i) - pace * 0.012 * dt * (60 / -sp.getZ(i));
        if (sx < -80) sx += 160;
        sp.setX(i, sx);
      }
      sp.needsUpdate = true;
      // The station: from out of sight ahead, coming to rest outside the window.
      if (after >= 0) {
        station.visible = true;
        const left = 1 - smooth(after / BRAKE);
        station.position.x = 45 * left * left;
      }
      if (after >= 0 && speed > 0.3 && !announced && after > 0.6) {
        announced = true;
        announce();
      }
      // The doors, once stopped.
      const doors = after < 0 ? 0 : smooth((after - DOORS_AT) / 0.6);
      if (after >= DOORS_AT && !chimed) {
        chimed = true;
        chime();
        // As every train in Japan says when its doors open.
        speak("お降りの際は、足元にご注意ください。", "ja-JP", { volume: 0.75, rate: 1.08 });
        speak("Please mind your step as you leave the train.", "en-US", { volume: 0.7 });
      }
      leaves.forEach((leaf, i) => (leaf.position.x = DOOR_X + (i ? 1 : -1) * (0.3 + 0.62 * doors)));
      // The wheels over the joints, quicker the faster.
      if (speed > 0.15 && t - lastClack > 1.1 / Math.max(0.3, speed)) {
        lastClack = t;
        clack(speed);
      }

      // Breathing: the view rises a little on the in-breath, settles on the out.
      const inBreath = t % breathLength < BREATH_IN;
      const phase = inBreath ? (t % breathLength) / BREATH_IN : 1 - ((t % breathLength) - BREATH_IN) / BREATH_OUT;
      const next: "in" | "out" = inBreath ? "in" : "out";
      if (next !== breathing) {
        breathing = next;
        setBreath(next);
      }

      // Your avatar: sitting, facing you; at the station, up off the seat and
      // forward into the aisle, a turn to the door, the walk, and out.
      const riseAt = RISE_AT;
      const turnAt = riseAt + STAND_SECONDS;
      const walkAt = turnAt + TURN_SECONDS * 0.6;
      const outAt = walkAt + WALK_SECONDS;
      const turn = smooth((after - turnAt) / TURN_SECONDS);
      const walk = smooth((after - walkAt) / WALK_SECONDS);
      const out = smooth((after - outAt + 0.2) / STEP_OUT_SECONDS);
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
        if (after >= turnAt && !a.walking && a.walk && !still) {
          a.walking = true;
          a.walk.reset().play();
          a.walk.timeScale = 1.4;
          a.walk.fadeIn(0.3);
          a.seiza?.fadeOut(0.3);
        }
        // VRM 1.0 models are built facing +Z, 0.x ones −Z: facing you first,
        // then a quarter turn to the door, then another, out through it.
        const facing = a.vrm.meta.metaVersion === "1" ? Math.PI : 0;
        a.vrm.scene.rotation.y = facing + Math.PI + (Math.PI / 2) * turn + (Math.PI / 2) * smooth((after - outAt) / 0.35);
        if (!still) {
          const up = smooth((after - riseAt) / STAND_SECONDS);
          a.vrm.scene.position.x = KNEEL[0] + (DOOR_X - KNEEL[0]) * walk;
          a.vrm.scene.position.y = SEAT.y * (1 - up);
          a.vrm.scene.position.z = SEAT.z + (KNEEL[1] - SEAT.z) * up + (WALL_Z - 1.2 - KNEEL[1]) * out;
        }
        a.mixer.update(dt);
        // A little bow, when you tap yourself.
        if (bow > 0) {
          bow = Math.max(0, bow - dt * 0.9);
          const k = Math.sin(Math.PI * (1 - bow));
          a.vrm.humanoid.getNormalizedBoneNode("spine")?.rotateX(0.35 * k);
          a.vrm.humanoid.getNormalizedBoneNode("neck")?.rotateX(0.25 * k);
        }
        a.vrm.update(dt);
      }
      // The straps rock with the train, and swing when you set them going.
      for (const s of straps) {
        s.speed += (-s.swing * 18 - s.speed * 1.8) * dt;
        s.swing += s.speed * dt;
        s.group.rotation.z = s.swing + (still ? 0 : 0.05 * speed * Math.sin(t * 1.7 + s.group.position.x));
      }

      // Watching from the aisle, rocking a little with the train, and
      // following you to the door.
      const rock = still ? 0 : speed;
      const follow = still ? 0 : smooth((after - walkAt) / (WALK_SECONDS + STEP_OUT_SECONDS));
      // Upright on a phone, you in the middle of it.
      const baseX = portrait ? KNEEL[0] + 0.15 : 0.6;
      camera.position.set(baseX + (1.9 - baseX) * follow + 0.01 * Math.sin(t * 9) * rock, 1.3 + (still ? 0 : 0.015 * smooth(phase)) + 0.006 * Math.sin(t * 11) * rock, 3.4 - 0.6 * follow);
      camera.lookAt((portrait ? KNEEL[0] : 0.1) + (portrait ? 2.2 : 1.6) * follow, 1.05, -0.6);
      camera.rotateZ(0.004 * Math.sin(t * 1.3) * rock);
      // Where you've dragged the view to, eased; back to the middle a while after you let go.
      if (!look.from) {
        look.idle += dt;
        if (look.idle > 3.5) {
          look.toYaw *= 1 - Math.min(1, dt * 1.2);
          look.toPitch *= 1 - Math.min(1, dt * 1.2);
        }
      }
      look.yaw += (look.toYaw - look.yaw) * Math.min(1, dt * 10);
      look.pitch += (look.toPitch - look.pitch) * Math.min(1, dt * 10);
      camera.rotateY(look.yaw);
      camera.rotateX(look.pitch);

      // The constellation: a line every breath and a bit, and one for each shooting star.
      const drawn = Math.min(lines.length, Math.floor(t / 1.2) + 1 + extraLines + (after >= 0 ? lines.length : 0));
      lineGeometry.setDrawRange(0, drawn * 2);
      bright.forEach((s, i) => (s.material.opacity = (i <= drawn ? 0.95 : 0.35) * (0.85 + 0.15 * Math.sin(t * 3 + i))));
      // The shooting star: across and down, fading.
      const st = (t - shootingAt) / 0.9;
      shootingMaterial.opacity = st >= 0 && st <= 1 ? Math.sin(Math.PI * st) : 0;
      if (st >= 0 && st <= 1) {
        shooting.position.copy(shootingFrom).add(new THREE.Vector3(-26 * st, -7 * st, 0));
        shootingMaterial.rotation = 0.26;
      }

      if (!lost) renderer.render(scene, camera);
      if ((out >= 0.85 || (still && after > DOORS_AT + 0.8)) && !gone) {
        gone = true;
        finishRef.current();
      }
    };
    loop();
    return () => {
      cancelAnimationFrame(frame);
      cancelled = true;
      window.clearTimeout(avatarTimer);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      if (self) {
        scene.remove(self.vrm.scene);
        VRMUtils.deepDispose(self.vrm.scene);
      }
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
    // The avatar and names are read once, at the start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, color]);

  const share = total > 0 ? Math.min(1, loaded / total) : 0;
  return (
    <div
      ref={host}
      role="status"
      aria-label={L(`Entering ${worldName}`, `${worldName}へ移動中`)}
      onPointerDown={() => {
        if (readyRef.current) skipRef.current = true;
      }}
      // The flash: the world's own colour, fading out to the world.
      style={{ position: "fixed", inset: 0, zIndex: 80, background: fading ? color : flat ? FLAT_SKY : "#0b0f20", opacity: fading ? 0 : 1, transition: `opacity ${FADE_SECONDS}s ease, background ${FADE_SECONDS / 2}s ease`, pointerEvents: fading ? "none" : "auto", overflow: "hidden", touchAction: "manipulation" }}
    >
      <div style={{ position: "absolute", zIndex: 1, left: 0, right: 0, bottom: 34, display: "grid", justifyItems: "center", gap: 8, color: "#fff", fontFamily: "system-ui, sans-serif", textShadow: "0 1px 6px rgba(0,0,0,0.7)", pointerEvents: "none", padding: "0 16px", textAlign: "center", opacity: fading ? 0 : 1, transition: "opacity 300ms" }}>
        <span style={{ fontSize: 14, opacity: 0.85, letterSpacing: 1, transition: "opacity 600ms" }}>{ready ? L("Tap to step off", "タップで降りる") : breath === "in" ? L("Breathe in…", "吸って…") : L("…and out", "…吐いて")}</span>
        <strong style={{ fontSize: 18, letterSpacing: 0.3 }}>{L(`Seikansen to ${worldName}`, `星環線 ${worldName}行き`)}</strong>
        <span aria-hidden style={{ width: 160, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.18)", overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${Math.round((ready ? 1 : 0.1 + 0.85 * share) * 100)}%`, background: color, transition: "width 400ms" }} />
        </span>
        <span style={{ fontSize: 13, opacity: 0.75 }}>{!tapped && !flat ? L("Tap the window, a strap, the speaker, or yourself · drag to look around", "窓、つり革、スピーカー、自分をタップ · ドラッグで見回せます") : L(...tip)}</span>
      </div>
    </div>
  );
}
