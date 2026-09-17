/**
 * Re-encodes a picked image before it is uploaded.
 *
 * Every image placed in a world is stored in the deployment's own Workers KV
 * namespace, which on the free tier is 1GB in total for avatars, models and
 * pictures together. A phone photo is 4-8MB and a screenshot of a slide is
 * often several hundred KB of PNG — at that size a few dozen pictures would
 * be a meaningful share of the whole budget, for a texture nobody will ever
 * see at more than a couple of metres.
 *
 * So the browser does the work: downscale to at most MAX_EDGE on the long
 * side, encode as WebP, and step the quality down until it fits the target.
 * The result is typically 100-400KB, which is both a smaller KV footprint
 * and a faster texture upload for everyone in the room.
 *
 * Animated GIFs are passed through untouched — canvas encoding would flatten
 * them to a single frame, and a GIF small enough to accept is small anyway.
 */

/** Longest edge kept, in pixels. Beyond this is invisible on a wall panel. */
const MAX_EDGE = 2048;
/** What the quality ladder aims for. Not a hard cap — see the worker's. */
const TARGET_BYTES = 500 * 1024;
const QUALITY_LADDER = [0.86, 0.75, 0.64, 0.52, 0.4];

export interface CompressedImage {
  blob: Blob;
  /** Filename to report to the server, with the encoded extension. */
  name: string;
  width: number;
  height: number;
}

export async function compressImage(file: File): Promise<CompressedImage> {
  if (file.type === "image/gif") {
    const size = await imageSize(file);
    return { blob: file, name: file.name, ...size };
  }

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot re-encode images.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap) bitmap.close();

  let encoded: Blob | null = null;
  for (const quality of QUALITY_LADDER) {
    encoded = await toBlob(canvas, "image/webp", quality);
    // A browser without WebP encoding silently hands back a PNG, which the
    // ladder can't shrink — take what it gave and stop.
    if (!encoded || encoded.type !== "image/webp") break;
    if (encoded.size <= TARGET_BYTES) break;
  }
  if (!encoded) throw new Error("This image could not be re-encoded.");

  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  const extension = encoded.type === "image/webp" ? "webp" : "png";
  return { blob: encoded, name: `${base}.${extension}`, width, height };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through: some browsers refuse certain encodings here but can
      // still decode the same file through an <img>.
    }
  }
  return loadImageElement(file);
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    image.src = url;
  });
}

async function imageSize(file: File): Promise<{ width: number; height: number }> {
  const image = await loadImageElement(file);
  return { width: image.naturalWidth || 1, height: image.naturalHeight || 1 };
}
