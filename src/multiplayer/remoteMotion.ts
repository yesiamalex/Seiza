/**
 * Where to draw another player between their position updates.
 *
 * Positions arrive about five times a second (each client sends at most
 * every NETWORK_TICK_MS, and the room server batches them on the same
 * beat), so chasing the latest one moves an avatar in pulses: a lurch
 * toward the new spot, a slow-down, a pause, the next lurch. Instead this
 * keeps a velocity from the updates already arriving and carries the
 * avatar along it between them, a short way, so it walks at an even pace
 * about where its player is. Nothing extra is sent, so it costs the
 * network and the room server nothing; per avatar it's a few
 * multiplications a frame.
 *
 * Plain numbers, no three.js, so it's tested on its own
 * (remoteMotion.test.ts).
 */

/** Furthest ahead of the last update an avatar is carried, in seconds:
 *  a little more than the gap between updates, so a late one doesn't make
 *  the avatar stop and start. */
export const MAX_LEAD_S = 0.25;
/** With no update for this long, the player has stopped (a still client
 *  sends nothing): the velocity is dropped. */
export const STOPPED_AFTER_S = 0.45;
/** Updates closer together than this (two in one server batch) say
 *  nothing reliable about speed, so they move the target but don't change
 *  the velocity. */
const MIN_SAMPLE_GAP_S = 0.08;
/** Faster than any walk or run: a teleport, a warp, a respawn. */
const MAX_SPEED = 9;
/** How much of each new speed reading is taken: smooths the jitter of
 *  arrival times without lagging behind a change of direction. */
const VELOCITY_BLEND = 0.6;

export class RemoteMotion {
  private x = 0;
  private y = 0;
  private z = 0;
  private vx = 0;
  private vz = 0;
  private at = -Infinity;
  private started = false;

  /** A position update arrived at `nowS` (seconds). The same position
   *  again means the player has stopped (presence.ts sends it once). */
  observe(x: number, y: number, z: number, nowS: number): void {
    if (this.started && x === this.x && y === this.y && z === this.z) {
      this.vx = 0;
      this.vz = 0;
      this.at = nowS;
      return;
    }
    if (this.started) {
      const gap = nowS - this.at;
      if (gap >= MIN_SAMPLE_GAP_S && gap < 1) {
        const sx = (x - this.x) / gap;
        const sz = (z - this.z) / gap;
        if (Math.hypot(sx, sz) > MAX_SPEED) {
          this.vx = 0;
          this.vz = 0;
        } else {
          this.vx += (sx - this.vx) * VELOCITY_BLEND;
          this.vz += (sz - this.vz) * VELOCITY_BLEND;
        }
      } else if (gap >= 1) {
        // After a long pause the old speed means nothing.
        this.vx = 0;
        this.vz = 0;
      }
    }
    this.x = x;
    this.y = y;
    this.z = z;
    this.at = nowS;
    this.started = true;
  }

  /** Where the player most likely is at `nowS`, written into `out`. Height
   *  isn't predicted: jumps and steps come from the updates themselves. */
  predict(nowS: number, out: [number, number, number]): [number, number, number] {
    const age = nowS - this.at;
    const lead = age > STOPPED_AFTER_S ? 0 : Math.min(Math.max(age, 0), MAX_LEAD_S);
    out[0] = this.x + this.vx * lead;
    out[1] = this.y;
    out[2] = this.z + this.vz * lead;
    return out;
  }

  /** Forgets the velocity: the next update is a fresh start (a snap). */
  reset(): void {
    this.vx = 0;
    this.vz = 0;
  }
}
