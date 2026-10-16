// Maps a rigged glTF's bone names onto VRM 1.0 humanoid bones, for
// converting a plain .glb avatar (Avaturn, Mixamo, and the many tools that
// share Mixamo's names) into a VRM. Pure data, no 3D code.

/** VRM 1.0's required humanoid bones. A skeleton missing any of these
 *  can't walk, sit, or gesture. */
export const REQUIRED_VRM_BONES = [
  "hips", "spine", "head",
  "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand",
  "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot",
] as const;

const BODY: Record<string, string> = {
  Hips: "hips",
  Spine: "spine",
  Spine1: "chest",
  Spine2: "upperChest",
  Neck: "neck",
  Head: "head",
  LeftEye: "leftEye",
  RightEye: "rightEye",
};

const SIDE: Record<string, string> = {
  Shoulder: "Shoulder",
  Arm: "UpperArm",
  ForeArm: "LowerArm",
  Hand: "Hand",
  UpLeg: "UpperLeg",
  Leg: "LowerLeg",
  Foot: "Foot",
  ToeBase: "Toes",
};

// Mixamo numbers finger joints 1 to 3 from the palm. VRM 1.0 calls the
// thumb's first joint its metacarpal and every other finger's its proximal.
const FINGERS: Record<string, [string, string, string]> = {
  Thumb: ["ThumbMetacarpal", "ThumbProximal", "ThumbDistal"],
  Index: ["IndexProximal", "IndexIntermediate", "IndexDistal"],
  Middle: ["MiddleProximal", "MiddleIntermediate", "MiddleDistal"],
  Ring: ["RingProximal", "RingIntermediate", "RingDistal"],
  Pinky: ["LittleProximal", "LittleIntermediate", "LittleDistal"],
};

/** A bone name without the prefixes exporters add: `mixamorig:Hips`,
 *  `mixamorig1_Hips`, `Armature|Hips`. */
export function bareBoneName(name: string): string {
  return name.replace(/^.*[:|]/, "").replace(/^mixamorig\d*_?/i, "");
}

/** The VRM humanoid bone a Mixamo-style bone name stands for, or null. */
export function vrmBoneFor(name: string): string | null {
  const bare = bareBoneName(name);
  if (BODY[bare]) return BODY[bare];
  const side = /^(Left|Right)(.+)$/.exec(bare);
  if (!side) return null;
  const prefix = side[1] === "Left" ? "left" : "right";
  const rest = side[2];
  if (SIDE[rest]) return prefix + SIDE[rest];
  const finger = /^Hand(Thumb|Index|Middle|Ring|Pinky)([123])$/.exec(rest);
  if (finger) return prefix + FINGERS[finger[1]][Number(finger[2]) - 1];
  return null;
}
