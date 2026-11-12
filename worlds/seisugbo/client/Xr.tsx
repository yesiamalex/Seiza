// The close-up view in a headset. Seiza's flat HUD (and so Hud.tsx) isn't
// visible in VR, so an opened piece appears as a panel in the world, a
// little in front of where you were looking: the picture large, its words
// and caption under it, and Previous, Close, and Next. Point and pull the
// trigger (or pinch); in a phone viewer, look at a button and tap, or keep
// looking (Seiza's gaze selection). The panel stays where it opened, so
// you can lean in to look closely, and comes back in front of you when
// you turn well away. Nothing here runs outside a headset session.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import * as THREE from "three";
import { readXrHead } from "../../../src/xr/body/xrPose";
import { registerGazeTarget } from "../../../src/xr/hud/gaze";
import { GROUP_COLORS, PIECE_BY_ID, viewUrl, type Group } from "./collection";
import { PORTAL_BY_GROUP } from "./Portals";
import { boardText, type BoardKey } from "./info";
import { kindLabel } from "./Hud";
import { FONT, loadPicture, wrapText } from "./kit";
import { openPiece, step, useViewer } from "./viewer";
import { L, useLang } from "../../../src/i18n/lang";

export function XrViewer() {
  const session = useXR((s) => s.session);
  // ?seisugboXrPreview draws the headset panel on a flat screen too.
  const preview = useMemo(() => typeof location !== "undefined" && new URLSearchParams(location.search).has("seisugboXrPreview"), []);
  const { open } = useViewer();
  return (session || preview) && open ? <Panel /> : null;
}

const W = 1.15; // panel width in metres
const TEXT_PX = 1000;

interface Button {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  onPress: () => void;
}

function Panel() {
  const lang = useLang();
  const { open, sequence } = useViewer();
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const presenting = useXR((s) => s.session != null);
  const group = useRef<THREE.Group>(null);
  const textMesh = useRef<THREE.Mesh>(null);
  const [picture, setPicture] = useState<THREE.Texture | null>(null);
  const board = open?.startsWith("board:") ? (open.slice(6) as BoardKey) : null;
  const portal = open?.startsWith("portal:") ? PORTAL_BY_GROUP[open.slice(7) as Group] : null;
  const piece = open && !board ? PIECE_BY_ID[open] : null;

  useEffect(() => {
    setPicture(null);
    if (!piece) return;
    let live = true;
    loadPicture(viewUrl(piece.id)).then((t) => live && setPicture(t), () => {});
    return () => {
      live = false;
    };
  }, [piece]);

  // The words, caption, and buttons, drawn on a canvas.
  const layout = useRef<{ height: number; buttons: Button[] }>({ height: 400, buttons: [] });
  const canvas = useMemo(() => document.createElement("canvas"), []);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);
  const [textHeight, setTextHeight] = useState(0.3);
  useEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Measure, then draw at that height.
    const paint = (dry: boolean) => {
      const pad = 36;
      let y = pad;
      const buttons: Button[] = [];
      if (!dry) {
        ctx.fillStyle = "rgba(18,20,28,0.94)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      const text = (s: string, size: number, color: string, weight = 400) => {
        ctx.font = `${weight} ${size}px ${FONT}`;
        ctx.fillStyle = color;
        if (dry) {
          const fill = ctx.fillText;
          ctx.fillText = () => {};
          y = wrapText(ctx, s, pad, y + size, TEXT_PX - pad * 2, size * 1.3) - size + 6;
          ctx.fillText = fill;
        } else y = wrapText(ctx, s, pad, y + size, TEXT_PX - pad * 2, size * 1.3) - size + 6;
      };
      if (piece) {
        text(piece.title, 46, "#fff", 700);
        text(L(`Group ${piece.group} · ${kindLabel(piece.kind)}`, `${piece.group}グループ · ${kindLabel(piece.kind)}`), 28, GROUP_COLORS[piece.group], 700);
        for (const line of piece.words ?? []) text(line.replace(/ \/ /g, " "), 30, "rgba(255,255,255,0.92)");
        if (piece.caption) text(piece.caption, 28, "rgba(255,255,255,0.75)");
      } else if (portal) {
        text(L(`Group ${portal.group} in FrameVR`, `FrameVRの${portal.group}グループ`), 44, GROUP_COLORS[portal.group], 700);
        text(
          L(
            `This portal goes to ${portal.url.replace("https://", "")}. A headset can't open another site from inside VR: exit VR, and click the portal again to open it in a new tab.`,
            `このポータルは ${portal.url.replace("https://", "")} へつながります。VRの中からはほかのサイトを開けないので、VRを終えてからもう一度ポータルをクリックすると、新しいタブで開きます。`
          ),
          28,
          "rgba(255,255,255,0.88)"
        );
      } else if (board) {
        const b = boardText(board);
        text(b.title, 44, "#fff", 700);
        if (b.subtitle) text(b.subtitle, 28, "#e8c37a", 600);
        for (const p of b.paragraphs) text(p, 28, "rgba(255,255,255,0.88)");
        for (const list of b.list ?? []) {
          if (list.heading) text(list.heading, 28, "#e8c37a", 700);
          list.items.forEach((item, i) => text(`${list.numbered ? `${i + 1}.` : "•"} ${item}`, 26, "rgba(255,255,255,0.88)"));
        }
      }
      y += 16;
      const PREV = L("‹ Previous", "‹ 前へ"), CLOSE = L("Close", "閉じる"), NEXT = L("Next ›", "次へ ›");
      const labels = piece && sequence.length > 1 ? [PREV, CLOSE, NEXT] : [CLOSE];
      const bw = (TEXT_PX - pad * 2 - (labels.length - 1) * 16) / labels.length;
      labels.forEach((label, i) => {
        const b: Button = {
          x: pad + i * (bw + 16),
          y,
          w: bw,
          h: 76,
          label,
          onPress: label === CLOSE ? () => openPiece(null) : () => step(label.startsWith("‹") ? -1 : 1),
        };
        buttons.push(b);
        if (!dry) {
          ctx.fillStyle = label === CLOSE ? "#3a4256" : "#2f6fd0";
          ctx.beginPath();
          ctx.roundRect(b.x, b.y, b.w, b.h, 18);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = `700 32px ${FONT}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
        }
      });
      y += 76 + pad;
      return { height: Math.ceil(y), buttons };
    };
    canvas.width = TEXT_PX;
    canvas.height = 2400;
    const measured = paint(true);
    canvas.width = TEXT_PX;
    canvas.height = measured.height;
    layout.current = paint(false);
    texture.needsUpdate = true;
    setTextHeight((W * measured.height) / TEXT_PX);
  }, [piece, board, portal, sequence, canvas, texture, lang]);
  useEffect(() => () => texture.dispose(), [texture]);

  // Where the panel goes: in front of you when it opens, and back in front
  // if you turn well away from it.
  const head = useMemo(() => new THREE.Vector3(), []);
  const headQ = useMemo(() => new THREE.Quaternion(), []);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const goal = useMemo(() => new THREE.Vector3(), []);
  const placed = useRef(false);
  useEffect(() => {
    placed.current = false;
  }, [open]);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    if (!presenting || !readXrHead(gl, head, headQ)) {
      camera.getWorldPosition(head);
      camera.getWorldQuaternion(headQ);
    }
    forward.set(0, 0, -1).applyQuaternion(headQ).setY(0).normalize();
    goal.copy(head).addScaledVector(forward, 1.05);
    goal.y = head.y - 0.05;
    if (!placed.current) {
      g.position.copy(goal);
      placed.current = true;
    } else {
      const toPanel = g.position.clone().sub(head).setY(0).normalize();
      if (toPanel.dot(forward) < 0.5) g.position.lerp(goal, 1 - Math.exp(-delta * 2.5));
    }
    g.lookAt(head.x, g.position.y, head.z);
  });

  const imageAspect = piece ? piece.px[0] / piece.px[1] : 1;
  const imageW = Math.min(W, 0.72 * imageAspect);
  const imageH = imageW / imageAspect;

  const buttonAt = (uv: THREE.Vector2) => {
    const x = uv.x * TEXT_PX;
    const y = (1 - uv.y) * layout.current.height;
    return layout.current.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) ?? null;
  };
  useEffect(() => {
    const m = textMesh.current;
    if (!m) return;
    return registerGazeTarget(m, {
      keyAt: (uv) => buttonAt(uv)?.label ?? null,
      select: (uv) => buttonAt(uv)?.onPress(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pressed = useRef<Button | null>(null);
  const hit = (event: ThreeEvent<PointerEvent>) => (event.uv ? buttonAt(event.uv) : null);

  const top = piece ? imageH / 2 + 0.02 : textHeight / 2;
  return (
    <group ref={group}>
      {piece && (
        <mesh position={[0, top - imageH / 2, 0]} renderOrder={20}>
          <planeGeometry args={[imageW, imageH]} />
          <meshBasicMaterial map={picture} color={picture ? "#ffffff" : "#333"} toneMapped={false} transparent={!!piece.cutout} alphaTest={piece.cutout ? 0.5 : 0} />
        </mesh>
      )}
      <mesh
        ref={textMesh}
        position={[0, (piece ? top - imageH - 0.02 : top) - textHeight / 2, 0]}
        scale={[W, textHeight, 1]}
        renderOrder={20}
        onPointerDown={(event) => {
          event.stopPropagation();
          pressed.current = hit(event);
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          const start = pressed.current;
          pressed.current = null;
          if (start && start === hit(event)) start.onPress();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}
