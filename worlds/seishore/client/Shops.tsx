// Buying things in Seishore, and what's on its tables. At the konbini you
// take something off a shelf and pay for it at the register (or ask there
// for a hot coffee); the vending machines, the café's counter, and the
// order tablet on each of the family restaurant's tables open a menu with
// prices. You pay from your wallet (shop.ts); a can or an onigiri is in
// your hand at once, and what's made for you is brought to the table
// nearest you, in place of whatever was there (serve.ts), to have when you
// like (heat.ts's consume, seen by the room as a drink of water is). Out of
// yen, the konbini's ATM tops you up. Every register, the ATM, the shelves
// and the tablets show their name over them as you come near.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { busyConsuming, consume, type Consumable } from "../../../src/avatar/heat";
import { speak } from "../../../src/guides/speech";
import { L, useLang } from "../../../src/i18n/lang";
import { Builder, canvasTexture, noRaycast, paint } from "../../seisugbo/client/kit";
import { showCaption } from "./caption";
import { ATM, CAFE_COUNTER, CAFE_TABLES, COUNTER, DINER_TABLES, DRINK_BAR, FRIDGES, GONDOLAS, Y } from "./plan";
import { getBasket, getPayBy, onPayBy, setPayBy, getOpenShop, getWallet, konbiniWare, onBasket, onOpenShop, onWallet, openShop, pay, setBasket, setWallet, SHOPS, withdraw, yen, type ShopId, type Ware } from "./shop";
import { clearServed, serveNearYou, setPlaces, setSelf, takeServed, useServed, type Dish } from "./serve";
import { atm, cardBeep, coinClink, register, steamWand, vendingDrop } from "./sounds";
import { Steam } from "./Extras";

const FONT = "system-ui, 'Hiragino Sans', 'Noto Sans CJK JP', sans-serif";

// --- buying -------------------------------------------------------------------------------

/** Pays for it and has it brought: the clerk's thanks, the café's wait, the kitchen's. */
export function purchase(id: ShopId, ware: Ware): boolean {
  const dish = dishFor(id, ware);
  // Handed to you, it needs a free hand; brought to a table, it waits there.
  if (!dish && busyConsuming()) {
    showCaption("まだ手がふさがっています", "Your hands are full: finish that first");
    return false;
  }
  const next = pay(getWallet(), ware);
  if (!next) {
    showCaption("お金が足りません", "Not enough yen: the konbini has an ATM at the back", 4);
    return false;
  }
  setWallet(next);
  openShop(null);
  const shop = SHOPS[id];
  // Paying: by card, a touch on the reader; in cash, the coins on the tray. One wallet either way.
  if (id !== "vending") {
    const card = getPayBy() === "card";
    showCaption(card ? "カードでお願いします" : "現金でお願いします", card ? "By card, please" : "Cash, please", 1.6);
    window.setTimeout(() => {
      if (card) {
        speak("はい、こちらにタッチしてください。", "ja-JP", { pitch: 1.1, rate: 1.1 });
        window.setTimeout(() => cardBeep(), 1300);
      } else {
        coinClink();
        speak(ware.price % 1000 === 0 ? "ちょうどお預かりします。" : "お預かりします。お釣りです。", "ja-JP", { pitch: 1.1, rate: 1.1 });
      }
    }, 700);
  }
  switch (id) {
    case "vending":
      vendingDrop();
      break;
    case "konbini":
      register();
      speak("ありがとうございましたー!", "ja-JP", { pitch: 1.25, rate: 1.05 });
      showCaption(`${ware.ja} ${yen(ware.price)}`, `${ware.en}, ${yen(ware.price)}. Thank you!`);
      break;
    case "cafe":
      register();
      speak("かしこまりました。少々お待ちください。", "ja-JP", { pitch: 1.15 });
      window.setTimeout(() => steamWand(), 1200);
      showCaption("少々お待ちください", "Just a moment: it's being made");
      break;
    case "famiresu":
      speak("かしこまりました!", "ja-JP", { pitch: 0.95 });
      showCaption("ご注文を承りました", "Order taken: it'll be right out");
      break;
    case "burger":
      register();
      speak("ありがとうございます!少々お待ちください。", "ja-JP", { pitch: 1.2, rate: 1.1 });
      showCaption("ご注文ありがとうございます", "Thanks for your order: just a moment");
      break;
    case "kissa":
      register();
      speak("かしこまりました。", "ja-JP", { pitch: 0.85 });
      window.setTimeout(() => steamWand(), 1500);
      showCaption("少々お待ちください", "Just a moment: the master is making it");
      break;
  }
  window.setTimeout(() => {
    if (dish) {
      speak("お待たせいたしました。", "ja-JP", { pitch: id === "cafe" ? 1.15 : 0.95 });
      // To the table nearest you, in place of what was there; away from any table, into your hands.
      if (serveNearYou(ware.item, dish, [ware.ja, ware.en])) {
        showCaption("お待たせいたしました", `${ware.en}: it's on your table`);
        return;
      }
      showCaption("お待たせいたしました", `Here you are: ${ware.en}`);
    }
    consume(ware.item);
  }, shop.wait * 1000);
  return true;
}

/** How what's made for you is brought (a can or an onigiri is just handed over). */
function dishFor(id: ShopId, ware: Ware): Dish | null {
  if (id === "vending" || id === "konbini") return null;
  if (id === "burger") return ware.item === "cup" ? "cup" : "tray";
  return ware.item === "cup" ? "cup" : "plate";
}

/** Opens a shop's menu; in a headset, where a menu on the screen can't be
 *  seen, buys its first thing straight away. */
export function useShop() {
  const gl = useThree((s) => s.gl);
  return (id: ShopId) => {
    if (gl.xr.isPresenting) purchase(id, SHOPS[id].wares[0]);
    else openShop(id);
  };
}

// --- the menu, on the screen ------------------------------------------------------------------

const useWallet = () => useSyncExternalStore(onWallet, getWallet, getWallet);
const useOpenShop = () => useSyncExternalStore(onOpenShop, getOpenShop, () => null);

/** The open shop's menu: what it has, at what price, and your wallet. */
export function ShopMenu() {
  useLang();
  const id = useOpenShop();
  const wallet = useWallet();
  const basket = useSyncExternalStore(onBasket, getBasket, getBasket);
  const payBy = useSyncExternalStore(onPayBy, getPayBy, getPayBy);
  useEffect(() => {
    if (!id) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && openShop(null);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [id]);
  if (!id) return basket ? <BasketPill ware={basket} /> : null;
  const shop = SHOPS[id];
  const cheapest = Math.min(...shop.wares.map((w) => w.price));
  return (
    <div
      role="dialog"
      aria-label={L(shop.en, shop.ja)}
      style={{ position: "fixed", left: "50%", bottom: 96, transform: "translateX(-50%)", zIndex: 40, width: "min(380px, calc(100vw - 32px))", padding: "14px 16px", borderRadius: 16, background: "rgba(16,18,24,0.9)", color: "#fff", fontFamily: FONT, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{shop.ja}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{shop.en}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>{L("Wallet", "財布")}</div>
          <div style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{yen(wallet.yen)}</div>
        </div>
      </div>
      <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
        {id !== "vending" && (
          <div role="radiogroup" aria-label={L("Pay by", "お支払い")} style={{ display: "flex", gap: 6, marginBottom: 2 }}>
            {(["cash", "card"] as const).map((by) => (
              <button
                key={by}
                type="button"
                role="radio"
                aria-checked={payBy === by}
                onClick={() => setPayBy(by)}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 999, border: `1px solid ${payBy === by ? "#ffe6a8" : "rgba(255,255,255,0.18)"}`, background: payBy === by ? "rgba(255,230,168,0.16)" : "transparent", color: "#fff", cursor: "pointer", font: "inherit", fontSize: 13 }}
              >
                {by === "cash" ? L("💴 Cash", "💴 現金") : L("💳 Card", "💳 カード")}
              </button>
            ))}
          </div>
        )}
        {shop.wares.map((w) => {
          const afford = wallet.yen >= w.price;
          return (
            <button
              key={w.id}
              type="button"
              disabled={!afford}
              onClick={() => purchase(id, w)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: afford ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)", color: "#fff", opacity: afford ? 1 : 0.5, cursor: afford ? "pointer" : "default", textAlign: "left", font: "inherit" }}
            >
              <span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{w.ja}</span>
                <span style={{ display: "block", fontSize: 12, opacity: 0.7 }}>{w.en}</span>
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{yen(w.price)}</span>
            </button>
          );
        })}
      </div>
      {wallet.yen < cheapest && <div style={{ fontSize: 12, opacity: 0.8, marginTop: 10 }}>{L("Out of yen? The konbini has an ATM at the back.", "お金が足りなければ、コンビニの奥にATMがあります。")}</div>}
      <button type="button" onClick={() => openShop(null)} style={{ marginTop: 12, width: "100%", padding: "8px 12px", borderRadius: 10, border: "none", background: "rgba(255,255,255,0.14)", color: "#fff", cursor: "pointer", font: "inherit", fontSize: 14 }}>
        {L("Close", "閉じる")}
      </button>
    </div>
  );
}

/** What's in your konbini basket: to pay for at the register, or put back. */
function BasketPill({ ware }: { ware: Ware }) {
  useLang();
  return (
    <div style={{ position: "fixed", left: "50%", bottom: 96, transform: "translateX(-50%)", zIndex: 40, display: "flex", alignItems: "center", gap: 10, padding: "8px 10px 8px 14px", borderRadius: 999, background: "rgba(16,18,24,0.86)", color: "#fff", fontFamily: FONT, fontSize: 14, boxShadow: "0 6px 18px rgba(0,0,0,0.3)", maxWidth: "calc(100vw - 32px)" }}>
      <span aria-hidden="true">🧺</span>
      <span>
        {L(ware.en, ware.ja)} {yen(ware.price)} · <span style={{ opacity: 0.75 }}>{L("pay at the register", "レジでお会計")}</span>
      </span>
      <button type="button" onClick={() => setBasket(null)} style={{ border: "none", borderRadius: 999, padding: "4px 10px", background: "rgba(255,255,255,0.14)", color: "#fff", cursor: "pointer", font: "inherit", fontSize: 13 }}>
        {L("Put back", "戻す")}
      </button>
    </div>
  );
}

// --- in the world ----------------------------------------------------------------------------

/** How near you have to be for a thing's name to show over it. */
const LABEL_NEAR = 2.8;
const labelTextures = new Map<string, THREE.Texture>();
/** A thing's name, in a pill: Japanese, then English. */
function labelTexture([ja, en]: [string, string]) {
  const key = `${ja}|${en}`;
  const had = labelTextures.get(key);
  if (had) return had;
  const tex = canvasTexture(512, 112, (ctx, w, h) => {
    ctx.fillStyle = "rgba(16,18,24,0.86)";
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 50);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,230,168,0.9)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(ja, w / 2, 42, w - 40);
    ctx.font = `500 26px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(en, w / 2, 84, w - 40);
  });
  labelTextures.set(key, tex);
  return tex;
}

/**
 * A place to click: invisible until you point at it, then a soft glow; and,
 * with a label, its name over it when you're near, so you can tell what it
 * is before you try it.
 */
export function Spot({ at, size, onClick, label }: { at: [number, number, number]; size: [number, number, number]; onClick: () => void; label?: [string, string] }) {
  const [hover, setHover] = useState(false);
  const tag = useRef<THREE.Sprite>(null);
  const ja = label?.[0];
  const en = label?.[1];
  const material = useMemo(() => (ja && en ? new THREE.SpriteMaterial({ map: labelTexture([ja, en]), depthTest: false, transparent: true }) : null), [ja, en]);
  useEffect(() => () => material?.dispose(), [material]);
  const eye = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!tag.current) return;
    camera.getWorldPosition(eye);
    tag.current.visible = hover || Math.hypot(eye.x - at[0], eye.z - at[2]) < LABEL_NEAR;
  });
  useEffect(() => {
    if (!hover) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hover]);
  return (
    <>
      <mesh
        position={at}
        visible={hover}
        userData={{ navIgnore: true }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <boxGeometry args={size} />
        <meshBasicMaterial color="#ffe6a8" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      {material && <sprite ref={tag} material={material} position={[at[0], at[1] + size[1] / 2 + 0.2, at[2]]} scale={[0.6, 0.13, 1]} raycast={noRaycast} visible={false} renderOrder={20} userData={{ navIgnore: true }} />}
    </>
  );
}

// --- the things you buy from, made to look like what they are ---------------------------------

/** A lit panel's face: a line or two of text on a colour. */
export function panelTexture(lines: [string, number][], bg: string, fg: string, w = 256, h = 128) {
  return canvasTexture(w, h, (ctx, cw, ch) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const total = lines.reduce((a, [, size]) => a + size * 1.15, 0);
    let y = (ch - total) / 2;
    for (const [text, size] of lines) {
      ctx.font = `800 ${size}px ${FONT}`;
      ctx.fillText(text, cw / 2, y + (size * 1.15) / 2, cw - 16);
      y += size * 1.15;
    }
  });
}

/** A register, as on any Japanese counter: the till and its drawer, the
 *  clerk's screen, the customer's display, the card reader, and the blue
 *  coin tray in front. Built facing +z (the customer's side). */
function registerGeometry() {
  const b = new Builder();
  b.box([0.42, 0.11, 0.38], [0, 0.055, 0], "#e3e4e1");
  b.box([0.36, 0.012, 0.006], [0, 0.07, 0.192], "#9da3a8");
  b.box([0.38, 0.03, 0.2], [0, 0.125, -0.05], "#3a3d42");
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) b.box([0.05, 0.012, 0.035], [-0.12 + i * 0.07, 0.145, -0.1 + j * 0.05], "#c9ccd0");
  b.box([0.04, 0.16, 0.04], [0, 0.2, -0.13], "#2b2d30");
  b.box([0.3, 0.2, 0.025], [0, 0.34, -0.14], "#202326", [-0.25, 0, 0]);
  b.box([0.03, 0.26, 0.03], [0.16, 0.24, 0.1], "#2b2d30");
  b.box([0.19, 0.09, 0.035], [0.16, 0.41, 0.1], "#202326");
  b.box([0.07, 0.03, 0.11], [0.15, 0.015, 0.29], "#2b2d30");
  b.box([0.2, 0.012, 0.13], [-0.1, 0.006, 0.3], "#3d6fb0");
  for (const dz of [-0.062, 0.062]) b.box([0.2, 0.02, 0.008], [-0.1, 0.012, 0.3 + dz], "#2f5a94");
  return b.build();
}

/** The register's pieces that show: its display, and the レジ sign over it. */
function useRegisterParts() {
  return useMemo(() => {
    const geometry = registerGeometry();
    const body = paint();
    const display = new THREE.MeshBasicMaterial({ map: panelTexture([["いらっしゃいませ", 30], ["¥ 0", 44]], "#0e2a1a", "#7dffb0"), toneMapped: false });
    const sign = new THREE.MeshBasicMaterial({ map: panelTexture([["レジ", 56], ["REGISTER", 26]], "#c8302b", "#ffffff"), toneMapped: false, side: THREE.DoubleSide });
    return { geometry, body, display, sign };
  }, []);
}

/** A register on a counter, facing the customer; with `sign`, the lit レジ plate hung over it. */
export function Register({ position, facing = 0, sign = false }: { position: [number, number, number]; facing?: number; sign?: boolean }) {
  const parts = useRegisterParts();
  useEffect(
    () => () => {
      parts.geometry.dispose();
      for (const m of [parts.body, parts.display, parts.sign]) {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      }
    },
    [parts]
  );
  return (
    <group position={position} rotation={[0, facing, 0]}>
      <mesh geometry={parts.geometry} material={parts.body} castShadow />
      <mesh position={[0.16, 0.41, 0.119]} material={parts.display}>
        <planeGeometry args={[0.17, 0.075]} />
      </mesh>
      {sign && (
        <group position={[0, 0.95, 0]}>
          <mesh material={parts.sign}>
            <planeGeometry args={[0.46, 0.2]} />
          </mesh>
          {[-0.18, 0.18].map((x) => (
            <mesh key={x} position={[x, 0.45, 0]}>
              <boxGeometry args={[0.01, 0.7, 0.01]} />
              <meshLambertMaterial color="#7d7f82" />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/** The ATM's kiosk: its lit header, the screen in its hood, the keypad, the card and cash slots. Front +z. */
function atmGeometry(w: number, d: number) {
  const b = new Builder();
  b.box([w, 1.44, d], [0, 0.72, 0], "#3a5f8a");
  b.box([w + 0.02, 0.06, d + 0.02], [0, 0.03, 0], "#2b3a52");
  // The hood round the screen.
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) b.box([0.04, 0.34, 0.14], [x, 1.1, d / 2 + 0.07], "#2b3a52");
  b.box([w, 0.04, 0.16], [0, 1.29, d / 2 + 0.08], "#2b3a52");
  // The keypad shelf, tilted, and its keys.
  b.box([w - 0.06, 0.03, 0.18], [0, 0.84, d / 2 + 0.07], "#2b3a52", [0.5, 0, 0]);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) b.box([0.05, 0.014, 0.03], [-0.07 + i * 0.07, 0.86 + j * 0.018, d / 2 + 0.03 + j * 0.032], j === 3 && i === 2 ? "#57b36a" : "#d9dde2", [0.5, 0, 0]);
  // The card slot (its green light) and the cash slot.
  b.box([0.12, 0.014, 0.02], [0.14, 0.96, d / 2 + 0.01], "#101214");
  b.box([0.02, 0.02, 0.01], [0.22, 0.96, d / 2 + 0.015], "#57e07a");
  b.box([0.3, 0.035, 0.02], [0, 0.66, d / 2 + 0.01], "#101214");
  return b.build();
}

/** The family restaurant's order tablet, in its stand. Front +x (along the table). */
function tabletGeometry() {
  const b = new Builder();
  b.box([0.1, 0.012, 0.12], [0, 0.006, 0], "#2b2d30");
  b.box([0.014, 0.16, 0.2], [0.02, 0.08, 0], "#2b2d30", [0, 0, 0.45]);
  return b.build();
}

// --- what's on the tables ----------------------------------------------------------------------

/** How long a cup or a plate stays empty before it's brought again. */
const REFILL_SECONDS = { cup: 75, plate: 120 };

interface Serving {
  id: string;
  at: [number, number, number];
  kind: "cup" | "plate";
  item: Consumable;
}

/** Each place at the café's tables (four round each, a cup at each) and the restaurant's (a plate at each). */
function servings(): Serving[] {
  const list: Serving[] = [];
  CAFE_TABLES.forEach(([x, z], t) =>
    [
      [-0.17, 0],
      [0.17, 0],
      [0, -0.17],
      [0, 0.17],
    ].forEach(([dx, dz], i) => list.push({ id: `cafe-${t}-${i}`, at: [x + dx, Y + 0.76, z + dz], kind: "cup", item: "cup" }))
  );
  DINER_TABLES.forEach(([x, z], t) =>
    [-0.28, 0.28].forEach((dx, i) => [-0.12, 0.12].forEach((dz, j) => list.push({ id: `diner-${t}-${i}-${j}`, at: [x + dx, Y + 0.79, z + dz], kind: "plate", item: "meal" })))
  );
  return list;
}

/** A plate's food: rice, a hamburg steak in its sauce, something green. */
function foodGeometry() {
  const b = new Builder();
  b.cylinder(0.045, 0.048, 0.022, [0.035, 0.012, 0], "#6e3b22", undefined, 14);
  b.cylinder(0.04, 0.042, 0.004, [0.035, 0.025, 0], "#8a4a26", undefined, 14);
  b.raw(new THREE.SphereGeometry(0.042, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1).translate(-0.045, 0.002, 0), "#f6f4ee");
  b.raw(new THREE.SphereGeometry(0.018, 8, 6).translate(0.0, 0.016, 0.06), "#5aa64a");
  b.raw(new THREE.SphereGeometry(0.012, 8, 6).translate(0.02, 0.014, -0.06), "#e8742a");
  return b.build();
}

/** A cup on its saucer (the coffee's surface is its own mesh, so it can be drunk). */
function cupGeometry() {
  const b = new Builder();
  b.cylinder(0.065, 0.06, 0.008, [0, 0.004, 0], "#f4f2ec", undefined, 16);
  b.cylinder(0.042, 0.034, 0.075, [0, 0.045, 0], "#f4f2ec", undefined, 14);
  b.raw(new THREE.TorusGeometry(0.018, 0.005, 6, 10, Math.PI).rotateZ(-Math.PI / 2).translate(0.045, 0.045, 0), "#f4f2ec");
  return b.build();
}

/** A plate brought to a table: the plate itself, with the meal on it. */
function plateGeometry() {
  const b = new Builder();
  b.cylinder(0.13, 0.11, 0.02, [0, 0.01, 0], "#ffffff", undefined, 16);
  return b.build();
}

/** SeaBurger's tray: the tray, its paper, a burger, fries in their box, a drink. */
function trayGeometry() {
  const b = new Builder();
  b.box([0.34, 0.015, 0.26], [0, 0.008, 0], "#c8402f");
  b.box([0.3, 0.002, 0.22], [0, 0.017, 0], "#f2e3c4");
  b.cylinder(0.05, 0.055, 0.025, [-0.06, 0.03, 0.02], "#d9a05b", undefined, 14);
  b.cylinder(0.052, 0.052, 0.016, [-0.06, 0.05, 0.02], "#6e3b22", undefined, 14);
  b.raw(new THREE.SphereGeometry(0.055, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(-0.06, 0.058, 0.02), "#e0a454");
  b.box([0.07, 0.07, 0.04], [0.07, 0.05, -0.05], "#c8302b");
  for (let i = 0; i < 6; i++) b.box([0.008, 0.05, 0.008], [0.05 + i * 0.008, 0.1, -0.05 + (i % 2) * 0.01], "#f2c94c");
  b.cylinder(0.03, 0.026, 0.1, [0.09, 0.066, 0.06], "#9fe07a", undefined, 12);
  return b.build();
}

/**
 * The shops' counters, the ATM, the drink bar, the konbini's shelves, and
 * the tables: what you click to buy, or to have what's there; and what's
 * been brought to each table.
 */
export function ShopsScene() {
  const shop = useShop();
  const list = useMemo(servings, []);
  const served = useServed();
  const basket = useSyncExternalStore(onBasket, getBasket, getBasket);
  // Every place here an order can be brought to.
  useEffect(() => {
    setPlaces("town", list.map((s) => ({ id: s.id, at: s.at })));
    return () => {
      setPlaces("town", null);
      clearServed();
    };
  }, [list]);
  const eye = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    camera.getWorldPosition(eye);
    setSelf(eye.x, eye.z);
  });
  // When each empty one is brought again (Date.now), by id.
  const [empty, setEmpty] = useState<Record<string, number>>({});
  useEffect(() => {
    const ids = Object.keys(empty);
    if (!ids.length) return;
    const next = Math.min(...ids.map((id) => empty[id]));
    const timer = window.setTimeout(() => setEmpty((e) => Object.fromEntries(Object.entries(e).filter(([, at]) => at > Date.now()))), Math.max(200, next - Date.now()));
    return () => window.clearTimeout(timer);
  }, [empty]);
  const have = (s: Serving) => {
    if (empty[s.id]) {
      showCaption(s.kind === "cup" ? "空です。おかわりはもうすぐ" : "お皿は空です。すぐに次が来ます", s.kind === "cup" ? "Empty: a refill's on its way" : "All gone: another's on its way");
      return;
    }
    if (!consume(s.item)) {
      showCaption("まだ手がふさがっています", "Your hands are full: finish that first");
      return;
    }
    setEmpty((e) => ({ ...e, [s.id]: Date.now() + REFILL_SECONDS[s.kind] * 1000 }));
  };
  const drinkBar = () => {
    if (!getWallet().drinkBar) {
      showCaption("ドリンクバーはご注文を", "The drink bar's on the menu: order it once, refills are free", 4);
      shop("famiresu");
      return;
    }
    if (consume("cup")) showCaption("ドリンクバー — おかわり自由", "Drink bar: help yourself");
  };
  const atATM = () => {
    const before = getWallet();
    const after = withdraw(before);
    if (after.yen === before.yen) {
      showCaption("お財布はいっぱいです", "Your wallet's full enough");
      return;
    }
    atm();
    setWallet(after);
    showCaption(`${yen(after.yen - before.yen)} を引き出しました`, `Took out ${yen(after.yen - before.yen)}: you have ${yen(after.yen)}`, 4);
  };
  // The konbini: take something off a shelf, then pay for it at the register.
  const pick = (id: string) => {
    const ware = konbiniWare(id);
    setBasket(ware);
    showCaption(`${ware.ja}をかごに`, `${ware.en} in your basket: take it to the register`, 4);
  };
  const atRegister = () => {
    const ware = getBasket();
    if (!ware) {
      shop("konbini");
      return;
    }
    if (purchase("konbini", ware)) setBasket(null);
  };

  const geo = useMemo(() => ({ food: foodGeometry(), cup: cupGeometry(), plate: plateGeometry(), tray: trayGeometry(), atm: atmGeometry(ATM.x1 - ATM.x0, ATM.z1 - ATM.z0), tablet: tabletGeometry() }), []);
  const m = useMemo(
    () => ({
      coffee: new THREE.MeshLambertMaterial({ color: "#3b2416" }),
      food: paint(),
      atm: paint(),
      header: new THREE.MeshBasicMaterial({ map: panelTexture([["ATM", 64], ["24時間 · 24 hours", 22]], "#1d3f7a", "#ffffff"), toneMapped: false }),
      screen: new THREE.MeshBasicMaterial({ map: panelTexture([["お引出し", 40], ["Withdraw ¥5,000", 24], ["カードを入れてください", 18]], "#bfeaf5", "#0f3a5a"), toneMapped: false }),
      order: new THREE.MeshBasicMaterial({ map: panelTexture([["ご注文", 44], ["Order here", 26]], "#ffffff", "#c2523d", 192, 128), toneMapped: false }),
    }),
    []
  );
  const surface = useMemo(() => new THREE.CircleGeometry(0.036, 16).rotateX(-Math.PI / 2), []);
  useEffect(
    () => () => {
      for (const g of Object.values(geo)) g.dispose();
      surface.dispose();
      for (const mat of Object.values(m)) {
        (mat as THREE.MeshBasicMaterial).map?.dispose();
        mat.dispose();
      }
    },
    [geo, surface, m]
  );
  const servedAt = new Set(served.map((s) => s.place));
  const steam = useMemo<[number, number, number][]>(
    () => [...list.filter((s) => s.kind === "cup" && !empty[s.id]).map((s): [number, number, number] => [s.at[0], s.at[1] + 0.1, s.at[2]]), [CAFE_COUNTER.x0 + 0.55, Y + 1.55, (CAFE_COUNTER.z0 + CAFE_COUNTER.z1) / 2]],
    [list, empty]
  );
  const atmAt: [number, number, number] = [(ATM.x0 + ATM.x1) / 2, Y, (ATM.z0 + ATM.z1) / 2];
  const atmD = ATM.z1 - ATM.z0;
  const top = Y + 1.045;
  const half = (GONDOLAS[0].z0 + GONDOLAS[0].z1) / 2;

  return (
    <>
      {/* The konbini's register (and the レジ sign over it), the café's. */}
      <Register position={[COUNTER.x0 + 0.3, top, COUNTER.z1 - 0.6]} facing={-Math.PI / 2} sign />
      <Spot at={[COUNTER.x0 + 0.3, Y + 1.25, COUNTER.z1 - 0.6]} size={[0.6, 0.5, 0.6]} onClick={atRegister} label={basket ? ["レジ — お会計", `Register: pay for the ${basket.en.toLowerCase()}`] : ["レジ", "Register"]} />
      <Register position={[CAFE_COUNTER.x0 + 2.05, top, (CAFE_COUNTER.z0 + CAFE_COUNTER.z1) / 2]} />
      <Spot at={[(CAFE_COUNTER.x0 + CAFE_COUNTER.x1) / 2 + 0.4, Y + 1.15, (CAFE_COUNTER.z0 + CAFE_COUNTER.z1) / 2]} size={[1.6, 0.35, 0.7]} onClick={() => shop("cafe")} label={["ご注文はこちら", "Order at the counter"]} />
      {/* The konbini's shelves: take something to the register. */}
      <Spot at={[(GONDOLAS[0].x0 + GONDOLAS[0].x1) / 2, Y + 0.75, (GONDOLAS[0].z0 + half) / 2]} size={[0.75, 1.4, half - GONDOLAS[0].z0]} onClick={() => pick("shake")} label={["鮭おにぎり ¥160", "Salmon onigiri"]} />
      <Spot at={[(GONDOLAS[0].x0 + GONDOLAS[0].x1) / 2, Y + 0.75, (half + GONDOLAS[0].z1) / 2]} size={[0.75, 1.4, GONDOLAS[0].z1 - half]} onClick={() => pick("tuna")} label={["ツナマヨ ¥150", "Tuna-mayo onigiri"]} />
      <Spot at={[(GONDOLAS[1].x0 + GONDOLAS[1].x1) / 2, Y + 0.75, (GONDOLAS[1].z0 + GONDOLAS[1].z1) / 2]} size={[0.75, 1.4, GONDOLAS[1].z1 - GONDOLAS[1].z0]} onClick={() => pick("tamago")} label={["サンドイッチ ¥280", "Egg sandwiches"]} />
      <Spot at={[(FRIDGES.x0 + FRIDGES.x1) / 2, Y + 1.05, FRIDGES.z1 + 0.06]} size={[FRIDGES.x1 - FRIDGES.x0, 1.7, 0.14]} onClick={() => pick("tea")} label={["お茶 ¥160", "Green tea, from the fridge"]} />
      {/* The restaurant's order tablets, one at each table, and the drink bar. */}
      {DINER_TABLES.map(([x, z], i) => (
        <group key={i}>
          <group position={[x - 0.5, Y + 0.765, z]}>
            <mesh geometry={geo.tablet} material={m.food} />
            <mesh position={[0.026, 0.085, 0]} rotation={[0, Math.PI / 2, 0.45]} material={m.order}>
              <planeGeometry args={[0.18, 0.13]} />
            </mesh>
          </group>
          <Spot at={[x - 0.48, Y + 0.87, z]} size={[0.24, 0.3, 0.26]} onClick={() => shop("famiresu")} label={["ご注文", "Order from the tablet"]} />
        </group>
      ))}
      <Spot at={[(DRINK_BAR.x0 + DRINK_BAR.x1) / 2, Y + 1.2, (DRINK_BAR.z0 + DRINK_BAR.z1) / 2]} size={[0.6, 0.45, 1.9]} onClick={drinkBar} label={["ドリンクバー", "Drink bar"]} />
      {/* The ATM, in the konbini's back corner, its screen to the room. */}
      <group position={atmAt}>
        <mesh geometry={geo.atm} material={m.atm} castShadow />
        <mesh position={[0, 1.54, atmD / 2 + 0.006]} material={m.header}>
          <planeGeometry args={[ATM.x1 - ATM.x0, 0.2]} />
        </mesh>
        <mesh position={[0, 1.54, 0]}>
          <boxGeometry args={[ATM.x1 - ATM.x0, 0.2, atmD]} />
          <meshLambertMaterial color="#1d3f7a" />
        </mesh>
        <mesh position={[0, 1.1, atmD / 2 + 0.005]} material={m.screen}>
          <planeGeometry args={[0.36, 0.26]} />
        </mesh>
      </group>
      <Spot at={[atmAt[0], Y + 1.0, atmAt[2] + 0.1]} size={[0.65, 0.8, 0.7]} onClick={atATM} label={["ATM", "Cash: ¥5,000 at a time"]} />
      {/* What's on the tables: theirs, or what you ordered in its place. */}
      {list.map((s) =>
        servedAt.has(s.id) ? null : s.kind === "cup" ? (
          <group key={s.id}>
            <mesh geometry={geo.cup} material={m.food} position={s.at} />
            {!empty[s.id] && <mesh geometry={surface} material={m.coffee} position={[s.at[0], s.at[1] + 0.078, s.at[2]]} />}
            <Spot at={[s.at[0], s.at[1] + 0.04, s.at[2]]} size={[0.13, 0.14, 0.13]} onClick={() => have(s)} />
          </group>
        ) : (
          <group key={s.id}>
            {!empty[s.id] && <mesh geometry={geo.food} material={m.food} position={s.at} />}
            <Spot at={[s.at[0], s.at[1] + 0.04, s.at[2]]} size={[0.27, 0.1, 0.24]} onClick={() => have(s)} />
          </group>
        )
      )}
      {served.map((s) => (
        <group key={s.place}>
          {s.dish === "cup" ? (
            <>
              <mesh geometry={geo.cup} material={m.food} position={s.at} />
              <mesh geometry={surface} material={m.coffee} position={[s.at[0], s.at[1] + 0.078, s.at[2]]} />
            </>
          ) : s.dish === "tray" ? (
            <mesh geometry={geo.tray} material={m.food} position={s.at} />
          ) : (
            <>
              <mesh geometry={geo.plate} material={m.food} position={s.at} />
              <mesh geometry={geo.food} material={m.food} position={[s.at[0], s.at[1] + 0.02, s.at[2]]} />
            </>
          )}
          <Spot
            at={[s.at[0], s.at[1] + 0.06, s.at[2]]}
            size={[0.3, 0.16, 0.26]}
            label={[s.name[0], "Yours: click to have it"]}
            onClick={() => {
              if (!consume(s.item)) {
                showCaption("まだ手がふさがっています", "Your hands are full: finish that first");
                return;
              }
              takeServed(s.place);
              showCaption("いただきます", `${s.name[1]}: enjoy`);
            }}
          />
        </group>
      ))}
      <Steam key={steam.length} at={steam} rise={0.35} size={0.07} opacity={0.3} />
    </>
  );
}
