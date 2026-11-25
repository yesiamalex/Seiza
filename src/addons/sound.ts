import { sfxOutput } from "../audio/sfx";

/**
 * Sound for the room modes: synthesized, never downloaded, and played
 * through the world sounds' own output, so their mute switch covers it.
 * A sound with a distance fades with it, linearly to silence at `falloff`.
 */
export interface Voice {
  ctx: AudioContext;
  /** Connect to this. */
  out: AudioNode;
  t: number;
}

/** `wet`: how much of it goes to the room's reverb too (0 none, 1 as much
 *  as is heard dry), for what rings in a real hall: a taiko. */
export function voice(gain = 1, distance?: number, falloff = 18, life = 4, wet = 0): Voice | null {
  const output = sfxOutput();
  if (!output || output.ctx.state !== "running") return null;
  const level = gain * (distance === undefined ? 1 : Math.max(0, 1 - distance / falloff));
  if (level <= 0.01) return null;
  const node = output.ctx.createGain();
  node.gain.value = level;
  node.connect(output.out);
  if (wet > 0) {
    const send = output.ctx.createGain();
    send.gain.value = wet;
    node.connect(send).connect(reverb(output.ctx, output.out));
  }
  // Let the chain go once everything on it has finished (`life` seconds).
  setTimeout(() => node.disconnect(), life * 1000);
  return { ctx: output.ctx, out: node, t: output.ctx.currentTime };
}

/** One reverb for everything that asks: a convolver whose echo is decaying
 *  noise, two and a half seconds of a hall, made once, nothing downloaded. */
let room: { ctx: AudioContext; node: ConvolverNode } | null = null;
function reverb(ctx: AudioContext, out: AudioNode): AudioNode {
  if (room?.ctx === ctx) return room.node;
  const seconds = 2.4;
  const ir = ctx.createBuffer(2, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = ir.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const k = i / data.length;
      // A short gap before the walls answer, then a smooth fade.
      data[i] = i < ctx.sampleRate * 0.012 ? 0 : (Math.random() * 2 - 1) * Math.pow(1 - k, 3.2);
    }
  }
  const node = ctx.createConvolver();
  node.buffer = ir;
  node.connect(out);
  room = { ctx, node };
  return node;
}

let noise: AudioBuffer | null = null;
export function noiseBuffer(ctx: AudioContext) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

/** Shaped noise: impacts, whooshes, hats, crackle. */
export function noiseHit(
  v: Voice,
  o: { duration: number; gain: number; type?: BiquadFilterType; frequency: number; q?: number; sweepTo?: number; attack?: number; delay?: number }
) {
  const { ctx } = v;
  const t = v.t + (o.delay ?? 0);
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = o.type ?? "bandpass";
  filter.Q.value = o.q ?? 1;
  filter.frequency.setValueAtTime(o.frequency, t);
  if (o.sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(30, o.sweepTo), t + o.duration);
  const env = envelope(ctx, t, o.gain, o.duration, o.attack ?? 0.004);
  source.connect(filter).connect(env).connect(v.out);
  source.start(t, Math.random() * 1.5);
  source.stop(t + o.duration + 0.05);
}

/** A pitched note with an exponential tail. */
export function toneHit(
  v: Voice,
  o: { frequency: number; duration: number; gain: number; type?: OscillatorType; sweepTo?: number; attack?: number; delay?: number; detune?: number }
) {
  const { ctx } = v;
  const t = v.t + (o.delay ?? 0);
  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sine";
  osc.detune.value = o.detune ?? 0;
  osc.frequency.setValueAtTime(o.frequency, t);
  if (o.sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.sweepTo), t + o.duration);
  const env = envelope(ctx, t, o.gain, o.duration, o.attack ?? 0.004);
  osc.connect(env).connect(v.out);
  osc.start(t);
  osc.stop(t + o.duration + 0.05);
}

function envelope(ctx: AudioContext, t: number, gain: number, duration: number, attack: number) {
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  return env;
}
