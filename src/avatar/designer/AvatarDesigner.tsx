import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ACCESSORIES,
  AVATAR_DESIGN_PRESETS,
  CLOTHING_COLORS,
  EYE_COLORS,
  HAIR_COLORS,
  SKIN_TONES,
  encodeAvatarSpec,
  randomAvatarSpec,
  type Accessory,
  type AvatarSpec,
  type BottomStyle,
  type HairStyle,
  type TopStyle,
} from "./avatarSpec";
import { FACE_EXPRESSIONS } from "../gestures";
import { L, useLang } from "../../i18n/lang";
import { AvatarPreview } from "../../ui/AvatarPreview";
import { ACCENT_COLOR, panelStyle, pillButtonStyle, primaryButtonStyle } from "../../ui/styles";

// Each label in English and Japanese; `pick` gives the current language's.
type Bilingual<T extends string> = Record<T, [string, string]>;
const pick = <T extends string>(labels: Bilingual<T>) => Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, L(...(v as [string, string]))])) as Record<T, string>;
const HAIR_LABELS: Bilingual<HairStyle> = {
  short: ["Short", "ショート"],
  bob: ["Bob", "ボブ"],
  long: ["Long", "ロング"],
  ponytail: ["Ponytail", "ポニーテール"],
  bun: ["Bun", "おだんご"],
  buzz: ["Buzz", "坊主"],
  none: ["Bald", "スキンヘッド"],
};
const TOP_LABELS: Bilingual<TopStyle> = {
  tshirt: ["T-shirt", "Tシャツ"],
  longsleeve: ["Long sleeve", "長袖"],
  hoodie: ["Hoodie", "パーカー"],
  blazer: ["Blazer", "ブレザー"],
  dress: ["Dress", "ワンピース"],
};
const BOTTOM_LABELS: Bilingual<BottomStyle> = { pants: ["Pants", "パンツ"], shorts: ["Shorts", "ショートパンツ"], skirt: ["Skirt", "スカート"] };
const ACCESSORY_LABELS: Bilingual<Accessory> = { glasses: ["Glasses", "メガネ"], cap: ["Cap", "キャップ"], headphones: ["Headphones", "ヘッドホン"], tie: ["Tie", "ネクタイ"] };
const EXPRESSION_LABELS: Record<string, [string, string]> = {
  neutral: ["neutral", "ふつう"],
  happy: ["happy", "うれしい"],
  sad: ["sad", "かなしい"],
  angry: ["angry", "おこる"],
  surprised: ["surprised", "おどろき"],
  relaxed: ["relaxed", "リラックス"],
};
const PRESET_LABELS: Record<string, string> = { Businessman: "ビジネスマン", Businesswoman: "ビジネスウーマン", Casual: "カジュアル", Student: "学生", Creative: "クリエイティブ" };
/** A built-in design preset's name in the visitor's language. */
export const presetLabel = (label: string) => L(label, PRESET_LABELS[label] ?? label);

/**
 * Controls for the built-in avatar designer. Everything it produces is an
 * AvatarSpec — see avatarSpec.ts for why a designed avatar is data rather
 * than a file, and buildDesignerVrm.ts for how it becomes a VRM.
 */
export function AvatarDesignerControls({ value, onChange }: { value: AvatarSpec; onChange: (spec: AvatarSpec) => void }) {
  useLang();
  const set = <K extends keyof AvatarSpec>(key: K, next: AvatarSpec[K]) => onChange({ ...value, [key]: next });
  const toggleAccessory = (accessory: Accessory) =>
    set(
      "accessories",
      value.accessories.includes(accessory) ? value.accessories.filter((a) => a !== accessory) : [...value.accessories, accessory]
    );

  return (
    <div className="seiza-designer-controls">
      <style>{DESIGNER_CSS}</style>

      <Section title={L("Start from", "ベース")}>
        <div className="seiza-chip-row">
          {AVATAR_DESIGN_PRESETS.map((preset) => (
            <button key={preset.id} type="button" style={chipStyle(false)} onClick={() => onChange({ ...preset.spec })}>
              {presetLabel(preset.label)}
            </button>
          ))}
          <button type="button" style={chipStyle(false)} onClick={() => onChange(randomAvatarSpec())}>
            Surprise me
          </button>
        </div>
      </Section>

      <Section title={L("Skin", "肌")}>
        <Swatches colors={SKIN_TONES} value={value.skin} onChange={(c) => set("skin", c)} label={L("Skin tone", "肌の色")} />
      </Section>

      <Section title={L("Body", "体型")}>
        <Slider label={L("Height", "身長")} min={0.88} max={1.12} value={value.height} onChange={(v) => set("height", v)} />
        <Slider label={L("Build", "体格")} min={0.85} max={1.2} value={value.build} onChange={(v) => set("build", v)} />
        {/* Shoulders and waist are separate from Build on purpose: one
            "thickness" control can only scale the whole torso at once,
            which is what made these figures read as tubes. These two are
            also what let a body be shaped without picking from a short
            list of gendered presets. */}
        <Slider label={L("Shoulders", "肩幅")} min={0.82} max={1.25} value={value.shoulders} onChange={(v) => set("shoulders", v)} />
        <Slider label={L("Waist", "ウエスト")} min={0.75} max={1.3} value={value.waist} onChange={(v) => set("waist", v)} />
      </Section>

      <Section title={L("Hair", "髪")}>
        <Choices options={pick(HAIR_LABELS)} value={value.hairStyle} onChange={(v) => set("hairStyle", v)} />
        <Swatches colors={HAIR_COLORS} value={value.hairColor} onChange={(c) => set("hairColor", c)} label={L("Hair color", "髪の色")} />
      </Section>

      <Section title={L("Eyes", "目")}>
        <Swatches colors={EYE_COLORS} value={value.eyeColor} onChange={(c) => set("eyeColor", c)} label={L("Eye color", "目の色")} />
      </Section>

      <Section title={L("Top", "トップス")}>
        <Choices options={pick(TOP_LABELS)} value={value.top} onChange={(v) => set("top", v)} />
        <Swatches colors={CLOTHING_COLORS} value={value.topColor} onChange={(c) => set("topColor", c)} label={L("Top color", "トップスの色")} />
      </Section>

      {value.top !== "dress" && (
        <Section title={L("Bottom", "ボトムス")}>
          <Choices options={pick(BOTTOM_LABELS)} value={value.bottom} onChange={(v) => set("bottom", v)} />
          <Swatches colors={CLOTHING_COLORS} value={value.bottomColor} onChange={(c) => set("bottomColor", c)} label={L("Bottom color", "ボトムスの色")} />
        </Section>
      )}

      <Section title={L("Shoes", "くつ")}>
        <Swatches colors={CLOTHING_COLORS} value={value.shoeColor} onChange={(c) => set("shoeColor", c)} label={L("Shoe color", "くつの色")} />
      </Section>

      <Section title={L("Accessories", "アクセサリー")}>
        <div className="seiza-chip-row">
          {ACCESSORIES.map((accessory) => (
            <button
              key={accessory}
              type="button"
              aria-pressed={value.accessories.includes(accessory)}
              style={chipStyle(value.accessories.includes(accessory))}
              onClick={() => toggleAccessory(accessory)}
            >
              {pick(ACCESSORY_LABELS)[accessory]}
            </button>
          ))}
        </div>
        {value.accessories.length > 0 && (
          <Swatches colors={CLOTHING_COLORS} value={value.accessoryColor} onChange={(c) => set("accessoryColor", c)} label={L("Accessory color", "アクセサリーの色")} />
        )}
      </Section>
    </div>
  );
}

/**
 * Full designer as a dialog: live preview + controls + save. Docks full
 * screen on phones, side-by-side on wider screens.
 */
export function AvatarDesignerDialog({
  initial,
  onSave,
  onCancel,
}: {
  initial: AvatarSpec;
  onSave: (spec: AvatarSpec) => void;
  onCancel: () => void;
}) {
  useLang();
  const [spec, setSpec] = useState(initial);
  // Rebuilding the model is cheap but not free — let slider drags stay
  // responsive and catch the preview up a beat later.
  const deferred = useDeferredValue(spec);
  const previewUrl = useMemo(() => encodeAvatarSpec(deferred), [deferred]);
  const [tryExpression, setTryExpression] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Portaled to <body>: the in-world avatar menu has a backdrop-filter,
  // which makes it the containing block for position:fixed descendants, so
  // without a portal the "full-screen" dialog would be trapped inside it.
  return createPortal(
    <div className="seiza-designer-backdrop" role="dialog" aria-modal="true" aria-label="Avatar designer">
      <style>{DESIGNER_CSS}</style>
      <div className="seiza-designer-dialog" style={panelStyle}>
        <div className="seiza-designer-preview" style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <AvatarPreview url={previewUrl} height="100%" expression={tryExpression} />
          </div>
          {/* Expressions are worth showing here rather than only in the
              world: they are the main reason the face has structure at
              all, and there is no other place to see one on demand. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
            <small style={{ opacity: 0.6, marginRight: 2 }}>{L("Try a face:", "表情を試す:")}</small>
            {FACE_EXPRESSIONS.map((name) => {
              const active = tryExpression === name || (name === "neutral" && tryExpression === null);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={active}
                  style={chipStyle(active)}
                  onClick={() => setTryExpression(name === "neutral" ? null : name)}
                >
                  {EXPRESSION_LABELS[name] ? L(...EXPRESSION_LABELS[name]) : name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="seiza-designer-side">
          <div className="seiza-designer-header">
            <strong style={{ fontSize: 16 }}>{L("Design your avatar", "アバターをデザイン")}</strong>
            <small style={{ opacity: 0.65 }}>{L("Generated in your browser — nothing is uploaded.", "ブラウザで作成します。何もアップロードされません。")}</small>
          </div>
          <div className="seiza-designer-scroll">
            <AvatarDesignerControls value={spec} onChange={setSpec} />
          </div>
          <div className="seiza-designer-footer">
            <button type="button" style={pillButtonStyle} onClick={onCancel}>
              {L("Cancel", "キャンセル")}
            </button>
            <button type="button" style={primaryButtonStyle} onClick={() => onSave(spec)}>
              {L("Use this avatar", "このアバターを使う")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="seiza-designer-section">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

function Choices<T extends string>({ options, value, onChange }: { options: Record<T, string>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seiza-chip-row" role="radiogroup">
      {(Object.keys(options) as T[]).map((key) => (
        <button key={key} type="button" role="radio" aria-checked={value === key} style={chipStyle(value === key)} onClick={() => onChange(key)}>
          {options[key]}
        </button>
      ))}
    </div>
  );
}

function Swatches({ colors, value, onChange, label }: { colors: string[]; value: string; onChange: (color: string) => void; label: string }) {
  const custom = !colors.includes(value);
  return (
    <div className="seiza-swatch-row" role="radiogroup" aria-label={label}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={`${label} ${c}`}
          className="seiza-swatch"
          style={{ background: c, boxShadow: value === c ? `0 0 0 2px #0b0b0e, 0 0 0 4px ${ACCENT_COLOR}` : undefined }}
          onClick={() => onChange(c)}
        />
      ))}
      <label className="seiza-swatch seiza-swatch-custom" title="Custom color" style={{ boxShadow: custom ? `0 0 0 2px #0b0b0e, 0 0 0 4px ${ACCENT_COLOR}` : undefined, background: custom ? value : undefined }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`Custom ${label.toLowerCase()}`} />
        {!custom && <span aria-hidden>+</span>}
      </label>
    </div>
  );
}

function Slider({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="seiza-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={0.01} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    ...pillButtonStyle,
    padding: "6px 12px",
    fontSize: 12,
    background: active ? "rgba(232,195,122,0.22)" : "rgba(255,255,255,0.07)",
    border: `1px solid ${active ? "rgba(232,195,122,0.7)" : "rgba(255,255,255,0.14)"}`,
  };
}

const DESIGNER_CSS = `
  .seiza-designer-controls { display: flex; flex-direction: column; gap: 14px; }
  .seiza-designer-section { border: 0; margin: 0; padding: 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  .seiza-designer-section legend { padding: 0; margin-bottom: 8px; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.6; }
  .seiza-chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .seiza-swatch-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .seiza-swatch { width: 26px; height: 26px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.25); padding: 0; cursor: pointer; position: relative; display: grid; place-items: center; color: white; font-size: 14px; background: rgba(255,255,255,0.06); }
  .seiza-swatch-custom input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .seiza-slider { display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 10px; font-size: 12px; }
  .seiza-slider input { width: 100%; accent-color: ${ACCENT_COLOR}; }
  .seiza-designer-backdrop { position: fixed; inset: 0; z-index: 60; background: rgba(4,5,8,0.62); display: grid; place-items: center; padding: 16px; pointer-events: auto; animation: seiza-designer-backdrop-in 260ms ease both; }
  .seiza-designer-dialog { width: min(980px, 100%); height: min(680px, calc(100svh - 32px)); display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 380px); gap: 16px; padding: 16px !important; box-sizing: border-box; animation: seiza-designer-dialog-in 380ms var(--seiza-ease, cubic-bezier(0.22,1,0.36,1)) both; }
  @keyframes seiza-designer-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes seiza-designer-dialog-in { from { opacity: 0; transform: translateY(14px) scale(0.985); } to { opacity: 1; transform: none; } }
  .seiza-designer-preview { min-height: 0; }
  .seiza-designer-side { display: flex; flex-direction: column; min-height: 0; gap: 12px; }
  .seiza-designer-header { display: flex; flex-direction: column; gap: 2px; }
  .seiza-designer-scroll { flex: 1; min-height: 0; overflow-y: auto; padding-right: 4px; }
  .seiza-designer-footer { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  @media (max-width: 720px) {
    .seiza-designer-backdrop { padding: 0; }
    .seiza-designer-dialog { width: 100%; height: 100svh; border-radius: 0 !important; grid-template-columns: 1fr; grid-template-rows: minmax(200px, 38svh) minmax(0, 1fr); padding: 12px !important; padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important; }
    .seiza-designer-footer > button { flex: 1; }
  }
`;
