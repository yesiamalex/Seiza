/**
 * Whether a transform gizmo is currently being dragged.
 *
 * PlayerRig needs to know this to decide what a left-drag means while
 * Edit Mode is on. Edit Mode used to reserve the left button entirely —
 * looking around needed a right- or middle-drag, and on a touch screen
 * there was no way to look at all, so you could end up editing a room
 * you could not turn to see.
 *
 * A module-level flag rather than React state on purpose: it is read
 * inside a pointer handler and a frame loop, changes on every grab, and
 * nothing should re-render because a gizmo was touched.
 */
let dragging = false;

export function setGizmoDragging(next: boolean) {
  dragging = next;
}

export function isGizmoDragging() {
  return dragging;
}
