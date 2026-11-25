import { L, useLang } from "../../i18n/lang";
import { pillButtonStyle } from "../../ui/styles";
import { useStore } from "../store";
import { Choices, Hint, MODE_ACCENTS, ModeButton } from "../ui";
import { PET_LABELS, PETS, pet, patPet, setPet, type Pet } from "./pets";

const ACCENT = MODE_ACCENTS.pet;
const NONE = "none" as const;

/** The Pets button in the bar: pick a dog, a cat, or a capybara, and pat it. */
export function PetButton({ selfId }: { selfId: string | null }) {
  useLang();
  const { kind } = useStore(pet);
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
      {kind && (
        <button type="button" style={pillButtonStyle} onClick={() => patPet(selfId ?? "")}>
          {L("Pat", "なでる")}
        </button>
      )}
      <Hint accent={ACCENT}>
        {L(
          "Your pet follows you, sits when you sit or stand still, and swims at the beach. In VR, put a hand on any pet's head to pat it.",
          "ペットはついてきて、座るか立ち止まると座り、海では泳ぎます。VRでは手をペットの頭に置くとなでられます。"
        )}
      </Hint>
    </ModeButton>
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
