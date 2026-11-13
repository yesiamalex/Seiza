// What a solar module looks like in Seinag, shared by the rooftop arrays
// (Panels.tsx) and the station's own roof (Station.tsx): a face of
// monocrystalline cells (6 by 10, with silver busbars and the white gaps
// between cells), an aluminium frame, and two rear legs that hold it at
// its tilt. Each is one instanced mesh, so hundreds of modules cost three
// draw calls.
import * as THREE from "three";

export const MODULE = { width: 1.7, depth: 1.1 };
/** 15° toward the south (+Z: north is -Z in Seiza), as Seizora's farm. */
export const TILT = (15 * Math.PI) / 180;
const FRAME = 0.035;

let faceTexture: THREE.CanvasTexture | null = null;

/** The cells: drawn once, shared. */
function cellTexture(): THREE.CanvasTexture {
  if (faceTexture) return faceTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext("2d")!;
  // The backsheet, white between the cells.
  ctx.fillStyle = "#d9dee6";
  ctx.fillRect(0, 0, 512, 320);
  const cols = 10, rows = 6, gap = 4;
  const cw = (512 - gap * (cols + 1)) / cols, ch = (320 - gap * (rows + 1)) / rows;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = gap + c * (cw + gap), y = gap + r * (ch + gap);
      const g = ctx.createLinearGradient(x, y, x + cw, y + ch);
      g.addColorStop(0, "#1a2a52");
      g.addColorStop(1, "#11203f");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, cw, ch);
      // Monocrystalline cells have clipped corners.
      ctx.fillStyle = "#d9dee6";
      const k = 5;
      for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + cw, y, -1, 1], [x, y + ch, 1, -1], [x + cw, y + ch, -1, -1]] as const) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + dx * k, cy);
        ctx.lineTo(cx, cy + dy * k);
        ctx.fill();
      }
      // Busbars along each cell.
      ctx.fillStyle = "rgba(205,214,228,0.75)";
      for (const f of [0.25, 0.5, 0.75]) ctx.fillRect(x, y + ch * f - 0.6, cw, 1.2);
    }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  faceTexture = t;
  return t;
}

export interface ModuleMeshes {
  face: THREE.InstancedMesh;
  frame: THREE.InstancedMesh;
  legs: THREE.InstancedMesh;
  dispose(): void;
}

/**
 * Modules at `spots` ([x, y, z]: the roof under the module's middle),
 * tilted to the south, their low edge `lift` metres off the roof.
 * `extraTilt` changes the tilt, for modules lying on a roof that's already
 * sloped.
 */
export function moduleMeshes(spots: [number, number, number][], lift = 0.25, extraTilt = 0): ModuleMeshes {
  const n = spots.length;
  const face = new THREE.InstancedMesh(
    new THREE.BoxGeometry(MODULE.width - FRAME * 2, 0.02, MODULE.depth - FRAME * 2),
    new THREE.MeshStandardMaterial({ map: cellTexture(), roughness: 0.22, metalness: 0.15, emissive: "#0a1222", emissiveIntensity: 0.6 }),
    n
  );
  const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(MODULE.width, 0.035, MODULE.depth), new THREE.MeshStandardMaterial({ color: "#b9c0ca", roughness: 0.4, metalness: 0.7 }), n);
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 1, 0.04), new THREE.MeshStandardMaterial({ color: "#8c939c", roughness: 0.5, metalness: 0.6 }), n * 2);
  const tilt = TILT + extraTilt;
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0));
  const m = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  // How high the back (north) edge sits above the front.
  const rise = Math.sin(tilt) * MODULE.depth;
  spots.forEach(([x, y, z], i) => {
    const centreY = y + lift + rise / 2;
    p.set(x, centreY + 0.02, z);
    face.setMatrixAt(i, m.compose(p, rotation, one));
    p.set(x, centreY, z);
    frame.setMatrixAt(i, m.compose(p, rotation, one));
    // Two legs under the back edge, from the roof up to it.
    const backZ = z - (Math.cos(tilt) * MODULE.depth) / 2 + 0.06;
    const legH = lift + rise;
    for (const side of [-1, 1]) {
      p.set(x + side * (MODULE.width / 2 - 0.15), y + legH / 2, backZ);
      legs.setMatrixAt(i * 2 + (side < 0 ? 0 : 1), m.compose(p, new THREE.Quaternion(), new THREE.Vector3(1, legH, 1)));
    }
  });
  for (const mesh of [face, frame, legs]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.navIgnore = true;
  }
  return {
    face,
    frame,
    legs,
    dispose() {
      for (const mesh of [face, frame, legs]) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        mesh.dispose();
      }
    },
  };
}
