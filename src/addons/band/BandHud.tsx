import { useEffect, useState, type CSSProperties } from "react";
import { L, useLang } from "../../i18n/lang";
import { panelStyle, pillButtonStyle } from "../../ui/styles";
import { useStore } from "../store";
import { Choices, Hint, MODE_ACCENTS, ModeButton, MusicIcon } from "../ui";
import { band, fret, pick, play, release, setInstrument, setLightColor, setPair, setPlaying, setWaving } from "./band";
import { INSTRUMENT_LABELS, INSTRUMENTS, isStand, isWorn, KEY_LAYOUT, KEYS_BASE, LIGHT_COLORS, noteName, PAD_COLUMNS, PADS, PICK_KEYS, pickedMidi, STRINGS, type Instrument } from "./instruments";

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
          <Choices<"one" | "two">
            title={L("Hold", "持ち方")}
            options={["one", "two"]}
            value={state.pair ? "two" : "one"}
            onChange={(n) => setPair(n === "two")}
            accent={ACCENT}
            render={(n) => (n === "two" ? L("One in each hand", "両手に1本ずつ") : L("One stick", "1本"))}
          />
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
          <Hint accent={ACCENT}>
            {L(
              "While you play, **the keys shown on the instrument** play it instead of moving you (**Esc** stops). On a phone, **tap the instrument**. In VR, play it with your hands: tap the pads and keys (with tracked hands, your fingertip), or strum the guitar while your other hand picks the chord along the neck.",
              "演奏中は、**楽器に表示されたキー**で演奏します(移動はしません。**Esc**で終了)。スマホは**楽器をタップ**。VRでは手で演奏します:パッドや鍵盤をたたき(ハンドトラッキングでは指先で)、ギターはもう一方の手でネックの位置でコードを選んでかき鳴らします。"
            )}
          </Hint>
          {isWorn(state.instrument) && (
            <Hint accent={ACCENT}>
              {L(
                "For a melody, **1 to 6** pick single strings of the chord you last played (**Shift** and a chord's key holds a chord without strumming it). Two at once ring together.",
                "メロディーは、最後に弾いたコードの弦を **1〜6** で1本ずつ弾きます(**Shift** とコードのキーで、鳴らさずにコードを押さえます)。2本同時にも鳴らせます。"
              )}
            </Hint>
          )}
          {isStand(state.instrument) && (
            <Hint>{L("It stands where you set it up, so you stay at it: pick Nothing to walk again.", "置いた場所に立てたままなので、その場から動きません。歩くには「なし」を選んでください。")}</Hint>
          )}
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
  /** The pad (or "s" and a string) just played, lit for a moment. */
  const [lit, setLit] = useState<string | null>(null);
  // Keys held down, for the keyboard: each lit, and ringing, until let go.
  const [down, setDown] = useState<ReadonlySet<number>>(() => new Set());
  const active = state.playing && state.instrument !== null && state.instrument !== "lightstick";
  // Out of the way while the Band menu is open over the same spot.
  const shown = active && !state.menuOpen;

  const hit = (note: number) => {
    play(note);
    setLit(String(note));
  };
  const pluck = (string: number) => {
    pick(string);
    setLit(`s${string}`);
  };
  /** A key pressed and held, on the keys: any number at once, for chords. */
  const press = (note: number) => {
    play(note, true);
    setDown((s) => new Set(s).add(note));
  };
  const lift = (note: number) => {
    release(note);
    setDown((s) => {
      const next = new Set(s);
      next.delete(note);
      return next;
    });
  };
  useEffect(() => {
    if (lit === null) return;
    const timer = setTimeout(() => setLit(null), 120);
    return () => clearTimeout(timer);
  }, [lit]);

  useEffect(() => {
    if (!active) return;
    // Which note each held keyboard key is playing, so its keyup lets go of
    // that note even if the octave changed in between.
    const pressed = new Map<string, number>();
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (key === "Escape") {
        setPlaying(false);
        return;
      }
      const { instrument, octave } = band.get();
      let note: number | null = null;
      const pads = instrument ? PADS[instrument] : undefined;
      // A string, picked from the chord held.
      const string = isWorn(instrument) ? PICK_KEYS.indexOf(e.key) : -1;
      if (isWorn(instrument) && string >= 0 && string < STRINGS[instrument]) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) pluck(string);
        return;
      }
      if (pads) note = indexOf(pads.map((p) => p.key), key);
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
      if (e.repeat) return;
      if (instrument === "keys") {
        pressed.set(key, note);
        press(note);
      } else if (isWorn(instrument) && e.shiftKey) fret(note);
      else hit(note);
    };
    // Keyups too, so movement never sees half a key press.
    const swallow = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const { instrument } = band.get();
      const pads = instrument ? PADS[instrument] : undefined;
      const keys = pads ? [...pads.map((p) => p.key), ...(isWorn(instrument) ? PICK_KEYS : [])] : [...KEY_LAYOUT.map((l) => l.key), "Z", "X"];
      if (keys.includes(key)) e.stopImmediatePropagation();
      const note = pressed.get(key);
      if (note !== undefined) {
        pressed.delete(key);
        lift(note);
      }
    };
    // Leaving the window with keys down never leaves them ringing.
    const letGo = () => {
      for (const note of pressed.values()) lift(note);
      pressed.clear();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", swallow, true);
    window.addEventListener("blur", letGo);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", swallow, true);
      window.removeEventListener("blur", letGo);
      letGo();
    };
    // press and lift only touch state setters and the band store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!shown) return null;
  const { instrument, octave, chord } = state;
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
      {instrument && PADS[instrument] && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${PAD_COLUMNS[instrument] ?? 4}, 1fr)`, gap: 6 }}>
          {PADS[instrument]!.map((pad, i) => (
            <Pad key={`${pad.label}${i}`} label={pad.label} hint={pad.key} lit={lit === String(i)} held={isWorn(instrument) && chord === i} onHit={() => hit(i)} height={instrument === "drums" ? 58 : 48} />
          ))}
        </div>
      )}
      {isWorn(instrument) && (
        <div role="group" aria-label={L("Strings", "弦")} style={{ display: "grid", gridTemplateColumns: `repeat(${STRINGS[instrument]}, 1fr)`, gap: 6 }}>
          {Array.from({ length: STRINGS[instrument] }, (_, s) => {
            const midi = pickedMidi(instrument, chord, s);
            return midi === null ? null : <Pad key={s} label={noteName(midi)} hint={PICK_KEYS[s]} lit={lit === `s${s}`} onHit={() => pluck(s)} height={36} />;
          })}
        </div>
      )}
      {instrument === "keys" && (
        <div style={{ position: "relative", height: 110, display: "flex", gap: 2 }}>
          {KEY_LAYOUT.filter((k) => !k.black).map((k) => {
            const note = KEYS_BASE + octave * 12 + k.semitone;
            return <Key key={k.semitone} hint={k.key} lit={down.has(note)} onHit={() => press(note)} onRelease={() => lift(note)} />;
          })}
          {KEY_LAYOUT.filter((k) => k.black).map((k) => {
            const note = KEYS_BASE + octave * 12 + k.semitone;
            const whitesBefore = KEY_LAYOUT.filter((w) => !w.black && w.semitone < k.semitone).length;
            return <Key key={k.semitone} hint={k.key} lit={down.has(note)} onHit={() => press(note)} onRelease={() => lift(note)} black left={`calc(${(whitesBefore / WHITES) * 100}% - ${BLACK_WIDTH / 2}%)`} />;
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

function Pad({ label, hint, lit, held, onHit, height }: { label: string; hint: string; lit: boolean; held?: boolean; onHit: () => void; height: number }) {
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
        border: `1px solid ${lit || held ? ACCENT : "rgba(255,255,255,0.16)"}`,
        transition: "background 80ms",
      }}
    >
      <span style={{ fontSize: 12 }}>{label}</span>
      <kbd style={{ fontSize: 10, opacity: 0.55 }}>{hint}</kbd>
    </button>
  );
}

const WHITES = KEY_LAYOUT.filter((k) => !k.black).length;
/** A black key's width, in percent of the keyboard. */
const BLACK_WIDTH = (100 / WHITES) * 0.58;

/** A key on screen: held while pressed, so several make a chord (with
 *  several fingers, or a finger held while the keyboard plays). */
function Key({ hint, lit, onHit, onRelease, black, left }: { hint: string; lit: boolean; onHit: () => void; onRelease: () => void; black?: boolean; left?: string }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        onHit();
      }}
      onPointerUp={onRelease}
      onPointerLeave={onRelease}
      onPointerCancel={onRelease}
      style={{
        flex: black ? undefined : 1,
        position: black ? "absolute" : "relative",
        left,
        top: 0,
        width: black ? `${BLACK_WIDTH}%` : undefined,
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
