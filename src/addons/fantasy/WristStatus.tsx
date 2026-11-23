import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { L } from "../../i18n/lang";
import { trackingStore } from "../../xr/body/trackingStore";
import { fantasy } from "./combat";
import { ELEMENT_COLORS, MAX_HP } from "./weapons";

/**
 * Your own health and special meter in a headset, where the flat screen's
 * bars (FantasyHud) can't be: a watch on the back of your left wrist.
 * Turn your wrist to read it. It flashes red when you're hit and glows in
 * your element's colour when the special is ready. Redrawn only when what
 * it shows changes.
 */
const W = 256;
const H = 96;
/** In metres: its width, and how far it sits off the back of the wrist. */
const WIDTH = 0.09;
const OFF_BACK = 0.035;
const TOWARD_ELBOW = 0.05;

const back = new THREE.Vector3();
const elbow = new THREE.Vector3();
const rot = new THREE.Quaternion();
/** The panel faces the back of the hand: +y in the hand's frame. */
const FACE_BACK = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

export function WristStatus() {
  const { gl } = useThree();
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    return c;
  }, []);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);
  const mesh = useMemo(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, (WIDTH * H) / W), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: true, toneMapped: false }));
    m.visible = false;
    m.renderOrder = 5;
    m.userData.navIgnore = true;
    return m;
  }, [texture]);
  useEffect(
    () => () => {
      texture.dispose();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
    [texture, mesh]
  );

  const shown = useRef("");
  const hurtAt = useRef(-Infinity);
  const lastHurt = useRef(fantasy.get().hurt);
  useFrame((state) => {
    const me = fantasy.get();
    const world = trackingStore.getLocalWorld();
    const hand = world?.left;
    if (!gl.xr.isPresenting || !me.weapon || !hand?.active) {
      mesh.visible = false;
      return;
    }
    if (me.hurt !== lastHurt.current) {
      lastHurt.current = me.hurt;
      hurtAt.current = state.clock.elapsedTime;
    }
    const flash = state.clock.elapsedTime - hurtAt.current < 0.35;
    const ready = me.meter >= 100;
    const key = [Math.round(me.hp), Math.floor(me.meter), me.ko, me.chain, flash, ready, me.element, me.primed].join(":");
    if (key !== shown.current) {
      shown.current = key;
      draw(canvas, me.hp, me.meter, me.ko, me.chain, flash, ready ? ELEMENT_COLORS[me.element] : null, me.primed);
      texture.needsUpdate = true;
    }
    rot.copy(hand.quaternion);
    back.set(0, 1, 0).applyQuaternion(rot);
    elbow.set(0, 0, 1).applyQuaternion(rot);
    mesh.position.copy(hand.position).addScaledVector(back, OFF_BACK).addScaledVector(elbow, TOWARD_ELBOW);
    mesh.quaternion.copy(rot).multiply(FACE_BACK);
    mesh.visible = true;
  });

  return <primitive object={mesh} />;
}

function draw(canvas: HTMLCanvasElement, hp: number, meter: number, ko: boolean, chain: number, flash: boolean, glow: string | null, primed: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = flash ? "rgba(120,16,24,0.92)" : "rgba(16,16,22,0.88)";
  ctx.beginPath();
  ctx.roundRect(2, 2, W - 4, H - 4, 18);
  ctx.fill();
  if (glow) {
    ctx.strokeStyle = glow;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  const bar = (y: number, value: number, color: string) => {
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.roundRect(18, y, W - 36, 18, 9);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(18, y, Math.max(0, (W - 36) * value), 18, 9);
    ctx.fill();
  };
  const health = Math.max(0, Math.min(1, hp / MAX_HP));
  bar(20, health, health > 0.5 ? "#5ad67a" : health > 0.25 ? "#ffc94a" : "#ff5a5a");
  bar(50, Math.min(1, meter / 100), glow ?? "#e8c37a");
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 15px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(ko ? L("Down", "ダウン") : `${Math.round(hp)}`, 24, 29);
  ctx.fillText(primed ? L("Swing!", "振って!") : glow ? L("Ready: draw back", "準備完了:引いて") : `${Math.floor(meter)}%`, 24, 59);
  if (chain > 1) {
    ctx.textAlign = "right";
    ctx.fillText(`×${chain}`, W - 24, 82);
    ctx.textAlign = "left";
  }
}
