/**
 * When this client tells the room where it is, and when it steps out.
 *
 * Kept free of React and the DOM so the rules can be tested on their own
 * (see presence.test.ts); App.tsx applies them.
 */

/** How often the position loop runs, and so the fastest updates go out. */
export const NETWORK_TICK_MS = 200;
/** Position goes out only when it changed, plus a heartbeat this often,
 *  so a seated class costs the room a fraction of a moving one. */
export const HEARTBEAT_MS = 5_000;
/** The heartbeat in a hidden tab, where nothing can move anyway. */
export const HIDDEN_HEARTBEAT_MS = 30_000;
/** Below these, a change isn't worth a message: metres and radians. */
export const MOVE_EPSILON = 0.004;
export const TURN_EPSILON = 0.004;
/** A tab hidden and untouched this long, with nothing being sent, steps
 *  out of the room until it is used again. */
export const AWAY_AFTER_MS = 60 * 60_000;

export interface SentState {
  position: [number, number, number];
  rotationY: number;
  headPitch: number;
  /** When it was sent, in ms. */
  at: number;
  /** Whether it was sent because the player had moved. */
  moved?: boolean;
}

/** Whether `position` is a move away from what was last sent. */
export function hasMoved(last: SentState | null, position: [number, number, number]): boolean {
  if (!last) return false;
  return Math.hypot(position[0] - last.position[0], position[1] - last.position[1], position[2] - last.position[2]) > MOVE_EPSILON;
}

/**
 * Whether this tick's position should go out: always the first time, then
 * whenever it moved or turned noticeably, and otherwise only as a
 * heartbeat. Plus once more on the first still tick after moving: the same
 * position again tells everyone else the player has stopped, so their
 * view stops carrying the avatar on (remoteMotion.ts). One small message
 * per stop.
 */
export function shouldSendState(last: SentState | null, current: Omit<SentState, "at">, now: number, hidden: boolean): boolean {
  if (!last) return true;
  const [x, y, z] = current.position;
  const moved = Math.hypot(x - last.position[0], y - last.position[1], z - last.position[2]) > MOVE_EPSILON;
  const turned = Math.abs(current.rotationY - last.rotationY) > TURN_EPSILON || Math.abs(current.headPitch - last.headPitch) > TURN_EPSILON;
  const heartbeat = hidden ? HIDDEN_HEARTBEAT_MS : HEARTBEAT_MS;
  const stopped = last.moved === true && !moved;
  return moved || turned || stopped || now - last.at > heartbeat;
}

/**
 * Whether an idle tab should step out of the room: hidden and untouched
 * for AWAY_AFTER_MS, and not sending anything (an unmuted mic, a camera,
 * or a screen keeps it in; only listening does not).
 */
export function shouldStepAway(state: { hiddenSince: number | null; lastInputAt: number; sendingMedia: boolean; now: number }): boolean {
  if (state.hiddenSince === null || state.sendingMedia) return false;
  return state.now - state.hiddenSince > AWAY_AFTER_MS && state.now - state.lastInputAt > AWAY_AFTER_MS;
}
