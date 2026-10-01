/**
 * World sound effects, synthesised rather than sampled.
 *
 * Every other asset in this project is generated in code — the room, the
 * avatars, the textures, the motion clips — and that is what keeps the
 * repository cleanly licensable (see THIRD_PARTY_ASSETS.md). Sound is no
 * different: a handful of recorded footsteps and a door slide would be
 * the first media files in the repo and the first licences to track, for
 * a few hundred milliseconds of audio each. These are built from noise
 * and oscillators instead, so they cost nothing to download and belong
 * to the repo like the geometry does.
 *
 * They are deliberately modest. A synthesised footstep will not pass for
 * a recording; what it does do is tell you that tatami sounds different
 * from floorboards and that you just stepped into water, which is the
 * part that carries information.
 *
 * Everything here is lazy and failure-tolerant. The AudioContext is only
 * created on the first sound, because browsers refuse to start one before
 * a user gesture, and every entry point swallows errors — audio is a
 * nice-to-have, and a blocked or unavailable context must never take the
 * world down with it.
 */

let context: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

/** Global ceiling. These are background texture, not the main event —
 *  voice is. */
const MASTER_VOLUME = 0.5;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (muted) return null;
  try {
    if (!context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = MASTER_VOLUME;
      master.connect(context.destination);
    }
    // Autoplay policy suspends a context created before the first
    // gesture. Resuming is a no-op once it is already running.
    if (context.state === "suspended") void context.resume();
    return master ? { ctx: context, out: master } : null;
  } catch {
    return null;
  }
}

/** Turns all world sound on or off. Voice chat is unaffected. */
export function setSfxMuted(next: boolean) {
  muted = next;
  if (master) master.gain.value = next ? 0 : MASTER_VOLUME;
}

export function isSfxMuted() {
  return muted;
}

/** A short burst of filtered noise — the basis of every impact here. */
function noiseBurst(
  ctx: AudioContext,
  out: GainNode,
  options: {
    duration: number;
    gain: number;
    type?: BiquadFilterType;
    frequency: number;
    q?: number;
    /** Sweep the filter to this frequency over the burst. */
    sweepTo?: number;
    /** Fraction of the duration spent rising, 0 for an instant attack. */
    attack?: number;
  }
) {
  const { duration, gain, type = "bandpass", frequency, q = 1, sweepTo, attack = 0 } = options;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, ctx.currentTime);
  filter.Q.value = q;
  if (sweepTo !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), ctx.currentTime + duration);
  }

  const envelope = ctx.createGain();
  const t = ctx.currentTime;
  const peak = t + Math.max(0.001, duration * attack);
  envelope.gain.setValueAtTime(0.0001, t);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), peak);
  // Exponential decay to near-silence, then a hard zero: ramping to
  // exactly 0 exponentially is undefined, and leaving it ringing costs a
  // live node per sound.
  envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  source.connect(filter).connect(envelope).connect(out);
  source.start(t);
  source.stop(t + duration + 0.02);
}

/** A short pitched blip — switch contacts, latches, small mechanisms. */
function tone(
  ctx: AudioContext,
  out: GainNode,
  options: { frequency: number; duration: number; gain: number; type?: OscillatorType; sweepTo?: number }
) {
  const { frequency, duration, gain, type = "square", sweepTo } = options;
  const osc = ctx.createOscillator();
  osc.type = type;
  const t = ctx.currentTime;
  osc.frequency.setValueAtTime(frequency, t);
  if (sweepTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + duration);

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, t);
  envelope.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  osc.connect(envelope).connect(out);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** What the player is standing on, which decides the footstep. */
export type StepSurface = "wood" | "tatami" | "water" | "stone";

/**
 * Distance attenuation, matching the voice chat's model (linear to zero,
 * no panning — see useRealtimeMedia). A sound with no distance is
 * something the local player did, and plays at full volume.
 */
const SFX_FALLOFF_DISTANCE = 18;

function gainForDistance(distance?: number): number {
  if (distance === undefined) return 1;
  return Math.max(0, 1 - distance / SFX_FALLOFF_DISTANCE);
}

/**
 * One footstep.
 *
 * The surfaces differ in the way the real ones do rather than by an
 * arbitrary pitch offset: boards are a hard mid-frequency knock with a
 * little ring, tatami is a soft low thud that woven straw absorbs almost
 * entirely, stone is brighter and sharper than wood, and water is a
 * splash — a wash of high noise sweeping downward as it collapses.
 */
export function playFootstep(surface: StepSurface, distance?: number) {
  const a = audio();
  if (!a) return;
  const level = gainForDistance(distance);
  if (level <= 0.01) return;
  // Steps are the most repeated sound in the world, so each one is
  // detuned slightly; identical repeats are what make footsteps grating.
  const vary = 0.88 + Math.random() * 0.24;

  switch (surface) {
    case "tatami":
      noiseBurst(a.ctx, a.out, { duration: 0.09, gain: 0.055 * level, type: "lowpass", frequency: 420 * vary, q: 0.7 });
      break;
    case "wood":
      noiseBurst(a.ctx, a.out, { duration: 0.07, gain: 0.07 * level, frequency: 900 * vary, q: 1.6, sweepTo: 320 });
      tone(a.ctx, a.out, { frequency: 150 * vary, duration: 0.05, gain: 0.03 * level, type: "sine" });
      break;
    case "stone":
      noiseBurst(a.ctx, a.out, { duration: 0.06, gain: 0.065 * level, frequency: 1700 * vary, q: 1.1, sweepTo: 700 });
      break;
    case "water":
      noiseBurst(a.ctx, a.out, { duration: 0.26, gain: 0.1 * level, frequency: 1500 * vary, q: 0.5, sweepTo: 260, attack: 0.04 });
      break;
  }
}

/** A single hand clap, used by the clap gesture. */
export function playClap(distance?: number) {
  const a = audio();
  if (!a) return;
  const level = gainForDistance(distance);
  if (level <= 0.01) return;
  // Two bursts a few milliseconds apart: a clap is the hands meeting and
  // the air escaping, and the pair is what stops it sounding like a hiss.
  noiseBurst(a.ctx, a.out, { duration: 0.035, gain: 0.16 * level, frequency: 1800, q: 0.9, sweepTo: 900 });
  window.setTimeout(() => {
    const b = audio();
    if (b) noiseBurst(b.ctx, b.out, { duration: 0.09, gain: 0.07 * level, frequency: 1100, q: 0.6, sweepTo: 420 });
  }, 12);
}

/** The rocker on a wall light switch. */
export function playSwitch(on: boolean, distance?: number) {
  const a = audio();
  if (!a) return;
  const level = gainForDistance(distance);
  if (level <= 0.01) return;
  // Up and down are not the same sound on a real switch; the pitch drop
  // is small but it is what makes it feel like a mechanism.
  tone(a.ctx, a.out, { frequency: on ? 2200 : 1750, duration: 0.028, gain: 0.08 * level, type: "square", sweepTo: on ? 900 : 700 });
  noiseBurst(a.ctx, a.out, { duration: 0.02, gain: 0.05 * level, frequency: 3200, q: 0.8 });
}

/**
 * A sliding door running in its track, or a hinged one swinging.
 *
 * `durationSeconds` should match the animation, since this is the one
 * sound here that is a sustained noise rather than an impact: it has to
 * stop when the leaf does or it keeps sliding after the door has settled.
 */
export function playDoorSlide(durationSeconds = 0.5, distance?: number) {
  const a = audio();
  if (!a) return;
  const level = gainForDistance(distance);
  if (level <= 0.01) return;
  // Wood running on wood: a low, rough rumble that fades as it slows,
  // with a soft knock at the end as the leaf reaches the jamb.
  noiseBurst(a.ctx, a.out, {
    duration: durationSeconds,
    gain: 0.045 * level,
    type: "bandpass",
    frequency: 620,
    q: 0.8,
    sweepTo: 240,
    attack: 0.18,
  });
  window.setTimeout(() => {
    const b = audio();
    if (b) noiseBurst(b.ctx, b.out, { duration: 0.05, gain: 0.05 * level, frequency: 420, q: 1.2, sweepTo: 180 });
  }, Math.max(0, durationSeconds * 1000 - 60));
}

/** A hinged door opening or closing (the garden door). */
export function playDoorSwing(distance?: number) {
  const a = audio();
  if (!a) return;
  const level = gainForDistance(distance);
  if (level <= 0.01) return;
  noiseBurst(a.ctx, a.out, { duration: 0.32, gain: 0.035 * level, type: "bandpass", frequency: 480, q: 1.4, sweepTo: 220, attack: 0.25 });
  window.setTimeout(() => {
    const b = audio();
    if (b) noiseBurst(b.ctx, b.out, { duration: 0.07, gain: 0.055 * level, frequency: 300, q: 1.5, sweepTo: 130 });
  }, 300);
}

/** A ripple on the pond — a click or something wading in. */
export function playWaterRipple(strength = 1, distance?: number) {
  const a = audio();
  if (!a) return;
  const level = gainForDistance(distance) * Math.min(1, Math.max(0.2, strength));
  if (level <= 0.01) return;
  noiseBurst(a.ctx, a.out, { duration: 0.22, gain: 0.07 * level, frequency: 1300, q: 0.6, sweepTo: 220, attack: 0.05 });
  // A low "bloop" under the splash, pitched down, which is what reads as
  // water having a volume rather than just a surface.
  tone(a.ctx, a.out, { frequency: 420, duration: 0.14, gain: 0.03 * level, type: "sine", sweepTo: 150 });
}
