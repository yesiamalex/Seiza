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
import { AvatarPreview } from "../../ui/AvatarPreview";
import { ACCENT_COLOR, panelStyle, pillButtonStyle, primaryButtonStyle } from "../../ui/styles";

const HAIR_LABELS: Record<HairStyle, string> = {
  short: "Short",
  bob: "Bob",
  long: "Long",
  ponytail: "Ponytail",
  bun: "Bun",
  buzz: "Buzz",
  none: "Bald",
};
const TOP_LABELS: Record<TopStyle, string> = {
  tshirt: "T-shirt",
  longsleeve: "Long sleeve",
  hoodie: "Hoodie",
  blazer: "Blazer",
  dress: "Dress",
};
const BOTTOM_LABELS: Record<BottomStyle, string> = { pants: "Pants", shorts: "Shorts", skirt: "Skirt" };
const ACCESSORY_LABELS: Record<Accessory, string> = { glasses: "Glasses", cap: "Cap", headphones: "Headphones", tie: "Tie" };

/**
 * Controls for the built-in avatar designer. Everything it produces is an
 * AvatarSpec — see avatarSpec.ts for why a designed avatar is data rather
 * than a file, and buildDesignerVrm.ts for how it becomes a VRM.
 */
export function AvatarDesignerControls({ value, onChange }: { value: AvatarSpec; onChange: (spec: AvatarSpec) => void }) {
  const set = <K extends keyof AvatarSpec>(key: K, next: AvatarSpec[K]) => onChange({ ...value, [key]: next });
  const toggleAccessory = (accessory: Accessory) =>
    set(
      "accessories",
      value.accessories.includes(accessory) ? value.accessories.filter((a) => a !== accessory) : [...value.accessories, accessory]
    );

  return (
    <div className="seiza-designer-controls">
      <style>{DESIGNER_CSS}</style>

      <Section title="Start from">
        <div className="seiza-chip-row">
          {AVATAR_DESIGN_PRESETS.map((preset) => (
            <button key={preset.id} type="button" style={chipStyle(false)} onClick={() => onChange({ ...preset.spec })}>
              {preset.label}
            </button>
          ))}
          <button type="button" style={chipStyle(false)} onClick={() => onChange(randomAvatarSpec())}>
            Surprise me
          </button>
        </div>
      </Section>

      <Section title="Skin">
        <Swatches colors={SKIN_TONES} value={value.skin} onChange={(c) => set("skin", c)} label="Skin tone" />
      </Section>

      <Section title="Body">
        <Slider label="Height" min={0.88} max={1.12} value={value.height} onChange={(v) => set("height", v)} />
        <Slider label="Build" min={0.85} max={1.2} value={value.build} onChange={(v) => set("build", v)} />
      </Section>

      <Section title="Hair">
        <Choices options={HAIR_LABELS} value={value.hairStyle} onChange={(v) => set("hairStyle", v)} />
        <Swatches colors={HAIR_COLORS} value={value.hairColor} onChange={(c) => set("hairColor", c)} label="Hair color" />
      </Section>

      <Section title="Eyes">
        <Swatches colors={EYE_COLORS} value={value.eyeColor} onChange={(c) => set("eyeColor", c)} label="Eye color" />
      </Section>

      <Section title="Top">
        <Choices options={TOP_LABELS} value={value.top} onChange={(v) => set("top", v)} />
        <Swatches colors={CLOTHING_COLORS} value={value.topColor} onChange={(c) => set("topColor", c)} label="Top color" />
      </Section>

      {value.top !== "dress" && (
        <Section title="Bottom">
          <Choices options={BOTTOM_LABELS} value={value.bottom} onChange={(v) => set("bottom", v)} />
          <Swatches colors={CLOTHING_COLORS} value={value.bottomColor} onChange={(c) => set("bottomColor", c)} label="Bottom color" />
        </Section>
      )}

      <Section title="Shoes">
        <Swatches colors={CLOTHING_COLORS} value={value.shoeColor} onChange={(c) => set("shoeColor", c)} label="Shoe color" />
      </Section>

      <Section title="Accessories">
        <div className="seiza-chip-row">
          {ACCESSORIES.map((accessory) => (
            <button
              key={accessory}
              type="button"
              aria-pressed={value.accessories.includes(accessory)}
              style={chipStyle(value.accessories.includes(accessory))}
              onClick={() => toggleAccessory(accessory)}
            >
              {ACCESSORY_LABELS[accessory]}
            </button>
          ))}
        </div>
        {value.accessories.length > 0 && (
          <Swatches colors={CLOTHING_COLORS} value={value.accessoryColor} onChange={(c) => set("accessoryColor", c)} label="Accessory color" />
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
  const [spec, setSpec] = useState(initial);
  // Rebuilding the model is cheap but not free — let slider drags stay
  // responsive and catch the preview up a beat later.
  const deferred = useDeferredValue(spec);
  const previewUrl = useMemo(() => encodeAvatarSpec(deferred), [deferred]);

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
        <div className="seiza-designer-preview">
          <AvatarPreview url={previewUrl} height="100%" />
        </div>
        <div className="seiza-designer-side">
          <div className="seiza-designer-header">
            <strong style={{ fontSize: 16 }}>Design your avatar</strong>
            <small style={{ opacity: 0.65 }}>Generated in your browser — nothing is uploaded.</small>
          </div>
          <div className="seiza-designer-scroll">
            <AvatarDesignerControls value={spec} onChange={setSpec} />
          </div>
          <div className="seiza-designer-footer">
            <button type="button" style={pillButtonStyle} onClick={onCancel}>
              Cancel
            </button>
            <button type="button" style={primaryButtonStyle} onClick={() => onSave(spec)}>
              Use this avatar
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
