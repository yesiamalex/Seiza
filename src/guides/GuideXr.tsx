/**
 * Talking to a guide in a headset, where there's no keyboard: their last
 * answer on a panel beside them, the questions to ask next as buttons,
 * "Walk me there", "Take me there now", and Close. Point and pull the
 * trigger (or pinch), or in a phone viewer look at a button and tap, or
 * keep looking (Seiza's gaze).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { registerGazeTarget } from "../xr/hud/gaze";
import { ask, goTo, lastReply, lead, openGuide, useGuides } from "./store";

const PX = 900;
const W = 0.9; // metres
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

interface Button {
  x: number;
  y: number;
  w: number;
  h: number;
  key: string;
  label: string;
  onPress: () => void;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > width && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export function GuideXr({ guideId }: { guideId: string }) {
  const { threads, guides } = useGuides();
  const messages = threads[guideId];
  const name = guides.find((g) => g.id === guideId)?.name ?? "Guide";
  const camera = useThree((s) => s.camera);
  const mesh = useRef<THREE.Mesh>(null);
  const canvas = useMemo(() => document.createElement("canvas"), []);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);
  useEffect(() => () => texture.dispose(), [texture]);
  const layout = useRef<{ height: number; buttons: Button[] }>({ height: 300, buttons: [] });
  const [height, setHeight] = useState(0.3);

  useEffect(() => {
    const reply = lastReply(guideId);
    if (!reply) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pad = 32;
    const draw = (dry: boolean) => {
      let y = pad;
      const buttons: Button[] = [];
      if (!dry) {
        ctx.fillStyle = "rgba(20,18,26,0.94)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.font = `700 34px ${FONT}`;
      if (!dry) {
        ctx.fillStyle = "#ffd58a";
        ctx.fillText(name, pad, y + 30);
      }
      y += 48;
      ctx.font = `400 30px ${FONT}`;
      for (const line of wrap(ctx, reply.text, PX - pad * 2)) {
        if (!dry) {
          ctx.fillStyle = "rgba(255,255,255,0.92)";
          ctx.fillText(line, pad, y + 28);
        }
        y += 40;
      }
      y += 12;
      const choices: { key: string; label: string; onPress: () => void }[] = [
        ...reply.suggestions.slice(0, 4).map((s) => ({ key: `q:${s}`, label: s, onPress: () => ask(guideId, s) })),
        ...(reply.place && reply.place.walk !== false ? [{ key: "lead", label: "Walk me there", onPress: () => lead(guideId, reply.place!) }] : []),
        ...(reply.place ? [{ key: "go", label: "Take me there now", onPress: () => goTo(reply.place!) }] : []),
        { key: "close", label: "Close", onPress: () => openGuide(null) },
      ];
      ctx.font = `600 28px ${FONT}`;
      for (const c of choices) {
        const b: Button = { x: pad, y, w: PX - pad * 2, h: 64, ...c };
        buttons.push(b);
        if (!dry) {
          ctx.fillStyle = c.key === "close" ? "#3a4256" : c.key === "go" || c.key === "lead" ? "#2f8f6f" : "#2f5f9f";
          ctx.beginPath();
          ctx.roundRect(b.x, b.y, b.w, b.h, 16);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.textBaseline = "middle";
          ctx.fillText(wrap(ctx, c.label, b.w - 40)[0] ?? "", b.x + 20, b.y + b.h / 2);
          ctx.textBaseline = "alphabetic";
        }
        y += 76;
      }
      return { height: y + pad - 12, buttons };
    };
    canvas.width = PX;
    canvas.height = 2000;
    const measured = draw(true);
    canvas.height = measured.height;
    layout.current = draw(false);
    texture.needsUpdate = true;
    setHeight((W * measured.height) / PX);
  }, [messages, name, guideId, canvas, texture]);

  // Beside the guide, toward you, at eye height, turned to face you.
  const world = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const m = mesh.current;
    const parent = m?.parent;
    if (!m || !parent) return;
    parent.getWorldPosition(world);
    const to = camera.getWorldPosition(new THREE.Vector3()).sub(world).setY(0).normalize();
    const side = new THREE.Vector3(to.z, 0, -to.x);
    m.position.copy(to.multiplyScalar(0.45).addScaledVector(side, 0.55));
    m.position.y = 1.3; // about eye height: the guide's group sits at their feet
    m.lookAt(camera.getWorldPosition(new THREE.Vector3()));
  });

  const at = (uv: THREE.Vector2) => {
    const x = uv.x * PX;
    const y = (1 - uv.y) * layout.current.height;
    return layout.current.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) ?? null;
  };
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    return registerGazeTarget(m, { keyAt: (uv) => at(uv)?.key ?? null, select: (uv) => at(uv)?.onPress() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pressed = useRef<Button | null>(null);
  const hit = (e: ThreeEvent<PointerEvent>) => (e.uv ? at(e.uv) : null);

  return (
    <mesh
      ref={mesh}
      scale={[W, height, 1]}
      renderOrder={20}
      onPointerDown={(e) => {
        e.stopPropagation();
        pressed.current = hit(e);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        const start = pressed.current;
        pressed.current = null;
        if (start && start === hit(e)) start.onPress();
      }}
      onClick={(e) => e.stopPropagation()}
      userData={{ navIgnore: true }}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
