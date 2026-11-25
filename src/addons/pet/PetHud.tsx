import { useEffect, useState } from "react";
import { L, useLang } from "../../i18n/lang";
import { pillButtonStyle } from "../../ui/styles";
import { Docked } from "../../ui/StatusDock";
import { uploadAvatarFile } from "../../profile/profileStore";
import { useStore } from "../store";
import { Choices, Hint, MODE_ACCENTS, ModeButton } from "../ui";
import { COATS, nearPet, PET_LABELS, PET_SIZE, PETS, pet, patPet, setPet, setPetLook, type Pet } from "./pets";

const ACCENT = MODE_ACCENTS.pet;
const NONE = "none" as const;
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** The Pets button in the bar: pick a dog, a cat, or a capybara, how it
 *  looks (coat, size, name, or a model of your own), and pat it. */
export function PetButton({ selfId }: { selfId: string | null }) {
  useLang();
  const { kind, look } = useStore(pet);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      setPetLook({ model: await uploadAvatarFile(file) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };
  return (
    <ModeButton id="pet" accent={ACCENT} icon={<PawIcon />} label={L("Pet", "ペット")} title={L("Pets: a dog, a cat, or a capybara that follows you", "ペット:ついてくる犬・猫・カピバラ")}>
      <strong style={{ color: ACCENT }}>{L("Pets", "ペット")}</strong>
      <Choices<Pet | typeof NONE>
        title={L("Your pet", "あなたのペット")}
        options={[NONE, ...PETS]}
        value={kind ?? NONE}
        onChange={(v) => setPet(v === NONE ? null : v)}
        accent={ACCENT}
        render={(v) => (v === NONE ? L("None", "なし") : L(...PET_LABELS[v]))}
      />
      {kind && look && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <small style={{ opacity: 0.7 }}>{L("Coat", "毛色")}</small>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {COATS[kind].map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={look.coat === c}
                  onClick={() => setPetLook({ coat: c })}
                  style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: look.coat === c ? `2px solid ${ACCENT}` : "2px solid rgba(255,255,255,0.25)", cursor: "pointer", padding: 0 }}
                />
              ))}
            </div>
          </div>
          <label style={{ display: "grid", gap: 4 }}>
            <small style={{ opacity: 0.7 }}>{L(`Size ${Math.round(look.size * 100)}%`, `大きさ ${Math.round(look.size * 100)}%`)}</small>
            <input type="range" min={PET_SIZE.min} max={PET_SIZE.max} step={0.05} value={look.size} onChange={(e) => setPetLook({ size: Number(e.target.value) })} style={{ accentColor: ACCENT }} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <small style={{ opacity: 0.7 }}>{L("Name", "名前")}</small>
            <input
              type="text"
              maxLength={16}
              value={look.name}
              placeholder={L(...PET_LABELS[kind])}
              onChange={(e) => setPetLook({ name: e.target.value })}
              style={{ background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "6px 8px" }}
            />
          </label>
          <div style={{ display: "grid", gap: 6 }}>
            <small style={{ opacity: 0.7 }}>{L("Its own model (.glb or .vrm)", "自分のモデル(.glb か .vrm)")}</small>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <label style={{ ...pillButtonStyle, cursor: uploading ? "wait" : "pointer" }}>
                {uploading ? L("Uploading…", "アップロード中…") : look.model ? L("Change model", "モデルを変える") : L("Upload a model", "モデルをアップロード")}
                <input type="file" accept=".glb,.vrm,model/gltf-binary" hidden disabled={uploading} onChange={(e) => void upload(e.target.files?.[0])} />
              </label>
              {look.model && (
                <button type="button" style={pillButtonStyle} onClick={() => setPetLook({ model: null })}>
                  {L("Back to the built one", "もとに戻す")}
                </button>
              )}
            </div>
            {error && <small style={{ color: "#ff8a8a" }}>{error}</small>}
          </div>
          <button type="button" style={pillButtonStyle} onClick={() => patPet(selfId ?? "")}>
            {L("Pat", "なでる")} <kbd style={{ opacity: 0.6, fontSize: 10 }}>P</kbd>
          </button>
        </div>
      )}
      <Hint accent={ACCENT}>
        {L(
          "Your pet follows you, sits when you sit or stand still, and swims at the beach. Near any pet, **P** (or **Pat**) pats it; in VR, put a hand on its head. A model of your own plays its own walk and idle if it has them.",
          "ペットはついてきて、座るか立ち止まると座り、海では泳ぎます。近くのペットは**P**(または「なでる」)でなでられます。VRでは手を頭に置きます。自分のモデルに歩きや待機のアニメーションがあれば、それが動きます。"
        )}
      </Hint>
    </ModeButton>
  );
}

/** Near any pet: a prompt to pat it, and P to. */
export function PetPrompt() {
  useLang();
  const near = useStore(nearPet);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || e.key.toLowerCase() !== "p") return;
      const { owner } = nearPet.get();
      if (owner !== null) patPet(owner);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (near.owner === null) return null;
  return (
    <Docked order={3}>
      <button type="button" onClick={() => patPet(near.owner!)} style={{ ...pillButtonStyle, pointerEvents: "auto", border: `1px solid ${ACCENT}`, background: "rgba(16,18,24,0.78)" }}>
        {L(`Pat ${near.name}`, `${near.name}をなでる`)} <kbd style={{ opacity: 0.6, fontSize: 10 }}>P</kbd>
      </button>
    </Docked>
  );
}

const PawIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <ellipse cx="12" cy="16" rx="4.5" ry="3.6" />
    <circle cx="6" cy="10.5" r="2" />
    <circle cx="18" cy="10.5" r="2" />
    <circle cx="9.3" cy="6.5" r="2" />
    <circle cx="14.7" cy="6.5" r="2" />
  </svg>
);
