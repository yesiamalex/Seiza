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
    const front = Math.max(0, z);
    // VRoid's face: a round cranium over a jaw that narrows in near-straight
    // lines from the cheeks (just under the eyes) to a small chin. The taper
    // starts below the eyes, not at the equator, which is what kept the
    // earlier, stronger taper from reading as a light bulb; and it bites
    // harder at the front, so the chin is narrow while the back of the jaw
    // stays wide under the ears.
    const jaw = Math.min(1, Math.max(0, (down - 0.15) / 0.85));
    const taper = 1 - jaw * (0.4 + 0.32 * front);
    // The chin comes down and a little forward in front of the neck, so
    // the head sits on the neck the way a drawn one does, not on top of it.
    const chin = front * front * jaw;
    position.setXYZ(
      i,
      x * 0.112 * taper,
      y * (y < 0 ? 0.128 + 0.034 * chin : 0.13),
      z * (0.122 - 0.008 * front) * (1 - 0.12 * down * (1 - front)) + 0.016 * chin
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

type Point = [number, number];
/** A point on a cubic Bézier, for drawing along a curve. */
const bezier = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
  const u = 1 - t;
  return [
    u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
    u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
  ];
};

/**
 * A line along a curve that thickens from `thin` to `thick`, drawn as one
 * filled ribbon: what an inked lash line is, where a stroke of one width
 * reads as a cartoon outline.
 */
function taperedLine(g: CanvasRenderingContext2D, curve: [Point, Point, Point, Point], thin: number, thick: number, below = 0.35) {
  const steps = 24;
  const top: Point[] = [];
  const bottom: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [x, y] = bezier(...curve, t);
    const [nx0, ny0] = bezier(...curve, Math.min(1, t + 0.01));
    const [px0, py0] = bezier(...curve, Math.max(0, t - 0.01));
    // The normal, pointing up (out of the eye).
    let nx = ny0 - py0;
    let ny = -(nx0 - px0);
    const length = Math.hypot(nx, ny) || 1;
    nx /= length;
    ny /= length;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const width = thin + (thick - thin) * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5);
    top.push([x + nx * width * (1 - below), y + ny * width * (1 - below)]);
    bottom.push([x - nx * width * below, y - ny * width * below]);
  }
  g.beginPath();
  g.moveTo(...top[0]);
  for (const p of top) g.lineTo(...p);
  for (const p of bottom.reverse()) g.lineTo(...p);
  g.closePath();
  g.fill();
}

/**
 * One eye, painted. The character's left eye has its outer corner on the
 * right of the canvas; the right eye's geometry is mirrored, so it passes
 * `mirrored` and gets its catch-lights painted on the other side, which
 * puts them on the same side of the face in both eyes, as one light would.
 *
 * Proportioned the way VRoid and most anime-styled avatars draw a calm,
 * friendly eye, which the earlier one missed in ways that added up to a
 * stare: it was taller than wide and filled almost entirely by iris and a
 * near-black pupil, and its iris sat toward the nose, so the white showed
 * only at the outer corner and the eyes looked crossed. Here the eye is a
 * little wider than tall, the iris is centred with white either side, the
 * pupil is small and soft, the lash line tapers into a short wing at the
 * outer corner, and a faint crease sits above the lid.
 */
export function paintEye(irisHex: string, mirrored = false): THREE.CanvasTexture {
  const [element, g] = canvas(256, 256);

  const inner: Point = [30, 148];
  const outer: Point = [228, 112];
  const upper: [Point, Point, Point, Point] = [inner, [58, 76], [168, 52], outer];
  const lower: [Point, Point, Point, Point] = [outer, [222, 190], [120, 214], inner];
  const eyeShape = () => {
    g.beginPath();
    g.moveTo(...inner);
    g.bezierCurveTo(...upper[1], ...upper[2], ...outer);
    g.bezierCurveTo(...lower[1], ...lower[2], ...inner);
    g.closePath();
  };
  // The bottom of the iris glows in a brighter, more saturated version of
  // its colour, so even a dark brown reads as an eye, not a grey disc.
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(irisHex).getHSL(hsl);
  const vivid = "#" + new THREE.Color().setHSL(hsl.h, Math.max(hsl.s, 0.5), Math.min(0.7, Math.max(0.5, hsl.l + 0.28))).getHexString();
  // A very dark iris (near-black brown is the default) is lifted a little,
  // or it reads as one black blob with the pupil lost in it.
  const base = "#" + new THREE.Color().setHSL(hsl.h, hsl.s, Math.max(hsl.l, 0.24)).getHexString();
  const deep = mix(base, "#0a0608", 0.55);

  // Iris centred under the lid's highest point, so the eye looks ahead.
  const cx = 130;
  const cy = 140;
  const rx = 58;
  const ry = 70;

  g.save();
  eyeShape();
  // The white is never pure: it shades toward the lid.
  const white = g.createLinearGradient(0, 60, 0, 210);
  white.addColorStop(0, "#e6e3ec");
  white.addColorStop(0.4, "#ffffff");
  white.addColorStop(1, "#f8f6f4");
  g.fillStyle = white;
  g.fill();
  g.clip();

  // Iris: shaded under the lid, brightening toward the bottom.
  const iris = g.createLinearGradient(0, cy - ry, 0, cy + ry);
  iris.addColorStop(0, deep);
  iris.addColorStop(0.42, base);
  iris.addColorStop(0.82, vivid);
  iris.addColorStop(1, mix(vivid, "#ffffff", 0.3));
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = iris;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = mix(base, "#0a0608", 0.7);
  g.stroke();

  // Pupil: small, soft-edged, the iris's own dark rather than black.
  const pupil = g.createRadialGradient(cx, cy + 4, 4, cx, cy + 4, 30);
  pupil.addColorStop(0, mix(base, "#0a0608", 0.85));
  pupil.addColorStop(0.7, mix(base, "#0a0608", 0.72));
  pupil.addColorStop(1, mix(base, "#0a0608", 0));
  g.fillStyle = pupil;
  g.beginPath();
  g.ellipse(cx, cy + 4, 24, 32, 0, 0, Math.PI * 2);
  g.fill();

  // A crescent of light round the bottom of the iris.
  g.strokeStyle = "rgba(255,255,255,0.3)";
  g.lineWidth = 5;
  g.beginPath();
  g.ellipse(cx, cy + 4, rx - 14, ry - 16, 0, Math.PI * 0.22, Math.PI * 0.78);
  g.stroke();

  // The upper lid's shadow over the top of the eye.
  const lidShadow = g.createLinearGradient(0, 56, 0, 118);
  lidShadow.addColorStop(0, "rgba(46,26,34,0.5)");
  lidShadow.addColorStop(1, "rgba(46,26,34,0)");
  g.fillStyle = lidShadow;
  g.fillRect(0, 0, 256, 124);

  // Catch-lights, toward the light: a large one high on the iris, a small
  // one low on the other side.
  const toward = mirrored ? 1 : -1;
  g.fillStyle = "rgba(255,255,255,0.96)";
  g.beginPath();
  g.ellipse(cx + toward * 24, cy - 26, 17, 21, toward * 0.35, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.8)";
  g.beginPath();
  g.ellipse(cx - toward * 26, cy + 34, 8, 6, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  const ink = mix(irisHex, "#1a1214", 0.82);
  g.fillStyle = ink;
  // Upper lash line: fine at the inner corner, full toward the outer, and
  // a short wing past it.
  taperedLine(g, upper, 4, 22);
  taperedLine(g, [[204, 106], [222, 98], [238, 90], [250, 78]], 12, 3, 0.5);
  // A faint crease above the lid.
  g.globalAlpha = 0.16;
  taperedLine(g, [[72, 70], [110, 40], [176, 34], [220, 66]], 1, 3.5, 0.5);
  // Lower lid: a soft line on its outer half only.
  g.globalAlpha = 0.5;
  taperedLine(g, [[224, 128], [218, 176], [180, 204], [140, 210]], 3.5, 1, 0.5);
  g.globalAlpha = 1;

  return texture(element);
}

/**
 * A closed eye, on the same patch as paintEye: the lid's lash line, bowed
 * down, with a little flick of lashes at the outer corner. Shown as the
 * eye closes (see the blink in designerExpressions.ts), because an open eye
 * squashed flat is only a faint smear, never the clean line a drawn
 * character closes its eyes with. `smile` bows the line up instead, the
 * closed, laughing eyes of a big smile.
 */
export function paintClosedEye(irisHex: string, smile = false): THREE.CanvasTexture {
  const [element, g] = canvas(256, 256);
  g.fillStyle = mix(irisHex, "#1a1214", 0.82);
  if (smile) {
    taperedLine(g, [[40, 160], [80, 96], [172, 92], [222, 150]], 5, 15, 0.5);
    taperedLine(g, [[210, 128], [226, 124], [238, 116], [248, 104]], 7, 2, 0.5);
  } else {
    taperedLine(g, [[34, 140], [80, 168], [176, 170], [228, 132]], 4, 16, 0.5);
    taperedLine(g, [[214, 146], [228, 150], [238, 156], [248, 166]], 8, 2, 0.5);
  }
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
