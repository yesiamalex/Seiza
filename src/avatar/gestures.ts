export interface GestureDefinition {
  name: string;
  label: string;
  vrmaUrl: string;
  available: boolean;
  license: "verify-before-use" | "own-authored" | "cc-by" | "other";
  sourceNote: string;
}

/**
 * Gesture registry. Deliberately shipped without real .vrma files — see
 * THIRD_PARTY_ASSETS.md and public/worlds/default/README.md. The `license`
 * field exists so a future CI check can fail a PR that adds a gesture
 * without documenting where the clip came from.
 */
export const GESTURES: Record<string, GestureDefinition> = {
  bow: {
    name: "bow",
    label: "Bow (ojigi)",
    vrmaUrl: "/gestures/bow.vrma",
    available: false,
    license: "verify-before-use",
    sourceNote:
      "Not in pixiv's official free VRMA pack. Options: BOOTH (check per-file license), " +
      "MMD motion retargeted via XR Animator, or author your own via VRM Posing Desktop.",
  },
  seiza: {
    name: "seiza",
    label: "Seiza (formal kneeling)",
    vrmaUrl: "/gestures/seiza.vrma",
    available: false,
    license: "verify-before-use",
    sourceNote: "Same sourcing situation as bow — see paper Section 5.",
  },
  wave: {
    name: "wave",
    label: "Wave",
    vrmaUrl: "/gestures/wave.vrma",
    available: false,
    license: "verify-before-use",
    sourceNote: "Check pixiv's official free VRMA sample pack first — greeting-type gestures are more likely covered there.",
  },
};
