/**
 * Small moves of this visitor's own position from outside PlayerRig: a
 * room mode's lunge, a step back off a blocked blow, a knockback. Each is a
 * flat distance spread over a moment, and PlayerRig spends it before its
 * collision pass (constrainWalker), so a push slides along a wall rather
 * than through it, and other people see it the way they see walking.
 *
 * Never in a headset (moving someone who is standing still is how you
 * make them ill), and a push PlayerRig doesn't get to in time (sitting,
 * say) lapses rather than arriving later.
 */
interface Push {
  /** Metres a second, world x and z. */
  vx: number;
  vz: number;
  from: number;
  until: number;
}

const pushes: Push[] = [];
const now = () => performance.now() / 1000;

/** Moves this visitor `dx`, `dz` metres over `seconds`, starting `after`
 *  seconds from now. */
export function pushSelf(dx: number, dz: number, seconds = 0.2, after = 0) {
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || seconds <= 0) return;
  const from = now() + Math.max(0, after);
  pushes.push({ vx: dx / seconds, vz: dz / seconds, from, until: from + seconds });
  if (pushes.length > 8) pushes.shift();
}

/** How far this frame's share of every push moves this visitor; called
 *  once a frame by PlayerRig, which applies it. */
export function takeSelfPush(delta: number, out: { x: number; z: number }) {
  out.x = 0;
  out.z = 0;
  const end = now();
  const start = end - delta;
  for (let i = pushes.length - 1; i >= 0; i--) {
    const p = pushes[i];
    const span = Math.min(end, p.until) - Math.max(start, p.from);
    if (span > 0) {
      out.x += p.vx * span;
      out.z += p.vz * span;
    }
    if (p.until <= end) pushes.splice(i, 1);
  }
  return out;
}

/** Forgets any push still to come (a mode switched off, a teleport). */
export function cancelSelfPush() {
  pushes.length = 0;
}
