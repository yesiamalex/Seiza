// What Seishore sells, at what price, and the yen in your wallet. The
// wallet is yours, in this browser (a visit's pocket money: it isn't real
// money and nothing is sent anywhere); the konbini's ATM tops it up.
import type { Consumable } from "../../../src/avatar/heat";

export type ShopId = "vending" | "konbini" | "cafe" | "famiresu" | "burger" | "kissa";

export interface Ware {
  id: string;
  ja: string;
  en: string;
  /** Yen. */
  price: number;
  /** What's in your hand for it. */
  item: Consumable;
}

export interface Shop {
  ja: string;
  en: string;
  wares: Ware[];
  /** Seconds from paying to having it in hand (the café makes it; the kitchen cooks). */
  wait: number;
}

export const SHOPS: Record<ShopId, Shop> = {
  burger: {
    ja: "シーバーガー",
    en: "SeaBurger",
    wait: 3,
    wares: [
      { id: "teri", ja: "てりやきバーガー", en: "Teriyaki burger", price: 390, item: "sandwich" },
      { id: "shrimp", ja: "えびバーガー", en: "Shrimp burger", price: 420, item: "sandwich" },
      { id: "fries", ja: "ポテト", en: "Fries", price: 260, item: "meal" },
      { id: "melon", ja: "メロンソーダ", en: "Melon soda", price: 200, item: "cup" },
    ],
  },
  kissa: {
    ja: "喫茶 波音",
    en: "Kissa Namioto",
    wait: 4,
    wares: [
      { id: "blend", ja: "ブレンドコーヒー", en: "House blend", price: 480, item: "cup" },
      { id: "cream", ja: "クリームソーダ", en: "Cream soda", price: 620, item: "cup" },
      { id: "napolitan", ja: "ナポリタン", en: "Napolitan spaghetti", price: 850, item: "meal" },
      { id: "pudding", ja: "プリン", en: "Custard pudding", price: 450, item: "meal" },
    ],
  },
  vending: {
    ja: "自動販売機",
    en: "Vending machine",
    wait: 1.3,
    wares: [
      { id: "water", ja: "天然水", en: "Mineral water", price: 110, item: "water" },
      { id: "tea", ja: "緑茶", en: "Green tea", price: 150, item: "tea" },
      { id: "can", ja: "缶コーヒー", en: "Canned coffee", price: 130, item: "coffeeCan" },
    ],
  },
  konbini: {
    ja: "うみマート",
    en: "Umi Mart",
    wait: 0.9,
    wares: [
      { id: "shake", ja: "鮭おにぎり", en: "Salmon onigiri", price: 160, item: "onigiri" },
      { id: "tuna", ja: "ツナマヨおにぎり", en: "Tuna-mayo onigiri", price: 150, item: "onigiri" },
      { id: "tamago", ja: "たまごサンド", en: "Egg sandwich", price: 280, item: "sandwich" },
      { id: "hot", ja: "ホットコーヒー", en: "Hot coffee", price: 120, item: "cup" },
      { id: "tea", ja: "緑茶", en: "Green tea", price: 160, item: "tea" },
    ],
  },
  cafe: {
    ja: "カフェ「潮騒」",
    en: "Shiosai café",
    wait: 4,
    wares: [
      { id: "drip", ja: "ハンドドリップ", en: "Hand-drip coffee", price: 450, item: "cup" },
      { id: "latte", ja: "カフェラテ", en: "Café latte", price: 520, item: "cup" },
      { id: "matcha", ja: "抹茶ラテ", en: "Matcha latte", price: 550, item: "cup" },
      { id: "toast", ja: "ホットサンド", en: "Toasted sandwich", price: 680, item: "sandwich" },
    ],
  },
  famiresu: {
    ja: "はまキッチン",
    en: "Hama Kitchen",
    wait: 7,
    wares: [
      { id: "hamburg", ja: "ハンバーグセット", en: "Hamburg steak set", price: 990, item: "meal" },
      { id: "curry", ja: "カレーライス", en: "Curry rice", price: 790, item: "meal" },
      { id: "doria", ja: "ミラノ風ドリア", en: "Rice gratin (doria)", price: 390, item: "meal" },
      { id: "drinkbar", ja: "ドリンクバー", en: "Drink bar (free refills)", price: 290, item: "cup" },
    ],
  },
};

/** What a visit starts with, and the most the ATM will take you to. */
export const START_YEN = 3000;
export const ATM_YEN = 5000;
export const MAX_YEN = 10000;
const KEY = "seishore-wallet";

export interface Wallet {
  yen: number;
  /** Paid for the drink bar this visit: its refills are free. */
  drinkBar: boolean;
}

/** A purchase, if you can afford it: the wallet after. */
export function pay(wallet: Wallet, ware: Ware): Wallet | null {
  if (wallet.yen < ware.price) return null;
  return { yen: wallet.yen - ware.price, drinkBar: wallet.drinkBar || ware.id === "drinkbar" };
}

/** The ATM: up by ATM_YEN, to MAX_YEN at most. */
export function withdraw(wallet: Wallet): Wallet {
  return { ...wallet, yen: Math.min(MAX_YEN, wallet.yen + ATM_YEN) };
}

export const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;

// --- the wallet you carry --------------------------------------------------------------------

function load(): Wallet {
  try {
    const n = Number(localStorage.getItem(KEY));
    if (Number.isFinite(n) && n >= 0 && localStorage.getItem(KEY) !== null) return { yen: Math.min(MAX_YEN, Math.floor(n)), drinkBar: false };
  } catch {
    // No storage: a fresh wallet.
  }
  return { yen: START_YEN, drinkBar: false };
}
let wallet: Wallet | null = null;
const listeners = new Set<() => void>();

export function getWallet(): Wallet {
  wallet ??= load();
  return wallet;
}

export function setWallet(next: Wallet): void {
  wallet = next;
  try {
    localStorage.setItem(KEY, String(next.yen));
  } catch {
    // Kept for this visit.
  }
  for (const l of listeners) l();
}

export function onWallet(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

// --- which shop's menu is open -----------------------------------------------------------------

let open: ShopId | null = null;
const shopListeners = new Set<() => void>();
export const getOpenShop = () => open;
export function openShop(id: ShopId | null): void {
  open = id;
  for (const l of shopListeners) l();
}
export function onOpenShop(l: () => void): () => void {
  shopListeners.add(l);
  return () => shopListeners.delete(l);
}

// --- the konbini's basket: what you've taken off a shelf, to pay for at the register ----------

let basket: Ware | null = null;
const basketListeners = new Set<() => void>();
export const getBasket = () => basket;
/** Takes something off a konbini shelf (one thing at a time: it replaces what you had). */
export function setBasket(ware: Ware | null): void {
  basket = ware;
  for (const l of basketListeners) l();
}
export function onBasket(l: () => void): () => void {
  basketListeners.add(l);
  return () => basketListeners.delete(l);
}
/** A konbini ware by its id. */
export const konbiniWare = (id: string): Ware => SHOPS.konbini.wares.find((w) => w.id === id) ?? SHOPS.konbini.wares[0];

// --- how you pay: cash or card (both from the same wallet) ------------------------------------

export type PayBy = "cash" | "card";
let payBy: PayBy = "cash";
const payListeners = new Set<() => void>();
export const getPayBy = () => payBy;
export function setPayBy(next: PayBy): void {
  payBy = next;
  for (const l of payListeners) l();
}
export function onPayBy(l: () => void): () => void {
  payListeners.add(l);
  return () => payListeners.delete(l);
}
