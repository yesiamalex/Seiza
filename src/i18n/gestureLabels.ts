import type { GestureDefinition } from "../avatar/gestures";
import { L } from "./lang";

/** Built-in gesture names in Japanese, by gesture name. A deployment's
 *  custom gestures keep the label their world.json gives them. */
const BUILTIN_JA: Record<string, string> = {
  wave: "手を振る",
  bow: "お辞儀",
  crouch: "しゃがむ(長押し)",
  seiza: "正座(長押し)",
  nod: "うなずく",
  clap: "拍手",
  cheer: "喜ぶ",
  shrug: "肩をすくめる",
  point: "指さす",
  gassho: "合掌(感謝)",
  raisehand: "手を挙げる(長押し)",
  sit: "座る",
  lie: "横になる",
  dance: "ダンス",
  slowdancelead: "スローダンス(リード)",
  slowdancefollow: "スローダンス(フォロー)",
  fistbump: "グータッチ",
  dap: "ダップ",
  handshake: "握手",
  highfive: "ハイタッチ",
  hug: "ハグ",
};

/** A gesture's label in the visitor's language. */
export function gestureLabel(g: Pick<GestureDefinition, "name" | "label" | "source">): string {
  const ja = g.source === "builtin" ? BUILTIN_JA[g.name] : undefined;
  return ja ? L(g.label, ja) : g.label;
}
