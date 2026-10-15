import { useEffect, useRef, useState } from "react";
import { ROOM_SKY_SCALES, ROOM_SKY_WEATHER, type RoomSky, type RoomSkyWeather } from "../multiplayer/types";
import { roomSkyNow } from "../sky/roomSky";
import type { SkyConfig } from "../sky/skyState";
import { philippineTime, WEATHER } from "../sky/weather";
import { inputStyle, pillButtonActiveStyle, pillButtonStyle } from "../ui/styles";

const SCALE_LABELS: Record<number, string> = {
  1: "Real speed",
  60: "1 hour a minute",
  360: "1 day in 4 min",
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
  return weather === "auto" ? "Auto (shared schedule)" : WEATHER[weather].label;
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
    ? "World default: the still sunset."
    : `${roomSky ? "Room sky" : "World default"}: ${formatHour(nowHour ?? 0)} PHT${
        synced ? ", real time" : mode === "running" ? `, running at ${scale}×` : ", held"
      }, ${weatherLabel(weather).toLowerCase()}.`;

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
      <strong>Sky and time</strong>
      <small style={{ opacity: 0.7 }}>
        {status} Changes here are shared with everyone in the room.
        {skyboxInUse && " The uploaded skybox image covers the sky, but the light still follows these settings."}
      </small>
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" checked={synced} disabled={!connected} onChange={(event) => setSynced(event.target.checked)} />
        Sync with real time in the Philippines (PHT)
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, ...greyed }} aria-disabled={synced}>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            style={!synced && mode === "fixed" ? pillButtonActiveStyle : pillButtonStyle}
            disabled={timeDisabled}
            onClick={() => send({ mode: "fixed", hour: currentHour() })}
            title="Hold the sky at one time of day"
          >
            Hold
          </button>
          <button
            style={!synced && mode === "running" ? pillButtonActiveStyle : pillButtonStyle}
            disabled={timeDisabled}
            onClick={() => send({ mode: "running", hour: draftHour, scale })}
            title="Run the clock from the chosen time"
          >
            Run
          </button>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>
            {mode === "running" && !synced ? "Start from" : "Time"}: {formatHour(draftHour)}
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
              title={SCALE_LABELS[option]}
            >
              {option}×
            </button>
          ))}
        </div>
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        Weather
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
          Reset to world default
        </button>
      )}
    </div>
  );
}
