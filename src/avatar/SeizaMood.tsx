import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SeizaPhase } from "./seizaEndurance";

/**
 * The comic-book marks over a kneeling avatar (see seizaEndurance.ts):
 * floating Zs while dozing; sweat and pins-and-needles sparks, with a
 * ビリビリ ("tingle tingle"), once the legs go; steam and an anger mark in
 * the last phase.
 *
 * Sprites, so they face every viewer, drawn once to small canvases and
 * shared by every avatar in the room. Placed in the avatar's own space,
 * feet at the origin, facing -Z, at kneeling heights.
 */

const HEAD_Y = 0.98;
/** In seiza the feet are tucked under the seat, behind the body: the part
 *  that actually falls asleep, and the part a third-person camera sees. */
const FEET = new THREE.Vector3(0, 0.1, 0.12);

let textures: Record<"z" | "drop" | "spark" | "tingle" | "puff" | "vein", THREE.CanvasTexture> | null = null;

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function getTextures() {
  if (textures) return textures;
  const font = (px: number, weight = 800) => `${weight} ${px}px system-ui, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`;
  textures = {
    z: canvasTexture(64, 64, (ctx) => {
      ctx.font = font(56);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(20,18,40,0.9)";
      ctx.strokeText("Z", 32, 34);
      ctx.fillStyle = "#f3d9a4";
      ctx.fillText("Z", 32, 34);
    }),
    drop: canvasTexture(32, 48, (ctx) => {
      ctx.fillStyle = "#8fd0ff";
      ctx.strokeStyle = "rgba(20,40,70,0.8)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(16, 4);
      ctx.quadraticCurveTo(30, 28, 16, 44);
      ctx.quadraticCurveTo(2, 28, 16, 4);
      ctx.fill();
      ctx.stroke();
    }),
    spark: canvasTexture(64, 64, (ctx) => {
      ctx.strokeStyle = "#ffe08a";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.moveTo(32 + Math.cos(a) * 8, 32 + Math.sin(a) * 8);
        ctx.lineTo(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28);
        ctx.stroke();
      }
    }),
    tingle: canvasTexture(256, 72, (ctx) => {
      ctx.font = font(52);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 9;
      ctx.strokeStyle = "rgba(40,20,10,0.9)";
      ctx.strokeText("ビリビリ", 128, 38);
      ctx.fillStyle = "#ffe08a";
      ctx.fillText("ビリビリ", 128, 38);
    }),
    puff: canvasTexture(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }),
    vein: canvasTexture(64, 64, (ctx) => {
      // The four-curve anger mark of manga.
      ctx.strokeStyle = "#ff4d4d";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(32 + sx * 6, 32 + sy * 22);
        ctx.quadraticCurveTo(32 + sx * 6, 32 + sy * 6, 32 + sx * 22, 32 + sy * 6);
        ctx.stroke();
      }
    }),
  };
  return textures;
}

type Kind = keyof ReturnType<typeof getTextures>;

/** One sprite per mark, each with its own material so opacity is per mark. */
const LAYOUT: { kind: Kind; phases: SeizaPhase[] }[] = [
  { kind: "z", phases: ["dozing"] },
  { kind: "z", phases: ["dozing"] },
  { kind: "z", phases: ["dozing"] },
  { kind: "drop", phases: ["numb", "agony"] },
  { kind: "spark", phases: ["numb", "agony"] },
  { kind: "spark", phases: ["numb", "agony"] },
  { kind: "tingle", phases: ["numb", "agony"] },
  { kind: "puff", phases: ["agony"] },
  { kind: "puff", phases: ["agony"] },
  { kind: "puff", phases: ["agony"] },
  { kind: "vein", phases: ["agony"] },
];

export function SeizaMood({ phase }: { phase: SeizaPhase | null }) {
  const sprites = useMemo(() => {
    if (typeof document === "undefined") return [];
    const tex = getTextures();
    return LAYOUT.map(({ kind, phases }) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[kind], transparent: true, depthWrite: false }));
      sprite.renderOrder = 5;
      sprite.visible = false;
      return { sprite, kind, phases };
    });
  }, []);
  // Each mark's own clock, so the three Zs don't move in lockstep.
  const clock = useRef(0);

  useEffect(() => () => sprites.forEach(({ sprite }) => sprite.material.dispose()), [sprites]);

  useFrame((_, delta) => {
    clock.current += Math.min(delta, 0.1);
    const t = clock.current;
    let zIndex = 0;
    let sparkIndex = 0;
    let puffIndex = 0;
    for (const entry of sprites) {
      const { sprite, kind } = entry;
      const on = phase != null && entry.phases.includes(phase);
      sprite.visible = on;
      if (!on) continue;
      const m = sprite.material;
      if (kind === "z") {
        const u = (t * 0.33 + zIndex++ / 3) % 1;
        sprite.position.set(0.12 + u * 0.22, HEAD_Y + 0.08 + u * 0.48, 0);
        sprite.scale.setScalar(0.09 + u * 0.11);
        m.opacity = Math.sin(Math.PI * u);
      } else if (kind === "drop") {
        const u = (t * 0.7) % 1;
        sprite.position.set(-0.13, HEAD_Y + 0.02 - u * 0.12, 0);
        sprite.scale.set(0.05, 0.075, 1);
        m.opacity = Math.sin(Math.PI * u);
      } else if (kind === "spark") {
        const side = sparkIndex++ === 0 ? -1 : 1;
        sprite.position.set(FEET.x + side * 0.17, FEET.y + (side > 0 ? 0.06 : 0), FEET.z);
        sprite.scale.setScalar(0.12);
        // Flicker faster as it gets worse.
        m.opacity = Math.sin(t * (phase === "agony" ? 28 : 16) + side) > 0 ? 1 : 0.25;
      } else if (kind === "tingle") {
        // Off to the side at hip height, readable from any angle.
        sprite.position.set(0.42, 0.42, 0);
        sprite.scale.set(0.46, 0.13, 1);
        m.opacity = Math.sin(t * (phase === "agony" ? 22 : 12)) > -0.3 ? 1 : 0.35;
      } else if (kind === "puff") {
        const u = (t * 0.6 + puffIndex++ / 3) % 1;
        sprite.position.set((puffIndex - 2) * 0.09, HEAD_Y + 0.12 + u * 0.4, 0);
        sprite.scale.setScalar(0.1 + u * 0.22);
        m.opacity = Math.min(1, 1.6 * (1 - u));
      } else if (kind === "vein") {
        sprite.position.set(0.12, HEAD_Y + 0.1, 0);
        sprite.scale.setScalar(0.11 * (1 + 0.25 * Math.max(0, Math.sin(t * 10))));
        m.opacity = 1;
      }
    }
  });

  if (sprites.length === 0) return null;
  return (
    <group>
      {sprites.map(({ sprite }, i) => (
        <primitive key={i} object={sprite} />
      ))}
    </group>
  );
}
