import { readFile } from "fs/promises";
import path from "path";

export const MIN_VIDEO_REFERENCE_IMAGE_SIDE = 300;

const PUBLIC_DIR = path.join(process.cwd(), "public");
const DEFAULT_UPLOAD_ROOT = path.join(PUBLIC_DIR, "uploads");

export type ImageDimensions = { width: number; height: number };

export function readImageDimensions(buffer: Buffer, mimeType = ""): ImageDimensions | undefined {
  if ((mimeType === "image/png" || !mimeType) && buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if ((mimeType === "image/jpeg" || mimeType === "image/jpg" || !mimeType) && buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }

  if ((mimeType === "image/webp" || !mimeType) && buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const type = buffer.toString("ascii", 12, 16);
    if (type === "VP8X") return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    if (type === "VP8 ") return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    if (type === "VP8L") {
      const b0 = buffer[21];
      const b1 = buffer[22];
      const b2 = buffer[23];
      const b3 = buffer[24];
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
  }

  return undefined;
}

export function imageDimensionWarning(dimensions?: ImageDimensions) {
  if (!dimensions) return undefined;
  const { width, height } = dimensions;
  if (width < MIN_VIDEO_REFERENCE_IMAGE_SIDE || height < MIN_VIDEO_REFERENCE_IMAGE_SIDE) {
    return `图片尺寸为 ${width}x${height}，视频参考图要求宽高都至少 ${MIN_VIDEO_REFERENCE_IMAGE_SIDE}px。该素材可保存，但不建议直接用于视频生成。`;
  }
  return undefined;
}

export function isSmallReferenceImage(dimensions?: ImageDimensions) {
  return Boolean(dimensions && (dimensions.width < MIN_VIDEO_REFERENCE_IMAGE_SIDE || dimensions.height < MIN_VIDEO_REFERENCE_IMAGE_SIDE));
}

function uploadPathFromUrl(value: string) {
  try {
    const url = new URL(value, "http://local");
    if (!url.pathname.startsWith("/uploads/")) return undefined;
    const relativePath = url.pathname.replace(/^\/uploads\//, "");
    const uploadRoot = process.env.ASSET_STORAGE_DIR || DEFAULT_UPLOAD_ROOT;
    return path.join(uploadRoot, relativePath);
  } catch {
    return undefined;
  }
}

export async function readLocalUploadImageDimensions(url: string) {
  const filePath = uploadPathFromUrl(url);
  if (!filePath) return undefined;
  try {
    return readImageDimensions(await readFile(filePath));
  } catch {
    return undefined;
  }
}
