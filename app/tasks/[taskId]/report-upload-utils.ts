"use client";

type CompressionResult = {
  changed: boolean;
  count: number;
  beforeBytes: number;
  afterBytes: number;
};

const MAX_IMAGE_EDGE = 1280;
const MIN_COMPRESS_BYTES = 180_000;
const JPEG_QUALITY = 0.7;

function bytesOf(files: File[]) {
  return files.reduce((total, file) => total + file.size, 0);
}

function replaceExtension(name: string, extension: string) {
  const trimmed = name.trim() || "report-image";
  const dotIndex = trimmed.lastIndexOf(".");
  return `${dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed}${extension}`;
}

async function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

function getScaledSize(sourceWidth: number, sourceHeight: number) {
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

async function drawCompressedImage(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
) {
  const { width, height } = getScaledSize(sourceWidth, sourceHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  return canvasBlob(canvas, "image/jpeg", JPEG_QUALITY);
}

async function loadBitmap(file: File) {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImageFile(file: File) {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return file;
  }

  try {
    const bitmap = await loadBitmap(file);
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    const shouldCompress =
      file.size >= MIN_COMPRESS_BYTES || Math.max(sourceWidth, sourceHeight) > MAX_IMAGE_EDGE;
    if (!shouldCompress) {
      if ("close" in bitmap && typeof bitmap.close === "function") {
        bitmap.close();
      }
      return file;
    }

    const blob = await drawCompressedImage(bitmap, sourceWidth, sourceHeight);

    if ("close" in bitmap && typeof bitmap.close === "function") {
      bitmap.close();
    }

    if (!blob || blob.size >= file.size) {
      return file;
    }

    return new File([blob], replaceExtension(file.name, ".jpg"), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn("[report-upload] image compression skipped", {
      name: file.name,
      size: file.size,
      error,
    });
    return file;
  }
}

export async function createCompressedCameraImageFile(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  name: string,
) {
  const blob = await drawCompressedImage(source, sourceWidth, sourceHeight);
  if (!blob) {
    return null;
  }

  return new File([blob], replaceExtension(name, ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

export async function compressInputImages(input: HTMLInputElement): Promise<CompressionResult> {
  const files = Array.from(input.files ?? []);
  if (!files.length) {
    return { changed: false, count: 0, beforeBytes: 0, afterBytes: 0 };
  }

  const compressedFiles = await Promise.all(files.map((file) => compressImageFile(file)));
  const beforeBytes = bytesOf(files);
  const afterBytes = bytesOf(compressedFiles);
  const changed = compressedFiles.some((file, index) => file !== files[index]);

  if (changed) {
    const dataTransfer = new DataTransfer();
    compressedFiles.forEach((file) => dataTransfer.items.add(file));
    input.files = dataTransfer.files;
  }

  return {
    changed,
    count: compressedFiles.length,
    beforeBytes,
    afterBytes,
  };
}
