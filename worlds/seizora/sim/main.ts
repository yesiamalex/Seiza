// Seizora's control room: runs the microgrid (energy.ts) on Seiza's shared
// weather engine and draws it. In Live mode it follows the same clock and
// weather schedule as the world's sky, so the numbers here match the sky
// visitors are standing under; Simulate mode lets a class scrub time,
// speed it up, and call in weather.
import {
  philippineTime,
  scheduledWeather,
  SITES,
  skyColors,
  sunPosition,
  WEATHER,
  WeatherState,
  type WeatherType,
} from "../../../src/sky/weather";
import {
  ABSORBERS,
  DEFAULT_CONTROLS,
  ETLS,
  evaluateDesign,
  HTLS,
  Microgrid,
  MOUNTS,
  PLANT,
  type Controls,
  type Encapsulation,
  type LabDesign,
  type Snapshot,
} from "./energy";
import { INFO, type InfoKey } from "./info";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

// --- state -------------------------------------------------------------------

const WORLD_SITE = "cebu"; // matches worlds/seizora/world/world.json
let mode: "live" | "sim" = "live";
let siteKey = WORLD_SITE;
let speed = 10; // simulated minutes per real second, in Simulate mode
let simDay = philippineTime(new Date()).dayOfYear;
let simHour = 6;
let simWeather: WeatherType = "clear";
const controls: Controls = { ...DEFAULT_CONTROLS };
let weather = new WeatherState(scheduledWeather(new Date()));
let grid = new Microgrid();
let simMinutes = 0;
const history: Snapshot[] = [];
const HISTORY_MINUTES = 24 * 60;
const SAMPLE_EVERY = 5; // minutes between chart samples
let sinceSample = 0;

// --- controls ------------------------------------------------------------------

const siteSelect = $<HTMLSelectElement>("#site");
const labSite = $<HTMLSelectElement>("#l-site");
for (const [key, s] of Object.entries(SITES)) {
  siteSelect.add(new Option(s.label, key, key === WORLD_SITE, key === WORLD_SITE));
  labSite.add(new Option(s.label, key, key === WORLD_SITE, key === WORLD_SITE));
}
siteSelect.onchange = () => {
  siteKey = siteSelect.value;
};

for (const input of document.querySelectorAll<HTMLInputElement>('input[name="mode"]')) {
  input.onchange = () => {
    mode = input.value as "live" | "sim";
    document.body.classList.toggle("live", mode === "live");
    reset();
  };
}
document.body.classList.add("live");

const weatherBar = $(".weathers");
for (const [key, w] of Object.entries(WEATHER)) {
  const b = document.createElement("button");
  b.textContent = w.label;
  b.dataset.weather = key;
  if (key === simWeather) b.classList.add("on");
  b.onclick = () => {
    simWeather = key as WeatherType;
    weatherBar.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  };
  weatherBar.append(b);
}
for (const b of document.querySelectorAll<HTMLButtonElement>(".speeds button")) {
  b.onclick = () => {
    speed = Number(b.dataset.speed);
    document.querySelectorAll(".speeds button").forEach((x) => x.classList.toggle("on", x === b));
  };
}
const hourInput = $<HTMLInputElement>("#hour");
const dayInput = $<HTMLInputElement>("#day");
dayInput.value = String(simDay);
hourInput.oninput = () => {
  simHour = Number(hourInput.value);
};
dayInput.oninput = () => {
  simDay = Number(dayInput.value);
};
$<HTMLSelectElement>("#batt-mode").onchange = (e) => {
  controls.batteryMode = (e.target as HTMLSelectElement).value as Controls["batteryMode"];
};
$<HTMLSelectElement>("#encap").onchange = (e) => {
  controls.encapsulation = (e.target as HTMLSelectElement).value as Encapsulation;
};
const breakers: [string, keyof Controls][] = [
  ["#b-si", "silicon"],
  ["#b-pvk", "perovskite"],
  ["#b-wind", "wind"],
  ["#b-batt", "battery"],
  ["#b-grid", "gridConnected"],
];
for (const [sel, key] of breakers) {
  $<HTMLInputElement>(sel).onchange = (e) => {
    (controls as unknown as Record<string, boolean>)[key] = (e.target as HTMLInputElement).checked;
  };
}

for (const tab of document.querySelectorAll<HTMLButtonElement>(".tabs button")) {
  tab.onclick = () => {
    document.querySelectorAll(".tabs button").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    $("#tab-grid").hidden = tab.dataset.tab !== "grid";
    $("#tab-lab").hidden = tab.dataset.tab !== "lab";
    if (tab.dataset.tab === "lab") updateLab();
  };
}

function reset() {
  grid = new Microgrid();
  history.length = 0;
  simMinutes = 0;
  weather = new WeatherState(mode === "live" ? scheduledWeather(new Date()) : simWeather);
}

// --- the clock -------------------------------------------------------------------

function currentTime(): { day: number; hour: number } {
  if (mode === "live") {
    const t = philippineTime(new Date());
    return { day: t.dayOfYear, hour: t.hour };
  }
  return { day: simDay, hour: simHour };
}

let lastFrame = performance.now();
let accumulator = 0;
function tick(now: number) {
  const dt = Math.min(0.25, (now - lastFrame) / 1000);
  lastFrame = now;
  // Live: real time, one simulated minute per real minute, stepped a few
  // times a second. Simulate: `speed` simulated minutes per real second.
  const minutes = mode === "live" ? dt / 60 : dt * speed;
  accumulator += minutes;
  if (mode === "sim" && minutes > 0) {
    simHour += minutes / 60;
    if (simHour >= 24) {
      simHour -= 24;
      simDay = (simDay % 365) + 1;
      dayInput.value = String(simDay);
    }
    hourInput.value = String(simHour);
  }
  // Integrate in steps of at most five minutes, so a fast speed still
  // charges and discharges the battery smoothly.
  const stepSize = mode === "live" ? accumulator : Math.min(5, accumulator);
  while (accumulator > 1e-6) {
    const m = Math.min(stepSize || accumulator, accumulator);
    accumulator -= m;
    simMinutes += m;
    weather.setType(mode === "live" ? scheduledWeather(new Date()) : simWeather);
    weather.step(m, simMinutes);
    const { day, hour } = currentTime();
    const s = grid.step(m, day, hour, SITES[siteKey], weather, controls);
    sinceSample += m;
    if (sinceSample >= SAMPLE_EVERY || history.length === 0) {
      sinceSample = 0;
      history.push(s);
      while (history.length > HISTORY_MINUTES / SAMPLE_EVERY) history.shift();
    }
    if (mode === "live") break;
  }
  if (grid.last) render(grid.last);
  requestAnimationFrame(tick);
}

// --- drawing ---------------------------------------------------------------------

const fmt = (v: number, d = 2) => v.toFixed(d);
const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
const hhmm = (h: number) => `${pad(h)}:${pad((h % 1) * 60)}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateLabel(day: number) {
  const d = new Date(Date.UTC(2026, 0, day));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function setNode(id: string, mw: number, on: boolean) {
  const n = $(id);
  n.querySelector(".mw")!.textContent = fmt(mw);
  n.classList.toggle("off", !on);
  n.classList.toggle("flowing", Math.abs(mw) > 0.01);
}

function render(s: Snapshot) {
  $("#clock-time").textContent = hhmm(s.hour);
  $("#clock-date").textContent = `${dateLabel(s.dayOfYear)} · ${SITES[siteKey].label} · ${WEATHER[weather.type].label}${mode === "live" ? " · live" : ""}`;
  $("#r-sun").textContent = s.sunElevation > 0 ? `${fmt(s.sunElevation, 0)}° up` : "below horizon";
  $("#r-ghi").textContent = `${fmt(s.ghi, 0)} W/m²`;
  $("#r-poa").textContent = `${fmt(s.poa, 0)} W/m²`;
  $("#r-temp").textContent = `${fmt(s.ambient, 0)} / ${fmt(s.cellTemp, 0)} °C`;
  $("#r-wind").textContent = `${fmt(s.windSpeed, 1)} m/s${s.turbinesFeathered ? " · feathered" : ""}`;
  $("#r-cloud").textContent = `${fmt(s.cloud * 100, 0)}% / ${fmt(s.humidity, 0)}%`;

  setNode("#n-si", s.siliconMw, controls.silicon);
  setNode("#n-pvk", s.perovskiteMw, controls.perovskite);
  setNode("#n-wind", s.windMw, controls.wind);
  setNode("#n-load", s.loadMw - s.unservedMw, true);
  setNode("#n-batt", s.batteryMw, controls.battery);
  setNode("#n-grid", s.gridMw, controls.gridConnected);
  $("#pvk-health").textContent = `${fmt(s.perovskiteHealth * 100, 1)}% health`;
  $("#batt-state").textContent = s.batteryMw > 0.01 ? "discharging" : s.batteryMw < -0.01 ? "charging" : "idle";
  $("#grid-state").textContent = !controls.gridConnected ? "island mode" : s.gridMw > 0.01 ? "importing" : s.gridMw < -0.01 ? "exporting" : "balanced";
  $("#soc-fill").style.width = `${s.soc * 100}%`;
  $("#soc-text").textContent = `${fmt(s.soc * 100, 0)}% · ${fmt(s.soc * PLANT.batteryMwh, 1)} MWh`;

  const t = grid.totals;
  $("#t-gen").textContent = `${fmt(t.generatedMwh, 1)} MWh`;
  const served = t.loadMwh;
  const renewableToLoad = Math.max(0, served - t.importedMwh);
  $("#t-share").textContent = served > 0.01 ? `${fmt((renewableToLoad / served) * 100, 0)}%` : "-";
  $("#t-co2").textContent = `${fmt(t.co2AvoidedT, 1)} t`;
  $("#t-grid").textContent = `${fmt(t.importedMwh, 1)} / ${fmt(t.exportedMwh, 1)} MWh`;
  $("#t-unserved").textContent = `${fmt(t.unservedMwh, 2)} MWh`;

  const log = $("#log");
  const html = grid.events
    .slice(0, 20)
    .map((e) => `<li class="${e.level}"><time>${dateLabel(e.dayOfYear)} ${hhmm(e.hour)}</time>${e.text}</li>`)
    .join("");
  if (log.dataset.html !== html) {
    log.innerHTML = html || '<li class="muted">Nothing yet. Try a typhoon, or open the grid tie at night.</li>';
    log.dataset.html = html;
  }

  drawSky(s);
  drawChart();
}

const skyCanvas = $<HTMLCanvasElement>("#sky");
const skyCtx = skyCanvas.getContext("2d")!;
const rainDrops = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.6 }));
function drawSky(s: Snapshot) {
  const { width: w, height: h } = skyCanvas;
  const colors = skyColors(s.sunElevation, s.cloud, s.rain);
  const rgb = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const g = skyCtx.createLinearGradient(0, 0, 0, h * 0.78);
  g.addColorStop(0, rgb(colors.top));
  g.addColorStop(1, rgb(colors.bottom));
  skyCtx.fillStyle = g;
  skyCtx.fillRect(0, 0, w, h);

  // Stars, fading in as the sky darkens.
  const starAlpha = Math.max(0, 1 - colors.daylight * 2) * (1 - s.cloud * 0.9);
  if (starAlpha > 0.02) {
    skyCtx.fillStyle = `rgba(255,255,240,${starAlpha})`;
    for (let i = 0; i < 90; i++) {
      const x = ((i * 977) % w) + ((i * 13) % 7);
      const y = (i * 613) % (h * 0.7);
      skyCtx.fillRect(x, y, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1);
    }
  }

  // The sun's arc across the panel, east on the left.
  const sun = sunPosition(s.dayOfYear, s.hour, SITES[siteKey]);
  if (sun.elevation > -4) {
    const x = ((sun.azimuth - 60) / 240) * w;
    const y = h * 0.78 - (Math.max(-4, sun.elevation) / 90) * h * 0.72;
    const glow = skyCtx.createRadialGradient(x, y, 2, x, y, 46);
    glow.addColorStop(0, `rgba(255,240,200,${0.95 * (1 - s.cloud * 0.8)})`);
    glow.addColorStop(1, "rgba(255,200,120,0)");
    skyCtx.fillStyle = glow;
    skyCtx.fillRect(x - 50, y - 50, 100, 100);
  }

  // Cloud bank.
  if (s.cloud > 0.05) {
    skyCtx.fillStyle = `rgba(${colors.daylight > 0.3 ? "235,238,244" : "70,74,90"},${Math.min(0.85, s.cloud * 0.8)})`;
    for (let i = 0; i < 9; i++) {
      const cx = ((i / 9) * w + (performance.now() / 120) * (0.3 + (i % 3) * 0.2)) % (w + 120) - 60;
      const cy = 30 + (i % 4) * 26;
      skyCtx.beginPath();
      skyCtx.ellipse(cx, cy, 70 + (i % 3) * 25, 18 + (i % 2) * 8, 0, 0, Math.PI * 2);
      skyCtx.fill();
    }
  }

  // Rain.
  if (s.rain > 0.05) {
    skyCtx.strokeStyle = `rgba(180,200,230,${0.25 + s.rain * 0.4})`;
    skyCtx.lineWidth = 1;
    skyCtx.beginPath();
    const n = Math.floor(rainDrops.length * s.rain);
    for (let i = 0; i < n; i++) {
      const d = rainDrops[i];
      d.y = (d.y + 0.02 * d.v) % 1;
      const x = d.x * w + s.windSpeed * 0.4;
      skyCtx.moveTo(x, d.y * h);
      skyCtx.lineTo(x - s.windSpeed * 0.5, d.y * h + 10);
    }
    skyCtx.stroke();
  }

  // Ground with the plant in silhouette: panels and two turbines.
  skyCtx.fillStyle = "#1c2a1c";
  skyCtx.fillRect(0, h * 0.78, w, h * 0.22);
  skyCtx.fillStyle = "#0b1222";
  for (let i = 0; i < 9; i++) skyCtx.fillRect(40 + i * 34, h * 0.8, 28, 9);
  const spin = (performance.now() / 1000) * (s.windMw > 0 ? 1.2 + s.windSpeed * 0.15 : 0);
  for (const tx of [w * 0.72, w * 0.86]) {
    skyCtx.fillRect(tx - 2, h * 0.42, 4, h * 0.38);
    for (let k = 0; k < 3; k++) {
      const a = spin + (k * Math.PI * 2) / 3;
      skyCtx.save();
      skyCtx.translate(tx, h * 0.42);
      skyCtx.rotate(a);
      skyCtx.fillRect(-2, -44, 4, 44);
      skyCtx.restore();
    }
  }
}

const chart = $<HTMLCanvasElement>("#chart");
const chartCtx = chart.getContext("2d")!;
function drawChart() {
  const { width: w, height: h } = chart;
  chartCtx.clearRect(0, 0, w, h);
  const maxMw = 6;
  const n = HISTORY_MINUTES / SAMPLE_EVERY;
  const x = (i: number) => (i / (n - 1)) * w;
  const y = (mw: number) => h - 18 - (mw / maxMw) * (h - 28);
  chartCtx.strokeStyle = "#24304f";
  chartCtx.fillStyle = "#8f9bbf";
  chartCtx.font = "11px system-ui";
  for (let mw = 0; mw <= maxMw; mw += 2) {
    chartCtx.beginPath();
    chartCtx.moveTo(0, y(mw));
    chartCtx.lineTo(w, y(mw));
    chartCtx.stroke();
    chartCtx.fillText(`${mw} MW`, 4, y(mw) - 3);
  }
  const offset = n - history.length;
  const layers: [string, (s: Snapshot) => number][] = [
    ["#3b7bff", (s) => s.siliconMw],
    ["#c2603a", (s) => s.perovskiteMw],
    ["#34c3a0", (s) => s.windMw],
    ["#b78cff", (s) => Math.max(0, s.batteryMw)],
  ];
  const base = history.map(() => 0);
  for (const [color, value] of layers) {
    chartCtx.fillStyle = color;
    chartCtx.beginPath();
    history.forEach((s, i) => chartCtx.lineTo(x(offset + i), y(base[i] + value(s))));
    for (let i = history.length - 1; i >= 0; i--) chartCtx.lineTo(x(offset + i), y(base[i]));
    chartCtx.closePath();
    chartCtx.globalAlpha = 0.85;
    chartCtx.fill();
    chartCtx.globalAlpha = 1;
    history.forEach((s, i) => (base[i] += value(s)));
  }
  chartCtx.strokeStyle = "#ffffff";
  chartCtx.lineWidth = 2;
  chartCtx.beginPath();
  history.forEach((s, i) => chartCtx.lineTo(x(offset + i), y(s.loadMw)));
  chartCtx.stroke();
  chartCtx.lineWidth = 1;
}

// --- perovskite lab ------------------------------------------------------------------

const labSelects: [string, Record<string, { label: string }>][] = [
  ["#l-absorber", ABSORBERS],
  ["#l-etl", ETLS],
  ["#l-htl", HTLS],
  ["#l-mount", MOUNTS],
];
for (const [sel, options] of labSelects) {
  const el = $<HTMLSelectElement>(sel);
  for (const [k, v] of Object.entries(options)) el.add(new Option(v.label, k));
  el.onchange = updateLab;
}
$<HTMLSelectElement>("#l-encap").onchange = updateLab;
labSite.onchange = updateLab;
$<HTMLSelectElement>("#l-absorber").value = "fac";
$<HTMLSelectElement>("#l-htl").value = "ptaa";

function updateLab() {
  const design: LabDesign = {
    absorber: $<HTMLSelectElement>("#l-absorber").value as LabDesign["absorber"],
    etl: $<HTMLSelectElement>("#l-etl").value as LabDesign["etl"],
    htl: $<HTMLSelectElement>("#l-htl").value as LabDesign["htl"],
    mount: $<HTMLSelectElement>("#l-mount").value as LabDesign["mount"],
    encapsulation: $<HTMLSelectElement>("#l-encap").value as Encapsulation,
  };
  const r = evaluateDesign(design, SITES[labSite.value]);
  const layers = [
    ["Glass (sunlight enters here)", "#bfe8f2"],
    ["Transparent electrode (TCO)", "#8cc9ef"],
    [`Electron transport: ${ETLS[design.etl].label}`, "#ececf2"],
    [`Perovskite absorber: ${ABSORBERS[design.absorber].label}`, "#7a3a24"],
    [`Hole transport: ${HTLS[design.htl].label}`, "#a98ad0"],
    ["Back contact (gold)", "#e3b85a"],
  ];
  $("#stack").innerHTML = layers
    .map(([name, color]) => `<div style="background:${color};color:${color === "#7a3a24" ? "#fff" : "#111"}">${name}</div>`)
    .join("");
  $("#o-eff").textContent = `${(r.efficiency * 100).toFixed(1)}%`;
  $("#o-cost").textContent = r.costIndex.toFixed(2);
  $("#o-t80").textContent = r.t80Months >= 300 ? "25 years or more" : r.t80Months < 12 ? `${r.t80Months} months` : `${(r.t80Months / 12).toFixed(1)} years`;
  $("#o-yield").textContent = `${r.yieldKwhPerKwp.toFixed(0)} kWh per kWp`;
  $("#o-year").textContent = `${(r.monthlyHealth[11] * 100).toFixed(0)}%`;
  drawFade(r.monthlyHealth);
}

function drawFade(health: number[]) {
  const c = $<HTMLCanvasElement>("#fade");
  const ctx = c.getContext("2d")!;
  const { width: w, height: h } = c;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#24304f";
  ctx.fillStyle = "#8f9bbf";
  ctx.font = "11px system-ui";
  for (const v of [1, 0.8, 0.6]) {
    const y = h - 16 - ((v - 0.5) / 0.5) * (h - 26);
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.fillText(`${v * 100}%`, 0, y + 4);
  }
  ctx.strokeStyle = "#c2603a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  [1, ...health].forEach((v, i) => ctx.lineTo(30 + (i / 12) * (w - 40), h - 16 - ((Math.max(0.5, v) - 0.5) / 0.5) * (h - 26)));
  ctx.stroke();
  ctx.lineWidth = 1;
  MONTHS.forEach((m, i) => ctx.fillText(m, 30 + ((i + 1) / 12) * (w - 40) - 10, h - 2));
}

// --- info pop-ups --------------------------------------------------------------------

const dialog = document.createElement("dialog");
dialog.className = "info";
document.body.append(dialog);
function openInfo(key: InfoKey) {
  const item = INFO[key];
  dialog.innerHTML = `
    <form method="dialog">
      <div class="info-art">${item.art}</div>
      <div class="info-text">
        <h3>${item.title}</h3>
        ${item.body.map((p) => `<p>${p}</p>`).join("")}
        ${item.try ? `<p class="try"><strong>Try it:</strong> ${item.try}</p>` : ""}
        <button class="close" value="close">Close</button>
      </div>
    </form>`;
  dialog.showModal();
}
// An ⓘ on every part of the plant and every lab section that has a card.
for (const [selector, key] of [
  ["#n-si", "silicon"],
  ["#n-pvk", "perovskite"],
  ["#n-wind", "wind"],
  ["#n-batt", "battery"],
  ["#n-grid", "grid"],
  ["#n-load", "load"],
  [".sky-panel", "sky"],
  [".lab-build", "layers"],
  [".lab-place", "degradation"],
] as [string, InfoKey][]) {
  const host = $(selector);
  const b = document.createElement("button");
  b.className = "info-btn";
  b.type = "button";
  b.textContent = "i";
  b.title = `About: ${INFO[key].title}`;
  b.setAttribute("aria-label", `About: ${INFO[key].title}`);
  b.onclick = () => openInfo(key);
  host.append(b);
}

reset();
updateLab();
requestAnimationFrame(tick);
