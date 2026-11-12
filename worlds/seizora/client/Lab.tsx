// The perovskite lab bench, at the back of the classroom: design a cell
// (absorber, electron and hole layers, seal, and where it's mounted) and
// see its efficiency, cost, a year's yield in Philippine sun, and how fast
// it fades. Each visitor's design is their own; nothing here is shared.
import { useMemo, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { ABSORBERS, ENCAPSULATION, ETLS, evaluateDesign, HTLS, MOUNTS, type LabDesign, type LabResult } from "../sim/energy";
import { openInfo } from "./InfoCard";
import { FONT, fmt, GlowLines, roundRect, standard, useCanvasTexture, useMerged, useNightLift, wrapText, type BoxSpec } from "./kit";
import { SITE } from "./live";
import { L, useLang } from "../../../src/i18n/lang";

export const LAB = { x: -5.6, z: -12.6, width: 2.4, depth: 0.8, height: 0.8 };

type Field = keyof LabDesign;
/** The options' names in Japanese, where they aren't just chemistry. */
const OPTION_JA: Record<string, string> = {
  "FA–Cs mixed cation (1.55 eV)": "FA–Cs混合カチオン(1.55 eV)",
  "Wide-gap for tandems (1.68 eV)": "タンデム用ワイドギャップ(1.68 eV)",
  "TiO₂ (mesoporous)": "TiO₂(メソポーラス)",
  "NiOₓ (inorganic)": "NiOₓ(無機)",
  "None (lab cell)": "なし(研究用セル)",
  "Edge seal": "端面封止",
  "Glass-glass with edge seal": "ガラス2枚+端面封止",
  "Rooftop, 15° south": "屋根、南向き15°",
  "Building facade, facing east": "建物の壁面、東向き",
  "Transit-shelter canopy, 5°": "バス停の屋根、5°",
};
const ja = (label: string) => L(label, OPTION_JA[label] ?? label);

const OPTIONS: Record<Field, { title: string; values: string[]; label: (v: string) => string }> = {
  absorber: { title: "ABSORBER", values: Object.keys(ABSORBERS), label: (v) => ja(ABSORBERS[v as keyof typeof ABSORBERS].label) },
  etl: { title: "ELECTRON LAYER", values: Object.keys(ETLS), label: (v) => ja(ETLS[v as keyof typeof ETLS].label) },
  htl: { title: "HOLE LAYER", values: Object.keys(HTLS), label: (v) => ja(HTLS[v as keyof typeof HTLS].label) },
  encapsulation: { title: "SEAL", values: Object.keys(ENCAPSULATION), label: (v) => ja(ENCAPSULATION[v as keyof typeof ENCAPSULATION].label) },
  mount: { title: "MOUNTED ON", values: Object.keys(MOUNTS), label: (v) => ja(MOUNTS[v as keyof typeof MOUNTS].label) },
};
const TITLE_JA: Record<string, string> = {
  ABSORBER: "吸収層",
  "ELECTRON LAYER": "電子輸送層",
  "HOLE LAYER": "正孔輸送層",
  SEAL: "封止",
  "MOUNTED ON": "設置場所",
};
const FIELDS = Object.keys(OPTIONS) as Field[];

function lifetime(months: number): string {
  if (months >= 300) return L("25+ years", "25年以上");
  if (months < 12) return L(`${months} months`, `${months}か月`);
  const y = Math.floor(months / 12), m = months % 12;
  return m ? L(`${y} y ${m} m`, `${y}年${m}か月`) : L(`${y} years`, `${y}年`);
}

function verdict(r: LabResult, d: LabDesign): string {
  if (r.t80Months < 6)
    return L(
      "Fades within months in this heat and humidity. A better seal, or a more stable hole layer, would help most.",
      "この暑さと湿度では数か月で衰えます。よりよい封止か、より安定した正孔輸送層がいちばん効きます。"
    );
  if (r.t80Months < 36)
    return L(
      "Promising, but it won't last a rooftop's life yet. Stability is perovskite's main problem, not efficiency.",
      "有望ですが、まだ屋根の寿命ほどはもちません。ペロブスカイトの一番の課題は効率ではなく安定性です。"
    );
  if (d.mount === "facade")
    return L(
      "A wall facing east sees the morning sun only, so it yields less, but there's far more wall than roof in a city.",
      "東向きの壁は朝日しか受けないので発電は少なめですが、都市には屋根よりずっと多くの壁があります。"
    );
  if (r.costIndex > 1.6) return L("Long-lived and efficient, but expensive. Cheaper layers trade some of that away.", "長持ちで効率もよいけれど、高価です。安い層にすると、その一部と引き換えになります。");
  return L("A good all-rounder for a Philippine rooftop. Compare its yield with the facade and the shelter.", "フィリピンの屋根にはバランスのよい設計です。壁面やバス停の屋根での発電量と比べてみましょう。");
}

// --- the bench's display -------------------------------------------------------------------

const SCREEN = { w: 1.9, h: 1.0, bottom: 0.92 };
/** The bench top's outline and the screen housing's. */
const LAB_GLOW: BoxSpec[] = [
  { size: [LAB.width, 0.04, LAB.depth], at: [0, LAB.height - 0.02, 0] },
  { size: [SCREEN.w + 0.1, SCREEN.h + 0.1, 0.05], at: [0, SCREEN.bottom + SCREEN.h / 2, -LAB.depth / 2 + 0.1] },
];

function drawResults(ctx: CanvasRenderingContext2D, w: number, h: number, d: LabDesign, r: LabResult) {
  ctx.fillStyle = "#101522";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#3a1e14";
  ctx.fillRect(0, 0, w, 70);
  ctx.fillStyle = "#ffd2b0";
  ctx.font = `700 34px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText(L("PEROVSKITE LAB · design a cell", "ペロブスカイト・ラボ · セルを設計しよう"), 26, 36);
  ctx.textAlign = "right";
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText(L(`in ${SITE.label} weather`, `${SITE.labelJa}の天気で`), w - 26, 36);
  ctx.textAlign = "left";

  const tiles: [string, string][] = [
    [L("Efficiency", "効率"), `${fmt(r.efficiency * 100, 1)}%`],
    [L("Cost index", "コスト指数"), `${fmt(r.costIndex, 2)}×`],
    [L("Year-one yield", "1年目の発電量"), `${fmt(r.yieldKwhPerKwp, 0)} kWh/kWp`],
    [L("Until 80% output", "出力80%まで"), lifetime(r.t80Months)],
  ];
  const tw = (w - 52 - 3 * 14) / 4;
  tiles.forEach(([k, v], i) => {
    const x = 26 + i * (tw + 14);
    roundRect(ctx, x, 92, tw, 120, 12);
    ctx.fillStyle = "#1b2336";
    ctx.fill();
    ctx.fillStyle = "#9fb0d6";
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(k, x + 16, 122);
    ctx.fillStyle = "#fff";
    ctx.font = `700 36px ${FONT}`;
    ctx.fillText(v, x + 16, 176);
  });

  // The first year's fade.
  const gx = 26, gy = 240, gw = w - 52, gh = 170;
  roundRect(ctx, gx, gy, gw, gh, 12);
  ctx.fillStyle = "#151c2c";
  ctx.fill();
  ctx.fillStyle = "#9fb0d6";
  ctx.font = `500 20px ${FONT}`;
  ctx.fillText(L("Output over the first year (100% at the top, 80% dashed)", "最初の1年の出力(上端が100%、破線が80%)"), gx + 14, gy + 22);
  const yAt = (v: number) => gy + 40 + (1 - (v - 0.6) / 0.4) * (gh - 56);
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = "#ffb347";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(gx + 10, yAt(0.8));
  ctx.lineTo(gx + gw - 10, yAt(0.8));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "#d0763f";
  ctx.lineWidth = 5;
  ctx.beginPath();
  [1, ...r.monthlyHealth].forEach((v, i) => ctx.lineTo(gx + 10 + (i / 12) * (gw - 20), yAt(Math.max(0.6, v))));
  ctx.stroke();

  ctx.fillStyle = "#e8ecf6";
  ctx.font = `500 25px ${FONT}`;
  ctx.textBaseline = "alphabetic";
  wrapText(ctx, verdict(r, d), 26, gy + gh + 44, w - 52, 32);
  ctx.fillStyle = "#6a7590";
  ctx.font = `400 18px ${FONT}`;
  ctx.fillText(L("Illustrative figures from a learning model, not measured cells.", "学習用モデルによる目安の数字で、実測したセルではありません。"), 26, h - 20);
}

// --- the selectors on the bench top --------------------------------------------------------

const TOP_W = 1536, TOP_H = 420;

function drawSelectors(ctx: CanvasRenderingContext2D, w: number, h: number, d: LabDesign, hovered: number) {
  ctx.fillStyle = "#2a2420";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffd2b0";
  ctx.font = `700 28px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText(L("Click a part to change it", "部品をクリックして変えてみよう"), 24, 32);
  const cw = (w - 48 - 4 * 12) / FIELDS.length;
  FIELDS.forEach((field, i) => {
    const x = 24 + i * (cw + 12), y = 64, ch = h - 88;
    roundRect(ctx, x, y, cw, ch, 14);
    ctx.fillStyle = i === hovered ? "#4a3a30" : "#3a302a";
    ctx.fill();
    ctx.strokeStyle = "#d0763f";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#e9b48f";
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(L(OPTIONS[field].title, TITLE_JA[OPTIONS[field].title] ?? OPTIONS[field].title), x + 16, y + 30);
    ctx.fillStyle = "#fff";
    ctx.font = `600 26px ${FONT}`;
    ctx.textBaseline = "alphabetic";
    wrapText(ctx, OPTIONS[field].label(d[field]), x + 16, y + 92, cw - 32, 32);
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e9b48f";
    ctx.font = `500 20px ${FONT}`;
    const k = OPTIONS[field].values.indexOf(d[field]) + 1;
    ctx.fillText(`${k} of ${OPTIONS[field].values.length} · next ▸`, x + 16, y + ch - 26);
  });
}

export function LabBench() {
  const lang = useLang();
  const [design, setDesign] = useState<LabDesign>({ absorber: "mapi", etl: "sno2", htl: "spiro", encapsulation: "glass", mount: "roof" });
  const [hovered, setHovered] = useState(-1);
  const result = useMemo(() => evaluateDesign(design, SITE), [design]);
  const screen = useCanvasTexture(1520, 800, (ctx, w, h) => drawResults(ctx, w, h, design, result), { deps: [design, result, lang] });
  const top = useCanvasTexture(TOP_W, TOP_H, (ctx, w, h) => drawSelectors(ctx, w, h, design, hovered), { deps: [design, hovered, lang] });
  const legs = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ size: [0.06, LAB.height - 0.04, 0.06], at: [sx * (LAB.width / 2 - 0.08), (LAB.height - 0.04) / 2, sz * (LAB.depth / 2 - 0.08)] })));
  const frame = useMerged([
    { size: [LAB.width, 0.04, LAB.depth], at: [0, LAB.height - 0.02, 0] },
    ...(legs as { size: [number, number, number]; at: [number, number, number] }[]),
    // The screen's housing and its stand, on the bench's back edge.
    { size: [SCREEN.w + 0.1, SCREEN.h + 0.1, 0.05], at: [0, SCREEN.bottom + SCREEN.h / 2, -LAB.depth / 2 + 0.1] },
    { size: [0.12, SCREEN.bottom - LAB.height, 0.08], at: [0, (SCREEN.bottom + LAB.height) / 2, -LAB.depth / 2 + 0.12] },
  ]);
  const material = useMemo(() => standard("#5a4636", 0.7, 0.05), []);
  useNightLift("classroom", [material], 0.35);
  const column = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!event.uv) return -1;
    const x = event.uv.x * TOP_W, y = (1 - event.uv.y) * TOP_H;
    if (y < 64) return -1;
    const cw = (TOP_W - 48 - 4 * 12) / FIELDS.length;
    const i = Math.floor((x - 24) / (cw + 12));
    return i >= 0 && i < FIELDS.length ? i : -1;
  };
  return (
    // Turned to face the room: the screen toward the desks, and the
    // operator standing on the room side, looking toward the back wall.
    <group position={[LAB.x, 0, LAB.z]} rotation={[0, Math.PI, 0]}>
      <mesh geometry={frame} material={material} castShadow receiveShadow />
      <GlowLines boxes={LAB_GLOW} color="#7cff9e" zone="classroom" thickness={0.018} />
      <mesh
        position={[0, SCREEN.bottom + SCREEN.h / 2, -LAB.depth / 2 + 0.13]}
        onClick={(event) => {
          event.stopPropagation();
          openInfo("degradation");
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <planeGeometry args={[SCREEN.w, SCREEN.h]} />
        <meshBasicMaterial map={screen} toneMapped={false} />
      </mesh>
      <mesh
        position={[0, LAB.height + 0.003, 0.07]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(event) => {
          event.stopPropagation();
          const i = column(event);
          if (i < 0) return;
          const field = FIELDS[i];
          const values = OPTIONS[field].values;
          setDesign((d) => ({ ...d, [field]: values[(values.indexOf(d[field]) + 1) % values.length] }));
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerMove={(event) => {
          const i = column(event);
          if (i !== hovered) setHovered(i);
          document.body.style.cursor = i >= 0 ? "pointer" : "";
        }}
        onPointerOut={() => {
          setHovered(-1);
          document.body.style.cursor = "";
        }}
      >
        <planeGeometry args={[LAB.width - 0.1, (LAB.width - 0.1) * (TOP_H / TOP_W)]} />
        <meshBasicMaterial map={top} toneMapped={false} />
      </mesh>
    </group>
  );
}
