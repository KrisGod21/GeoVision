import { describe, expect, it } from "vitest";
import { expandRect, mapRectToCover } from "./coverFit";

const FRAME = { width: 1280, height: 720 };
/** The watermark, measured from the frames: 48x48 at (1136, 576). */
const WATERMARK = { left: 1136, top: 576, width: 48, height: 48 };

describe("mapRectToCover", () => {
  it("is the identity when the container matches the source exactly", () => {
    expect(mapRectToCover(FRAME, FRAME, WATERMARK)).toEqual(WATERMARK);
  });

  it("scales uniformly when the aspect ratio matches", () => {
    const result = mapRectToCover(FRAME, { width: 2560, height: 1440 }, WATERMARK);
    expect(result).toEqual({ left: 2272, top: 1152, width: 96, height: 96 });
  });

  it("crops the sides on a container taller than the source", () => {
    // Container is 720x720. Cover scales by height (1.0), so the 1280-wide
    // frame overflows horizontally by 560px, 280 each side.
    const result = mapRectToCover(FRAME, { width: 720, height: 720 }, WATERMARK);
    expect(result.left).toBeCloseTo(1136 - 280, 5);
    expect(result.top).toBeCloseTo(576, 5);
    expect(result.width).toBeCloseTo(48, 5);
  });

  it("crops the top and bottom on a container wider than the source", () => {
    // 2560x720: cover scales by width (2.0), so height becomes 1440 and
    // overflows by 720, i.e. 360 off the top.
    const result = mapRectToCover(FRAME, { width: 2560, height: 720 }, WATERMARK);
    expect(result.left).toBeCloseTo(2272, 5);
    expect(result.top).toBeCloseTo(1152 - 360, 5);
    expect(result.width).toBeCloseTo(96, 5);
  });

  it("keeps the overlay square when the source rect is square", () => {
    for (const container of [
      { width: 1920, height: 1080 },
      { width: 800, height: 1200 },
      { width: 3440, height: 1440 },
      { width: 375, height: 812 },
    ]) {
      const result = mapRectToCover(FRAME, container, WATERMARK);
      expect(result.width).toBeCloseTo(result.height, 6);
    }
  });

  it("tracks the same relative point across wildly different viewports", () => {
    // The centre of the mapped rect must always correspond to the same point
    // of the image, which is what stops the cover drifting off the watermark.
    const centreOf = (c: { width: number; height: number }) => {
      const r = mapRectToCover(FRAME, c, WATERMARK);
      const scale = Math.max(c.width / FRAME.width, c.height / FRAME.height);
      // Convert back into source coordinates.
      const offsetX = (c.width - FRAME.width * scale) / 2;
      const offsetY = (c.height - FRAME.height * scale) / 2;
      return {
        x: (r.left + r.width / 2 - offsetX) / scale,
        y: (r.top + r.height / 2 - offsetY) / scale,
      };
    };

    for (const container of [
      { width: 1920, height: 1080 },
      { width: 1024, height: 1366 },
      { width: 3440, height: 1440 },
      { width: 360, height: 640 },
    ]) {
      const centre = centreOf(container);
      expect(centre.x).toBeCloseTo(1160, 3);
      expect(centre.y).toBeCloseTo(600, 3);
    }
  });

  it("returns an empty rect for a degenerate source rather than dividing by zero", () => {
    expect(mapRectToCover({ width: 0, height: 0 }, FRAME, WATERMARK)).toEqual({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    });
  });

  it("handles a zero-sized container without producing NaN", () => {
    const result = mapRectToCover(FRAME, { width: 0, height: 0 }, WATERMARK);
    for (const value of Object.values(result)) expect(Number.isNaN(value)).toBe(false);
  });
});

describe("expandRect", () => {
  it("grows about the centre, leaving the centre fixed", () => {
    const rect = { left: 100, top: 100, width: 48, height: 48 };
    const grown = expandRect(rect, 2);

    expect(grown.width).toBe(96);
    expect(grown.height).toBe(96);
    expect(grown.left + grown.width / 2).toBe(rect.left + rect.width / 2);
    expect(grown.top + grown.height / 2).toBe(rect.top + rect.height / 2);
  });

  it("is a no-op at factor 1", () => {
    const rect = { left: 10, top: 20, width: 30, height: 40 };
    expect(expandRect(rect, 1)).toEqual(rect);
  });
});
