/**
 * Portals to other Seiza worlds (or any site), from world.json's `portals`:
 * a row of rings, each in its world's colour around a slowly turning swirl,
 * with the world's name over it. Click one and a card says where it goes
 * and opens it in a new tab, so nobody leaves by accident and this room
 * stays open behind. In a headset, which can't open another site, the card
 * says to exit VR first.
 *
 * One `urlPattern` ("https://{id}.example.workers.dev", or
 * "https://seiza.org/{id}/" on one domain) addresses every world at once;
 * a world can give its own `url` instead.
 *
 * Cheap: per portal, a ring, a disc, and a label; the swirl is the disc
 * turning and its glow pulsing, two numbers a frame.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { PortalConfig, PortalWorld } from "../config/worldConfig";
import { L, useLang } from "../i18n/lang";
import { floorHeightAt } from "../scene/layout";
import { panelStyle, pillButtonStyle } from "../ui/styles";

const RADIUS = 0.85;
const CENTRE = 1.25;
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

/** Where a portal goes, or null when its address isn't set yet. */
export function portalUrl(config: PortalConfig, world: PortalWorld): string | null {
  const url = world.url ?? config.urlPattern?.replace(/\{id\}/g, world.id);
  if (!url || /REPLACE|example\./i.test(url)) return null;
  return /^(https:\/\/|\/)/.test(url) ? url : null;
}

// --- which portal's card is open ------------------------------------------------------------

let open: PortalWorld | null = null;
const listeners = new Set<() => void>();
function openPortal(world: PortalWorld | null) {
  open = world;
  for (const l of listeners) l();
}

// --- in the world ---------------------------------------------------------------------------

function swirl(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0.05)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 6;
  for (let arm = 0; arm < 3; arm++) {
    ctx.beginPath();
    for (let t = 0; t < 1; t += 0.02) {
      const a = arm * ((Math.PI * 2) / 3) + t * 5;
      const r = 10 + t * 112;
      if (t === 0) ctx.moveTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
      else ctx.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function label(world: PortalWorld, color: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(20,22,30,0.82)";
  ctx.beginPath();
  ctx.roundRect(4, 4, 504, 120, 24);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.font = `800 46px ${FONT}`;
  ctx.fillText(L(world.label, world.labelJa ?? world.label), 256, 58, 480);
  ctx.fillStyle = "#fff";
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(L("Portal to this world", "このワールドへのポータル"), 256, 100, 480);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function Portal({ world, position, facing }: { world: PortalWorld; position: [number, number, number]; facing: number }) {
  const lang = useLang();
  const disc = useRef<THREE.Mesh>(null);
  const color = world.color ?? "#8fb3ff";
  const m = useMemo(
    () => ({
      ring: new THREE.MeshBasicMaterial({ color, toneMapped: false }),
      disc: new THREE.MeshBasicMaterial({ map: swirl(), color, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      label: new THREE.MeshBasicMaterial({ map: label(world, color), transparent: true, toneMapped: false }),
      post: new THREE.MeshLambertMaterial({ color: "#3a3f48" }),
    }),
    // The label redraws in the visitor's language.
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
  useFrame(({ clock }) => {
    const d = disc.current;
    if (!d) return;
    d.rotation.z = -clock.elapsedTime * 0.6;
    (d.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.2 * Math.sin(clock.elapsedTime * 2);
  });
  const click = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    openPortal(world);
  };
  return (
    <group position={position} rotation={[0, facing, 0]}>
      <group onClick={click} onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
        <mesh position={[0, CENTRE, 0]} material={m.ring}>
          <torusGeometry args={[RADIUS, 0.07, 10, 48]} />
        </mesh>
        <mesh ref={disc} position={[0, CENTRE, 0]} material={m.disc}>
          <circleGeometry args={[RADIUS - 0.04, 40]} />
        </mesh>
      </group>
      <mesh position={[0, CENTRE + RADIUS + 0.38, 0]} material={m.label}>
        <planeGeometry args={[1.5, 0.375]} />
      </mesh>
      <mesh position={[0, (CENTRE - RADIUS) / 2, 0]} material={m.post}>
        <boxGeometry args={[0.12, CENTRE - RADIUS, 0.12]} />
      </mesh>
    </group>
  );
}

/** The row of portals, from world.json's `portals`. */
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
        return <Portal key={world.id} world={world} position={[px, y, pz]} facing={config.facing} />;
      })}
    </>
  );
}

// --- the card -----------------------------------------------------------------------------------

/** Before leaving for another world: where it goes, and a link that opens
 *  it in a new tab. Mounted beside the HUD. */
export function PortalCard({ config, inXr }: { config: PortalConfig; inXr: boolean }) {
  useLang();
  const world = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open
  );
  if (!world) return null;
  const url = portalUrl(config, world);
  const name = L(world.label, world.labelJa ?? world.label);
  const color = world.color ?? "#8fb3ff";
  const close = () => openPortal(null);
  return (
    <div role="dialog" aria-label={L(`Portal to ${name}`, `${name}へのポータル`)} onClick={close} style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", padding: 12, pointerEvents: "auto", zIndex: 40, background: "rgba(8,10,16,0.45)" }}>
      <div onClick={(event) => event.stopPropagation()} style={{ ...panelStyle, width: "min(420px, 100%)", padding: 16, display: "grid", gap: 10, fontSize: 14, lineHeight: 1.5 }}>
        <strong style={{ fontSize: 18, color }}>{name}</strong>
        {world.blurb && <p style={{ margin: 0 }}>{L(world.blurb, world.blurbJa ?? world.blurb)}</p>}
        {url ? (
          <p style={{ margin: 0, opacity: 0.85 }}>
            {inXr
              ? L(`This portal goes to ${url.replace("https://", "")}. A headset can't open another site from inside VR: exit VR, and click the portal again.`, `このポータルは ${url.replace("https://", "")} へつながります。VRの中からはほかのサイトを開けないので、VRを終えてからもう一度クリックしてください。`)
              : L(`It opens ${url.replace("https://", "")} in a new tab, and this room stays open here.`, `${url.replace("https://", "")} を新しいタブで開きます。この部屋は開いたままです。`)}
          </p>
        ) : (
          <p style={{ margin: 0, opacity: 0.85 }}>
            {L("This portal's address isn't set yet. Whoever runs this deployment can set it in world.json (portals.urlPattern).", "このポータルの行き先はまだ設定されていません。このサイトの運営者が world.json(portals.urlPattern)で設定できます。")}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" style={pillButtonStyle} onClick={close}>
            {L("Stay here", "ここに残る")}
          </button>
          {url && !inXr && (
            <a href={url} target="_blank" rel="noopener noreferrer" onClick={close} style={{ ...pillButtonStyle, textDecoration: "none", fontWeight: 700, background: color, color: "#10131a" }}>
              {L(`Go to ${name}`, `${name}へ行く`)}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
