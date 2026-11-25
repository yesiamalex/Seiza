import { useEffect, useSyncExternalStore, type CSSProperties } from "react";
import { L, useLang } from "../../i18n/lang";
import { pillButtonStyle } from "../../ui/styles";
import { Docked } from "../../ui/StatusDock";
import { useStore } from "../store";
import { Choices, Hint, MODE_ACCENTS, ModeButton } from "../ui";
import { activeRideSource, connectRideSource, disconnectRideSource, latestReading, onRideSourcesChange, rideSources } from "../sport";
import { getOffBehind, letOff, myPassenger, nearRide, passenger, releaseBell, rideBehind, ride, ringBell, setVehicle } from "./ride";
import { VEHICLE_LABELS, VEHICLE_SPECS, VEHICLES, type Vehicle } from "./vehicles";

const ACCENT = MODE_ACCENTS.exer;
const NONE = "none" as const;

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** On a keyboard: T goes through the rides (Shift+T back), on foot after
 *  the last; while riding, B rings the bell (or the horn), Esc gets off. */
function useBellKey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.key.toLowerCase() === "t") {
        const order = [null, ...VEHICLES];
        const at = order.indexOf(ride.get().vehicle);
        setVehicle(order[(at + (e.shiftKey ? order.length - 1 : 1)) % order.length]);
        return;
      }
      if (!ride.get().vehicle) return;
      if (e.key.toLowerCase() === "b") ringBell();
      else if (e.key === "Escape") setVehicle(null);
    };
    // The horn sounds while B is held.
    const onUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "b") releaseBell();
    };
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", releaseBell);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", releaseBell);
    };
  }, []);
}

const useSources = () => useSyncExternalStore(onRideSourcesChange, () => rideSources().length, () => 0);

/** ExerSeiza's button in the bar: get on a bike, a skateboard, or a moped. */
export function ExerButton() {
  useLang();
  useBellKey();
  useSources();
  const state = useStore(ride);
  const bell = state.vehicle ? VEHICLE_SPECS[state.vehicle].bell : null;
  const sources = rideSources();
  const active = activeRideSource();
  return (
    <ModeButton id="exer" accent={ACCENT} icon={<BikeIcon />} label={L("Ride", "乗る")} title={L("ExerSeiza: ride a bike, a skateboard, or a moped", "ExerSeiza:自転車・スケボー・原付に乗る")}>
      <strong style={{ color: ACCENT }}>ExerSeiza</strong>
      <Choices<Vehicle | typeof NONE>
        title={L("Ride", "乗りもの")}
        options={[NONE, ...VEHICLES]}
        value={state.vehicle ?? NONE}
        onChange={(v) => setVehicle(v === NONE ? null : v)}
        accent={ACCENT}
        render={(v) => (v === NONE ? L("On foot", "徒歩") : L(...VEHICLE_LABELS[v]))}
      />
      {bell && (
        <button type="button" style={pillButtonStyle} {...holdToSound}>
          {bell === "bell" ? L("Ring the bell", "ベルを鳴らす") : L("Sound the horn", "クラクション")} <kbd style={{ opacity: 0.6, fontSize: 10 }}>B</kbd>
        </button>
      )}
      {state.vehicle && <RideStats />}
      {sources.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          <small style={{ opacity: 0.7 }}>{L("Smart trainer (SportSeiza)", "スマートトレーナー(SportSeiza)")}</small>
          {sources.map((s) => (
            <button key={s.id} type="button" style={toggle(active?.id === s.id)} onClick={() => (active?.id === s.id ? disconnectRideSource() : void connectRideSource(s.id))}>
              {L(...s.label)} · {active?.id === s.id ? L("Disconnect", "切断") : L("Connect", "接続")}
            </button>
          ))}
        </div>
      )}
      <Hint accent={ACCENT}>
        {L(
          "**T** goes through the rides (Shift+T back). **W** (or the pad) rides where you look, **A** and **D** steer, **S** (or the pad pulled back) brakes and, stopped, backs up, faster than walking, slower uphill. **B** rings the bike's bell, or sounds the moped's horn while held, and **Esc** (or **Get off** at the top) gets off. In VR, **hold the right trigger** to ride on (let go to coast to a stop), **squeeze the left trigger** to brake, press **A** for the bell (hold it for the moped's horn), and **B** to get off.",
          "**T**で乗りものを切り替え(Shift+Tで戻る)。**W**(またはパッド)で見ている方へ進み、**A**と**D**で曲がり、**S**(またはパッドを後ろへ)でブレーキ、止まってからは後ろへ下がります。歩くより速く、上り坂では遅くなります。**B**で自転車のベル、押している間は原付のクラクション、**Esc**(または上の「降りる」)で降ります。VRでは**右トリガーを押している間**進み(離すと止まります)、**左トリガー**でブレーキ、**A**でベル(原付は押している間クラクション)、**B**で降ります。"
        )}
      </Hint>
    </ModeButton>
  );
}

function RideStats() {
  const state = useStore(ride);
  const reading = latestReading();
  const parts = [`${(state.speed * 3.6).toFixed(1)} km/h`, `${Math.round(state.distance)} m`, L(`slope ${(state.gradient * 100).toFixed(1)}%`, `勾配 ${(state.gradient * 100).toFixed(1)}%`)];
  if (state.climb >= 1) parts.push(L(`climbed ${Math.round(state.climb)} m`, `上昇 ${Math.round(state.climb)} m`));
  if (reading?.cadence !== undefined) parts.push(`${Math.round(reading.cadence)} rpm`);
  if (reading?.power !== undefined) parts.push(`${Math.round(reading.power)} W`);
  if (reading?.heartRate !== undefined) parts.push(`${Math.round(reading.heartRate)} bpm`);
  return <small style={{ fontVariantNumeric: "tabular-nums" }}>{parts.join(" · ")}</small>;
}

/** Over the world while riding: the numbers, and a bell to tap on a phone. */
export function ExerStatus({ touch }: { touch: boolean }) {
  useLang();
  const state = useStore(ride);
  if (!state.vehicle) return null;
  const bell = VEHICLE_SPECS[state.vehicle].bell;
  return (
    <Docked order={1}>
    <div style={statusStyle}>
      <RideStats />
      {touch && bell && (
        <button type="button" style={{ ...pillButtonStyle, padding: "6px 12px" }} {...holdToSound}>
          {bell === "bell" ? L("Bell", "ベル") : L("Horn", "クラクション")}
        </button>
      )}
      <button type="button" style={{ ...pillButtonStyle, padding: "6px 12px" }} onClick={() => setVehicle(null)} title={L("Get off (Esc)", "降りる(Esc)")}>
        {L("Get off", "降りる")}
      </button>
    </div>
    </Docked>
  );
}

/** Near a bike or moped someone's riding: get on behind them (E); behind
 *  someone: get off (E); riding with someone behind: let them off. */
export function RideAlong() {
  useLang();
  const near = useStore(nearRide);
  const behind = useStore(passenger);
  const mine = useStore(myPassenger);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || e.key.toLowerCase() !== "e") return;
      if (passenger.get().driver) getOffBehind();
      else {
        const { driver, kind } = nearRide.get();
        if (driver && kind) rideBehind(driver, kind);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const chip = (text: string, action: string, onClick: () => void, key?: string) => (
    <Docked order={4}>
      <div style={{ ...statusStyle, fontSize: 13 }}>
        <span>{text}</span>
        <button type="button" style={{ ...pillButtonStyle, padding: "5px 12px" }} onClick={onClick}>
          {action} {key && <kbd style={{ opacity: 0.6, fontSize: 10 }}>{key}</kbd>}
        </button>
      </div>
    </Docked>
  );
  if (behind.driver) return chip(L("Riding behind", "うしろに乗っています"), L("Get off", "降りる"), getOffBehind, "E");
  if (mine.id) return chip(L(`${mine.name || "Someone"} is riding behind you`, `${mine.name || "誰か"}がうしろに乗っています`), L("Let off", "降ろす"), () => letOff(mine.id!));
  if (near.driver && near.kind) return chip(near.kind === "bike" ? L(`Ride on ${near.name}'s carrier`, `${near.name}の荷台に乗る`) : L(`Ride behind ${near.name}`, `${near.name}のうしろに乗る`), L("Get on", "乗る"), () => rideBehind(near.driver!, near.kind!), "E");
  return null;
}

const statusStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 12px",
  borderRadius: 999,
  background: "rgba(16,18,24,0.72)",
  color: "#fff",
  border: `1px solid ${ACCENT}`,
  pointerEvents: "auto",
};

const toggle = (on: boolean): CSSProperties => ({
  ...pillButtonStyle,
  justifyContent: "center",
  ...(on ? { background: "rgba(95,211,154,0.25)", border: `1px solid ${ACCENT}` } : {}),
});

export const BikeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="5.5" cy="17" r="3.5" />
    <circle cx="18.5" cy="17" r="3.5" />
    <path d="M5.5 17l4-8h5l4 8M9.5 9L8 6H6M14.5 9l-3 8" />
  </svg>
);

/** A bell or horn button: the horn sounds while it's held, the bell rings
 *  on the press (Enter or Space on a keyboard too). */
const holdToSound = {
  onPointerDown: (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    ringBell();
  },
  onPointerUp: releaseBell,
  onPointerCancel: releaseBell,
  onLostPointerCapture: releaseBell,
  onClick: (e: React.MouseEvent) => {
    if (e.detail !== 0) return;
    ringBell();
    setTimeout(releaseBell, 300);
  },
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
};
