import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, extensionOf, formatBytes, validateUpload } from "./upload";

const file = (name: string, size = 1024) => ({ name, size });

describe("extensionOf", () => {
  it("lowercases the extension", () => {
    expect(extensionOf("VILLAGE.PNG")).toBe(".png");
  });

  it("uses the last dot, not the first", () => {
    expect(extensionOf("survey.2026.03.tif")).toBe(".tif");
  });

  it("returns empty for a file with no extension", () => {
    expect(extensionOf("orthophoto")).toBe("");
  });
});

describe("validateUpload", () => {
  it.each([".png", ".jpg", ".jpeg", ".webp"])("accepts %s as previewable", (extension) => {
    const result = validateUpload(file(`village${extension}`));
    expect(result).toEqual({ ok: true, previewable: true });
  });

  it.each([".tif", ".tiff"])("accepts %s but not as previewable", (extension) => {
    // The browser cannot decode GeoTIFF, so the UI must know to show a
    // placeholder rather than a broken thumbnail.
    const result = validateUpload(file(`village${extension}`));
    expect(result).toEqual({ ok: true, previewable: false });
  });

  it.each(["notes.txt", "archive.zip", "model.onnx", "orthophoto"])(
    "rejects %s",
    (name) => {
      const result = validateUpload(file(name));
      expect(result.ok).toBe(false);
    }
  );

  it("rejects an empty file", () => {
    const result = validateUpload(file("village.png", 0));
    expect(result).toEqual({ ok: false, reason: "That file is empty." });
  });

  it("accepts a file exactly at the limit", () => {
    expect(validateUpload(file("village.png", MAX_UPLOAD_BYTES)).ok).toBe(true);
  });

  it("rejects a file one byte over the limit", () => {
    expect(validateUpload(file("village.png", MAX_UPLOAD_BYTES + 1)).ok).toBe(false);
  });

  it("names the actual size in the rejection so the user can act on it", () => {
    const result = validateUpload(file("village.png", 80 * 1024 * 1024));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("80.0 MB");
  });

  it("is case insensitive about extensions", () => {
    expect(validateUpload(file("VILLAGE.PNG")).ok).toBe(true);
  });
});

describe("formatBytes", () => {
  it("formats bytes, kilobytes and megabytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
