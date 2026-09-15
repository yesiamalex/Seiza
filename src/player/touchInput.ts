/**
 * Shared mutable input state between the DOM touch overlay
 * (TouchControls.tsx) and the frame loop that consumes it
 * (PlayerRig.tsx).
 *
 * A plain ref rather than React state on purpose: this is read every
 * frame inside useFrame, and routing per-frame D-pad input through
 * setState would re-render the whole app tree ~60 times a second while
 * someone holds a direction.
 *
 * Whether the overlay is shown at all is decided by useWantsTouchControls
 * (src/ui/useMediaQuery.ts), which re-evaluates live.
 */
export interface TouchMoveInput {
  /** -1 = strafe left, +1 = strafe right. */
  x: number;
  /** -1 = backward, +1 = forward. */
  y: number;
  /** Minecraft-style: double-tap forward to sprint until forward is released. */
  running: boolean;
  /** Set by the jump button; PlayerRig consumes and clears it. */
  jumpRequested: boolean;
}

export function createTouchMoveInput(): TouchMoveInput {
  return { x: 0, y: 0, running: false, jumpRequested: false };
}
