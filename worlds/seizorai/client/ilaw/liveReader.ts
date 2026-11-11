// The live plant as Ilaw-san reads it, for her knowledge (knowledge.ts).
import { skyState } from "../../../../src/sky/skyState";
import { dayTotals, lessonNow, live } from "../live";
import type { LiveReader } from "./knowledge";

const WEATHER: Record<string, string> = { clear: "clear", partly: "partly cloudy", overcast: "overcast", rain: "raining", typhoon: "a typhoon" };

export const liveReader: LiveReader = {
  now: () => live.now,
  lesson: lessonNow,
  co2TodayT: () => (live.now ? dayTotals().co2AvoidedT : null),
  weather: () => (skyState.weatherState ? WEATHER[skyState.weatherState.type] ?? null : null),
};
