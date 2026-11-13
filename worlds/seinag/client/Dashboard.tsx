// The solar dashboard on the station's back wall (Station.tsx): the roofs'
// output now, the campus's demand, the battery, and the last 24 hours,
// redrawn while someone is near. Click it for the card that explains them.
import { useRef } from "react";
import * as THREE from "three";
import { L, useLang } from "../../../src/i18n/lang";
import { Clickable, FONT, roundRect, useCanvasTexture, standard } from "../../seizora/client/kit";
import { openCard } from "./cards";
import { dayTotals, live } from "./live";
import { CAMPUS, ROOFTOP_MWP } from "./plant";

const bezel = standard("#1c222c", 0.45, 0.4);

const kw = (mw: number) => `${Math.round(mw * 1000)}`;

function draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#0f1626";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#16213a";
  ctx.fillRect(0, 0, w, 86);
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffcf6e";
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(L("☀ SEINAG · CAMPUS SOLAR, LIVE", "☀ SEINAG · キャンパスの太陽光(ライブ)"), 32, 44);
  ctx.textAlign = "right";
  ctx.fillStyle = "#9fb0d6";
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText(L("Hypothetical: not UPOU's real plan", "仮想:UPOUの実際の計画ではありません"), w - 32, 44);
  ctx.textAlign = "left";
  const s = live.now;
  if (!s) {
    ctx.fillStyle = "#9fb0d6";
    ctx.font = `500 34px ${FONT}`;
    ctx.fillText(L("Waiting for the sky…", "空の準備を待っています…"), 40, h / 2);
    return;
  }
  const tiles: [string, string, string][] = [
    [L("Roofs making", "屋根の発電"), `${kw(s.siliconMw)} kW`, L(`of ${Math.round(ROOFTOP_MWP * 1000)} kW peak`, `最大 ${Math.round(ROOFTOP_MWP * 1000)} kW`)],
    [L("Campus using", "キャンパスの使用"), `${kw(s.loadMw)} kW`, s.loadMw > 0 ? L(`${Math.round(Math.min(1, s.siliconMw / s.loadMw) * 100)}% from the sun`, `${Math.round(Math.min(1, s.siliconMw / s.loadMw) * 100)}%を太陽で`) : ""],
    [
      L("Battery", "蓄電池"),
      `${Math.round(s.soc * 100)}%`,
      s.batteryMw < -0.001 ? L(`charging ${kw(-s.batteryMw)} kW`, `${kw(-s.batteryMw)} kWで充電`) : s.batteryMw > 0.001 ? L(`giving ${kw(s.batteryMw)} kW`, `${kw(s.batteryMw)} kWを供給`) : L("resting", "待機中"),
    ],
    [
      L("Grid", "系統"),
      `${kw(Math.abs(s.gridMw))} kW`,
      s.gridMw > 0.001 ? L("from the grid", "系統から受電") : s.gridMw < -0.001 ? L("sent to the grid", "系統へ送電") : L("balanced", "均衡"),
    ],
  ];
  const tw = (w - 64 - 3 * 16) / 4;
  tiles.forEach(([label, value, sub], i) => {
    const x = 32 + i * (tw + 16);
    roundRect(ctx, x, 110, tw, 170, 14);
    ctx.fillStyle = "#1b2336";
    ctx.fill();
    ctx.fillStyle = "#9fb0d6";
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(label, x + 18, 142);
    ctx.fillStyle = "#fff";
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText(value, x + 18, 200);
    ctx.fillStyle = "#9fb0d6";
    ctx.font = `500 20px ${FONT}`;
    ctx.fillText(sub, x + 18, 252);
  });

  // The last 24 hours: solar against demand.
  const gx = 32, gy = 304, gw = w - 64, gh = 260;
  roundRect(ctx, gx, gy, gw, gh, 14);
  ctx.fillStyle = "#151c2c";
  ctx.fill();
  ctx.fillStyle = "#9fb0d6";
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText(L("LAST 24 HOURS", "過去24時間"), gx + 18, gy + 28);
  const history = live.history;
  const max = Math.max(CAMPUS.peakLoadMw, ROOFTOP_MWP) * 1.1;
  const px = (i: number) => gx + 18 + (i / Math.max(1, history.length - 1)) * (gw - 36);
  const py = (v: number) => gy + gh - 22 - (v / max) * (gh - 70);
  const line = (value: (i: number) => number, color: string, fill: boolean) => {
    ctx.beginPath();
    history.forEach((_, i) => (i ? ctx.lineTo(px(i), py(value(i))) : ctx.moveTo(px(i), py(value(i)))));
    if (fill) {
      ctx.lineTo(px(history.length - 1), py(0));
      ctx.lineTo(px(0), py(0));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  };
  if (history.length > 1) {
    line((i) => history[i].siliconMw, "rgba(255,190,80,0.55)", true);
    line((i) => history[i].loadMw, "#ffffff", false);
  }
  ctx.font = `500 20px ${FONT}`;
  ctx.fillStyle = "#ffbe50";
  ctx.fillText(L("■ Solar", "■ 太陽光"), gx + gw - 300, gy + 28);
  ctx.fillStyle = "#fff";
  ctx.fillText(L("— Campus use", "— キャンパスの使用"), gx + gw - 170, gy + 28);

  const t = dayTotals();
  ctx.fillStyle = "#e8ecf6";
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(
    L(
      `24 h: ${(t.solarMwh * 1000).toFixed(0)} kWh from the roofs · ${Math.round(t.ownShare * 100)}% of the campus's use without the grid · ${(t.co2AvoidedT * 1000).toFixed(0)} kg CO₂ avoided`,
      `24時間:屋根から ${(t.solarMwh * 1000).toFixed(0)} kWh · 使用量の ${Math.round(t.ownShare * 100)}% を系統なしで · CO₂ ${(t.co2AvoidedT * 1000).toFixed(0)} kg 削減`
    ),
    32,
    600
  );
  ctx.fillStyle = "#6a7590";
  ctx.font = `400 20px ${FONT}`;
  ctx.fillText(L("Click for how this is worked out", "クリックで計算のしかたを見る"), 32, h - 22);
}

/** The dashboard, mounted on the station's back wall: a screen `width`
 *  metres across, in a dark bezel, facing +Z. Click it for how it works. */
export function DashboardScreen({ width = 2.8 }: { width?: number }) {
  const lang = useLang();
  const anchor = useRef<THREE.Mesh>(null);
  const texture = useCanvasTexture(1400, 808, draw, { hz: 2, anchor, range: 30, deps: [lang] });
  const height = (width * 808) / 1400;
  return (
    <Clickable onClick={() => openCard("solar")}>
      <mesh position={[0, 0, -0.04]} material={bezel} castShadow>
        <boxGeometry args={[width + 0.12, height + 0.12, 0.06]} />
      </mesh>
      <mesh ref={anchor}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </Clickable>
  );
}
