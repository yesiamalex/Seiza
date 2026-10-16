import { Document, NodeIO, type Node } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { convertGlbToVrm, readGlb } from "./glbToVrm";
import { REQUIRED_VRM_BONES, vrmBoneFor } from "./humanoidBones";

describe("Mixamo-style bone names", () => {
  it("map onto VRM humanoid bones, with or without exporter prefixes", () => {
    expect(vrmBoneFor("Hips")).toBe("hips");
    expect(vrmBoneFor("mixamorig:LeftForeArm")).toBe("leftLowerArm");
    expect(vrmBoneFor("mixamorig1_RightUpLeg")).toBe("rightUpperLeg");
    expect(vrmBoneFor("Spine2")).toBe("upperChest");
    expect(vrmBoneFor("LeftHandThumb1")).toBe("leftThumbMetacarpal");
    expect(vrmBoneFor("RightHandPinky3")).toBe("rightLittleDistal");
    expect(vrmBoneFor("LeftToeBase")).toBe("leftToes");
    expect(vrmBoneFor("HeadTop_End")).toBeNull();
  });
});

/** A tiny T-posed, Mixamo-named skeleton with one skinned triangle that
 *  has eight bone influences, like an Avaturn export's. */
async function syntheticAvatar(): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  const make = (name: string, t: [number, number, number], parent?: Node) => {
    const node = doc.createNode(name).setTranslation(t);
    if (parent) parent.addChild(node);
    else scene.addChild(node);
    return node;
  };
  const hips = make("Hips", [0, 0.9, 0]);
  const spine = make("Spine", [0, 0.1, 0], hips);
  const head = make("Head", [0, 0.6, 0], spine);
  const joints = [hips, spine, head];
  for (const [side, x] of [["Left", 1], ["Right", -1]] as const) {
    const upper = make(`${side}Arm`, [0.2 * x, 0.45, 0], spine);
    const lower = make(`${side}ForeArm`, [0.25 * x, 0, 0], upper);
    const hand = make(`${side}Hand`, [0.25 * x, 0, 0], lower);
    const leg = make(`${side}UpLeg`, [0.1 * x, -0.05, 0], hips);
    const knee = make(`${side}Leg`, [0, -0.4, 0], leg);
    const foot = make(`${side}Foot`, [0, -0.4, 0], knee);
    joints.push(upper, lower, hand, leg, knee, foot);
  }
  const skin = doc.createSkin();
  joints.forEach((j) => skin.addJoint(j));
  const acc = (type: "VEC3" | "VEC4", array: Float32Array | Uint8Array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", acc("VEC3", new Float32Array([0, 1, 0, 0.1, 1, 0, 0, 1.1, 0])))
    .setAttribute("JOINTS_0", acc("VEC4", new Uint8Array([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3])))
    .setAttribute("WEIGHTS_0", acc("VEC4", new Float32Array([0.3, 0.2, 0.1, 0.05, 0.4, 0.3, 0.2, 0.1, 1, 0, 0, 0])))
    .setAttribute("JOINTS_1", acc("VEC4", new Uint8Array([4, 5, 6, 7, 4, 5, 6, 7, 4, 5, 6, 7])))
    .setAttribute("WEIGHTS_1", acc("VEC4", new Float32Array([0.25, 0.05, 0.03, 0.02, 0, 0, 0, 0, 0, 0, 0, 0])));
  scene.addChild(doc.createNode("body").setMesh(doc.createMesh().addPrimitive(prim)).setSkin(skin));
  return new NodeIO().writeBinary(doc);
}

describe("converting a .glb avatar to VRM", () => {
  it("writes a VRM 1.0 humanoid with every required bone", async () => {
    const glb = await syntheticAvatar();
    const result = await convertGlbToVrm(new Blob([glb as Uint8Array<ArrayBuffer>]), { name: "test", compressTextures: false });
    const { json } = readGlb(new Uint8Array(await result.blob.arrayBuffer()));
    const vrm = json.extensions?.VRMC_vrm as { specVersion: string; humanoid: { humanBones: Record<string, { node: number }> } };
    expect(json.extensionsUsed).toContain("VRMC_vrm");
    expect(vrm.specVersion).toBe("1.0");
    for (const bone of REQUIRED_VRM_BONES) expect(json.nodes?.[vrm.humanoid.humanBones[bone].node]).toBeDefined();
    expect(json.nodes?.[vrm.humanoid.humanBones.leftLowerArm.node].name).toBe("LeftForeArm");
  });

  it("keeps each vertex's four strongest weights, as bytes adding up to 255", async () => {
    const glb = await syntheticAvatar();
    const result = await convertGlbToVrm(new Blob([glb as Uint8Array<ArrayBuffer>]), { name: "test", compressTextures: false });
    const doc = await new NodeIO().readBinary(new Uint8Array(await result.blob.arrayBuffer()));
    const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    expect(prim.getAttribute("JOINTS_1")).toBeNull();
    const weights = prim.getAttribute("WEIGHTS_0")!;
    const joints = prim.getAttribute("JOINTS_0")!;
    expect(weights.getArray()).toBeInstanceOf(Uint8Array);
    const raw = weights.getArray() as Uint8Array;
    for (let v = 0; v < 3; v++) expect(raw[v * 4] + raw[v * 4 + 1] + raw[v * 4 + 2] + raw[v * 4 + 3]).toBe(255);
    // The first vertex's strongest four: joint 0 (0.3), 4 (0.25), 1 (0.2), 2 (0.1).
    const j = [0, 0, 0, 0];
    joints.getElement(0, j);
    expect(j).toEqual([0, 4, 1, 2]);
  });

  it("refuses a file without a recognizable skeleton", async () => {
    const doc = new Document();
    doc.createBuffer();
    doc.createScene().addChild(doc.createNode("Cube"));
    const glb = await new NodeIO().writeBinary(doc);
    await expect(convertGlbToVrm(new Blob([glb as Uint8Array<ArrayBuffer>]), { name: "x", compressTextures: false })).rejects.toThrow(/humanoid skeleton/);
  });
});
