import * as THREE from "three";

/**
 * Materials for the built-in world, including textures drawn with a 2D
 * canvas at startup.
 *
 * Drawing them in code keeps the "no bundled 3D assets" property of this
 * project (see THIRD_PARTY_ASSETS.md) while still giving the room wood
 * grain, tatami weave and plaster instead of flat blocks of colour. They
 * are small (256–512px, greyscale-ish patterns tinted by the material's
 * own colour) and built once per page.
 *
 * Everything here is a single shared instance: the room has a few hundred
 * meshes, and giving each one its own material and texture would upload
 * the same data to the GPU over and over.
 */

const canvasAvailable = () => typeof document !== "undefined" && typeof document.createElement === "function";

function drawTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, repeat: [number, number]) {
  if (!canvasAvailable()) return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 4;
  return texture;
}

/** Plank floor: seams across the tile plus a little lengthwise grain. */
function plankTexture(repeat: [number, number]) {
  return drawTexture(
    512,
    (ctx, size) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      const planks = 4;
      const plankHeight = size / planks;
      for (let i = 0; i < planks; i++) {
        const shade = 236 + ((i * 37) % 18);
        ctx.fillStyle = `rgb(${shade},${shade - 2},${shade - 6})`;
        ctx.fillRect(0, i * plankHeight, size, plankHeight - 1);
        // Seam between planks.
        ctx.fillStyle = "rgba(120,92,64,0.35)";
        ctx.fillRect(0, i * plankHeight + plankHeight - 2, size, 2);
        // Grain.
        ctx.strokeStyle = "rgba(140,108,74,0.16)";
        ctx.lineWidth = 1;
        for (let g = 0; g < 7; g++) {
          const y = i * plankHeight + 6 + ((g * 53) % (plankHeight - 12));
          ctx.beginPath();
          ctx.moveTo(0, y);
          for (let x = 0; x <= size; x += 32) ctx.lineTo(x, y + Math.sin((x + i * 90 + g * 17) / 40) * 1.6);
          ctx.stroke();
        }
        // Short end joint, offset per row so it reads as staggered boards.
        ctx.fillStyle = "rgba(120,92,64,0.3)";
        ctx.fillRect(((i * 137) % size), i * plankHeight, 2, plankHeight - 2);
      }
    },
    repeat
  );
}

/** Tatami: woven strands with a stitched border on two edges. */
function tatamiTexture(repeat: [number, number]) {
  return drawTexture(
    256,
    (ctx, size) => {
      ctx.fillStyle = "#f3f1dd";
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = "rgba(150,150,110,0.35)";
      ctx.lineWidth = 2;
      for (let i = 0; i < size; i += 6) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(size, i);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(120,124,86,0.18)";
      for (let i = 0; i < size; i += 24) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, size);
        ctx.stroke();
      }
    },
    repeat
  );
}

/** Plaster: faint mottling so large walls aren't dead flat. */
function plasterTexture() {
  return drawTexture(
    256,
    (ctx, size) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 2600; i++) {
        const x = (i * 97) % size;
        const y = (i * 61) % size;
        ctx.fillStyle = i % 3 === 0 ? "rgba(214,206,190,0.5)" : "rgba(255,255,255,0.5)";
        ctx.fillRect(x, y, 2, 2);
      }
    },
    [3, 2]
  );
}

export interface WorldMaterials {
  hallFloor: THREE.Material;
  classroomFloor: THREE.Material;
  corridorFloor: THREE.Material;
  wall: THREE.Material;
  wainscot: THREE.Material;
  trim: THREE.Material;
  beam: THREE.Material;
  tatami: THREE.Material;
  tatamiBorder: THREE.Material;
  furnitureLight: THREE.Material;
  furnitureWarm: THREE.Material;
  furnitureTop: THREE.Material;
  metal: THREE.Material;
  board: THREE.Material;
  glass: THREE.Material;
  lantern: THREE.Material;
  paper: THREE.Material;
  planter: THREE.Material;
  foliage: THREE.Material;
  foliageDark: THREE.Material;
  ceiling: THREE.Material;
  accentRed: THREE.Material;
  accentBlue: THREE.Material;
}

let cached: WorldMaterials | null = null;

export function getWorldMaterials(): WorldMaterials {
  if (cached) return cached;

  const plaster = plasterTexture();
  const standard = (color: string, options: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...options });

  cached = {
    hallFloor: standard("#c89a6a", { map: plankTexture([9, 8]), roughness: 0.62 }),
    classroomFloor: standard("#d6b184", { map: plankTexture([7, 6]), roughness: 0.6 }),
    corridorFloor: standard("#c08f61", { map: plankTexture([2, 3]), roughness: 0.68 }),
    wall: standard("#f5efe3", { map: plaster, roughness: 0.92 }),
    wainscot: standard("#c08b5c", { roughness: 0.7 }),
    trim: standard("#9d6a41", { roughness: 0.62 }),
    beam: standard("#8d5f39", { roughness: 0.68 }),
    tatami: standard("#cfd39f", { map: tatamiTexture([4, 3]), roughness: 0.9 }),
    tatamiBorder: standard("#5f6f42", { roughness: 0.8 }),
    furnitureLight: standard("#d9b482", { roughness: 0.6 }),
    furnitureWarm: standard("#b3763f", { roughness: 0.6 }),
    furnitureTop: standard("#e7cfa6", { roughness: 0.5 }),
    metal: standard("#9aa3ab", { roughness: 0.4, metalness: 0.25 }),
    board: standard("#3d6152", { roughness: 0.85 }),
    // Faintly lit from within, so the panes glow with the low sun outside
    // instead of reading as flat blue slabs.
    glass: new THREE.MeshStandardMaterial({
      color: "#ffe2bd",
      roughness: 0.1,
      transparent: true,
      opacity: 0.45,
      emissive: new THREE.Color("#ffbc73"),
      emissiveIntensity: 0.55,
      side: THREE.DoubleSide,
    }),
    lantern: new THREE.MeshStandardMaterial({ color: "#fff1d2", emissive: new THREE.Color("#ffce85"), emissiveIntensity: 0.9, roughness: 0.6 }),
    // Double-sided: a sheet of paper is a flat plane, and from behind a
    // single-sided one simply isn't there.
    paper: standard("#fbf6ea", { roughness: 0.95, side: THREE.DoubleSide }),
    planter: standard("#c1714f", { roughness: 0.8 }),
    foliage: standard("#6f9f56", { roughness: 0.9 }),
    foliageDark: standard("#557f43", { roughness: 0.9 }),
    ceiling: standard("#f8f3e8", { roughness: 0.95 }),
    accentRed: standard("#c2564c", { roughness: 0.7 }),
    accentBlue: standard("#4f86b8", { roughness: 0.7 }),
  };
  return cached;
}
