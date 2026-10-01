import * as THREE from "three";

/**
 * Painted facial features for designer avatars.
 *
 * The first faces were built from geometry: a white bead for each eye
 * with smaller beads for iris, pupil and highlight, a capsule per brow, a
 * torus for the mouth. That is exactly what made them look like a child's
 * drawing, since no stylised character face is made that way. VRoid,
 * Mii-likes and anime-styled VRMs all *paint* the eyes, brows and mouth as
 * textures on the face, which is how they get the gradient iris, lash
 * line, catch-lights and soft mouth shapes that read as a face.
 *
 * So these are drawn with Canvas 2D (no image assets, no network, and
 * recoloured per avatar) onto small patches that follow the curve of the
 * head. Each patch lives inside the same group the expression system
 * already animates (designerExpressions.ts), so blinks, emotions and lip
 * sync work unchanged: squashing a painted eye closes it, and stretching
 * a painted mouth opens it.
 */

/** Head-local depth of the face's front surface at (x, y). */
export type FaceSurface = (x: number, y: number) => number;

/**
 * The head: a sphere sculpted into a stylised head shape, as one smooth
 * mesh. The earlier head was a cranium with separate jaw and chin
 * ellipsoids pushed into it, and where they intersected they left hard,
 * jagged shading seams across the lower face, which read as stubble.
 *
 * Proportioned the way anime-styled avatars are: a full, round cranium
 * and cheeks, narrowing into a soft V toward a small chin that sits a
 * little forward.
 */
export function sculptedHeadGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 48, 36);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    // 0 at the equator, 1 at the bottom of the head.
    const down = Math.max(0, -y);
    const taper = 1 - 0.33 * Math.pow(down, 1.5);
    const front = Math.max(0, z);
    position.setXYZ(
      i,
      x * 0.122 * taper,
      y * (y < 0 ? 0.142 : 0.132),
      z * 0.125 * (1 - 0.12 * down * (1 - front)) + 0.016 * Math.pow(down, 2.2) * front
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Surface lookup for a head geometry, in that geometry's own units: casts
 * a ray at it from the front and returns the depth it hits.
 */
export function raycastFaceSurface(geometry: THREE.BufferGeometry): FaceSurface {
  const probe = new THREE.Mesh(geometry);
  probe.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const back = new THREE.Vector3(0, 0, -1);
  return (x, y) => {
    raycaster.set(origin.set(x, y, 1), back);
    const hit = raycaster.intersectObject(probe, false)[0];
    return hit ? hit.point.z : 0;
  };
}

/**
 * A rectangle of `width` x `height` centred on (cx, cy), wrapped onto the
 * face surface, in coordinates local to its own group at
 * (cx, cy, surface + lift). `mirror` flips it horizontally so one painted
 * eye or brow serves both sides of the face.
 */
export function faceDecalGeometry(
  surface: FaceSurface,
  cx: number,
  cy: number,
  width: number,
  height: number,
  lift: number,
  mirror = false
): { geometry: THREE.BufferGeometry; origin: [number, number, number] } {
  const originZ = surface(cx, cy) + lift;
  const geometry = new THREE.PlaneGeometry(width, height, 10, 10);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    position.setZ(i, surface(cx + x, cy + y) + lift - originZ);
  }
  if (mirror) {
    const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  }
  geometry.computeVertexNormals();
  return { geometry, origin: [cx, cy, originZ] };
}

const mix = (a: string, b: string, t: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  return [element, element.getContext("2d")!];
}

function texture(element: HTMLCanvasElement): THREE.CanvasTexture {
  const map = new THREE.CanvasTexture(element);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

/**
 * The character's left eye, outer corner on the right of the canvas
 * (mirror the geometry for the right eye). Proportioned like an anime
 * eye: taller than wide, a heavy upper lash line, a large iris that the
 * upper lid partly covers, and two catch-lights.
 */
export function paintEye(irisHex: string): THREE.CanvasTexture {
  const [element, g] = canvas(256, 256);

  const eyeShape = () => {
    g.beginPath();
    g.moveTo(24, 122);
    g.bezierCurveTo(52, 58, 168, 34, 238, 90); // upper lid
    g.bezierCurveTo(240, 168, 204, 232, 132, 234); // outer, lower
    g.bezierCurveTo(68, 234, 28, 186, 24, 122); // inner corner
    g.closePath();
  };

  g.save();
  eyeShape();
  g.fillStyle = "#fbf8f5";
  g.fill();
  g.clip();

  // Iris: dark under the lid, brightening toward the bottom, with a
  // darker rim. This gradient is most of what makes it read as an eye.
  const iris = g.createLinearGradient(0, 56, 0, 230);
  iris.addColorStop(0, mix(irisHex, "#000000", 0.62));
  iris.addColorStop(0.55, irisHex);
  iris.addColorStop(1, mix(irisHex, "#ffffff", 0.45));
  g.beginPath();
  g.ellipse(140, 142, 68, 88, 0, 0, Math.PI * 2);
  g.fillStyle = iris;
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = mix(irisHex, "#000000", 0.7);
  g.stroke();

  // Pupil.
  g.beginPath();
  g.ellipse(140, 150, 26, 40, 0, 0, Math.PI * 2);
  g.fillStyle = mix(irisHex, "#05040a", 0.85);
  g.fill();

  // The upper lid's shadow across the top of the eye.
  const lidShadow = g.createLinearGradient(0, 40, 0, 120);
  lidShadow.addColorStop(0, "rgba(40,22,30,0.55)");
  lidShadow.addColorStop(1, "rgba(40,22,30,0)");
  g.fillStyle = lidShadow;
  g.fillRect(0, 0, 256, 130);

  // Catch-lights: one large, one small, on opposite sides.
  g.fillStyle = "rgba(255,255,255,0.95)";
  g.beginPath();
  g.ellipse(112, 110, 21, 25, -0.3, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(172, 190, 10, 8, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // Upper lash line, thickest toward the outer corner, with a flick.
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = "#1d1416";
  g.lineWidth = 16;
  g.beginPath();
  g.moveTo(26, 120);
  g.bezierCurveTo(54, 58, 168, 34, 238, 90);
  g.stroke();
  g.lineWidth = 12;
  g.beginPath();
  g.moveTo(222, 80);
  g.lineTo(250, 66);
  g.stroke();

  // A light lower lash, outer half only.
  g.strokeStyle = "rgba(29,20,22,0.55)";
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(232, 160);
  g.bezierCurveTo(222, 210, 190, 232, 140, 234);
  g.stroke();

  return texture(element);
}

/** The character's left brow, inner end on the left of the canvas. */
export function paintBrow(hairHex: string): THREE.CanvasTexture {
  const [element, g] = canvas(256, 64);
  g.fillStyle = mix(hairHex, "#120c0a", 0.45);
  // Thick at the inner end, tapering to a point at the outer end, with a
  // gentle arch: a filled shape rather than a stroke, so the taper is real.
  g.beginPath();
  g.moveTo(10, 40);
  g.quadraticCurveTo(110, 2, 248, 24);
  g.quadraticCurveTo(120, 30, 14, 62);
  g.closePath();
  g.fill();
  return texture(element);
}

/**
 * A small smile-shaped mouth, drawn open. The expression system scales
 * the mouth group vertically, so at rest it is squashed to a soft closed
 * line and the lips part (showing the tongue) as visemes stretch it.
 */
export function paintMouth(): THREE.CanvasTexture {
  const [element, g] = canvas(128, 64);
  const lens = () => {
    g.beginPath();
    g.moveTo(6, 16);
    g.quadraticCurveTo(64, 30, 122, 16); // upper lip line, corners up
    g.quadraticCurveTo(64, 78, 6, 16); // lower lip line
    g.closePath();
  };
  g.save();
  lens();
  g.fillStyle = "#6e2630";
  g.fill();
  g.clip();
  g.fillStyle = "#d8737c";
  g.beginPath();
  g.ellipse(64, 60, 30, 16, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.lineWidth = 4;
  g.strokeStyle = "#4b1820";
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(6, 16);
  g.quadraticCurveTo(64, 30, 122, 16);
  g.stroke();
  return texture(element);
}

/** Soft cheek blush. Static, and faint: it warms the face, nothing more. */
export function paintBlush(): THREE.CanvasTexture {
  const [element, g] = canvas(128, 64);
  // Drawn in a vertically halved space, so the round gradient comes out
  // as a wide oval: (64, 64) here is the canvas centre.
  const glow = g.createRadialGradient(64, 64, 0, 64, 64, 60);
  glow.addColorStop(0, "rgba(240,120,130,0.42)");
  glow.addColorStop(1, "rgba(240,120,130,0)");
  g.save();
  g.scale(1, 0.5);
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 128);
  g.restore();
  return texture(element);
}

/** Material for a painted decal: blends over the skin and never z-fights it. */
export function decalMaterial(map: THREE.Texture, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    roughness: 0.45,
    metalness: 0,
    // A touch of self-illumination keeps eyes readable when the face is
    // turned away from the light, which is where unlit-looking anime eyes
    // get their clarity.
    emissive: emissive > 0 ? new THREE.Color("#ffffff") : new THREE.Color("#000000"),
    emissiveMap: emissive > 0 ? map : null,
    emissiveIntensity: emissive,
  });
}
