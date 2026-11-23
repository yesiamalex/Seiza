import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { simplify } from "./Strokes";

describe("drawn lines", () => {
  it("keep the points a line bends at and drop the rest of a straight run", () => {
    const straight = Array.from({ length: 50 }, (_, i) => new THREE.Vector3(i * 0.01, 1, 0));
    expect(simplify(straight, 0.003)).toHaveLength(2);
    const corner = [...straight, ...Array.from({ length: 50 }, (_, i) => new THREE.Vector3(0.49, 1, (i + 1) * 0.01))];
    expect(simplify(corner, 0.003)).toHaveLength(3);
  });
});
