import { sfxOutput } from "../audio/sfx";

/**
 * Recorded sounds (the violin's notes, a dog's barks): fetched early, as
 * soon as the mode they belong to is on (warmSamples), so the first time
 * one's wanted it's already here. Fetching needs no sound allowed yet;
 * turning the bytes into sound does (an AudioContext, after a first tap),
 * and takes a few milliseconds when it's needed. Each file is fetched once.
 */
const bytes = new Map<string, Promise<ArrayBuffer | null>>();
const decoded = new Map<string, { ctx: AudioContext; buffer: AudioBuffer }>();

function fetchBytes(url: string) {
  let p = bytes.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    bytes.set(url, p);
  }
  return p;
}

/** Starts fetching these now, and decodes them as soon as sound is allowed. */
export function warmSamples(urls: string[]) {
  for (const url of urls) void fetchBytes(url);
  const output = sfxOutput();
  if (output) void loadSamples(output.ctx, urls);
}

/** The decoded sounds, if they're all ready for this context; else null. */
export function readySamples(ctx: AudioContext, urls: string[]): AudioBuffer[] | null {
  const out: AudioBuffer[] = [];
  for (const url of urls) {
    const d = decoded.get(url);
    if (!d || d.ctx !== ctx) return null;
    out.push(d.buffer);
  }
  return out;
}

/** The decoded sounds, fetching and decoding whatever isn't yet; null if any can't be had. */
export async function loadSamples(ctx: AudioContext, urls: string[]): Promise<AudioBuffer[] | null> {
  const ready = readySamples(ctx, urls);
  if (ready) return ready;
  const buffers = await Promise.all(
    urls.map(async (url) => {
      const d = decoded.get(url);
      if (d?.ctx === ctx) return d.buffer;
      const raw = await fetchBytes(url);
      if (!raw) return null;
      try {
        // Decoding takes the bytes over, so a copy, kept for another context.
        const buffer = await ctx.decodeAudioData(raw.slice(0));
        decoded.set(url, { ctx, buffer });
        return buffer;
      } catch {
        return null;
      }
    })
  );
  return buffers.every((b) => b) ? (buffers as AudioBuffer[]) : null;
}
