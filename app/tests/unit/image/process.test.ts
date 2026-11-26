import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/shared/schemas/case-form";
import { ImageError, MAX_INPUT_PIXELS, processImage } from "@/server/image/process";

// Real inputs only (AGENTS.md, assets/example-images/README.md). Invalid cases are in-memory
// buffers derived from these real photos; nothing is written to disk and no image is drawn from scratch.
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const EXAMPLES = path.join(REPO_ROOT, "assets/example-images");
const PRD = path.join(REPO_ROOT, "docs/PRD.md");

const real = (name: string): Buffer => readFileSync(path.join(EXAMPLES, name));

/** Resolves to the ImageError code, "NO_ERROR" when processing succeeds, or "OTHER:<msg>" for non-ImageError throws. */
async function outcome(
  bytes: Buffer,
  declaredType: string,
): Promise<{ code: string; result?: Awaited<ReturnType<typeof processImage>> }> {
  try {
    const result = await processImage({ bytes, declaredType });
    return { code: "NO_ERROR", result };
  } catch (error) {
    if (error instanceof ImageError) return { code: error.code };
    return { code: `OTHER:${String(error)}` };
  }
}

describe("test inputs", () => {
  it("finds the real example photos and the PRD", () => {
    for (const name of ["laptop-1.png", "laptop-2.webp", "phone-1.jpg", "phone-2.jpeg", "phone-3.jpeg"]) {
      expect(existsSync(path.join(EXAMPLES, name)), name).toBe(true);
    }
    expect(existsSync(PRD)).toBe(true);
  });
});

describe("processImage: real photos", () => {
  it("converts laptop-1.png (really a JPEG) to WebP, longest side 1536, aspect kept, under 1 MB", async () => {
    const out = await outcome(real("laptop-1.png"), "image/png");
    expect(out.code).toBe("NO_ERROR");
    const result = out.result!;

    const meta = await sharp(result.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(result.mediaType).toBe("image/webp");
    expect(result.height).toBe(1536);
    expect(result.width).toBeGreaterThanOrEqual(1480);
    expect(result.width).toBeLessThanOrEqual(1482);
    expect(meta.width).toBe(result.width);
    expect(meta.height).toBe(result.height);
    expect(result.bytes.length).toBeLessThan(1_000_000);
    expect(result.dataUrl.startsWith("data:image/webp;base64,")).toBe(true);
  });

  it("does not upscale laptop-2.webp (863 x 843) and phone-2.jpeg (387 x 516)", async () => {
    const webp = await outcome(real("laptop-2.webp"), "image/webp");
    expect(webp.code).toBe("NO_ERROR");
    expect([webp.result!.width, webp.result!.height]).toEqual([863, 843]);

    const jpeg = await outcome(real("phone-2.jpeg"), "image/jpeg");
    expect(jpeg.code).toBe("NO_ERROR");
    expect([jpeg.result!.width, jpeg.result!.height]).toEqual([387, 516]);
  });

  it("strips EXIF and orientation from the output of every real photo", async () => {
    for (const [name, type] of [
      ["laptop-1.png", "image/png"],
      ["laptop-2.webp", "image/webp"],
      ["phone-1.jpg", "image/jpeg"],
      ["phone-2.jpeg", "image/jpeg"],
      ["phone-3.jpeg", "image/jpeg"],
    ] as const) {
      const out = await outcome(real(name), type);
      expect(out.code, name).toBe("NO_ERROR");
      const meta = await sharp(out.result!.bytes).metadata();
      expect(meta.exif, name).toBeUndefined();
      expect(meta.orientation, name).toBeUndefined();
    }
  });
});

describe("processImage: derived in-memory inputs", () => {
  // Not testable here (missing prerequisites, no real file in the repo):
  // - a real HEIC photo decoded by sharp as `heif` (the sniffing rule for heif is covered only by the GIF case);
  // - a real animated WebP, to check the first-frame-only rule (ADR-002 §3.3 step 4).

  it("applies EXIF orientation 6 and drops GPS and orientation metadata", async () => {
    const source = await sharp(real("phone-1.jpg")).withMetadata({ orientation: 6 }).withExif({
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "52/1 13/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "21/1 0/1 0/1",
      },
    }).jpeg().toBuffer();

    const derivedMeta = await sharp(source).metadata();
    expect(derivedMeta.orientation).toBe(6);
    expect(derivedMeta.exif).toBeInstanceOf(Buffer);

    const out = await outcome(source, "image/jpeg");
    expect(out.code).toBe("NO_ERROR");
    expect([out.result!.width, out.result!.height]).toEqual([1200, 900]);
    const meta = await sharp(out.result!.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("reports a truncated JPEG (first third of phone-1.jpg) as IMAGE_UNREADABLE", async () => {
    const bytes = real("phone-1.jpg");
    const truncated = bytes.subarray(0, Math.floor(bytes.length / 3));
    expect((await outcome(truncated, "image/jpeg")).code).toBe("IMAGE_UNREADABLE");
  });

  it("rejects bytes above MAX_IMAGE_BYTES with FILE_TOO_LARGE, before decoding", async () => {
    const base = real("phone-2.jpeg");
    const oversized = Buffer.concat([base, Buffer.alloc(MAX_IMAGE_BYTES + 1 - base.length)]);
    expect(oversized.length).toBe(MAX_IMAGE_BYTES + 1);
    expect((await outcome(oversized, "image/jpeg")).code).toBe("FILE_TOO_LARGE");
  });

  it("does not report FILE_TOO_LARGE for bytes of exactly MAX_IMAGE_BYTES", async () => {
    const base = real("phone-2.jpeg");
    const exact = Buffer.concat([base, Buffer.alloc(MAX_IMAGE_BYTES - base.length)]);
    expect(exact.length).toBe(MAX_IMAGE_BYTES);
    const out = await outcome(exact, "image/jpeg");
    expect(out.code).not.toBe("FILE_TOO_LARGE");
  });

  // Decoding a 6400 x 6400 image can take > 5 s under load; the assertion is unchanged.
  it("reports a decoded image above MAX_INPUT_PIXELS as IMAGE_UNREADABLE", { timeout: 30_000 }, async () => {
    const big = await sharp(real("phone-3.jpeg"))
      .resize(6400, 6400, { fit: "fill" })
      .jpeg({ quality: 40 })
      .toBuffer();
    expect(big.length).toBeLessThan(MAX_IMAGE_BYTES);
    expect(6400 * 6400).toBeGreaterThan(MAX_INPUT_PIXELS);
    expect((await outcome(big, "image/jpeg")).code).toBe("IMAGE_UNREADABLE");
  });

  it("sniffs the real format: a GIF declared as image/jpeg is UNSUPPORTED_IMAGE", async () => {
    const gif = await sharp(real("phone-2.jpeg")).gif().toBuffer();
    expect((await sharp(gif).metadata()).format).toBe("gif");
    expect((await outcome(gif, "image/jpeg")).code).toBe("UNSUPPORTED_IMAGE");
  });

  it("treats a non-image file (docs/PRD.md) declared as image/jpeg as UNSUPPORTED_IMAGE", async () => {
    expect((await outcome(readFileSync(PRD), "image/jpeg")).code).toBe("UNSUPPORTED_IMAGE");
  });

  it("rejects an undeclared-accepted type before decoding: image/heic and application/pdf are UNSUPPORTED_IMAGE", async () => {
    const jpeg = real("phone-1.jpg");
    expect((await outcome(jpeg, "image/heic")).code).toBe("UNSUPPORTED_IMAGE");
    expect((await outcome(jpeg, "application/pdf")).code).toBe("UNSUPPORTED_IMAGE");
  });

  it("accepts exactly the shared ACCEPTED_IMAGE_TYPES as declared types", () => {
    expect([...ACCEPTED_IMAGE_TYPES]).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });
});
