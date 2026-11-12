// Seilaya inside a headset. Seiza's flat-screen HUD (and so Hud.tsx) isn't
// visible in VR, so the safety tools, request prompts, refuge banner, and
// station cards are drawn here as panels in the world, pointed at with a
// controller ray (or a hand) and pressed with the trigger or a pinch.
//
// - A small L("Safety", "安全") chip floats low on the left of your view and follows
//   you; press it to open the safety panel in front of you.
// - A request appears in front of you, with Yes and No thanks.
// - Station cards (and the code of conduct, if not yet agreed) open in
//   front of you; the quiz and the bystander scenario work here too.
//
// Panels stay put until you turn well away from them, then drift back in
// front, so reading never means chasing a panel. They read the same safety
// store as the flat HUD, so the two can never disagree. Nothing here runs
// outside a headset session.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import * as THREE from "three";
import { trackingStore } from "../../../src/xr/body/trackingStore";
import { LazyYaw, registerGazeTarget } from "../../../src/xr/hud/gaze";
import { answerTogether, getTogether, setAllowRequests, useTogether } from "../../../src/interactions/together";
import { bystander, card as cardText, helpContacts, quiz as quizItems } from "./info";
import { REFERENCES } from "./references";
import {
  ask,
  block,
  BUBBLE_CHOICES,
  cannotAsk,
  isFacilitator,
  nameOf,
  openCard,
  others,
  PRONOUNS,
  REACH,
  returnFromRefuge,
  ROOM_KEYS,
  roomSettings,
  setRoom,
  showToEveryone,
  state,
  stepOut,
  TOGETHER,
  unblock,
  updateSettings,
  useSafety,
  type CardKey,
} from "./safety";
import { getLang, L, useLang } from "../../../src/i18n/lang";
import { togetherAskLine, togetherLabel } from "../../../src/interactions/together";

export function XrSafety() {
  useLang();
  const session = useXR((s) => s.session);
  // ?seilayaXrPreview draws the headset panels on a flat screen too, placed
  // from the ordinary camera, to check them without a headset.
  const preview = useMemo(() => typeof location !== "undefined" && new URLSearchParams(location.search).has("seilayaXrPreview"), []);
  return session || preview ? <XrPanels /> : null;
}

// --- drawing ---------------------------------------------------------------------------------

const PX = 1000; // canvas width in pixels
const MAX_H = 2400; // tallest a panel's canvas can be
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const GOLD = "#e8c37a";

interface Button {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  active?: boolean;
  disabled?: boolean;
  primary?: boolean;
  /** Takes the panel's whole width (the dock's one button). */
  fill?: boolean;
  onPress: () => void;
}

/** Lays out a panel top to bottom: text, headings, and rows of buttons. */
class Painter {
  y: number;
  buttons: Button[] = [];
  constructor(
    private ctx: CanvasRenderingContext2D,
    private canvasWidth = PX,
    private pad = 40
  ) {
    this.y = pad;
  }
  private get width() {
    return this.canvasWidth - this.pad * 2;
  }
  title(text: string) {
    // Wrapped like body text, so a long title can't run past the edge.
    this.text(text, 46, "#fff", 700);
    this.y += 6;
  }
  heading(text: string) {
    this.y += 14;
    this.ctx.fillStyle = GOLD;
    this.ctx.font = `600 26px ${FONT}`;
    this.ctx.fillText(text.toUpperCase(), this.pad, this.y + 24);
    this.y += 40;
  }
  text(text: string, size = 30, color = "rgba(255,255,255,0.86)", weight = 400) {
    this.ctx.fillStyle = color;
    this.ctx.font = `${weight} ${size}px ${FONT}`;
    const lineHeight = Math.round(size * 1.35);
    // A word wider than the panel (a long link, say) is cut into pieces
    // that fit, rather than running past the edge.
    const words: string[] = [];
    for (const word of text.split(" ")) {
      let rest = word;
      while (rest.length > 1 && this.ctx.measureText(rest).width > this.width) {
        let cut = rest.length - 1;
        while (cut > 1 && this.ctx.measureText(rest.slice(0, cut)).width > this.width) cut--;
        words.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      words.push(rest);
    }
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (this.ctx.measureText(test).width > this.width && line) {
        this.ctx.fillText(line, this.pad, this.y + size);
        this.y += lineHeight;
        line = word;
      } else line = test;
    }
    if (line) {
      this.ctx.fillText(line, this.pad, this.y + size);
      this.y += lineHeight;
    }
    this.y += 8;
  }
  /** A row of buttons, wrapping onto more rows as needed. */
  row(buttons: Omit<Button, "x" | "y" | "w" | "h">[], height = 72) {
    this.ctx.font = `600 30px ${FONT}`;
    let x = this.pad;
    for (const original of buttons) {
      // A label too long for the panel is cut short with an ellipsis.
      let label = original.label;
      while (label.length > 2 && this.ctx.measureText(label).width + 56 > this.width) label = `${label.slice(0, -2)}…`;
      const b = { ...original, label };
      const w = b.fill ? this.width : Math.min(this.width, this.ctx.measureText(b.label).width + 56);
      if (x + w > this.canvasWidth - this.pad && x > this.pad) {
        x = this.pad;
        this.y += height + 14;
      }
      const button = { ...b, x, y: this.y, w, h: height };
      this.drawButton(button);
      this.buttons.push(button);
      x += w + 14;
    }
    this.y += height + 18;
  }
  private drawButton(b: Button) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, b.h / 2);
    ctx.fillStyle = b.primary ? GOLD : b.active ? "rgba(124,255,158,0.3)" : "rgba(255,255,255,0.12)";
    ctx.fill();
    ctx.strokeStyle = b.active ? "rgba(124,255,158,0.7)" : "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = b.primary ? "#2a1d08" : b.disabled ? "rgba(255,255,255,0.35)" : "#fff";
    ctx.font = `600 30px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
  divider() {
    this.y += 8;
    this.ctx.fillStyle = "rgba(255,255,255,0.1)";
    this.ctx.fillRect(this.pad, this.y, this.width, 2);
    this.y += 12;
  }
}

type Paint = (p: Painter) => void;

// --- a panel -----------------------------------------------------------------------------------

type Placement = "dock" | "front" | "low-front";

/**
 * One panel: a canvas texture on a plane, laid out by `paint`, redrawn
 * whenever `signature` changes, and placed relative to the head. A press
 * lands on release, and only on the button it started on.
 */
function XrPanel({
  widthM,
  paint,
  signature,
  placement,
  canvasWidth = PX,
  pad = 40,
}: {
  widthM: number;
  paint: Paint;
  signature: string;
  placement: Placement;
  /** The canvas's width in pixels: a small button (the dock) gets a small
   *  canvas, so its one button fills it instead of a corner of a strip. */
  canvasWidth?: number;
  pad?: number;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const layout = useRef<{ height: number; buttons: Button[] }>({ height: 100, buttons: [] });
  const pressed = useRef<Button | null>(null);
  const placed = useRef(false);
  const paintRef = useRef(paint);
  paintRef.current = paint;

  const { texture, canvas } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = MAX_H;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return { texture, canvas };
    // The canvas is made once per panel; its width never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false }), [texture]);
  useEffect(
    () => () => {
      texture.dispose();
      material.dispose();
    },
    [texture, material]
  );

  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasWidth, MAX_H);
    // Measure first, then draw the background under the content.
    const measure = new Painter(ctx, canvasWidth, pad);
    ctx.save();
    ctx.globalAlpha = 0;
    paintRef.current(measure);
    ctx.restore();
    const height = Math.min(MAX_H, Math.ceil(measure.y + pad - 18));
    ctx.clearRect(0, 0, canvasWidth, MAX_H);
    ctx.beginPath();
    ctx.roundRect(0, 0, canvasWidth, height, Math.min(36, height / 2));
    ctx.fillStyle = "rgba(18,18,24,0.94)";
    ctx.fill();
    const painter = new Painter(ctx, canvasWidth, pad);
    paintRef.current(painter);
    layout.current = { height, buttons: painter.buttons };
    // Show only the used part of the canvas.
    texture.repeat.set(1, height / MAX_H);
    texture.offset.set(0, 1 - height / MAX_H);
    texture.needsUpdate = true;
    if (mesh.current) mesh.current.scale.set(widthM, (widthM * height) / canvasWidth, 1);
  }, [signature, canvas, texture, widthM]);

  const goal = useMemo(() => new THREE.Vector3(), []);
  const dockYaw = useMemo(() => new LazyYaw(), []);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const side = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }, delta) => {
    const m = mesh.current;
    if (!m) return;
    // In a session, the head as Seiza tracks it; in the flat-screen preview,
    // the camera.
    const world = trackingStore.getLocalWorld();
    const head = world ? world.head.position : camera.position;
    const headQuaternion = world ? world.head.quaternion : camera.quaternion;
    forward.set(0, 0, -1).applyQuaternion(headQuaternion).setY(0);
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    if (placement === "dock") {
      // Low on the left, a glance away. Anchored to a yaw that only
      // follows once you've turned well away (Seiza's LazyYaw), so in a
      // phone viewer you can turn your head to look at it and select it.
      const yaw = dockYaw.update(Math.atan2(-forward.x, -forward.z), delta);
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      side.set(forward.z, 0, -forward.x); // left of forward
      goal.copy(head).addScaledVector(forward, 0.5).addScaledVector(side, 0.28);
      goal.y -= 0.36;
    } else {
      goal.copy(head).addScaledVector(forward, placement === "front" ? 0.75 : 0.6);
      goal.y -= placement === "front" ? 0.08 : 0.2;
      // A tall panel is raised so its bottom edge stays above the Safety
      // and Menu buttons low in view: with gaze, whatever is nearest under
      // the centre of view is selected, so a panel covering them would
      // make them (and the buttons beneath them) unreachable.
      const heightM = (widthM * layout.current.height) / canvasWidth;
      goal.y += Math.max(0, heightM / 2 - (placement === "front" ? 0.2 : 0.1));
    }
    if (!placed.current) {
      m.position.copy(goal);
      placed.current = true;
    } else if (placement === "dock") {
      m.position.copy(goal);
    } else if (m.position.distanceTo(goal) > 0.45) {
      // Stay put until you've turned well away, then glide back in front.
      m.position.lerp(goal, 1 - Math.exp(-delta * 2.5));
    }
    m.lookAt(head);
  });

  const toCanvas = (event: ThreeEvent<PointerEvent>) => (event.uv ? { x: event.uv.x * canvasWidth, y: (1 - event.uv.y) * layout.current.height } : null);
  const buttonAt = (x: number, y: number) =>
    layout.current.buttons.find((b) => !b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) ?? null;
  const hit = (event: ThreeEvent<PointerEvent>) => {
    const point = toCanvas(event);
    return point ? buttonAt(point.x, point.y) : null;
  };
  // Selectable by gaze too, in a phone viewer (Seiza's gaze.ts). Buttons
  // are told apart by position, since labels can repeat across rows.
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const at = (uv: THREE.Vector2) => buttonAt(uv.x * canvasWidth, (1 - uv.y) * layout.current.height);
    return registerGazeTarget(m, {
      keyAt: (uv) => {
        const b = at(uv);
        return b ? `${b.x},${b.y}` : null;
      },
      select: (uv) => at(uv)?.onPress(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <mesh
      ref={mesh}
      material={material}
      renderOrder={20}
      onPointerDown={(event) => {
        event.stopPropagation();
        pressed.current = hit(event);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        const start = pressed.current;
        pressed.current = null;
        const end = hit(event);
        if (start && end && start === end) start.onPress();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

// --- the panels ------------------------------------------------------------------------------

function XrPanels() {
  const s = useSafety();
  // Requests are Seiza's (src/interactions/together.ts); shown here too,
  // since the flat prompt isn't visible in a headset.
  const t = useTogether();
  // Everything the panels show, so they redraw only when it changes.
  const room = roomSettings();
  const people = others();
  const base = JSON.stringify([
    getLang(),
    s.settings,
    [...s.blocked],
    s.nearby,
    s.inRefuge,
    [...s.pronouns],
    t.incoming.map((r) => r.id),
    t.outgoing?.id ?? null,
    t.allow,
    s.notices.map((n) => n.id),
    s.panelOpen,
    s.card,
    room,
    people,
    isFacilitator(),
  ]);
  const gate = !s.settings.agreed;
  const card: CardKey | null = gate ? "conduct" : s.card;
  return (
    <>
      <XrPanel widthM={0.12} canvasWidth={220} pad={14} placement="dock" signature={`dock:${getLang()}:${t.incoming.length}:${s.panelOpen}:${s.inRefuge}`} paint={paintDock} />
      {s.panelOpen && !card && <XrPanel widthM={0.62} placement="front" signature={base} paint={paintSafety} />}
      {t.incoming[0] && !s.inRefuge && !card && <XrPanel widthM={0.5} placement="low-front" signature={base} paint={paintPrompt} />}
      {s.inRefuge && !card && !s.panelOpen && <XrPanel widthM={0.55} placement="low-front" signature={base} paint={paintRefuge} />}
      {s.notices.length > 0 && !card && !s.panelOpen && !t.incoming[0] && <XrPanel widthM={0.5} placement="low-front" signature={base} paint={paintNotices} />}
      {card && <XrCard card={card} gate={gate} signature={base} />}
    </>
  );
}

const togglePanel = () => {
  state.panelOpen = !state.panelOpen;
  openCard(state.card);
};

const paintDock: Paint = (p) => {
  p.row([{ label: getTogether().incoming.length ? `${L("Safety", "安全")}  •` : L("Safety", "安全"), active: state.panelOpen, fill: true, onPress: togglePanel }], 96);
};

const paintSafety: Paint = (p) => {
  const room = roomSettings();
  p.title(L("Your safety tools", "あなたの安全の機能"));
  if (room.notice) p.text(`Facilitator: ${room.notice}`, 28, GOLD, 600);
  p.text(L("Only you see these choices. Nothing is recorded.", "この選択はあなたにしか見えません。何も記録されません。"), 26, "rgba(255,255,255,0.6)");
  p.heading(L("Personal space", "パーソナルスペース"));
  p.row(
    BUBBLE_CHOICES.map((r) => ({
      label: r === 0 ? L("Off", "オフ") : `${r} m`,
      active: Math.max(state.settings.bubble, room.minSpace) === r,
      disabled: r < room.minSpace,
      onPress: () => updateSettings({ bubble: r }),
    }))
  );
  p.heading(L("Handshakes, hugs, dances, and more", "握手、ハグ、ダンスなど"));
  p.row([
    { label: L("Others may ask me", "頼まれてもいい"), active: getTogether().allow, onPress: () => setAllowRequests(true) },
    { label: L("No requests", "リクエストを受けない"), active: !getTogether().allow, onPress: () => setAllowRequests(false) },
  ]);
  if (room.paused) p.text(L("The facilitator has paused requests for now.", "ファシリテーターが今はリクエストを止めています。"), 26, "rgba(255,255,255,0.6)");
  else if (state.nearby.length === 0) p.text(L(`Stand within ${REACH} m of someone to ask them.`, `頼みたい人の${REACH} m以内に立ちましょう。`), 26, "rgba(255,255,255,0.6)");
  for (const id of state.nearby.slice(0, 2)) {
    p.text(`Ask ${nameOf(id)} for`, 28);
    p.row(TOGETHER.map((t) => ({ label: togetherLabel(t.name), disabled: !!cannotAsk(id), onPress: () => ask(id, t.name) })));
  }
  p.heading(L("People here", "ここにいる人"));
  const people = others();
  if (people.length === 0) p.text(L("Nobody else is here right now.", "今はほかに誰もいません。"), 26, "rgba(255,255,255,0.6)");
  for (const id of people.slice(0, 5)) {
    const pronouns = state.pronouns.get(id);
    p.text(`${nameOf(id)}${pronouns ? ` (${pronouns})` : ""}`, 28);
    p.row([state.blocked.has(id) ? { label: L("Unblock", "ブロック解除"), active: true, onPress: () => unblock(id) } : { label: L("Block", "ブロック"), onPress: () => block(id) }], 60);
  }
  p.heading(L("Your pronouns", "あなたの代名詞"));
  p.row(["", ...PRONOUNS].map((v) => ({ label: v || L("None", "なし"), active: state.settings.pronouns === v, onPress: () => updateSettings({ pronouns: v }) })));
  p.divider();
  p.row([
    state.inRefuge ? { label: L("Return to where I was", "元の場所に戻る"), primary: true, onPress: () => returnFromRefuge(true) } : { label: L("Step out to Kanlungan", "カンルンガンへ一時退避"), primary: true, onPress: stepOut },
    { label: L("If something happened", "何かあったときは"), onPress: () => openCard("help") },
    { label: L("Code of conduct", "行動規範"), onPress: () => openCard("conduct") },
  ]);
  if (isFacilitator()) {
    p.heading(L("Facilitator", "ファシリテーター"));
    p.row([{ label: room.paused ? L("Resume requests", "リクエストを再開") : L("Pause requests for everyone", "全員のリクエストを止める"), active: room.paused, onPress: () => setRoom(ROOM_KEYS.paused, !room.paused) }]);
    p.text(L("Minimum personal space for everyone", "全員の最小パーソナルスペース"), 26);
    p.row(BUBBLE_CHOICES.map((r) => ({ label: r === 0 ? L("None", "なし") : `${r} m`, active: room.minSpace === r, onPress: () => setRoom(ROOM_KEYS.minSpace, r) })));
  }
  p.row([{ label: L("Close", "閉じる"), onPress: togglePanel }]);
};

const paintPrompt: Paint = (p) => {
  const request = getTogether().incoming[0];
  if (!request) return;
  p.text(`${togetherAskLine(nameOf(request.peer), request.gesture)}${L(".", "。")}`, 36, "#fff", 600);
  p.row([
    { label: L("Yes", "はい"), primary: true, onPress: () => answerTogether(request.id, true) },
    { label: L("No thanks", "遠慮します"), onPress: () => answerTogether(request.id, false) },
  ], 84);
  p.text(L("No answer means no.", "返事がなければ「いいえ」です。"), 24, "rgba(255,255,255,0.55)");
};

const paintRefuge: Paint = (p) => {
  p.text("You've stepped out to Kanlungan.", 34, "#fff", 700);
  p.text(L("You won't see or hear anyone, and nobody can ask you for anything, until you return.", "戻るまで、誰も見えず聞こえず、誰もあなたに何かを頼めません。"), 26);
  p.row([
    { label: L("Return to where I was", "元の場所に戻る"), primary: true, onPress: () => returnFromRefuge(true) },
    { label: L("Stay here, but rejoin", "ここにいたまま、戻る"), onPress: () => returnFromRefuge(false) },
  ]);
};

const paintNotices: Paint = (p) => {
  for (const n of state.notices) p.text(n.text, 28, "#fff");
};

// --- cards ---------------------------------------------------------------------------------------

function XrCard({ card, gate, signature }: { card: CardKey; gate: boolean; signature: string }) {
  const [quiz, setQuiz] = useState({ index: 0, picked: null as boolean | null, score: 0 });
  const [choice, setChoice] = useState<number | null>(null);
  useEffect(() => {
    setQuiz({ index: 0, picked: null, score: 0 });
    setChoice(null);
  }, [card]);
  const close = () => openCard(null);

  const paint: Paint = (p) => {
    const QUIZ = quizItems();
    const BYSTANDER = bystander();
    if (card === "quiz") {
      p.title(L("Is this harassment?", "これはハラスメント?"));
      if (quiz.index >= QUIZ.length) {
        p.text(L(`You matched ${quiz.score} of ${QUIZ.length}. Was it wanted? Did everyone agree?`, `${QUIZ.length}問中${quiz.score}問が一致。望まれていた?全員が同意していた?`), 32, "#fff");
        p.text(L("Following the Safe Spaces Act (RA 11313). Not legal advice.", "セーフスペース法(共和国法11313号)にもとづいています。法的な助言ではありません。"), 24, "rgba(255,255,255,0.55)");
        p.row([{ label: L("Try again", "もう一度"), onPress: () => setQuiz({ index: 0, picked: null, score: 0 }) }, { label: L("Close", "閉じる"), onPress: close }]);
        return;
      }
      const item = QUIZ[quiz.index];
      p.text(`${quiz.index + 1} / ${QUIZ.length}`, 24, "rgba(255,255,255,0.55)");
      p.text(item.situation, 32, "#fff");
      const pick = (v: boolean) => quiz.picked === null && setQuiz((q) => ({ ...q, picked: v, score: q.score + (v === item.harassment ? 1 : 0) }));
      p.row([
        { label: L("Harassment", "ハラスメント"), active: quiz.picked === true, onPress: () => pick(true) },
        { label: L("Not harassment", "ハラスメントではない"), active: quiz.picked === false, onPress: () => pick(false) },
      ]);
      if (quiz.picked !== null) {
        p.text(`${item.harassment ? "Harassment." : "Not harassment."} ${item.why}`, 28, quiz.picked === item.harassment ? "#9dffb4" : "#ffc58f");
        p.row([{ label: quiz.index + 1 < QUIZ.length ? L("Next", "次へ") : L("See how you did", "結果を見る"), primary: true, onPress: () => setQuiz((q) => ({ ...q, index: q.index + 1, picked: null })) }]);
      }
      p.row([{ label: L("Close", "閉じる"), onPress: close }]);
      return;
    }
    if (card === "bystander") {
      p.title(L("What would you do?", "あなたならどうする?"));
      p.text(BYSTANDER.scenario, 30, "#fff");
      BYSTANDER.choices.forEach((c, i) => {
        p.row([{ label: c.label.length > 52 ? `${c.label.slice(0, 50)}…` : c.label, active: choice === i, onPress: () => setChoice(i) }], 64);
        if (choice === i) p.text(c.feedback, 26, "#9dd2ff");
      });
      p.text(L(`Source: ${REFERENCES.rightToBe.short}. Only step in directly when it's safe for you.`, `出典:${REFERENCES.rightToBe.short}。直接介入するのは、安全なときだけにしてください。`), 22, "rgba(255,255,255,0.55)");
      p.row([{ label: L("Close", "閉じる"), onPress: close }]);
      return;
    }
    const c = cardText(card);
    p.title(gate ? L("Before you start", "はじめる前に") : c.title);
    for (const part of c.body) {
      if (Array.isArray(part)) {
        p.text(part[0], 30, "#fff", 700);
        p.text(part[1], 28);
      } else p.text(part, 30);
    }
    if (card === "help") for (const h of helpContacts()) p.text(`${h.label}. ${h.detail}`, 26);
    if (c.sources.length) p.text(`Sources: ${c.sources.map((k) => REFERENCES[k].short).join("; ")}.`, 22, "rgba(255,255,255,0.55)");
    const buttons: Omit<Button, "x" | "y" | "w" | "h">[] = [];
    if (gate) buttons.push({ label: L("I agree. Let me in", "同意します。入ります"), primary: true, onPress: () => updateSettings({ agreed: true }) });
    if (card === "refuge" && !gate)
      buttons.push(
        state.inRefuge
          ? { label: L("Return to where I was", "元の場所に戻る"), primary: true, onPress: () => returnFromRefuge(true) }
          : {
              label: L("Step out now", "今すぐ一時退避"),
              primary: true,
              onPress: () => {
                openCard(null);
                stepOut();
              },
            }
      );
    if (!gate && isFacilitator()) buttons.push({ label: L("Show to everyone", "全員に見せる"), onPress: () => showToEveryone(card) });
    if (!gate) buttons.push({ label: L("Close", "閉じる"), onPress: close });
    p.row(buttons);
  };
  return <XrPanel widthM={0.7} placement="front" signature={`${getLang()}:${card}:${gate}:${JSON.stringify(quiz)}:${choice}:${signature}`} paint={paint} />;
}
