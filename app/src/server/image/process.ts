import "server-only";

import sharp from "sharp";
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/shared/schemas/case-form";

// Image validation and compression (ADR-002 §3.3, ADR-000 TD-09).

export type ImageErrorCode = "FILE_TOO_LARGE" | "UNSUPPORTED_IMAGE" | "IMAGE_UNREADABLE";

export class ImageError extends Error {
  readonly code: ImageErrorCode;

  constructor(code: ImageErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ImageError";
    this.code = code;
  }
}

export interface ProcessedImage {
  mediaType: "image/webp";
  width: number;
  height: number;
  bytes: Buffer;
  dataUrl: string;
}

export const MAX_INPUT_PIXELS = 40_000_000;
export const MAX_OUTPUT_SIDE = 1536;
export const WEBP_QUALITY = 80;

const SNIFFED_FORMATS: ReadonlySet<string> = new Set(["jpeg", "png", "webp"]);

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Validates and compresses an uploaded photo. The first failing step throws ImageError:
 * size, declared type, decode and format sniffing, then normalize, resize, WebP encode.
 * The declared type and the file extension are never trusted for the format decision.
 */
export async function processImage(input: { bytes: Buffer; declaredType: string }): Promise<ProcessedImage> {
  // 1. Size
  if (input.bytes.length > MAX_IMAGE_BYTES) {
    throw new ImageError("FILE_TOO_LARGE");
  }

  // 2. Declared type
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(input.declaredType)) {
    throw new ImageError("UNSUPPORTED_IMAGE");
  }

  // 3. Decode and sniff the real format
  let format: string | undefined;
  try {
    const meta = await sharp(input.bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    format = meta.format;
  } catch (error) {
    if (messageOf(error).includes("unsupported image format")) {
      throw new ImageError("UNSUPPORTED_IMAGE");
    }
    throw new ImageError("IMAGE_UNREADABLE");
  }
  if (format === undefined || !SNIFFED_FORMATS.has(format)) {
    throw new ImageError("UNSUPPORTED_IMAGE");
  }

  // 4-7. Normalize (EXIF orientation, first frame), resize, encode WebP, produce output
  try {
    const { data, info } = await sharp(input.bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .autoOrient()
      .resize({
        width: MAX_OUTPUT_SIDE,
        height: MAX_OUTPUT_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    return {
      mediaType: "image/webp",
      width: info.width,
      height: info.height,
      bytes: data,
      dataUrl: `data:image/webp;base64,${data.toString("base64")}`,
    };
  } catch {
    throw new ImageError("IMAGE_UNREADABLE");
  }
}
