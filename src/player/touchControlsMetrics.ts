/**
 * Single source of truth for the on-screen D-pad's footprint, shared
 * between TouchControls.tsx (which draws it) and HUD.tsx (which has to
 * reserve room above it so the control bar doesn't sit on top of it).
 *
 * Both were previously computed as two separate constants — a fixed
 * `PAD_BUTTON = 54` in TouchControls and a fixed
 * `TOUCH_CONTROLS_CLEARANCE_PX = 186` in HUD, sized to match it — which
 * looked fine on a tall portrait phone but broke down on a short
 * landscape one: 186px of *fixed* clearance is a small fraction of an
 * 844px-tall screen and nearly HALF of a 400px-tall one, which is what
 * pushed the whole control bar up into the vertical middle of the screen
 * instead of near the bottom (visually, this read as "the HUD floats in
 * the middle").
 *
 * The fix is to size the pad's buttons off viewport *height* with
 * `clamp()` instead of a flat pixel value, so both the pad and the
 * matching clearance shrink together on a short/landscape screen and
 * stay at their original comfortable size everywhere else — no resize
 * listener needed, since clamp() is just CSS and recalculates on its own
 * whenever the viewport does (including on a device rotation).
 */

/** Reaches its 56px ceiling once the viewport is roughly 620px tall or
 *  more (covers essentially all portrait phone use), and shrinks toward
 *  its 40px floor as height drops below that — reached at about 445px and
 *  below, which keeps buttons touch-usable even on the shortest common
 *  landscape phone viewports rather than shrinking indefinitely. */
export const PAD_BUTTON_SIZE = "clamp(40px, 9vh, 56px)";
export const PAD_GAP_PX = 5;

/** The pad's middle column and row: wider than a direction cell, so the
 *  crouch button in the centre has room around it instead of being
 *  squeezed between four arrows. */
export const PAD_CENTER_SIZE = "clamp(48px, 10vh, 64px)";

/** The crouch button in the pad's centre. Smaller than the seiza button
 *  at every height (and so than Jump): it is the pad's least-used cell. */
export const CROUCH_BUTTON_SIZE = "clamp(36px, 7.5vh, 48px)";

/** The pad's full width and height: two direction cells, the centre,
 *  and the gaps between them. */
export const PAD_EXTENT_CSS = `calc(2 * ${PAD_BUTTON_SIZE} + ${PAD_CENTER_SIZE} + ${2 * PAD_GAP_PX}px)`;

/** Mirrors JUMP_BUTTON's relationship to PAD_BUTTON_SIZE in the original
 *  fixed-size version (76px vs. 54px) so it keeps looking proportionate
 *  at every size instead of only at the ceiling. */
export const JUMP_BUTTON_SIZE = "clamp(52px, 11vh, 76px)";

/**
 * The seiza button that sits above Jump, and the gap between them.
 *
 * Deliberately smaller than Jump and separated by more than the pad's
 * own 4px gutter: Jump is pressed repeatedly and often in a hurry, and
 * seiza is a state you enter on purpose, so an accidental hit on either
 * is worse than the space it costs. The gap is roughly a third of the
 * seiza button, which clears a fingertip.
 */
export const SEIZA_BUTTON_SIZE = "clamp(42px, 8.5vh, 58px)";
export const SEIZA_JUMP_GAP_PX = 18;

/** TouchControls' own distance from the true bottom edge (see its
 *  wrapperStyle) — kept here too so the clearance formula below doesn't
 *  have two copies of this number to keep in sync. */
export const TOUCH_WRAPPER_BOTTOM_OFFSET_PX = 12;

/**
 * Total vertical footprint of the D-pad above the safe-area-adjusted
 * bottom edge, as a CSS calc() expression: HUD.tsx adds this on top of
 * its own base padding when the touch controls are visible, so the
 * control bar docks just above the pad instead of overlapping it —
 * however tall or short the pad currently is.
 */
/** Height of the jump column: the seiza button, the gap, and Jump. Used
 *  by anything that stacks above it (see FpsCounter). */
export const JUMP_COLUMN_HEIGHT_CSS =
  `calc(${SEIZA_BUTTON_SIZE} + ${SEIZA_JUMP_GAP_PX}px + ${JUMP_BUTTON_SIZE})`;

export const TOUCH_CONTROLS_CLEARANCE_CSS = `calc(${TOUCH_WRAPPER_BOTTOM_OFFSET_PX}px + ${PAD_EXTENT_CSS} + 16px)`;

/**
 * Horizontal footprint of the D-pad from the left edge (and, because the
 * control bar is centred, the room it needs on *both* sides) when the bar
 * sits on the bottom row beside the pad instead of stacked above it —
 * TouchControls' 16px side padding, the three-column pad, and a gap.
 * The jump button on the right is narrower than the pad, so the pad's
 * side is the one that decides it.
 */
export const TOUCH_CONTROLS_SIDE_CLEARANCE_CSS = `calc(16px + ${PAD_EXTENT_CSS} + 12px)`;
