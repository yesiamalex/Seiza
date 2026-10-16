import { describe, expect, it } from "vitest";
import { writeGlb } from "./import/glbContainer";
import { optimizeVrmAvatar } from "./optimizeVrm";

// Re-encoding needs a browser's canvas; these are the paths that don't.
describe("VRM optimizer", () => {
  it("leaves a file with nothing to shrink exactly as it was", async () => {
    const glb = writeGlb({ asset: { version: "2.0" }, buffers: [{ byteLength: 4 }], extensions: { VRMC_vrm: { specVersion: "1.0" } } }, new Uint8Array(4));
    const file = new File([glb], "plain.vrm");
    const result = await optimizeVrmAvatar(file);
    expect(result.applied).toBe(false);
    expect(result.blob).toBe(file);
  });

  it("leaves a layout it doesn't handle alone instead of guessing", async () => {
    const glb = writeGlb({ asset: { version: "2.0" }, buffers: [{ byteLength: 4 }, { byteLength: 4 }] }, new Uint8Array(4));
    const result = await optimizeVrmAvatar(new File([glb], "two-buffers.vrm"));
    expect(result.applied).toBe(false);
    expect(result.reason).toMatch(/as is/);
  });

  it("falls back to the original for a file that isn't a GLB", async () => {
    const file = new File(["not a model"], "broken.vrm");
    const result = await optimizeVrmAvatar(file);
    expect(result.applied).toBe(false);
    expect(result.blob).toBe(file);
  });
});
