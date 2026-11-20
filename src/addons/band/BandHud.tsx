import { useEffect, useState, type CSSProperties } from "react";
import { L, useLang } from "../../i18n/lang";
import { panelStyle, pillButtonStyle } from "../../ui/styles";
import { useStore } from "../store";
import { Choices, Hint, MODE_ACCENTS, ModeButton, MusicIcon } from "../ui";
import { band, play, setInstrument, setLightColor, setPlaying, setWaving } from "./band";
import { CHORDS, DRUM_PADS, INSTRUMENT_LABELS, INSTRUMENTS, KEY_LAYOUT, KEYS_BASE, LIGHT_COLORS, type Instrument } from "./instruments";

const ACCENT = MODE_ACCENTS.band;
const NONE = "none" as const;

/** Band mode's button in the bar: pick an instrument or a light stick. */
export function BandButton() {
  useLang();
  const state = useStore(band);
  return (
    <ModeButton
      id="band"
      accent={ACCENT}
      icon={<MusicIcon />}
      label={L("Band", "バンド")}
      title={L("Band mode: instruments and light sticks", "バンドモード:楽器とペンライト")}
      onOpenChange={(menuOpen) => band.set((s) => (s.menuOpen === menuOpen ? s : { ...s, menuOpen }))}
    >
      <strong style={{ color: ACCENT }}>{L("Band mode", "バンドモード")}</strong>
      <Choices<Instrument | typeof NONE>
        title={L("Play", "演奏する")}
        options={[NONE, ...INSTRUMENTS]}
        value={state.instrument ?? NONE}
        onChange={(i) => setInstrument(i === NONE ? null : i)}
        accent={ACCENT}
        render={(i) => (i === NONE ? L("Nothing", "なし") : L(...INSTRUMENT_LABELS[i]))}
      />
      {state.instrument === "lightstick" ? (
        <>
          <Swatches value={state.color} onChange={setLightColor} />
          <button type="button" onClick={() => setWaving(!state.waving)} style={toggleStyle(state.waving)}>
            {state.waving ? L("Stop waving", "振るのをやめる") : L("Wave it overhead", "頭上で振る")}
          </button>
          <Hint>{L("Everyone's light sticks sway on the same beat. In VR, it's in your hand: wave it yourself.", "全員のペンライトが同じリズムで揺れます。VRでは手に持っているので、自分で振ってください。")}</Hint>
        </>
      ) : state.instrument ? (
        <>
          <button type="button" onClick={() => setPlaying(!state.playing)} style={toggleStyle(state.playing)}>
            {state.playing ? L("Stop playing", "演奏をやめる") : L("Start playing", "演奏を始める")}
          </button>
          <Hint>
            {L(
              "While you play, the keys shown on the instrument play it instead of moving you (Esc stops). On a phone, tap the instrument. In VR, play it with your hands: tap the pads and keys, or strum the guitar while your other hand picks the chord along the neck.",
              "演奏中は、楽器に表示されたキーで演奏します(移動はしません。Escで終了)。スマホは楽器をタップ。VRでは手で演奏します:パッドや鍵盤をたたき、ギターはもう一方の手でネックの位置でコードを選んでかき鳴らします。"
            )}
          </Hint>
        </>
      ) : (
        <Hint>{L("Pick an instrument to play for the room, or a light stick to cheer with.", "部屋に向けて演奏する楽器か、応援用のペンライトを選んでください。")}</Hint>
      )}
    </ModeButton>
  );
}

function Swatches({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="radiogroup" aria-label={L("Light colour", "ライトの色")}>
      {LIGHT_COLORS.map((color, i) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={color}
          onClick={() => onChange(i)}
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            cursor: "pointer",
            background: color,
            boxShadow: value === i ? `0 0 0 2px #111, 0 0 0 4px ${color}, 0 0 14px ${color}` : "none",
            border: "1px solid rgba(255,255,255,0.4)",
          }}
        />
      ))}
    </div>
  );
}

const toggleStyle = (on: boolean): CSSProperties => ({
  ...pillButtonStyle,
  justifyContent: "center",
  ...(on ? { background: "rgba(180,140,255,0.3)", border: `1px solid ${ACCENT}` } : {}),
});

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * The instrument itself, while playing: big pads, keys, or chords to tap,
 * labelled with their keyboard keys, which play it too. The keys are taken
 * before anything else hears them (capture phase), so W doesn't walk you
 * off while it plays a C sharp.
 */
export function BandStage() {
  useLang();
  const state = useStore(band);
  const [lit, setLit] = useState<number | null>(null);
  const active = state.playing && state.instrument !== null && state.instrument !== "lightstick";
  // Out of the way while the Band menu is open over the same spot.
  const shown = active && !state.menuOpen;

  const hit = (note: number) => {
    play(note);
    setLit(note);
  };
  useEffect(() => {
    if (lit === null) return;
    const timer = setTimeout(() => setLit(null), 120);
    return () => clearTimeout(timer);
  }, [lit]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (key === "Escape") {
        setPlaying(false);
        return;
      }
      const { instrument, octave } = band.get();
      let note: number | null = null;
      if (instrument === "drums") note = indexOf(DRUM_PADS.map((p) => p.key), key);
      else if (instrument === "guitar") note = indexOf(CHORDS.map((c) => c.key), key);
      else if (instrument === "keys") {
        if (key === "Z" || key === "X") {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (!e.repeat) band.set((s) => ({ ...s, octave: Math.max(-2, Math.min(2, s.octave + (key === "Z" ? -1 : 1))) }));
          return;
        }
        const k = KEY_LAYOUT.find((l) => l.key === key);
        if (k) note = KEYS_BASE + octave * 12 + k.semitone;
      }
      if (note === null) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) hit(note);
    };
    // Keyups too, so movement never sees half a key press.
    const swallow = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const { instrument } = band.get();
      const keys = instrument === "drums" ? DRUM_PADS.map((p) => p.key) : instrument === "guitar" ? CHORDS.map((c) => c.key) : [...KEY_LAYOUT.map((l) => l.key), "Z", "X"];
      if (keys.includes(key)) e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", swallow, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", swallow, true);
    };
  }, [active]);

  if (!shown) return null;
  const { instrument, octave } = state;
  return (
    <div role="group" aria-label={L("Instrument", "楽器")} style={stageStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ color: ACCENT, fontSize: 13 }}>{L(...INSTRUMENT_LABELS[instrument!])}</strong>
        {instrument === "keys" && (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <button type="button" style={smallButton} onClick={() => band.set((s) => ({ ...s, octave: Math.max(-2, s.octave - 1) }))} aria-label={L("Octave down (Z)", "オクターブ下げる(Z)")}>
              −
            </button>
            C{4 + octave}
            <button type="button" style={smallButton} onClick={() => band.set((s) => ({ ...s, octave: Math.min(2, s.octave + 1) }))} aria-label={L("Octave up (X)", "オクターブ上げる(X)")}>
              +
            </button>
          </span>
        )}
        <button type="button" style={smallButton} onClick={() => setPlaying(false)}>
          {L("Done", "終了")} <kbd style={{ opacity: 0.6, fontSize: 10 }}>Esc</kbd>
        </button>
      </div>
      {instrument === "drums" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {DRUM_PADS.map((pad, i) => (
            <Pad key={pad.label} label={pad.label} hint={pad.key} lit={lit === i} onHit={() => hit(i)} height={58} />
          ))}
        </div>
      )}
      {instrument === "guitar" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {CHORDS.map((chord, i) => (
            <Pad key={chord.name} label={chord.name} hint={chord.key} lit={lit === i} onHit={() => hit(i)} height={52} />
          ))}
        </div>
      )}
      {instrument === "keys" && (
        <div style={{ position: "relative", height: 110, display: "flex", gap: 2 }}>
          {KEY_LAYOUT.filter((k) => !k.black).map((k) => {
            const note = KEYS_BASE + octave * 12 + k.semitone;
            return <Key key={k.semitone} hint={k.key} lit={lit === note} onHit={() => hit(note)} />;
          })}
          {KEY_LAYOUT.filter((k) => k.black).map((k) => {
            const note = KEYS_BASE + octave * 12 + k.semitone;
            const whitesBefore = KEY_LAYOUT.filter((w) => !w.black && w.semitone < k.semitone).length;
            return <Key key={k.semitone} hint={k.key} lit={lit === note} onHit={() => hit(note)} black left={`calc(${(whitesBefore / 8) * 100}% - 3.4%)`} />;
          })}
        </div>
      )}
    </div>
  );
}

const indexOf = (keys: string[], key: string) => {
  const i = keys.indexOf(key);
  return i < 0 ? null : i;
};

function Pad({ label, hint, lit, onHit, height }: { label: string; hint: string; lit: boolean; onHit: () => void; height: number }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        onHit();
      }}
      style={{
        ...pillButtonStyle,
        borderRadius: 10,
        height,
        flexDirection: "column",
        justifyContent: "center",
        gap: 2,
        padding: 4,
        touchAction: "none",
        background: lit ? "rgba(180,140,255,0.55)" : "rgba(255,255,255,0.08)",
        border: `1px solid ${lit ? ACCENT : "rgba(255,255,255,0.16)"}`,
        transition: "background 80ms",
      }}
    >
      <span style={{ fontSize: 12 }}>{label}</span>
      <kbd style={{ fontSize: 10, opacity: 0.55 }}>{hint}</kbd>
    </button>
  );
}

function Key({ hint, lit, onHit, black, left }: { hint: string; lit: boolean; onHit: () => void; black?: boolean; left?: string }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        onHit();
      }}
      style={{
        flex: black ? undefined : 1,
        position: black ? "absolute" : "relative",
        left,
        top: 0,
        width: black ? "6.8%" : undefined,
        height: black ? "60%" : "100%",
        zIndex: black ? 1 : 0,
        borderRadius: "0 0 6px 6px",
        border: "1px solid rgba(0,0,0,0.5)",
        background: lit ? ACCENT : black ? "#16161a" : "#f4f2ec",
        color: black ? "#ddd" : "#333",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: 6,
        fontSize: 10,
        cursor: "pointer",
        touchAction: "none",
      }}
    >
      {hint}
    </button>
  );
}

const stageStyle: CSSProperties = {
  ...panelStyle,
  position: "fixed",
  left: "50%",
  transform: "translateX(-50%)",
  bottom: "calc(var(--seiza-popover-bottom, 96px) + 8px)",
  width: "min(440px, calc(100vw - 24px))",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  zIndex: 27,
  pointerEvents: "auto",
  borderColor: "rgba(180,140,255,0.4)",
};

const smallButton: CSSProperties = { ...pillButtonStyle, padding: "5px 10px", fontSize: 12 };
