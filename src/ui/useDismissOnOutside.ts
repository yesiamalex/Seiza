import { useEffect, type RefObject } from "react";

/**
 * Closes a popover when a pointer goes down anywhere outside it, without
 * putting anything in front of the page to detect that.
 *
 * The obvious implementation — a full-screen transparent `<div>` behind
 * the panel whose onClick closes it — is what this replaces, and it had a
 * bug that looked like a broken feature. That div sits above every other
 * HUD control, so the first click on anything else hits the div instead
 * of the control: the menu closes and the click is swallowed. Signing in
 * through the admin panel and then clicking the world-name pill did
 * nothing at all, because the admin panel's own backdrop ate it, and
 * "open the roster and press Gather everyone here" was unreachable in one
 * pass. Everything needed two clicks, which reads as "the button doesn't
 * work".
 *
 * A document-level listener sees the same pointer events without being in
 * their way, so one click both dismisses this panel and activates
 * whatever was actually clicked.
 *
 * `pointerdown` rather than `click`, so dismissal happens before the
 * target's own click handler runs and the two can't race. Capture phase,
 * so a handler that calls stopPropagation on its own subtree cannot
 * accidentally leave this panel stuck open.
 *
 * @param ref     The panel. A pointer inside it is not an outside click.
 * @param active  Only listens while the panel is open.
 * @param onClose Called once per outside press.
 */
export function useDismissOnOutside(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void
) {
  useEffect(() => {
    if (!active) return;

    const onPointerDown = (event: PointerEvent) => {
      const panel = ref.current;
      // `composedPath` rather than `contains(event.target)`: it still
      // reports the real path when the press began inside a portal or a
      // shadow root, and the designer dialog is portaled to <body>.
      if (panel && event.composedPath().includes(panel)) return;
      onClose();
    };

    // Deferred by a frame: the very press that opened this panel is still
    // being dispatched when the effect runs, and without this the panel
    // would see its own opening click as an outside press and shut again
    // immediately.
    const id = requestAnimationFrame(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    });

    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [ref, active, onClose]);
}
