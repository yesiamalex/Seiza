/**
 * Stations of the Shinkanseiza (新幹星座), the line between the EcoSeiztem's
 * worlds, from world.json's `portals`: a row of station name boards, each
 * in its world's colour, its name in Japanese and English. Click one and
 * the departure board comes up: the line's trains to every world, the one
 * you picked boarding, and a button to board it, which opens that world in
 * a new tab, so nobody leaves by accident and this room stays open behind.
 * In a headset, which can't open another site, it says to exit VR first.
 *
 * One `urlPattern` ("https://{id}.example.workers.dev", or
 * "https://seiza.org/{id}/" on one domain) addresses every world at once;
 * a world can give its own `url` instead.
 *
 * Cheap: per station, a board, two posts and a lamp, drawn once.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { PortalConfig, PortalWorld } from "../config/worldConfig";
import { L, useLang } from "../i18n/lang";
import { floorHeightAt } from "../scene/layout";
import { pillButtonStyle } from "../ui/styles";

const FONT = "system-ui, -apple-system, 'Segoe UI', 'Hiragino Sans', 'Noto Sans CJK JP', sans-serif";
/** The board's size, and how high its middle is. */
const SIGN = { w: 1.7, h: 0.62, y: 1.55 };

/** Where a station's train goes, or null when its address isn't set yet. */
export function portalUrl(config: PortalConfig, world: PortalWorld): string | null {
  const url = world.url ?? config.urlPattern?.replace(/\{id\}/g, world.id);
  if (!url || /REPLACE|example\./i.test(url)) return null;
  return /^(https:\/\/|\/)/.test(url) ? url : null;
}

// --- which station's departure board is open ------------------------------------------------

let open: PortalWorld | null = null;
const listeners = new Set<() => void>();
/** Opens a station's departure board (or, with null, closes it). */
export function openPortal(world: PortalWorld | null) {
  open = world;
  for (const l of listeners) l();
}

// --- in the world ---------------------------------------------------------------------------

/** A station name board (ekimeihyō): the line on top, the name large in
 *  Japanese, English under, the world's colour along the foot. */
function board(world: PortalWorld, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 280;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f7f7f2";
  ctx.fillRect(0, 0, 768, 280);
  ctx.fillStyle = "#1d2433";
  ctx.fillRect(0, 0, 768, 40);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText("新幹星座  SHINKANSEIZA  ·  EcoSeiztem", 384, 28);
  ctx.fillStyle = "#1d2433";
  ctx.font = `800 92px ${FONT}`;
  ctx.fillText(world.labelJa ?? world.label, 384, 140, 720);
  ctx.font = `600 38px ${FONT}`;
  ctx.fillText(world.label, 384, 192, 720);
  ctx.fillStyle = color;
  ctx.fillRect(0, 222, 768, 58);
  ctx.fillStyle = "#10131a";
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(L("Click for the departure board", "クリックで発車案内"), 384, 260, 720);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function Station({ world, position, facing }: { world: PortalWorld; position: [number, number, number]; facing: number }) {
  const lang = useLang();
  const color = world.color ?? "#8fb3ff";
  const m = useMemo(
    () => ({
      board: new THREE.MeshBasicMaterial({ map: board(world, color), toneMapped: false }),
      post: new THREE.MeshLambertMaterial({ color: "#5a5f68" }),
      lamp: new THREE.MeshBasicMaterial({ color, toneMapped: false }),
      back: new THREE.MeshLambertMaterial({ color: "#2b2f38" }),
    }),
    // The board redraws in the visitor's language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [color, world, lang]
  );
  useEffect(
    () => () => {
      for (const material of Object.values(m)) {
        (material as THREE.MeshBasicMaterial).map?.dispose();
        material.dispose();
      }
    },
    [m]
  );
  const click = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    openPortal(world);
  };
  return (
    <group position={position} rotation={[0, facing, 0]}>
      <group onClick={click} onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
        <mesh position={[0, SIGN.y, 0.03]} material={m.board}>
          <planeGeometry args={[SIGN.w, SIGN.h]} />
        </mesh>
        <mesh position={[0, SIGN.y, 0]} material={m.back}>
          <boxGeometry args={[SIGN.w + 0.06, SIGN.h + 0.06, 0.05]} />
        </mesh>
      </group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (SIGN.w / 2 - 0.12), (SIGN.y - SIGN.h / 2) / 2, 0]} material={m.post}>
          <boxGeometry args={[0.07, SIGN.y - SIGN.h / 2, 0.07]} />
        </mesh>
      ))}
      {/* A lamp over it in the line's colour, as a platform has. */}
      <mesh position={[0, SIGN.y + SIGN.h / 2 + 0.07, 0.06]} material={m.lamp}>
        <boxGeometry args={[SIGN.w * 0.7, 0.04, 0.06]} />
      </mesh>
    </group>
  );
}

/** The row of stations, from world.json's `portals`. */
export function Portals({ config, builtin }: { config: PortalConfig; builtin: boolean }) {
  const spacing = config.spacing ?? 2.6;
  const { x, z } = config.at;
  // Side by side across the row, which faces `facing`.
  const across = [Math.cos(config.facing), -Math.sin(config.facing)];
  const first = -((config.worlds.length - 1) * spacing) / 2;
  return (
    <>
      {config.worlds.map((world, i) => {
        const px = x + across[0] * (first + i * spacing);
        const pz = z + across[1] * (first + i * spacing);
        const y = config.at.y ?? (builtin ? floorHeightAt(px, pz) : 0);
        return <Station key={world.id} world={world} position={[px, y, pz]} facing={config.facing} />;
      })}
    </>
  );
}

// --- the departure board --------------------------------------------------------------------------

const LED = "#ffb347";
const LED_DIM = "rgba(255,179,71,0.55)";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Hiragino Sans', 'Noto Sans CJK JP', monospace";

/** The time `minutes` from now, as a departure board shows it. */
const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/**
 * Before leaving for another world: the Shinkanseiza's departure board,
 * every world's train in amber, its words turning between Japanese and
 * English as real boards do, the one you picked boarding at the top, and
 * a button to board it (a new tab). Mounted beside the HUD.
 */
export function PortalCard({ config, inXr }: { config: PortalConfig; inXr: boolean }) {
  useLang();
  const world = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open
  );
  // Japanese, then English, every three seconds; and the clock.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!world) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), 3000);
    return () => window.clearInterval(timer);
  }, [world]);
  if (!world) return null;
  const ja = tick % 2 === 0;
  const url = portalUrl(config, world);
  const name = L(world.label, world.labelJa ?? world.label);
  const color = world.color ?? "#8fb3ff";
  const close = () => openPortal(null);
  // The one you picked first, then the rest, three minutes apart.
  const rows = [world, ...config.worlds.filter((w) => w.id !== world.id)];
  return (
    <div role="dialog" aria-label={L(`Departures to ${name}`, `${name}行きの発車案内`)} onClick={close} style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", padding: 12, pointerEvents: "auto", zIndex: 40, background: "rgba(8,10,16,0.5)" }}>
      <style>{`@keyframes seiza-board-blink { 50% { opacity: 0.25 } }`}</style>
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ width: "min(560px, 100%)", borderRadius: 14, overflow: "hidden", background: "#0b0c10", border: "1px solid #2a2d36", boxShadow: "0 18px 50px rgba(0,0,0,0.5)", color: "#fff", fontFamily: FONT }}
      >
        {/* The board's head: the line, and the time. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#1d2433", borderBottom: `3px solid ${color}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.5 }}>{ja ? "新幹星座　発車案内" : "Shinkanseiza · Departures"}</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{ja ? "EcoSeiztem 全線" : "Every line of the EcoSeiztem"}</div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 20, color: LED, textShadow: `0 0 8px ${LED_DIM}` }}>{at(0)}</div>
        </div>
        {/* The departures, in amber. */}
        <div style={{ padding: "6px 0", fontFamily: MONO, color: LED, textShadow: `0 0 6px ${LED_DIM}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "56px 64px 1fr 54px", gap: 8, padding: "4px 14px", fontSize: 11, color: LED_DIM }}>
            <span>{ja ? "発車" : "Time"}</span>
            <span>{ja ? "種別" : "Train"}</span>
            <span>{ja ? "行き先" : "For"}</span>
            <span style={{ textAlign: "right" }}>{ja ? "番線" : "Plat."}</span>
          </div>
          {rows.map((w, i) => {
            const mine = i === 0;
            return (
              <div key={w.id} style={{ display: "grid", gridTemplateColumns: "56px 64px 1fr 54px", gap: 8, alignItems: "center", padding: "7px 14px", fontSize: mine ? 17 : 15, background: mine ? "rgba(255,179,71,0.07)" : undefined, borderTop: "1px solid #1c1e26" }}>
                <span>{mine ? at(0) : at(i * 3)}</span>
                <span style={{ fontSize: 11, color: "#10131a", background: w.color ?? "#8fb3ff", borderRadius: 4, padding: "2px 4px", textAlign: "center", textShadow: "none", fontFamily: FONT, fontWeight: 700 }}>{ja ? "新幹星座" : "SHINKAN"}</span>
                <span style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  {ja ? (w.labelJa ?? w.label) : w.label}
                  {mine && <span style={{ marginLeft: 10, fontSize: 12, animation: "seiza-board-blink 1.2s steps(2) infinite" }}>{ja ? "乗車中" : "BOARDING"}</span>}
                </span>
                <span style={{ textAlign: "right" }}>{i + 1}</span>
              </div>
            );
          })}
        </div>
        {/* Where it goes, and boarding. */}
        <div style={{ padding: "12px 14px 14px", display: "grid", gap: 10, fontSize: 14, lineHeight: 1.5, borderTop: "1px solid #2a2d36", background: "#12141a" }}>
          <strong style={{ fontSize: 17, color }}>{name}</strong>
          {world.blurb && <p style={{ margin: 0, opacity: 0.9 }}>{L(world.blurb, world.blurbJa ?? world.blurb)}</p>}
          {url ? (
            <p style={{ margin: 0, opacity: 0.75, fontSize: 13 }}>
              {inXr
                ? L(`This train goes to ${url.replace("https://", "")}. A headset can't open another site from inside VR: exit VR, and click the station's board again.`, `この列車は ${url.replace("https://", "")} へ向かいます。VRの中からはほかのサイトを開けないので、VRを終えてからもう一度駅名標をクリックしてください。`)
                : L(`It opens ${url.replace("https://", "")} in a new tab, and this room stays open here.`, `${url.replace("https://", "")} を新しいタブで開きます。この部屋は開いたままです。`)}
            </p>
          ) : (
            <p style={{ margin: 0, opacity: 0.75, fontSize: 13 }}>
              {L("This station's line isn't open yet. Whoever runs this deployment can set it in world.json (portals.urlPattern).", "この駅の路線はまだ開通していません。このサイトの運営者が world.json(portals.urlPattern)で設定できます。")}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" style={pillButtonStyle} onClick={close}>
              {L("Stay here", "ここに残る")}
            </button>
            {url && !inXr && (
              <a href={url} target="_blank" rel="noopener noreferrer" onClick={close} style={{ ...pillButtonStyle, textDecoration: "none", fontWeight: 800, background: color, color: "#10131a" }}>
                {L(`Board for ${name}`, `${name}行きに乗る`)}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
