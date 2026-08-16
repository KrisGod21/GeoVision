/**
 * Client-side upload validation. Pure, so it is testable and so the rules live
 * in one place rather than being spread through the dropzone component.
 *
 * The server validates independently -- this exists to give immediate feedback,
 * not to be the security boundary.
 */

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Previewable in a browser. */
export const PREVIEWABLE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;

/**
 * Accepted but not previewable. The browser cannot decode GeoTIFF, so these
 * upload and process while showing a placeholder card instead of a thumbnail.
 */
export const RASTER_EXTENSIONS = [".tif", ".tiff"] as const;

export const ACCEPTED_EXTENSIONS = [...PREVIEWABLE_EXTENSIONS, ...RASTER_EXTENSIONS];

export type ValidationResult =
  | { ok: true; previewable: boolean }
  | { ok: false; reason: string };

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

export function validateUpload(file: { name: string; size: number }): ValidationResult {
  const extension = extensionOf(file.name);

  if (!ACCEPTED_EXTENSIONS.includes(extension as (typeof ACCEPTED_EXTENSIONS)[number])) {
    return {
      ok: false,
      reason: `${extension || "That file type"} is not supported. Use ${ACCEPTED_EXTENSIONS.join(", ")}.`,
    };
  }

  if (file.size === 0) {
    return { ok: false, reason: "That file is empty." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    };
  }

  return {
    ok: true,
    previewable: PREVIEWABLE_EXTENSIONS.includes(
      extension as (typeof PREVIEWABLE_EXTENSIONS)[number]
    ),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
