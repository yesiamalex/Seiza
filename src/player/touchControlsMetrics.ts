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

/** Reaches its 54px ceiling once the viewport is roughly 675px tall or
 *  more (covers essentially all portrait phone use), and shrinks toward
 *  its 36px floor as height drops below that — reached at 450px and
 *  below, which keeps buttons touch-usable even on the shortest common
 *  landscape phone viewports rather than shrinking indefinitely. */
export const PAD_BUTTON_SIZE = "clamp(36px, 8vh, 54px)";
export const PAD_GAP_PX = 4;
export const PAD_ROWS = 3;

/** Mirrors JUMP_BUTTON's relationship to PAD_BUTTON_SIZE in the original
 *  fixed-size version (76px vs. 54px) so it keeps looking proportionate
 *  at every size instead of only at the ceiling. */
export const JUMP_BUTTON_SIZE = "clamp(52px, 11vh, 76px)";

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
export const TOUCH_CONTROLS_CLEARANCE_CSS =
  `calc(${TOUCH_WRAPPER_BOTTOM_OFFSET_PX}px + ` +
  `(${PAD_ROWS} * ${PAD_BUTTON_SIZE}) + ${(PAD_ROWS - 1) * PAD_GAP_PX}px + 16px)`;
