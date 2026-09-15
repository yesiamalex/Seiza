import { useSyncExternalStore } from "react";

/** Live CSS media query match — re-renders when the result changes (e.g.
 *  rotating a tablet, docking a keyboard, toggling device emulation). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false
  );
}

/**
 * Whether to show on-screen movement controls (D-pad, jump).
 *
 * `pointer: coarse` alone misses some Android browsers in desktop-site
 * mode and hybrid tablets, so a device whose *every* pointer is coarse
 * and that can't hover also qualifies. A touchscreen laptop with a
 * trackpad reports a fine primary pointer and correctly gets no D-pad.
 */
export function useWantsTouchControls(): boolean {
  const coarsePrimary = useMediaQuery("(pointer: coarse)");
  const touchOnly = useMediaQuery("(any-pointer: coarse) and (any-hover: none)");
  return coarsePrimary || touchOnly;
}
