import { useEffect, useRef, useState } from "react";
import { ROOM_SKY_SCALES, ROOM_SKY_WEATHER, type RoomSky, type RoomSkyWeather } from "../multiplayer/types";
import { roomSkyNow } from "../sky/roomSky";
import type { SkyConfig } from "../sky/skyState";
import { philippineTime, WEATHER } from "../sky/weather";
import { L, useLang } from "../i18n/lang";
import { inputStyle, pillButtonActiveStyle, pillButtonStyle } from "../ui/styles";

const SCALE_LABELS: Record<number, [string, string]> = {
  1: ["Real speed", "実際の速さ"],
  60: ["1 hour a minute", "1分で1時間"],
  360: ["1 day in 4 min", "4分で1日"],
};

/** Hour slider changes are sent once the slider rests this long. */
const HOUR_SEND_DELAY_MS = 300;

function phtHourNow(): number {
  return philippineTime(new Date()).hour;
}

/** 18.5 → "6:30 PM". */
function formatHour(hour: number): string {
  const totalMinutes = Math.round((((hour % 24) + 24) % 24) * 60) % 1440;
  const h24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(minutes).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/** Where a running room sky's clock is now, as a Philippine hour. */
function runningHour(sky: RoomSky): number {
  return philippineTime(roomSkyNow(sky)).hour;
}

function weatherLabel(weather: RoomSkyWeather): string {
  return weather === "auto" ? L("Auto (shared schedule)", "自動(共通スケジュール)") : L(WEATHER[weather].label, WEATHER[weather].labelJa);
}

interface SkyControlsProps {
  worldSky?: SkyConfig;
  roomSky: RoomSky | null;
  onSetRoomSky: (sky: RoomSky | null) => void;
  connected: boolean;
  /** An uploaded panorama covers the sky; the light still follows it. */
  skyboxInUse: boolean;
}

/**
 * The bottom of the edit panel: the room's time of day and weather,
 * shared with everyone in the room (see RoomSky). With "Sync with real
 * time" on, the sky follows the clock in the Philippines and the time
 * controls are greyed out. Off, an editor can hold the sky at an hour or
 * run it from an hour at a chosen speed. Reset goes back to world.json.
 */
export function SkyControls({ worldSky, roomSky, onSetRoomSky, connected, skyboxInUse }: SkyControlsProps) {
  useLang();
  const synced = roomSky ? roomSky.mode === "realtime" : worldSky?.cycle === "realtime";
  const mode: "fixed" | "running" = roomSky?.mode === "running" ? "running" : "fixed";
  const scale = roomSky?.scale ?? 60;
  const weather: RoomSkyWeather = roomSky?.weather ?? worldSky?.weather ?? "auto";
  const stillSunset = !roomSky && worldSky?.cycle !== "realtime";

  // The slider moves locally while dragged and is sent when it rests.
  const [draftHour, setDraftHour] = useState(() => roomSky?.hour ?? phtHourNow());
  const sendTimer = useRef<number | null>(null);
  useEffect(() => {
    if (sendTimer.current === null && roomSky?.hour !== undefined) setDraftHour(roomSky.hour);
  }, [roomSky]);
  useEffect(() => () => {
    if (sendTimer.current !== null) window.clearTimeout(sendTimer.current);
  }, []);

  // A clock line that ticks while the room's sky is moving.
  const [, setTick] = useState(0);
  const ticking = synced || mode === "running";
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);

  const nowHour = synced ? phtHourNow() : roomSky?.mode === "running" ? runningHour(roomSky) : roomSky?.hour;
  const status = stillSunset
    ? L("World default: the still sunset.", "ワールドの標準:止まった夕焼け。")
    : L(
        `${roomSky ? "Room sky" : "World default"}: ${formatHour(nowHour ?? 0)} PHT${
          synced ? ", real time" : mode === "running" ? `, running at ${scale}×` : ", held"
        }, ${weatherLabel(weather).toLowerCase()}.`,
        `${roomSky ? "部屋の空" : "ワールドの標準"}:フィリピン時間 ${formatHour(nowHour ?? 0)}${
          synced ? "、実時間" : mode === "running" ? `、${scale}倍速` : "、固定"
        }、${weatherLabel(weather)}。`
      );

  /** Where the clock is now, so a speed or weather change carries on from
   *  there instead of jumping back to the start hour. */
  const currentHour = () => (roomSky?.mode === "running" ? runningHour(roomSky) : draftHour);

  const send = (next: Partial<RoomSky>) => {
    const sky: RoomSky = { mode: synced ? "realtime" : mode, hour: currentHour(), scale, weather, ...next };
    if (sky.mode === "realtime") {
      delete sky.hour;
      delete sky.scale;
    }
    if (sky.mode === "fixed") delete sky.scale;
    if (sky.hour !== undefined) setDraftHour(sky.hour);
    onSetRoomSky(sky);
  };

  const setSynced = (on: boolean) => {
    // Turning sync off holds the sky where real time has it now.
    if (on) send({ mode: "realtime" });
    else send({ mode: "fixed", hour: phtHourNow() });
  };

  const onHourInput = (hour: number) => {
    setDraftHour(hour);
    if (sendTimer.current !== null) window.clearTimeout(sendTimer.current);
    sendTimer.current = window.setTimeout(() => {
      sendTimer.current = null;
      send({ mode, hour, scale: mode === "running" ? scale : undefined });
    }, HOUR_SEND_DELAY_MS);
  };

  const timeDisabled = !connected || synced;
  const greyed = { opacity: synced ? 0.4 : 1, transition: "opacity 0.15s" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8 }}>
      <strong>{L("Sky and time", "空と時間")}</strong>
      <small style={{ opacity: 0.7 }}>
        {status} {L("Changes here are shared with everyone in the room.", "ここでの変更は部屋の全員に共有されます。")}
        {skyboxInUse && L(" The uploaded skybox image covers the sky, but the light still follows these settings.", "アップロードしたスカイボックスが空を覆いますが、光はこの設定に従います。")}
      </small>
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" checked={synced} disabled={!connected} onChange={(event) => setSynced(event.target.checked)} />
        {L("Sync with real time in the Philippines (PHT)", "フィリピンの実時間(PHT)に合わせる")}
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, ...greyed }} aria-disabled={synced}>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            style={!synced && mode === "fixed" ? pillButtonActiveStyle : pillButtonStyle}
            disabled={timeDisabled}
            onClick={() => send({ mode: "fixed", hour: currentHour() })}
            title={L("Hold the sky at one time of day", "空をある時刻で止める")}
          >
            {L("Hold", "固定")}
          </button>
          <button
            style={!synced && mode === "running" ? pillButtonActiveStyle : pillButtonStyle}
            disabled={timeDisabled}
            onClick={() => send({ mode: "running", hour: draftHour, scale })}
            title={L("Run the clock from the chosen time", "選んだ時刻から時計を進める")}
          >
            {L("Run", "進める")}
          </button>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>
            {mode === "running" && !synced ? L("Start from", "開始時刻") : L("Time", "時刻")}: {formatHour(draftHour)}
          </span>
          <input
            type="range"
            min={0}
            max={23.75}
            step={0.25}
            value={draftHour}
            disabled={timeDisabled}
            onChange={(event) => onHourInput(Number(event.target.value))}
          />
        </label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", opacity: mode === "running" ? 1 : 0.4 }}>
          {ROOM_SKY_SCALES.map((option) => (
            <button
              key={option}
              style={!synced && mode === "running" && scale === option ? pillButtonActiveStyle : pillButtonStyle}
              disabled={timeDisabled || mode !== "running"}
              onClick={() => send({ mode: "running", scale: option })}
              title={SCALE_LABELS[option] && L(...SCALE_LABELS[option])}
            >
              {option}×
            </button>
          ))}
        </div>
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {L("Weather", "天気")}
        <select
          value={weather}
          disabled={!connected}
          onChange={(event) => send({ weather: event.target.value as RoomSkyWeather })}
          style={{ ...inputStyle, padding: "6px 8px" }}
        >
          {ROOM_SKY_WEATHER.map((option) => (
            <option key={option} value={option} style={{ color: "black" }}>
              {weatherLabel(option)}
            </option>
          ))}
        </select>
      </label>
      {roomSky && (
        <button style={pillButtonStyle} disabled={!connected} onClick={() => onSetRoomSky(null)}>
          {L("Reset to world default", "ワールドの標準に戻す")}
        </button>
      )}
    </div>
  );
}
