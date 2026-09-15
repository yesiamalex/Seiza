/**
 * Data model for Seiza's built-in avatar designer.
 *
 * A designed avatar is never a file. It's this small spec, and every client
 * builds the same humanoid from it locally (buildDesignerVrm.ts). That means
 * no upload, no storage in the deployer's KV namespace, nothing to
 * license-check (all geometry is generated in code), and a network payload
 * of a few hundred bytes instead of a multi-megabyte VRM.
 *
 * The spec travels inside the ordinary `avatarUrl` field as
 * `seiza-avatar:v1:<base64url JSON>`, so the multiplayer protocol didn't need
 * a second avatar field. worker/room.ts validates that shape before relaying
 * it, and `decodeAvatarSpec` re-validates every field on the receiving end.
 */

export const DESIGNER_AVATAR_PREFIX = "seiza-avatar:v1:";

export const HAIR_STYLES = ["short", "bob", "long", "ponytail", "bun", "buzz", "none"] as const;
export const TOP_STYLES = ["tshirt", "longsleeve", "hoodie", "blazer", "dress"] as const;
export const BOTTOM_STYLES = ["pants", "shorts", "skirt"] as const;
export const ACCESSORIES = ["glasses", "cap", "headphones", "tie"] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type TopStyle = (typeof TOP_STYLES)[number];
export type BottomStyle = (typeof BOTTOM_STYLES)[number];
export type Accessory = (typeof ACCESSORIES)[number];

export interface AvatarSpec {
  skin: string;
  hairStyle: HairStyle;
  hairColor: string;
  eyeColor: string;
  top: TopStyle;
  topColor: string;
  bottom: BottomStyle;
  bottomColor: string;
  shoeColor: string;
  accessories: Accessory[];
  accessoryColor: string;
  /** Overall height multiplier, 0.88–1.12. */
  height: number;
  /** Width of shoulders and limbs, 0.85–1.2. */
  build: number;
}

export const SKIN_TONES = ["#f6d7c3", "#eec1a0", "#d9a07a", "#b87a55", "#8d5a3b", "#5e3b26"];
export const HAIR_COLORS = ["#1f1a17", "#4a2f22", "#8a5a33", "#d4a860", "#b3413b", "#e7e2dc", "#e993b8", "#4d6fbf"];
export const EYE_COLORS = ["#2e2118", "#3e6fb0", "#4c8a4a", "#7a5230", "#6b4aa0", "#222222"];
export const CLOTHING_COLORS = [
  "#1d2433", "#2f3b52", "#6b6f78", "#f2f0eb", "#1f1f1f", "#8c2f39",
  "#d97b3f", "#e8c37a", "#3d7a5a", "#4f8fc9", "#9a4fc9", "#e993b8",
];

export const DEFAULT_AVATAR_SPEC: AvatarSpec = {
  skin: "#eec1a0",
  hairStyle: "short",
  hairColor: "#4a2f22",
  eyeColor: "#2e2118",
  top: "hoodie",
  topColor: "#4f8fc9",
  bottom: "pants",
  bottomColor: "#2f3b52",
  shoeColor: "#f2f0eb",
  accessories: [],
  accessoryColor: "#1f1f1f",
  height: 1,
  build: 1,
};

export interface AvatarDesignPreset {
  id: string;
  label: string;
  spec: AvatarSpec;
}

/** Built-in starting points. Entirely generated in code — no assets. */
export const AVATAR_DESIGN_PRESETS: AvatarDesignPreset[] = [
  {
    id: "businessman",
    label: "Businessman",
    spec: {
      ...DEFAULT_AVATAR_SPEC,
      hairStyle: "short",
      hairColor: "#1f1a17",
      top: "blazer",
      topColor: "#1d2433",
      bottom: "pants",
      bottomColor: "#1d2433",
      shoeColor: "#1f1f1f",
      accessories: ["tie"],
      accessoryColor: "#8c2f39",
      height: 1.04,
      build: 1.06,
    },
  },
  {
    id: "businesswoman",
    label: "Businesswoman",
    spec: {
      ...DEFAULT_AVATAR_SPEC,
      skin: "#f6d7c3",
      hairStyle: "bob",
      hairColor: "#4a2f22",
      eyeColor: "#3e6fb0",
      top: "blazer",
      topColor: "#2f3b52",
      bottom: "skirt",
      bottomColor: "#2f3b52",
      shoeColor: "#1f1f1f",
      accessories: ["glasses"],
      accessoryColor: "#1f1f1f",
      height: 0.96,
      build: 0.92,
    },
  },
  {
    id: "casual",
    label: "Casual",
    spec: {
      ...DEFAULT_AVATAR_SPEC,
      skin: "#d9a07a",
      hairStyle: "ponytail",
      hairColor: "#8a5a33",
      top: "tshirt",
      topColor: "#d97b3f",
      bottom: "shorts",
      bottomColor: "#3d7a5a",
      shoeColor: "#f2f0eb",
      accessories: ["cap"],
      accessoryColor: "#1d2433",
      height: 0.98,
      build: 0.98,
    },
  },
  {
    id: "student",
    label: "Student",
    spec: {
      ...DEFAULT_AVATAR_SPEC,
      skin: "#f6d7c3",
      hairStyle: "long",
      hairColor: "#1f1a17",
      top: "longsleeve",
      topColor: "#f2f0eb",
      bottom: "skirt",
      bottomColor: "#8c2f39",
      shoeColor: "#4a2f22",
      accessories: [],
      height: 0.94,
      build: 0.9,
    },
  },
  {
    id: "creative",
    label: "Creative",
    spec: {
      ...DEFAULT_AVATAR_SPEC,
      skin: "#8d5a3b",
      hairStyle: "bun",
      hairColor: "#e993b8",
      eyeColor: "#6b4aa0",
      top: "hoodie",
      topColor: "#9a4fc9",
      bottom: "pants",
      bottomColor: "#1f1f1f",
      shoeColor: "#e8c37a",
      accessories: ["headphones"],
      accessoryColor: "#e8c37a",
      height: 1,
      build: 1,
    },
  },
];

const HEX = /^#[0-9a-f]{6}$/i;
const color = (value: unknown, fallback: string) => (typeof value === "string" && HEX.test(value) ? value.toLowerCase() : fallback);
const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;
const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Coerces anything into a valid spec. Never throws; unknown values fall
 *  back to defaults, so a malformed or hostile payload just renders as a
 *  plain avatar instead of breaking the scene. */
export function sanitizeAvatarSpec(input: unknown): AvatarSpec {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_AVATAR_SPEC;
  const accessories = Array.isArray(raw.accessories)
    ? [...new Set(raw.accessories.filter((a): a is Accessory => typeof a === "string" && (ACCESSORIES as readonly string[]).includes(a)))]
    : [];
  return {
    skin: color(raw.skin, d.skin),
    hairStyle: pick(raw.hairStyle, HAIR_STYLES, d.hairStyle),
    hairColor: color(raw.hairColor, d.hairColor),
    eyeColor: color(raw.eyeColor, d.eyeColor),
    top: pick(raw.top, TOP_STYLES, d.top),
    topColor: color(raw.topColor, d.topColor),
    bottom: pick(raw.bottom, BOTTOM_STYLES, d.bottom),
    bottomColor: color(raw.bottomColor, d.bottomColor),
    shoeColor: color(raw.shoeColor, d.shoeColor),
    accessories,
    accessoryColor: color(raw.accessoryColor, d.accessoryColor),
    height: clamp(raw.height, 0.88, 1.12, d.height),
    build: clamp(raw.build, 0.85, 1.2, d.build),
  };
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeAvatarSpec(spec: AvatarSpec): string {
  const clean = sanitizeAvatarSpec(spec);
  // Two decimals is plenty for sliders and keeps the payload short.
  const compact = { ...clean, height: Math.round(clean.height * 100) / 100, build: Math.round(clean.build * 100) / 100 };
  return DESIGNER_AVATAR_PREFIX + toBase64Url(JSON.stringify(compact));
}

export function isDesignerAvatarUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith(DESIGNER_AVATAR_PREFIX);
}

/** Returns null for anything that isn't a designer avatar URL. */
export function decodeAvatarSpec(url: string): AvatarSpec | null {
  if (!isDesignerAvatarUrl(url)) return null;
  try {
    return sanitizeAvatarSpec(JSON.parse(fromBase64Url(url.slice(DESIGNER_AVATAR_PREFIX.length))));
  } catch {
    return null;
  }
}

export function randomAvatarSpec(): AvatarSpec {
  const any = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
  const accessories = ACCESSORIES.filter(() => Math.random() < 0.22);
  return sanitizeAvatarSpec({
    skin: any(SKIN_TONES),
    hairStyle: any(HAIR_STYLES),
    hairColor: any(HAIR_COLORS),
    eyeColor: any(EYE_COLORS),
    top: any(TOP_STYLES),
    topColor: any(CLOTHING_COLORS),
    bottom: any(BOTTOM_STYLES),
    bottomColor: any(CLOTHING_COLORS),
    shoeColor: any(CLOTHING_COLORS),
    accessories,
    accessoryColor: any(CLOTHING_COLORS),
    height: 0.92 + Math.random() * 0.16,
    build: 0.88 + Math.random() * 0.24,
  });
}
