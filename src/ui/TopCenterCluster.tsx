import type { ReactNode } from "react";

/**
 * The top bar's centre: the admin and help buttons, with the minimised
 * seiza timer beside them. Everything that drops from the top (the admin
 * panel, the controls guide, the seiza timer) drops from this same centre
 * line, so a control and the panel it opens never sit on opposite sides
 * of the screen.
 *
 * Wide screens: pinned to the exact top centre (the HUD's top row is its
 * positioning context), not wherever space-between would put a middle
 * item. `side` hangs off its right edge without counting toward the
 * centring, so the badge appearing doesn't nudge the buttons beside it.
 * Being positioned, the cluster is also what the admin panel centres on.
 *
 * Phones: the centre is where the room pill runs, so the cluster joins the
 * Avatar button on the right, with `side` first so that it, rather than
 * the buttons, is what moves over. The transform goes too, since it would
 * trap the panels that dock to the viewport there (see HUD.tsx).
 */
export function TopCenterCluster({ children, side }: { children: ReactNode; side?: ReactNode }) {
  return (
    <div className="seiza-top-center">
      <style>{CSS}</style>
      {children}
      {side && <div className="seiza-top-center-side">{side}</div>}
    </div>
  );
}

const CSS = `
  .seiza-top-center { position: absolute; top: 0; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; }
  .seiza-top-center-side { position: absolute; top: 0; left: calc(100% + 8px); display: flex; }
  @media (max-width: 640px) {
    .seiza-top-center { position: relative; left: auto; transform: none; margin-left: auto; flex-shrink: 0; }
    .seiza-top-center-side { position: static; order: -1; }
  }
`;
