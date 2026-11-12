// Seilaya's stations, built into Seiza's rooms: boards in the hall,
// classroom, and garden, four plaques on the hall wall, the gender data
// screen at the front of the classroom, two podiums for the interactive
// stations, and Kanlungan, the refuge mat in the garden's back corner.
// Every one opens a card (Hud.tsx) when clicked.
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { LightZone } from "../../../src/multiplayer/types";
import type { Obstacle } from "../../../src/scene/layout";
import { Clickable, FONT, roundRect, standard, useCanvasTexture, useWashedFace, wrapText } from "./kit";
import { openCard, REFUGE_SPOT, type CardKey } from "./safety";
import { L, useLang } from "../../../src/i18n/lang";

const materials = {
  wood: standard("#73502f", 0.8, 0),
  dark: standard("#26282e", 0.6, 0.2),
  mat: standard("#7d9a6a", 0.95, 0),
  matEdge: standard("#3f4a35", 0.9, 0),
};

// --- boards ------------------------------------------------------------------------------

type Emblem = "ring" | "shield" | "equal" | "dots" | "lamp" | "roof";

interface BoardSpec {
  card: CardKey;
  title: string;
  color: string;
  emblem: Emblem;
  lines: string[];
  position: [number, number, number];
  rotationY: number;
  zone: LightZone;
}

/** The boards' words in Japanese, by card. */
const BOARD_JA: Partial<Record<BoardSpec["card"], { title: string; lines: string[] }>> = {
  welcome: {
    title: "Seilayaへようこそ",
    lines: [
      "ジェンダー、安全、尊重について学ぶための場所。ここにいる誰もが安心できるように作られています。",
      "安全の機能は左上の「安全」ボタンに。何を選んでも記録されません。",
      "握手、ハグ、グータッチ、ダンスの前には、まず聞きましょう。返事がなければ「いいえ」です。",
    ],
  },
  safespaces: {
    title: "セーフスペース法",
    lines: [
      "共和国法11313号(2019年)は、公共の場、オンライン、職場、学校でのジェンダーにもとづくハラスメントを対象にしています。",
      "オンラインでは、望まれない性的な発言、侮辱語、ストーキング、同意のない画像の共有を含みます。",
      "どの学校にも礼節・調査委員会が必要です。",
    ],
  },
  gad: {
    title: "ジェンダーと開発",
    lines: [
      "女性のためのマグナカルタ(共和国法9710号)で、国は女性と男性の平等を約束しています。",
      "州立大学を含むすべての機関は、予算の少なくとも5%をGADにあてなければなりません。",
      "安全で包摂的な学びの場は、その取り組みの一部です。",
    ],
  },
  sogiesc: {
    title: "SOGIESC",
    lines: ["性的指向、性自認、性表現、性的特徴。", "誰もがこの4つすべてを持っています。言葉を知ることが、おたがいを尊重する助けになります。", "相手が伝えた名前と代名詞を使いましょう。"],
  },
  cpted: {
    title: "デザインによる安全",
    lines: [
      "光、見通し、わかりやすい出口が、場所を安心できるものにします。CPTEDの考え方です。",
      "だから夜は街灯が庭を照らし、道はいつも開けています。",
      "仮想空間でも効果があるのでしょうか?Seilayaの研究が問いかけています。",
    ],
  },
  refuge: {
    title: "カンルンガン",
    lines: ["避難所。ひと息つきたいときは、いつでもここへ。", "ここにいるあいだは誰も見えず聞こえず、誰もあなたに何かを頼めません。", "クリックして一時退避するか、「安全」ボタンを使ってください。"],
  },
};

export const BOARDS: BoardSpec[] = [
  {
    card: "welcome",
    title: "Welcome to Seilaya",
    color: "#c8607a",
    emblem: "ring",
    lines: [
      "A space for learning about gender, safety, and respect, built to feel safe for everyone in it.",
      "Your safety tools are under the Safety button, top left. Nothing you choose is recorded.",
      "Ask before any handshake, hug, fist bump, or dance. No answer means no.",
    ],
    // The hall's free front-right corner, turned toward the spawn point.
    position: [6.2, 0, 14.2],
    rotationY: -2.17,
    zone: "hall",
  },
  {
    card: "safespaces",
    title: "The Safe Spaces Act",
    color: "#3a6fd8",
    emblem: "shield",
    lines: [
      "RA 11313 (2019) covers gender-based harassment in public spaces, online, at work, and in schools.",
      "Online, it includes unwanted sexual remarks, slurs, stalking, and sharing images without consent.",
      "Every school must have a Committee on Decorum and Investigation.",
    ],
    position: [7.4, 0, -15.4],
    rotationY: -Math.PI / 2,
    zone: "classroom",
  },
  {
    card: "gad",
    title: "Gender and development",
    color: "#7a4fc8",
    emblem: "equal",
    lines: [
      "The Magna Carta of Women (RA 9710) commits the state to equality of women and men.",
      "Every agency, state universities included, must spend at least 5% of its budget on GAD.",
      "Safe, inclusive learning spaces are part of that work.",
    ],
    position: [-7.4, 0, -16.2],
    rotationY: Math.PI / 2,
    zone: "classroom",
  },
  {
    card: "sogiesc",
    title: "SOGIESC",
    color: "#d0662f",
    emblem: "dots",
    lines: [
      "Sexual orientation, gender identity, gender expression, and sex characteristics.",
      "Everyone has all four. Knowing the words helps us respect each other.",
      "Use the names and pronouns people share.",
    ],
    position: [-6.5, 0, 28.3],
    rotationY: Math.PI,
    zone: "pond",
  },
  {
    card: "cpted",
    title: "Safe by design",
    color: "#2f8f6f",
    emblem: "lamp",
    lines: [
      "Light, open sightlines, and clear exits make places feel safer: the idea behind CPTED.",
      "That's why the lampposts light the garden at night, and the paths stay clear.",
      "Does it work in virtual spaces too? Seilaya's research asks.",
    ],
    position: [5.6, 0, 25.6],
    rotationY: Math.PI,
    zone: "pond",
  },
  {
    card: "refuge",
    title: "Kanlungan",
    color: "#5b8a4a",
    emblem: "roof",
    lines: [
      "A refuge. Step out here whenever you need a moment.",
      "While you're here you don't see or hear anyone, and nobody can ask you for anything.",
      "Click to step out, or use the Safety button.",
    ],
    // Beside the mat, facing the garden: readable on the way over, and
    // never in the way of whoever is sitting on the mat.
    position: [REFUGE_SPOT[0] + 2.9, 0, REFUGE_SPOT[2] + 0.4],
    rotationY: Math.PI / 2,
    zone: "pond",
  },
];

const BOARD = { w: 2.4, h: 1.5, bottom: 0.85 };

function drawEmblem(ctx: CanvasRenderingContext2D, kind: Emblem, cx: number, cy: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (kind) {
    case "ring":
      ctx.beginPath();
      ctx.arc(cx, cy, 120, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy - 34, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - 62, cy + 80);
      ctx.quadraticCurveTo(cx - 62, cy + 6, cx, cy + 6);
      ctx.quadraticCurveTo(cx + 62, cy + 6, cx + 62, cy + 80);
      ctx.closePath();
      ctx.fill();
      break;
    case "shield":
      ctx.beginPath();
      ctx.moveTo(cx, cy - 120);
      ctx.lineTo(cx + 100, cy - 80);
      ctx.quadraticCurveTo(cx + 100, cy + 60, cx, cy + 125);
      ctx.quadraticCurveTo(cx - 100, cy + 60, cx - 100, cy - 80);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 40, cy);
      ctx.lineTo(cx - 8, cy + 34);
      ctx.lineTo(cx + 48, cy - 30);
      ctx.stroke();
      break;
    case "equal":
      ctx.beginPath();
      ctx.arc(cx, cy, 115, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillRect(cx - 60, cy - 36, 120, 22);
      ctx.fillRect(cx - 60, cy + 14, 120, 22);
      break;
    case "dots": {
      const colors = ["#c8607a", "#3a6fd8", "#d0a02f", "#2f8f6f"];
      colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(cx + (i % 2 ? 52 : -52), cy + (i < 2 ? -52 : 52), 42, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }
    case "lamp":
      ctx.fillRect(cx - 7, cy - 60, 14, 180);
      ctx.fillRect(cx - 40, cy - 110, 80, 50);
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.moveTo(cx - 40, cy - 60);
      ctx.lineTo(cx - 130, cy + 120);
      ctx.lineTo(cx + 130, cy + 120);
      ctx.lineTo(cx + 40, cy - 60);
      ctx.closePath();
      ctx.fill();
      break;
    case "roof":
      ctx.beginPath();
      ctx.moveTo(cx - 120, cy - 10);
      ctx.lineTo(cx, cy - 110);
      ctx.lineTo(cx + 120, cy - 10);
      ctx.stroke();
      ctx.strokeRect(cx - 80, cy - 10, 160, 120);
      ctx.beginPath();
      ctx.arc(cx, cy + 50, 26, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  ctx.restore();
}

function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number, b: BoardSpec) {
  ctx.fillStyle = "#fbf8f2";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = b.color;
  ctx.fillRect(0, 0, w, 110);
  ctx.fillStyle = "#fff";
  ctx.font = `700 52px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText(b.title, 36, 56);
  ctx.font = `600 22px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText("SEILAYA", w - 30, 56);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f1ebe2";
  roundRect(ctx, 36, 140, 380, 380, 24);
  ctx.fill();
  drawEmblem(ctx, b.emblem, 226, 330, b.color);
  ctx.font = `400 30px ${FONT}`;
  let y = 180;
  for (const line of b.lines) {
    ctx.fillStyle = b.color;
    ctx.fillRect(450, y - 20, 10, 10);
    ctx.fillStyle = "#1f2430";
    y = wrapText(ctx, line, 474, y, w - 510, 40) + 18;
  }
  ctx.fillStyle = "#6a7080";
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText(L("Click to read more, with sources", "クリックで詳しい説明と出典"), 36, h - 40);
}

function Board(b: BoardSpec) {
  const lang = useLang();
  const texture = useCanvasTexture(1200, 750, (ctx, w, h) => drawBoard(ctx, w, h, lang === "ja" ? { ...b, ...BOARD_JA[b.card] } : b), [lang]);
  const face = useWashedFace(texture, b.zone);
  return (
    <group position={b.position} rotation={[0, b.rotationY, 0]}>
      <Clickable onClick={() => openCard(b.card)}>
        <mesh position={[0, BOARD.bottom + BOARD.h / 2, -0.04]} material={materials.wood} castShadow>
          <boxGeometry args={[BOARD.w + 0.12, BOARD.h + 0.12, 0.06]} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * (BOARD.w / 2 - 0.2), (BOARD.bottom + 0.2) / 2, -0.06]} material={materials.wood} castShadow>
            <boxGeometry args={[0.09, BOARD.bottom + 0.2, 0.09]} />
          </mesh>
        ))}
        <mesh position={[0, BOARD.bottom + BOARD.h / 2, 0.002]} material={face}>
          <planeGeometry args={[BOARD.w, BOARD.h]} />
        </mesh>
      </Clickable>
    </group>
  );
}

// --- plaques: women in Philippine science, on the hall's back wall --------------------------

const PLAQUES = [
  { x: -9.4, name: "Honoria Acosta-Sison", years: "1888–1970", line: ["First Filipina physician", "フィリピン初の女性医師"] as [string, string] },
  { x: -6.2, name: "María Y. Orosa", years: "1893–1945", line: ["Food technologist and chemist", "食品技術者・化学者"] as [string, string] },
  { x: 6.2, name: "Fe del Mundo", years: "1911–2011", line: ["First woman National Scientist", "初の女性ナショナル・サイエンティスト"] as [string, string] },
  { x: 9.4, name: "Lourdes J. Cruz", years: "National Scientist" as string, line: ["Biochemist, cone snail venoms", "生化学者、イモガイの毒の研究"] as [string, string] },
];
/** Just proud of the hall's back wall (z = -4, 0.3 m thick), above the wainscot. */
const PLAQUE_Z = -4 + 0.15 + 0.02;

function Plaque({ x, name, years, line }: (typeof PLAQUES)[number]) {
  const lang = useLang();
  const texture = useCanvasTexture(640, 440, (ctx, w, h) => {
    ctx.fillStyle = "#f6efe3";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#b8925a";
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = "#8a6a3a";
    ctx.font = `600 22px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(L("WOMEN IN PHILIPPINE SCIENCE", "フィリピンの科学の女性たち"), w / 2, 70);
    ctx.fillStyle = "#1f2430";
    ctx.font = `700 46px ${FONT}`;
    wrapText(ctx, name, w / 2, 160, w - 90, 52);
    ctx.font = `500 30px ${FONT}`;
    ctx.fillStyle = "#4a4f5c";
    ctx.fillText(years === "National Scientist" ? L(years, "ナショナル・サイエンティスト") : years, w / 2, 290);
    ctx.font = `400 28px ${FONT}`;
    ctx.fillText(L(...line), w / 2, 340);
    ctx.fillStyle = "#8a8f9c";
    ctx.font = `400 20px ${FONT}`;
    ctx.fillText(L("Click to read more", "クリックで詳しく"), w / 2, 400);
  }, [lang]);
  const face = useWashedFace(texture, "hall");
  return (
    <group position={[x, 1.75, PLAQUE_Z]}>
      <Clickable onClick={() => openCard("women")}>
        <mesh position={[0, 0, -0.01]} material={materials.wood}>
          <boxGeometry args={[1.34, 0.94, 0.03]} />
        </mesh>
        <mesh position={[0, 0, 0.007]} material={face}>
          <planeGeometry args={[1.26, 0.86]} />
        </mesh>
      </Clickable>
    </group>
  );
}

// --- the data screen at the front of the classroom -------------------------------------------

const DISPLAY = { width: 5.4, height: 2.3, x: 0, y: 2.05, z: -23.55 };

function drawData(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#0f1626";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.font = `700 56px ${FONT}`;
  ctx.fillText(L("Gender in numbers: the Philippines", "数字で見るジェンダー:フィリピン"), 50, 90);
  ctx.font = `400 28px ${FONT}`;
  ctx.fillStyle = "#b9c3d8";
  ctx.fillText(L("Global Gender Gap Report 2025: 20th of 148 countries, 78.1% of parity, first in Southeast Asia", "グローバル・ジェンダー・ギャップ報告書2025:148か国中20位、平等の78.1%、東南アジアで1位"), 50, 140);
  // Subindex bars, as a share of parity.
  const bars: [string, number][] = [
    [L("Educational attainment", "教育"), 0.988],
    [L("Health and survival", "健康と生存"), 0.967],
    [L("Economic participation", "経済参画"), 0.79],
    [L("Political empowerment", "政治参画"), 0.377],
  ];
  const left = 50, labelW = 380, barW = 900, top = 172, rowH = 62;
  bars.forEach(([label, v], i) => {
    const y = top + i * rowH;
    ctx.fillStyle = "#e6ebf5";
    ctx.font = `500 30px ${FONT}`;
    ctx.fillText(label, left, y + 38);
    ctx.fillStyle = "#26324a";
    roundRect(ctx, left + labelW, y + 10, barW, 40, 10);
    ctx.fill();
    ctx.fillStyle = v < 0.5 ? "#ff8f6b" : "#7aa2ff";
    roundRect(ctx, left + labelW, y + 10, barW * v, 40, 10);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(`${(v * 100).toFixed(1)}%${v === 0.79 ? L(" (about)", "(約)") : ""}`, left + labelW + barW + 20, y + 40);
  });
  // Labor force participation, women and men.
  const y0 = top + bars.length * rowH + 44;
  ctx.fillStyle = "#e6ebf5";
  ctx.font = `600 32px ${FONT}`;
  ctx.fillText(L("In the labor force (2021)", "労働力率(2021年)"), left, y0);
  const lf: [string, number, string][] = [
    [L("Women", "女性"), 0.512, "#c8607a"],
    [L("Men", "男性"), 0.754, "#5b8ad8"],
  ];
  lf.forEach(([label, v, color], i) => {
    const y = y0 + 18 + i * 56;
    ctx.fillStyle = "#e6ebf5";
    ctx.font = `500 30px ${FONT}`;
    ctx.fillText(label, left, y + 34);
    ctx.fillStyle = "#26324a";
    roundRect(ctx, left + labelW, y + 6, barW, 36, 10);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, left + labelW, y + 6, barW * v, 36, 10);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(`${(v * 100).toFixed(1)}%`, left + labelW + barW * v + 16, y + 34);
  });
  ctx.fillStyle = "#8f9bb5";
  ctx.font = `400 22px ${FONT}`;
  ctx.fillText(L("Sources: World Economic Forum (2025), via the Philippine Commission on Women; Philippine Statistics Authority (2024). Click for details.", "出典:世界経済フォーラム(2025、フィリピン女性委員会経由)、フィリピン統計庁(2024)。クリックで詳しく。"), 50, h - 30);
}

function DataScreen() {
  const lang = useLang();
  const texture = useCanvasTexture(1600, Math.round((1600 * DISPLAY.height) / DISPLAY.width), drawData, [lang]);
  return (
    <group position={[DISPLAY.x, DISPLAY.y, DISPLAY.z]}>
      <Clickable onClick={() => openCard("data")}>
        <mesh position={[0, 0, -0.04]} material={materials.dark}>
          <boxGeometry args={[DISPLAY.width + 0.16, DISPLAY.height + 0.16, 0.06]} />
        </mesh>
        <mesh>
          <planeGeometry args={[DISPLAY.width, DISPLAY.height]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      </Clickable>
    </group>
  );
}

// --- podiums for the interactive stations ----------------------------------------------------

interface PodiumSpec {
  card: CardKey;
  title: string;
  prompt: string;
  color: string;
  position: [number, number, number];
  rotationY: number;
}

export const PODIUMS: PodiumSpec[] = [
  { card: "quiz", title: "Is this harassment?", prompt: "Six situations. Decide, then see why.", color: "#3a6fd8", position: [3.4, 0, -21.95], rotationY: 0 },
  { card: "bystander", title: "What would you do?", prompt: "A scenario, and the 5Ds of bystander action.", color: "#c8607a", position: [-6.6, 0, -12.8], rotationY: Math.PI / 2 },
];
/** A lectern: `front` high on the visitor's side (+Z), `back` higher
 *  behind, so its top slopes toward whoever stands at it. */
const PODIUM = { w: 0.8, d: 0.5, front: 0.92, back: 1.1 };
const PODIUM_TILT = Math.atan2(PODIUM.back - PODIUM.front, PODIUM.d);

/** The lectern's body: its side profile run across its width, so the
 *  sloped top is solid wood and the card lies flush on it. */
function usePodiumBody() {
  const geometry = useMemo(() => {
    const half = PODIUM.d / 2;
    // Shape x is -z, so turning the extrusion onto X lands +Z at the front.
    const shape = new THREE.Shape([
      new THREE.Vector2(-half, 0),
      new THREE.Vector2(-half, PODIUM.front),
      new THREE.Vector2(half, PODIUM.back),
      new THREE.Vector2(half, 0),
    ]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: PODIUM.w, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    g.translate(-PODIUM.w / 2, 0, 0);
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

function Podium(p: PodiumSpec) {
  const lang = useLang();
  const texture = useCanvasTexture(800, 500, (ctx, w, h) => {
    ctx.fillStyle = "#101828";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = p.color;
    ctx.fillRect(0, 0, w, 16);
    ctx.fillStyle = "#fff";
    ctx.font = `700 54px ${FONT}`;
    wrapText(ctx, p.card === "quiz" ? L(p.title, "これはハラスメント?") : L(p.title, "あなたならどうする?"), 40, 110, w - 80, 60);
    ctx.fillStyle = "#c6cfe0";
    ctx.font = `400 32px ${FONT}`;
    wrapText(ctx, p.card === "quiz" ? L(p.prompt, "6つの場面。考えてから、理由を見てみよう。") : L(p.prompt, "ある場面と、傍観者の行動の5つのD。"), 40, 260, w - 80, 42);
    ctx.fillStyle = p.color;
    roundRect(ctx, 40, h - 110, 300, 70, 35);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `600 32px ${FONT}`;
    ctx.fillText(L("Click to start", "クリックしてはじめる"), 76, h - 63);
  }, [lang]);
  const body = usePodiumBody();
  // The card fits the sloped top, with a small margin of wood round it.
  const cardW = PODIUM.w - 0.08;
  const cardH = Math.min(cardW * 0.625, Math.hypot(PODIUM.d, PODIUM.back - PODIUM.front) - 0.06);
  return (
    <group position={p.position} rotation={[0, p.rotationY, 0]}>
      <Clickable onClick={() => openCard(p.card)}>
        <mesh geometry={body} material={materials.wood} castShadow receiveShadow />
        {/* The card, on the top, facing whoever stands on the +Z side. */}
        <mesh position={[0, (PODIUM.front + PODIUM.back) / 2 + 0.004, 0]} rotation={[-Math.PI / 2 + PODIUM_TILT, 0, 0]}>
          <planeGeometry args={[cardW, cardH]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      </Clickable>
    </group>
  );
}

// --- Kanlungan, the refuge mat -----------------------------------------------------------------

function Refuge() {
  const lanterns = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffd9a0", toneMapped: false }), []);
  return (
    <group position={[REFUGE_SPOT[0], 0, REFUGE_SPOT[2]]}>
      <Clickable onClick={() => openCard("refuge")}>
        <mesh position={[0, 0.03, 0]} material={materials.matEdge} receiveShadow>
          <cylinderGeometry args={[1.75, 1.75, 0.05, 40]} />
        </mesh>
        <mesh position={[0, 0.06, 0]} material={materials.mat} receiveShadow>
          <cylinderGeometry args={[1.6, 1.6, 0.04, 40]} />
        </mesh>
      </Clickable>
      {/* Small lanterns round the mat's edge: unlit and cheap, a glow only. */}
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 1.95, 0.18, Math.sin(a) * 1.95]} material={lanterns}>
            <sphereGeometry args={[0.09, 10, 8]} />
          </mesh>
        );
      })}
    </group>
  );
}

export function Exhibits() {
  return (
    <>
      {BOARDS.map((b) => (
        <Board key={b.card} {...b} />
      ))}
      {PLAQUES.map((p) => (
        <Plaque key={p.name} {...p} />
      ))}
      <DataScreen />
      {PODIUMS.map((p) => (
        <Podium key={p.card} {...p} />
      ))}
      <Refuge />
    </>
  );
}

/** Collision for what a visitor can walk into. The mat and plaques have none. */
export function exhibitObstacles(): Obstacle[] {
  return [
    ...BOARDS.map((b) => ({ x: b.position[0], z: b.position[2], halfX: BOARD.w / 2 + 0.06, halfZ: 0.15, rotationY: b.rotationY })),
    ...PODIUMS.map((p) => ({ x: p.position[0], z: p.position[2], halfX: PODIUM.w / 2, halfZ: PODIUM.d / 2, rotationY: p.rotationY })),
  ];
}
