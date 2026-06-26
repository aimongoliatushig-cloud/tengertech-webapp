import "server-only";

import sharp from "sharp";

// Бүх зураг upload-ыг сервер тал дээр автоматаар жижигрүүлж DB багтаамжийг хэмнэнэ.
// Зураг биш файл (PDF, аудио, документ) хэвээрээ дамжина.

const MAX_IMAGE_EDGE = 1280;
const JPEG_QUALITY = 70;
const MIN_COMPRESS_BYTES = 180_000;

export type PreparedUpload = {
  base64: string;
  mimeType: string;
  filename: string;
};

function isCompressibleImage(mimeType: string) {
  const type = (mimeType || "").toLowerCase();
  if (type === "image/gif" || type === "image/svg+xml") {
    return false;
  }
  return (
    type.startsWith("image/") ||
    type === "" // mimetype тодорхойгүй ч sharp таних боломжтой
  );
}

function replaceExtension(name: string, extension: string) {
  const trimmed = (name || "").trim() || "upload";
  const dotIndex = trimmed.lastIndexOf(".");
  return `${dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed}${extension}`;
}

export async function prepareUploadFromBuffer(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<PreparedUpload> {
  const fallbackMime = mimeType || "application/octet-stream";
  if (!isCompressibleImage(mimeType)) {
    return { base64: buffer.toString("base64"), mimeType: fallbackMime, filename };
  }

  try {
    const image = sharp(buffer, { failOn: "none" });
    const meta = await image.metadata();
    // sharp танихгүй (зураг биш) бол хэвээр нь
    if (!meta.format || meta.format === "gif" || meta.format === "svg") {
      return { base64: buffer.toString("base64"), mimeType: fallbackMime, filename };
    }

    const longestEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
    const needsCompression = buffer.length >= MIN_COMPRESS_BYTES || longestEdge > MAX_IMAGE_EDGE;
    if (!needsCompression) {
      return { base64: buffer.toString("base64"), mimeType: mimeType || `image/${meta.format}`, filename };
    }

    const compressed = await image
      .rotate() // EXIF чиглэлийг хадгална (утасны зураг)
      .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    // Шахсан нь том болсон бол эх хувийг үлдээнэ
    if (compressed.length >= buffer.length) {
      return { base64: buffer.toString("base64"), mimeType: mimeType || `image/${meta.format}`, filename };
    }

    return {
      base64: compressed.toString("base64"),
      mimeType: "image/jpeg",
      filename: replaceExtension(filename, ".jpg"),
    };
  } catch {
    // sharp алдвал эх хувийг хэвээр хадгална (upload бүтэлгүйтэхгүй)
    return { base64: buffer.toString("base64"), mimeType: fallbackMime, filename };
  }
}

export async function prepareUploadFromFile(file: File): Promise<PreparedUpload> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return prepareUploadFromBuffer(buffer, file.type, file.name);
}

// Олон attachment үүсгэгчийн нийтлэг хэлбэр: { name, mimeType, base64 }.
export async function prepareAttachment(
  file: File,
): Promise<{ name: string; mimeType: string; base64: string }> {
  const prepared = await prepareUploadFromFile(file);
  return { name: prepared.filename, mimeType: prepared.mimeType, base64: prepared.base64 };
}
