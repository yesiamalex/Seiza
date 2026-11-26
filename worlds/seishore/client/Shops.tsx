// Buying things in Seishore, and what's on its tables. The vending
// machines, the konbini's register, the café's counter, and the menu on
// each of the family restaurant's tables open a menu with prices; you pay
// from your wallet (shop.ts), and a moment later it's in your hand: a can,
// an onigiri, a coffee, a fork and your meal (heat.ts's consume, seen by
// the room as a drink of water is). Out of yen, the konbini's ATM tops you
// up. The café's tables have coffee in their cups and the restaurant's
// plates have food on them: have one, and it's refilled a while later.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { busyConsuming, consume, type Consumable } from "../../../src/avatar/heat";
import { speak } from "../../../src/guides/speech";
import { L, useLang } from "../../../src/i18n/lang";
import { Builder, paint } from "../../seisugbo/client/kit";
import { showCaption } from "./caption";
import { ATM, CAFE_COUNTER, CAFE_TABLES, COUNTER, DINER_TABLES, DRINK_BAR, Y } from "./plan";
import { getOpenShop, getWallet, onOpenShop, onWallet, openShop, pay, setWallet, SHOPS, withdraw, yen, type ShopId, type Ware } from "./shop";
import { atm, register, steamWand, vendingDrop } from "./sounds";
import { Steam } from "./Extras";

const FONT = "system-ui, 'Hiragino Sans', 'Noto Sans CJK JP', sans-serif";

// --- buying -------------------------------------------------------------------------------

/** Pays for it and has it brought: the clerk's thanks, the café's wait, the kitchen's. */
export function purchase(id: ShopId, ware: Ware) {
  if (busyConsuming()) {
    showCaption("まだ手がふさがっています", "Your hands are full: finish that first");
    return;
  }
  const next = pay(getWallet(), ware);
  if (!next) {
    showCaption("お金が足りません", "Not enough yen: the konbini has an ATM at the back", 4);
    return;
  }
  setWallet(next);
  openShop(null);
  const shop = SHOPS[id];
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
  }
  window.setTimeout(() => {
    if (id === "cafe" || id === "famiresu") {
      speak("お待たせいたしました。", "ja-JP", { pitch: id === "cafe" ? 1.15 : 0.95 });
      showCaption("お待たせいたしました", `Here you are: ${ware.en}`);
    }
    consume(ware.item);
  }, shop.wait * 1000);
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
  useEffect(() => {
    if (!id) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && openShop(null);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [id]);
  if (!id) return null;
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

// --- in the world ----------------------------------------------------------------------------

/** A place to click: invisible until you point at it, then a soft glow. */
function Spot({ at, size, onClick }: { at: [number, number, number]; size: [number, number, number]; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!hover) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hover]);
  return (
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
  );
}

/** How long a cup or a plate stays empty before it's brought again. */
const REFILL_SECONDS = { cup: 75, plate: 120 };

interface Serving {
  id: string;
  at: [number, number, number];
  kind: "cup" | "plate";
  item: Consumable;
}

function servings(): Serving[] {
  const list: Serving[] = [];
  CAFE_TABLES.forEach(([x, z], t) => [-0.14, 0.14].forEach((dx, i) => list.push({ id: `cafe-${t}-${i}`, at: [x + dx, Y + 0.8, z], kind: "cup", item: "cup" })));
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

/**
 * The shops' counters, the ATM, the drink bar, and the tables' cups and
 * plates: what you click to buy, or to have what's there.
 */
export function ShopsScene() {
  const shop = useShop();
  const list = useMemo(servings, []);
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

  const food = useMemo(foodGeometry, []);
  const m = useMemo(
    () => ({
      coffee: new THREE.MeshLambertMaterial({ color: "#3b2416" }),
      food: paint(),
      atm: new THREE.MeshLambertMaterial({ color: "#3a5f8a" }),
      screen: new THREE.MeshBasicMaterial({ color: "#8fe0f0", toneMapped: false }),
    }),
    []
  );
  const surface = useMemo(() => new THREE.CircleGeometry(0.037, 16).rotateX(-Math.PI / 2), []);
  useEffect(
    () => () => {
      food.dispose();
      surface.dispose();
      for (const mat of Object.values(m)) mat.dispose();
    },
    [food, surface, m]
  );
  const steam = useMemo<[number, number, number][]>(
    () => [...list.filter((s) => s.kind === "cup" && !empty[s.id]).map((s): [number, number, number] => [s.at[0], s.at[1] + 0.08, s.at[2]]), [CAFE_COUNTER.x0 + 0.55, Y + 1.55, (CAFE_COUNTER.z0 + CAFE_COUNTER.z1) / 2]],
    [list, empty]
  );
  const atmAt: [number, number, number] = [(ATM.x0 + ATM.x1) / 2, Y, (ATM.z0 + ATM.z1) / 2];

  return (
    <>
      {/* The konbini's register, the café's counter, each table's menu. */}
      <Spot at={[COUNTER.x0 + 0.3, Y + 1.2, COUNTER.z1 - 0.6]} size={[0.5, 0.45, 0.6]} onClick={() => shop("konbini")} />
      <Spot at={[(CAFE_COUNTER.x0 + CAFE_COUNTER.x1) / 2 + 0.4, Y + 1.15, (CAFE_COUNTER.z0 + CAFE_COUNTER.z1) / 2]} size={[1.6, 0.35, 0.7]} onClick={() => shop("cafe")} />
      {DINER_TABLES.map(([x, z], i) => (
        <Spot key={i} at={[x - 0.48, Y + 0.87, z]} size={[0.22, 0.3, 0.2]} onClick={() => shop("famiresu")} />
      ))}
      <Spot at={[(DRINK_BAR.x0 + DRINK_BAR.x1) / 2, Y + 1.2, (DRINK_BAR.z0 + DRINK_BAR.z1) / 2]} size={[0.6, 0.45, 1.9]} onClick={drinkBar} />
      {/* The ATM, in the konbini's back corner, its screen to the room. */}
      <group position={atmAt}>
        <mesh position={[0, 0.72, 0]} material={m.atm} castShadow>
          <boxGeometry args={[ATM.x1 - ATM.x0, 1.44, ATM.z1 - ATM.z0]} />
        </mesh>
        <mesh position={[0, 1.08, (ATM.z1 - ATM.z0) / 2 + 0.005]} material={m.screen}>
          <planeGeometry args={[0.34, 0.24]} />
        </mesh>
        <mesh position={[0, 0.82, (ATM.z1 - ATM.z0) / 2 + 0.06]} rotation={[-0.6, 0, 0]} material={m.atm}>
          <boxGeometry args={[0.4, 0.02, 0.16]} />
        </mesh>
      </group>
      <Spot at={[atmAt[0], Y + 1.0, atmAt[2] + 0.1]} size={[0.65, 0.8, 0.7]} onClick={atATM} />
      {/* What's on the tables. */}
      {list.map((s) =>
        s.kind === "cup" ? (
          <group key={s.id}>
            {!empty[s.id] && <mesh geometry={surface} material={m.coffee} position={[s.at[0], s.at[1] + 0.0415, s.at[2]]} />}
            <Spot at={[s.at[0], s.at[1] + 0.02, s.at[2]]} size={[0.13, 0.14, 0.13]} onClick={() => have(s)} />
          </group>
        ) : (
          <group key={s.id}>
            {!empty[s.id] && <mesh geometry={food} material={m.food} position={s.at} />}
            <Spot at={[s.at[0], s.at[1] + 0.04, s.at[2]]} size={[0.27, 0.1, 0.24]} onClick={() => have(s)} />
          </group>
        )
      )}
      <Steam key={steam.length} at={steam} rise={0.35} size={0.07} opacity={0.3} />
    </>
  );
}
