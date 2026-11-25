/**
 * A world's own thing done, for the room's research counts (worker/stats.ts):
 * an artwork opened, a card read. Only counted, by how many people and how
 * often; nothing about who. Sent only where the room keeps counts.
 */
let send: ((key: string) => void) | null = null;
const lastSent = new Map<string, number>();

/** App connects this to the room socket while joined (null when not). */
export function connectTrack(next: ((key: string) => void) | null) {
  send = next;
}

/** `track("piece.court-3")`: letters, digits, and . _ - only, as the room
 *  checks; anything else becomes a dash. Repeats within 3 s count once. */
export function track(key: string) {
  if (!send) return;
  const clean = key.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+/, "").slice(0, 48);
  if (!clean) return;
  const now = Date.now();
  if (now - (lastSent.get(clean) ?? 0) < 3000) return;
  lastSent.set(clean, now);
  send(clean);
}
