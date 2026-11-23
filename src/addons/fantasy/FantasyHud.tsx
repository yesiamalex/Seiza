import { useEffect, useState, type CSSProperties } from "react";
import { L, useLang } from "../../i18n/lang";
import { pillButtonStyle } from "../../ui/styles";
import { useStore } from "../store";
import { Choices, Hint, MODE_ACCENTS, ModeButton, SwordIcon } from "../ui";
import { fantasy, KO_SECONDS, pressCancel, pressEnd, pressStart, setElement, setGuard, setWeapon } from "./combat";
import { ELEMENT_COLORS, ELEMENT_LABELS, ELEMENTS, isBladed, MAX_HP, WEAPON_SPECS, WEAPONS, type Weapon } from "./weapons";
import { record, usedWeapons } from "./record";

const ACCENT = MODE_ACCENTS.fantasy;
const NONE = "none" as const;

/** Fantasy mode's button in the bar: pick a weapon and an element. */
export function FantasyButton() {
  useLang();
  const state = useStore(fantasy);
  return (
    <ModeButton id="fantasy" accent={ACCENT} icon={<SwordIcon />} label={L("Fantasy", "ファンタジー")} title={L("Fantasy mode: weapons", "ファンタジーモード:武器")}>
      <strong style={{ color: ACCENT }}>{L("Fantasy mode", "ファンタジーモード")}</strong>
      <Choices<Weapon | typeof NONE>
        title={L("Weapon", "武器")}
        options={[NONE, ...WEAPONS]}
        value={state.weapon ?? NONE}
        onChange={(w) => setWeapon(w === NONE ? null : w)}
        accent={ACCENT}
        render={(w) => (w === NONE ? L("None", "なし") : L(...WEAPON_SPECS[w].label))}
      />
      {state.weapon && <small style={{ marginTop: -6, color: ACCENT, opacity: 0.9 }}>{L(...WEAPON_SPECS[state.weapon].note)}</small>}
      <RecordTable />
      <Choices
        title={L("Special attack", "必殺技")}
        options={ELEMENTS}
        value={state.element}
        onChange={setElement}
        accent={ACCENT}
        render={(e) => (
          <>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: ELEMENT_COLORS[e] }} />
            {L(...ELEMENT_LABELS[e])}
          </>
        )}
      />
      <Hint accent={ACCENT}>
        {L(
          "**Click** to swing (on a phone, the sword button). A blow lands only where the blade really meets a body; where two blades meet, both bounce off. **Hold F** (the shield button) to raise your blade across your chest: it catches more blows, not all of them. When the bar under your health is full, **hold the click** for your special. An arrow flies, so step out of its way. The **Necromancer**'s rod casts slow bolts instead, and its special raises three undead who fight for you a while. In VR, **just swing**: your blade cuts and parries wherever you put it. Draw your hand back over your shoulder with the bar full, and your next hard swing is the special; **the trigger** shoots a bow. Only people holding a weapon can be hit, so choose None to step out.",
          "**クリック**で振る(スマホは剣ボタン)。刃が実際に体に当たったときだけダメージが入り、刃同士が当たると両方はじかれます。**Fキー長押し**(盾ボタン)で刃を胸の前に構えると、受けられる攻撃が増えます(全部ではありません)。体力の下のゲージが満タンなら、**クリック長押し**で必殺技。矢は飛んでくるので、よければ当たりません。**ネクロマンサー**の杖は遅い魔法弾を放ち、必殺技ではアンデッド3体がしばらく代わりに戦います。VRでは**そのまま振るだけ**で、刃の当たった所で攻撃・受け流しになります。ゲージ満タンで手を肩の後ろへ引くと、次の強い一振りが必殺技。弓は**トリガー**で射ます。武器を持っている人だけが攻撃を受けるので、抜けたいときは「なし」を選んでください。"
        )}
      </Hint>
    </ModeButton>
  );
}

/** The record for the weapon in hand, small, under the bars. */
function RecordLine({ weapon }: { weapon: Weapon }) {
  const r = useStore(record)[weapon];
  if (!r) return null;
  return (
    <small style={{ textAlign: "center", fontSize: 11, opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>
      K {r.k} · D {r.d} · A {r.a} · {L(`best ×${r.combo}`, `最高 ×${r.combo}`)}
    </small>
  );
}

/** Your record with each weapon used so far, on this device. */
function RecordTable() {
  const rows = useStore(record);
  const used = usedWeapons(rows);
  if (used.length === 0) return null;
  const cell: CSSProperties = { textAlign: "right", padding: "1px 6px", fontVariantNumeric: "tabular-nums" };
  return (
    <table style={{ fontSize: 12, borderCollapse: "collapse", opacity: 0.9 }} aria-label={L("Your record", "あなたの戦績")}>
      <thead>
        <tr style={{ color: ACCENT }}>
          <th style={{ textAlign: "left", fontWeight: 600 }}>{L("Your record", "戦績")}</th>
          <th style={cell} title={L("Knockouts", "撃破")}>K</th>
          <th style={cell} title={L("Knocked out", "ダウン")}>D</th>
          <th style={cell} title={L("Assists", "アシスト")}>A</th>
          <th style={cell}>{L("Best combo", "最高コンボ")}</th>
        </tr>
      </thead>
      <tbody>
        {used.map((w) => (
          <tr key={w}>
            <td>{L(...WEAPON_SPECS[w].label)}</td>
            <td style={cell}>{rows[w]!.k}</td>
            <td style={cell}>{rows[w]!.d}</td>
            <td style={cell}>{rows[w]!.a}</td>
            <td style={cell}>×{rows[w]!.combo}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Health, the special's meter, and on a phone, the attack button. */
export function FantasyStatus({ touch }: { touch: boolean }) {
  useLang();
  const state = useStore(fantasy);
  const flash = useFlash(state.hurt);
  const [koSince, setKoSince] = useState<number | null>(null);
  useEffect(() => setKoSince(state.ko ? Date.now() : null), [state.ko]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (koSince === null) return;
    const timer = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(timer);
  }, [koSince]);
  if (!state.weapon) return null;

  const full = state.meter >= 100;
  const left = koSince === null ? 0 : Math.max(0, Math.ceil(KO_SECONDS - (Date.now() - koSince) / 1000));
  return (
    <>
      {flash && <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 25, boxShadow: "inset 0 0 120px rgba(255,40,60,0.55)" }} />}
      <div
        role="status"
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          top: "calc(64px + env(safe-area-inset-top, 0px))",
          width: "min(260px, calc(100vw - 140px))",
          display: "grid",
          gap: 4,
          pointerEvents: "none",
          zIndex: 24,
          fontFamily: "system-ui, sans-serif",
          color: "white",
          textShadow: "0 1px 3px rgba(0,0,0,0.7)",
        }}
      >
        <Bar share={state.hp / MAX_HP} color={state.hp > 35 ? "#5dff8a" : "#ff4d4d"} height={9} />
        <Bar share={state.meter / 100} color={full ? ELEMENT_COLORS[state.element] : "rgba(255,255,255,0.55)"} height={5} glow={full} />
        <small
          style={{
            textAlign: "center",
            fontSize: full && !state.ko ? 13 : 11,
            fontWeight: full && !state.ko ? 800 : 400,
            letterSpacing: full && !state.ko ? 0.3 : 0,
            color: full && !state.ko ? ELEMENT_COLORS[state.element] : undefined,
            opacity: 0.95,
          }}
        >
          {state.ko
            ? L(`Knocked out. Back in ${left}…`, `ダウン。あと${left}秒で復帰…`)
            : state.primed
              ? L("Special ready: swing hard!", "必殺技の準備完了:強く振って!")
              : full
                ? state.charge > 0
                  ? L("Charging…", "チャージ中…")
                  : touch
                    ? L("Hold the attack button: special!", "攻撃ボタン長押しで必殺技!")
                    : L("Hold the click: special!", "クリック長押しで必殺技!")
                : null}
        </small>
        {state.charge > 0 && <Bar share={state.charge} color="#ffffff" height={3} />}
        <RecordLine weapon={state.weapon} />
        {state.chain >= 2 && !state.ko && (
          // Hits in a row fill the special faster (combat.ts), so say so.
          <small key={state.chain} style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: full ? ELEMENT_COLORS[state.element] : "#ffe3a3" }}>
            {L(`Combo ×${state.chain}`, `コンボ ×${state.chain}`)}
          </small>
        )}
      </div>
      {touch && !state.ko && isBladed(state.weapon) && (
        <button
          type="button"
          aria-label={L("Guard (hold)", "防御(長押し)")}
          aria-pressed={state.guard}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setGuard(true);
          }}
          onPointerUp={() => setGuard(false)}
          onPointerCancel={() => setGuard(false)}
          onContextMenu={(e) => e.preventDefault()}
          style={{ ...attackButton(state.guard ? "#cfe6ff" : "rgba(255,255,255,0.75)", 0), width: 52, height: 52, right: "calc(96px + env(safe-area-inset-right, 0px))", bottom: "calc(218px + env(safe-area-inset-bottom, 0px))" }}
        >
          <ShieldIcon />
        </button>
      )}
      {touch && !state.ko && (
        <button
          type="button"
          aria-label={L("Attack (hold for special)", "攻撃(長押しで必殺技)")}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pressStart();
          }}
          onPointerUp={pressEnd}
          onPointerCancel={pressCancel}
          onContextMenu={(e) => e.preventDefault()}
          style={attackButton(full ? ELEMENT_COLORS[state.element] : ACCENT, state.charge)}
        >
          <SwordIcon />
        </button>
      )}
    </>
  );
}

const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

function Bar({ share, color, height, glow }: { share: number; color: string; height: number; glow?: boolean }) {
  return (
    <div style={{ height, borderRadius: height, background: "rgba(10,12,16,0.65)", border: "1px solid rgba(255,255,255,0.14)", overflow: "hidden" }}>
      <div
        style={{
          width: `${Math.max(0, Math.min(1, share)) * 100}%`,
          height: "100%",
          background: color,
          transition: "width 160ms linear",
          boxShadow: glow ? `0 0 10px ${color}` : undefined,
        }}
      />
    </div>
  );
}

/** True for a moment after each hit taken. */
function useFlash(hurt: number) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (hurt === 0) return;
    setOn(true);
    const timer = setTimeout(() => setOn(false), 180);
    return () => clearTimeout(timer);
  }, [hurt]);
  return on;
}

const attackButton = (color: string, charge: number): CSSProperties => ({
  ...pillButtonStyle,
  position: "fixed",
  right: "calc(18px + env(safe-area-inset-right, 0px))",
  // Above the jump and seiza buttons on the right of the touch controls.
  bottom: "calc(210px + env(safe-area-inset-bottom, 0px))",
  width: 66,
  height: 66,
  padding: 0,
  justifyContent: "center",
  borderRadius: "50%",
  zIndex: 26,
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
  color,
  background: `conic-gradient(${color} ${charge * 360}deg, rgba(16,17,22,0.82) 0deg)`,
  border: `2px solid ${color}`,
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  pointerEvents: "auto",
});
