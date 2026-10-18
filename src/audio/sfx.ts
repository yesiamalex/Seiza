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

/** Global ceiling. These sit under voice chat, but the first pass set
 *  this so low the world was effectively silent. */
const MASTER_VOLUME = 0.95;

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

/**
 * Starts the audio context on the first real user interaction.
 *
 * Browsers refuse to run an AudioContext until the page has been
 * interacted with, and `resume()` is asynchronous. A sound scheduled at
 * `currentTime` while the context is still suspended is scheduled into a
 * clock that is not advancing, so it is silently dropped — which is why
 * world sounds appeared to work only on the clicks that happened to
 * unlock the context, and not on keyboard gestures or anything the app
 * triggered by itself.
 *
 * Calling this once from app start registers one-shot listeners so the
 * context is already running long before anything wants to play.
 */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  const start = () => {
    const a = audio();
    if (a && a.ctx.state === "running") detach();
  };
  const detach = () => {
    for (const type of ["pointerdown", "keydown", "touchstart"] as const) {
      window.removeEventListener(type, start, true);
    }
  };
  for (const type of ["pointerdown", "keydown", "touchstart"] as const) {
    window.addEventListener(type, start, true);
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
export type StepSurface = "wood" | "tatami" | "water" | "stone" | "grass";

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
 *
 * `scale` quietens the step without changing its character, for a crouched
 * walk: moving carefully is quieter, not differently shaped.
 */
export function playFootstep(surface: StepSurface, distance?: number, scale = 1) {
  const a = audio();
  if (!a) return;
  const level = gainForDistance(distance) * scale;
  if (level <= 0.01) return;
  // Steps are the most repeated sound in the world, so each one is
  // detuned slightly; identical repeats are what make footsteps grating.
  const vary = 0.88 + Math.random() * 0.24;

  switch (surface) {
    case "tatami":
      // Tatami is a soft, low thud by nature, so it needs the most help of
      // the four to be audible at all; a second, lower layer gives it some
      // body rather than just turning the hiss up.
      noiseBurst(a.ctx, a.out, { duration: 0.11, gain: 0.30 * level, type: "lowpass", frequency: 460 * vary, q: 0.8 });
      tone(a.ctx, a.out, { frequency: 96 * vary, duration: 0.09, gain: 0.16 * level, type: "sine", sweepTo: 62 });
      break;
    case "wood":
      noiseBurst(a.ctx, a.out, { duration: 0.08, gain: 0.26 * level, frequency: 900 * vary, q: 1.6, sweepTo: 320 });
      tone(a.ctx, a.out, { frequency: 150 * vary, duration: 0.06, gain: 0.14 * level, type: "sine", sweepTo: 92 });
      break;
    case "stone":
      noiseBurst(a.ctx, a.out, { duration: 0.07, gain: 0.24 * level, frequency: 1700 * vary, q: 1.1, sweepTo: 700 });
      break;
    case "grass":
      // A brush, not a hit. The first version was high noise over a short
      // low noise thump, and that pair is a snare drum (the same trap the
      // water step notes below). Grass has no crack: the foot pushes
      // through the blades, so the noise swells in over a third of its
      // length and stays mid-band, sweeping down as the blades fold.
      noiseBurst(a.ctx, a.out, {
        duration: 0.2,
        gain: 0.17 * level,
        type: "bandpass",
        frequency: 1300 * vary,
        q: 0.55,
        sweepTo: 520,
        attack: 0.35,
      });
      // The soft earth underneath, as a low pitched bump rather than
      // noise, so it gives weight without rattle.
      tone(a.ctx, a.out, { frequency: 82 * vary, duration: 0.08, gain: 0.09 * level, type: "sine", sweepTo: 58 });
      break;
    case "water":
      // No bright transient at all. The previous two attempts both led
      // with a short, high, instant-attack noise burst — first a
      // bandpass, then a highpass — and that *is* a snare: broadband
      // energy, fast attack, fast decay. Quietening it only produced a
      // quieter snare. Water has no crack in it; what it has is a soft
      // low wash and a pitched cavity, so those are the only two things
      // here.
      //
      // The wash: hard low-passed and eased in over a third of its
      // length, so there is no onset click anywhere.
      noiseBurst(a.ctx, a.out, {
        duration: 0.36,
        gain: 0.3 * level,
        type: "lowpass",
        frequency: 520 * vary,
        q: 0.5,
        sweepTo: 130,
        attack: 0.32,
      });
      // The cavity closing over, rising in pitch. This carries most of
      // the "that was water" impression, so it is louder than before.
      tone(a.ctx, a.out, { frequency: 150 * vary, duration: 0.2, gain: 0.19 * level, type: "sine", sweepTo: 430 * vary });
      // Two small droplets just after, as pitched blips rather than
      // noise. Noise up here is exactly what was making it snare.
      for (const [delay, freq] of [[70, 760], [130, 1040]] as const) {
        window.setTimeout(() => {
          const b = audio();
          if (b) tone(b.ctx, b.out, { frequency: freq * vary, duration: 0.05, gain: 0.05 * level, type: "sine", sweepTo: freq * 1.7 * vary });
        }, delay);
      }
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
  noiseBurst(a.ctx, a.out, { duration: 0.035, gain: 0.34 * level, frequency: 1800, q: 0.9, sweepTo: 900 });
  window.setTimeout(() => {
    const b = audio();
    if (b) noiseBurst(b.ctx, b.out, { duration: 0.09, gain: 0.18 * level, frequency: 1100, q: 0.6, sweepTo: 420 });
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
  tone(a.ctx, a.out, { frequency: on ? 2200 : 1750, duration: 0.028, gain: 0.20 * level, type: "square", sweepTo: on ? 900 : 700 });
  noiseBurst(a.ctx, a.out, { duration: 0.02, gain: 0.14 * level, frequency: 3200, q: 0.8 });
}

/**
 * A sliding door running in its track, or a hinged one swinging.
 *
 * `durationSeconds` should match the animation, since this is the one
 * sound here that is a sustained noise rather than an impact: it has to
 * stop when the leaf does or it keeps sliding after the door has settled.
 */
export function playDoorSlide(durationSeconds = 0.75, distance?: number) {
  const a = audio();
  if (!a) return;
  const level = gainForDistance(distance);
  if (level <= 0.01) return;
  // Wood running on wood: a low, rough rumble that fades as it slows,
  // with a soft knock at the end as the leaf reaches the jamb.
  noiseBurst(a.ctx, a.out, {
    duration: durationSeconds,
    gain: 0.20 * level,
    type: "bandpass",
    frequency: 620,
    q: 0.8,
    sweepTo: 240,
    attack: 0.18,
  });
  window.setTimeout(() => {
    const b = audio();
    if (b) noiseBurst(b.ctx, b.out, { duration: 0.06, gain: 0.20 * level, frequency: 420, q: 1.2, sweepTo: 180 });
  }, Math.max(0, durationSeconds * 1000 - 60));
}

/** A hinged door opening or closing (the garden door). */
export function playDoorSwing(distance?: number) {
  const a = audio();
  if (!a) return;
  const level = gainForDistance(distance);
  if (level <= 0.01) return;
  // Q widened as well as the gain raised: at 1.4 the band was narrow
  // enough that the swing read as quieter than the shoji slide even at a
  // similar nominal gain, because far less of the noise got through.
  noiseBurst(a.ctx, a.out, { duration: 0.62, gain: 0.26 * level, type: "bandpass", frequency: 480, q: 0.9, sweepTo: 220, attack: 0.3 });
  // The latch, as the leaf reaches the end of its swing.
  window.setTimeout(() => {
    const b = audio();
    if (b) noiseBurst(b.ctx, b.out, { duration: 0.08, gain: 0.26 * level, frequency: 300, q: 1.1, sweepTo: 130 });
  }, 580);
}

/** A ripple on the pond — a click or something wading in. */
export function playWaterRipple(strength = 1, distance?: number) {
  const a = audio();
  if (!a) return;
  const level = gainForDistance(distance) * Math.min(1, Math.max(0.15, strength));
  if (level <= 0.01) return;
  // Water is mostly a low, rounded "bloop" with a short wet edge on it.
  // An earlier version led with a long bright noise burst, which is the
  // recipe for a hiss or a sizzle rather than a ripple — it was both too
  // loud and the wrong shape. The noise is now brief, dark, and sits
  // under the pitched part rather than over it.
  // Rising, like the footstep splash: an air cavity closing over goes
  // up in pitch. This swept downward before, which is a drip landing on
  // a hard surface rather than water opening and closing.
  tone(a.ctx, a.out, { frequency: 160, duration: 0.18, gain: 0.11 * level, type: "sine", sweepTo: 400 });
  noiseBurst(a.ctx, a.out, { duration: 0.13, gain: 0.05 * level, type: "lowpass", frequency: 480, q: 0.5, sweepTo: 160, attack: 0.3 });
}

/**
 * One second of a wall clock.
 *
 * Alternating pitch between tick and tock, because a real escapement
 * does: the two halves of the beat are not the same sound, and making
 * them identical is what turns a clock into a metronome. Very quiet, and
 * attenuated hard by distance — a clock you can hear across the room is
 * an irritation, not atmosphere.
 */
export function playClockTick(tock: boolean, distance?: number) {
  const a = audio();
  if (!a) return;
  // Falls off far faster than anything else here: audible standing at
  // the wall, gone a few metres away.
  const level = Math.max(0, 1 - (distance ?? 0) / 6);
  if (level <= 0.02) return;
  noiseBurst(a.ctx, a.out, { duration: 0.016, gain: 0.05 * level, frequency: tock ? 2400 : 3100, q: 2.2 });
  tone(a.ctx, a.out, { frequency: tock ? 900 : 1150, duration: 0.012, gain: 0.025 * level, type: "triangle" });
}

/**
 * A continuous, looping trickle for standing near the pond.
 *
 * Built once and kept running with its gain driven by distance, rather
 * than retriggered: water is the one sound here that is genuinely
 * continuous, and firing repeated one-shots at it produces a stutter
 * that reads as a fault. Two slow-swept filters over a noise loop give
 * enough movement that the loop point is not audible.
 */
let ambientWater: { gain: GainNode; source: AudioBufferSourceNode } | null = null;

export function setPondAmbience(distance: number) {
  const a = audio();
  if (!a) return;
  // Quiet, and only within a few metres. A pond heard from the
  // classroom would be wrong.
  const target = Math.max(0, 1 - distance / 7) * 0.085;

  if (!ambientWater) {
    if (target <= 0.001) return; // don't build it until someone is close
    const seconds = 3;
    const frames = a.ctx.sampleRate * seconds;
    const buffer = a.ctx.createBuffer(1, frames, a.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Brown-ish noise: integrating white noise tilts it toward the low
    // end, which is much closer to moving water than raw hiss.
    let last = 0;
    for (let i = 0; i < frames; i++) {
      last = (last + Math.random() * 2 - 1) * 0.5;
      data[i] = last;
    }
    const source = a.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const band = a.ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 620;
    band.Q.value = 0.7;

    // A slow wander on the filter so the three-second loop doesn't
    // announce itself.
    const lfo = a.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoDepth = a.ctx.createGain();
    lfoDepth.gain.value = 180;
    lfo.connect(lfoDepth).connect(band.frequency);
    lfo.start();

    const gain = a.ctx.createGain();
    gain.gain.value = 0;
    source.connect(band).connect(gain).connect(a.out);
    source.start();
    ambientWater = { gain, source };
  }

  // Ramped, not assigned: stepping a gain per frame clicks.
  ambientWater.gain.gain.setTargetAtTime(target, a.ctx.currentTime, 0.25);
}

/**
 * The campfire, heard from nearby: a low, soft roar under it and a few
 * crackles a second, in little clusters, the way wood spits. Call every
 * frame with how far the listener is and how lit the fire is (0 to 1).
 *
 * The roar is a noise loop like the pond's; the crackles are pops far
 * shorter than a footstep (a few milliseconds each), which is what keeps
 * them reading as sparks rather than a drum.
 */
const FIRE_HEARD_DISTANCE = 14;
let fireBed: { gain: GainNode } | null = null;

export function setFireAmbience(distance: number, level: number, delta: number) {
  const a = audio();
  if (!a) return;
  const near = Math.max(0, 1 - distance / FIRE_HEARD_DISTANCE) * level;
  const target = near * near * 0.06;

  if (!fireBed) {
    if (target <= 0.001) return;
    const frames = a.ctx.sampleRate * 3;
    const buffer = a.ctx.createBuffer(1, frames, a.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < frames; i++) {
      last = (last + Math.random() * 2 - 1) * 0.5;
      data[i] = last;
    }
    const source = a.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const low = a.ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 380;
    const gain = a.ctx.createGain();
    gain.gain.value = 0;
    source.connect(low).connect(gain).connect(a.out);
    source.start();
    fireBed = { gain };
  }
  fireBed.gain.gain.setTargetAtTime(target, a.ctx.currentTime, 0.3);

  // About four clusters a second at full strength.
  if (near > 0.02 && Math.random() < delta * 4) {
    const pops = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pops; i++) {
      window.setTimeout(() => {
        const b = audio();
        if (!b) return;
        noiseBurst(b.ctx, b.out, {
          duration: 0.004 + Math.random() * 0.01,
          gain: (0.05 + Math.random() * 0.1) * near,
          frequency: 1600 + Math.random() * 2800,
          q: 1.3,
        });
      }, i * (15 + Math.random() * 45));
    }
  }
}

/** The campfire lit (a soft whoomph as it catches) or put out (a hiss). */
export function playFireToggle(on: boolean, distance?: number) {
  const a = audio();
  if (!a) return;
  const level = gainForDistance(distance);
  if (level <= 0.01) return;
  if (on) {
    noiseBurst(a.ctx, a.out, { duration: 0.7, gain: 0.26 * level, type: "lowpass", frequency: 220, q: 0.6, sweepTo: 900, attack: 0.45 });
    tone(a.ctx, a.out, { frequency: 70, duration: 0.5, gain: 0.08 * level, type: "sine", sweepTo: 110 });
  } else {
    // Eased in and kept mid-band, so it's a hiss, not a hit.
    noiseBurst(a.ctx, a.out, { duration: 0.9, gain: 0.12 * level, frequency: 2400, q: 0.45, sweepTo: 800, attack: 0.18 });
  }
}
