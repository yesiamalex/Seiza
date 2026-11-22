import * as THREE from "three";
import { VRMExpression, VRMExpressionManager, type VRMExpressionBind } from "@pixiv/three-vrm";

/**
 * Facial expressions for designer-built avatars.
 *
 * An uploaded VRM expresses itself through morph targets: the artist
 * sculpted a "happy" version of the face mesh and three-vrm blends toward
 * it. A designer avatar has no sculpted anything — its eyes, brows and
 * mouth are painted patches on the head (designerFace.ts), each in its own
 * group, so there is nothing to morph between.
 *
 * Rather than give up on expressions for exactly the avatars most people
 * will use, this expresses the same presets by *moving the parts*: brows
 * tilt and rise, eyelids close, the mouth stretches and curves. three-vrm
 * does not care how an expression is implemented — `VRMExpressionBind` is
 * just "apply this much of yourself" plus "undo it" — so these are real
 * VRMExpressions under a real VRMExpressionManager, and everything that
 * drives expressions on an uploaded model drives these identically.
 *
 * Ranges are kept small on purpose. These faces are a few spheres; the
 * difference between a readable expression and a grotesque one is about
 * two millimetres of scale.
 */

/** The movable pieces of a designer face, as built by buildDesignerVrm. */
export interface DesignerFaceParts {
  leftEye: THREE.Object3D;
  rightEye: THREE.Object3D;
  leftBrow: THREE.Object3D;
  rightBrow: THREE.Object3D;
  mouth: THREE.Object3D;
  /** The painted closed eye, and the open eyes' materials, which the blink
   *  crossfades between (see LidBind). */
  lids?: { closed: THREE.Material; smile: THREE.Material; open: THREE.Material[] };
}

interface Delta {
  /** Added to the rest position, scaled by weight. In head-local units. */
  position?: [number, number, number];
  /** Multiplied toward, by weight: 1 means "unchanged". */
  scale?: [number, number, number];
  /** Added to the rest rotation, in radians, scaled by weight. */
  rotation?: [number, number, number];
}

/**
 * Moves one object by a fraction of a fixed offset.
 *
 * three-vrm's update cycle clears every bind and then re-applies all of
 * them, so several expressions at partial weight compose additively
 * (a half-blink over a smile) instead of the last one winning.
 */
class TransformBind implements VRMExpressionBind {
  private readonly restPosition: THREE.Vector3;
  private readonly restScale: THREE.Vector3;
  private readonly restRotation: THREE.Euler;

  constructor(
    private readonly target: THREE.Object3D,
    private readonly delta: Delta
  ) {
    this.restPosition = target.position.clone();
    this.restScale = target.scale.clone();
    this.restRotation = target.rotation.clone();
  }

  applyWeight(weight: number): void {
    const { position, scale, rotation } = this.delta;
    if (position) {
      this.target.position.x += position[0] * weight;
      this.target.position.y += position[1] * weight;
      this.target.position.z += position[2] * weight;
    }
    if (scale) {
      this.target.scale.x *= 1 + (scale[0] - 1) * weight;
      this.target.scale.y *= 1 + (scale[1] - 1) * weight;
      this.target.scale.z *= 1 + (scale[2] - 1) * weight;
    }
    if (rotation) {
      this.target.rotation.x += rotation[0] * weight;
      this.target.rotation.y += rotation[1] * weight;
      this.target.rotation.z += rotation[2] * weight;
    }
  }

  clearAppliedWeight(): void {
    this.target.position.copy(this.restPosition);
    this.target.scale.copy(this.restScale);
    this.target.rotation.copy(this.restRotation);
  }
}

/**
 * Crossfades the open eyes into a painted closed one as a blink closes
 * them (an open eye squashed flat is only a faint smear), or into laughing
 * ones, bowed up, in a big smile. Whichever is most closed wins; the open
 * eyes fade by as much.
 */
class LidBind implements VRMExpressionBind {
  private static levels = new WeakMap<THREE.Material, { closed: number; smile: number }>();

  constructor(
    private readonly lids: NonNullable<DesignerFaceParts["lids"]>,
    private readonly which: "closed" | "smile"
  ) {}

  private get state() {
    let state = LidBind.levels.get(this.lids.closed);
    if (!state) LidBind.levels.set(this.lids.closed, (state = { closed: 0, smile: 0 }));
    return state;
  }

  private show() {
    const { closed, smile } = this.state;
    // One closed eye at a time: a blink in a smile is still the smile's.
    const smiling = smile >= closed;
    this.lids.smile.opacity = smiling ? smile : 0;
    this.lids.closed.opacity = smiling ? 0 : closed;
    for (const open of this.lids.open) open.opacity = 1 - Math.max(closed, smile);
  }

  applyWeight(weight: number): void {
    // Only the last stretch of the close: a half blink is still an eye.
    const shown = this.which === "closed" ? THREE.MathUtils.smoothstep(weight, 0.55, 0.9) : THREE.MathUtils.smoothstep(weight, 0.45, 0.85);
    this.state[this.which] = Math.max(this.state[this.which], shown);
    this.show();
  }

  clearAppliedWeight(): void {
    this.state[this.which] = 0;
    this.show();
  }
}

/**
 * Per-preset choreography.
 *
 * `mirror` flips the X components for the right-hand part, so "inner brow
 * up" means inner on both sides rather than the same absolute direction
 * on both. Brow rotation is the workhorse: the angle of two short bars
 * over the eyes carries more of an expression than anything else on a
 * face this simple.
 */
interface ExpressionRecipe {
  eyes?: Delta;
  /** Applied to the left brow; the right brow gets it mirrored. */
  brow?: Delta;
  mouth?: Delta;
}

const RECIPES: Record<string, ExpressionRecipe> = {
  happy: {
    // Eyes squeeze up into a smile; the mouth widens and lifts.
    eyes: { scale: [1, 0.55, 1], position: [0, 0.004, 0] },
    brow: { position: [0, 0.006, 0], rotation: [0, 0, -0.12] },
    mouth: { scale: [1.35, 1.15, 1], position: [0, -0.004, 0.001] },
  },
  sad: {
    eyes: { scale: [1, 0.85, 1], position: [0, -0.002, 0] },
    // Inner end up, outer end down — the classic sad brow.
    brow: { position: [0, -0.004, 0], rotation: [0, 0, 0.3] },
    mouth: { scale: [0.85, 0.9, 1], position: [0, -0.008, 0], rotation: [0, 0, Math.PI] },
  },
  angry: {
    eyes: { scale: [1, 0.78, 1] },
    // Inner end down and lowered: a scowl.
    brow: { position: [0, -0.012, 0], rotation: [0, 0, -0.34] },
    mouth: { scale: [0.9, 0.55, 1], position: [0, -0.003, 0], rotation: [0, 0, Math.PI] },
  },
  surprised: {
    eyes: { scale: [1.2, 1.35, 1] },
    brow: { position: [0, 0.018, 0] },
    mouth: { scale: [0.75, 1.9, 1], position: [0, -0.006, 0] },
  },
  relaxed: {
    eyes: { scale: [1, 0.78, 1] },
    brow: { position: [0, 0.003, 0], rotation: [0, 0, -0.06] },
    mouth: { scale: [1.15, 1.0, 1], position: [0, -0.002, 0] },
  },
  blink: {
    // The only one that goes all the way: a closed eye is a flat lid.
    eyes: { scale: [1, 0.06, 1] },
  },

  // Mouth visemes. Registered so that an eventual lip-sync driver has
  // the same preset names available on a designer avatar as on an
  // uploaded VRM. NOTHING DRIVES THESE TODAY — there is no lip-sync in
  // the app. They are shape-only (no brow or eye movement) precisely so
  // that such a driver could run at full weight underneath whichever
  // expression is already showing.
  aa: { mouth: { scale: [1.05, 2.3, 1], position: [0, -0.006, 0] } },
  ih: { mouth: { scale: [1.45, 0.8, 1] } },
  ou: { mouth: { scale: [0.6, 1.7, 1], position: [0, -0.004, 0] } },
  ee: { mouth: { scale: [1.5, 1.1, 1] } },
  oh: { mouth: { scale: [0.85, 2.0, 1], position: [0, -0.005, 0] } },
};

/** Mirrors a delta's X-axis components for the opposite side of the face. */
function mirrored(delta: Delta): Delta {
  return {
    position: delta.position ? [-delta.position[0], delta.position[1], delta.position[2]] : undefined,
    scale: delta.scale,
    // Z rotation is the in-plane tilt, so it has to flip too or both
    // brows tilt the same way and the face looks lopsided instead of sad.
    rotation: delta.rotation ? [delta.rotation[0], -delta.rotation[1], -delta.rotation[2]] : undefined,
  };
}

/**
 * Builds the expression manager for a designer avatar.
 *
 * Every preset three-vrm knows by name is registered, so callers never
 * have to special-case designer avatars — `getExpression("happy")`
 * resolves for both kinds.
 */
export function buildDesignerExpressions(parts: DesignerFaceParts): VRMExpressionManager {
  const manager = new VRMExpressionManager();

  for (const [name, recipe] of Object.entries(RECIPES)) {
    const expression = new VRMExpression(name);
    // Overriding nothing: these compose, and blocking would make a
    // viseme silently cancel a smile.
    expression.isBinary = false;

    if (recipe.eyes) {
      expression.addBind(new TransformBind(parts.leftEye, recipe.eyes));
      expression.addBind(new TransformBind(parts.rightEye, mirrored(recipe.eyes)));
    }
    if (recipe.brow) {
      expression.addBind(new TransformBind(parts.leftBrow, recipe.brow));
      expression.addBind(new TransformBind(parts.rightBrow, mirrored(recipe.brow)));
    }
    if (recipe.mouth) {
      expression.addBind(new TransformBind(parts.mouth, recipe.mouth));
    }
    if (name === "blink" && parts.lids) expression.addBind(new LidBind(parts.lids, "closed"));
    if (name === "happy" && parts.lids) expression.addBind(new LidBind(parts.lids, "smile"));

    manager.registerExpression(expression);
  }

  return manager;
}
