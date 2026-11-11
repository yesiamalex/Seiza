/**
 * The one AudioContext that plays everyone's voice, and its unlocking.
 *
 * Browsers keep audio suspended until the page gets a user gesture, and
 * only some events count: a click or a key does, a touch's pointerdown
 * doesn't (Chrome counts touchend instead), and iOS also wants a sound
 * started inside the gesture. So the Join button unlocks it (JoinScreen),
 * which is the gesture every visitor makes anyway, and any later tap,
 * click, or key does again if the browser suspends it (a phone call, an
 * app switch). Voices then play from the moment someone joins, without
 * turning on their own microphone first.
 */

let shared: AudioContext | null = null;
const listeners = new Set<() => void>();

function create(): AudioContext {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const context = new Ctor();
  context.addEventListener("statechange", () => {
    for (const listener of listeners) listener();
  });
  return context;
}

/** The voice AudioContext, made on first use. */
export function voiceAudioContext(): AudioContext {
  if (!shared || shared.state === "closed") shared = create();
  return shared;
}

/**
 * Starts audio, if it isn't running. Call it from inside a user gesture:
 * it resumes the context and plays one silent sample, which is what iOS
 * needs to let the context make sound.
 */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  try {
    const context = voiceAudioContext();
    if (context.state !== "running") void context.resume().catch(() => {});
    const source = context.createBufferSource();
    source.buffer = context.createBuffer(1, 1, context.sampleRate);
    source.connect(context.destination);
    source.start();
  } catch {
    // No Web Audio at all: nothing to unlock.
  }
}

/** Whether voices can be heard right now (false until a gesture unlocks it). */
export function audioRunning(): boolean {
  return shared?.state === "running";
}

/** Calls `listener` whenever the context starts, suspends, or closes. */
export function onAudioStateChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Closes the context, when the page leaves the room for good. */
export function closeVoiceAudioContext(): void {
  void shared?.close().catch(() => {});
  shared = null;
}
