import { describe, expect, it } from "vitest";
import {
  PIN_ORDER,
  PIN_THRESHOLDS,
  REVEAL_DAMPING,
  SCRUB_DAMPING,
  SCRUB_END,
  clamp01,
  dampStep,
  nearestLoadedIndex,
  pinVisibility,
  progressToFrameIndex,
  splitProgress,
  visiblePins,
} from "./scrub";

describe("clamp01", () => {
  it("passes through values already in range", () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.42)).toBe(0.42);
    expect(clamp01(1)).toBe(1);
  });

  it("clamps out-of-range values", () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(7)).toBe(1);
  });

  it("treats NaN as 0 rather than propagating it into a frame index", () => {
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

describe("progressToFrameIndex", () => {
  it("maps the start of the scrub to the first frame", () => {
    expect(progressToFrameIndex(0, 180)).toBe(0);
  });

  it("maps the end of the scrub to the last frame, not out of bounds", () => {
    expect(progressToFrameIndex(1, 180)).toBe(179);
  });

  it("maps the midpoint to the middle of the sequence", () => {
    expect(progressToFrameIndex(0.5, 180)).toBe(90);
  });

  it("never returns an index outside the sequence for any input", () => {
    for (const p of [-5, -0.001, 0, 0.333, 0.999, 1, 1.001, 42, Number.NaN]) {
      const index = progressToFrameIndex(p, 180);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(179);
      expect(Number.isInteger(index)).toBe(true);
    }
  });

  it("advances monotonically across the whole range", () => {
    let previous = -1;
    for (let step = 0; step <= 1000; step++) {
      const index = progressToFrameIndex(step / 1000, 180);
      expect(index).toBeGreaterThanOrEqual(previous);
      previous = index;
    }
  });

  it("visits every frame when stepped finely enough", () => {
    const seen = new Set<number>();
    for (let step = 0; step <= 10_000; step++) {
      seen.add(progressToFrameIndex(step / 10_000, 180));
    }
    expect(seen.size).toBe(180);
  });

  it("handles a single-frame sequence without dividing by zero", () => {
    expect(progressToFrameIndex(0, 1)).toBe(0);
    expect(progressToFrameIndex(1, 1)).toBe(0);
  });
});

describe("splitProgress", () => {
  it("puts raw 0 at the very start of the scrub with no reveal", () => {
    expect(splitProgress(0)).toEqual({ scrubProgress: 0, revealProgress: 0 });
  });

  it("completes the scrub exactly at the hold boundary", () => {
    const { scrubProgress, revealProgress } = splitProgress(SCRUB_END);
    expect(scrubProgress).toBeCloseTo(1, 10);
    expect(revealProgress).toBe(0);
  });

  it("completes the reveal at raw 1", () => {
    const { scrubProgress, revealProgress } = splitProgress(1);
    expect(scrubProgress).toBe(1);
    expect(revealProgress).toBeCloseTo(1, 10);
  });

  it("holds the scrub at its end for every raw value inside the hold window", () => {
    for (let raw = SCRUB_END; raw <= 1; raw += 0.005) {
      expect(splitProgress(raw).scrubProgress).toBeCloseTo(1, 10);
    }
  });

  it("holds the frame index on the last frame throughout the hold window", () => {
    for (let raw = SCRUB_END; raw <= 1; raw += 0.005) {
      const { scrubProgress } = splitProgress(raw);
      expect(progressToFrameIndex(scrubProgress, 180)).toBe(179);
    }
  });

  it("keeps the reveal at zero for the entire scrub phase", () => {
    for (let raw = 0; raw < SCRUB_END; raw += 0.01) {
      expect(splitProgress(raw).revealProgress).toBe(0);
    }
  });

  it("maps the hold window linearly onto the reveal", () => {
    // Halfway through the 0.82 -> 1.0 window is reveal 0.5.
    const midpoint = SCRUB_END + (1 - SCRUB_END) / 2;
    expect(splitProgress(midpoint).revealProgress).toBeCloseTo(0.5, 10);
  });

  it("clamps raw values outside 0..1", () => {
    expect(splitProgress(-2)).toEqual({ scrubProgress: 0, revealProgress: 0 });
    const beyond = splitProgress(5);
    expect(beyond.scrubProgress).toBe(1);
    expect(beyond.revealProgress).toBe(1);
  });

  it("produces monotonic reveal progress", () => {
    let previous = -1;
    for (let step = 0; step <= 1000; step++) {
      const { revealProgress } = splitProgress(step / 1000);
      expect(revealProgress).toBeGreaterThanOrEqual(previous);
      previous = revealProgress;
    }
  });
});

describe("pinVisibility", () => {
  it("shows nothing at the start of the reveal", () => {
    expect(visiblePins(0)).toEqual([]);
  });

  it("shows each pin at its own threshold", () => {
    expect(visiblePins(PIN_THRESHOLDS.buildings)).toEqual(["buildings"]);
    expect(visiblePins(PIN_THRESHOLDS.roads)).toEqual(["buildings", "roads"]);
    expect(visiblePins(PIN_THRESHOLDS.water)).toEqual(["buildings", "roads", "water"]);
  });

  it("does not show a pin just below its threshold", () => {
    expect(visiblePins(PIN_THRESHOLDS.buildings - 0.001)).toEqual([]);
    expect(visiblePins(PIN_THRESHOLDS.roads - 0.001)).toEqual(["buildings"]);
    expect(visiblePins(PIN_THRESHOLDS.water - 0.001)).toEqual(["buildings", "roads"]);
  });

  it("shows all three by the end of the reveal", () => {
    expect(visiblePins(1)).toEqual(["buildings", "roads", "water"]);
  });

  it("declares thresholds in ascending order, so pins can only appear in order", () => {
    const thresholds = PIN_ORDER.map((name) => PIN_THRESHOLDS[name]);
    const ascending = [...thresholds].sort((a, b) => a - b);
    expect(thresholds).toEqual(ascending);
  });

  it("never un-reveals a pin as the reveal advances", () => {
    let previousCount = 0;
    for (let step = 0; step <= 1000; step++) {
      const count = visiblePins(step / 1000).length;
      expect(count).toBeGreaterThanOrEqual(previousCount);
      previousCount = count;
    }
  });

  it("returns a full record for rendering, not just the visible subset", () => {
    expect(pinVisibility(PIN_THRESHOLDS.roads)).toEqual({
      buildings: true,
      roads: true,
      water: false,
    });
  });
});

describe("dampStep", () => {
  const FRAME = 1000 / 60;

  it("moves toward the target", () => {
    expect(dampStep(0, 1, 0.25, FRAME)).toBeGreaterThan(0);
    expect(dampStep(0, 1, 0.25, FRAME)).toBeLessThan(1);
  });

  it("never overshoots the target", () => {
    let current = 0;
    for (let i = 0; i < 500; i++) {
      current = dampStep(current, 1, 0.25, FRAME);
      expect(current).toBeLessThanOrEqual(1);
    }
  });

  it("never overshoots when moving downward either", () => {
    let current = 1;
    for (let i = 0; i < 500; i++) {
      current = dampStep(current, 0, 0.25, FRAME);
      expect(current).toBeGreaterThanOrEqual(0);
    }
  });

  it("converges to the target", () => {
    let current = 0;
    for (let i = 0; i < 500; i++) current = dampStep(current, 1, 0.25, FRAME);
    expect(current).toBeCloseTo(1, 6);
  });

  it("snaps to the target once the remaining distance is imperceptible", () => {
    // Otherwise the rAF loop never terminates and burns battery forever.
    expect(dampStep(1 - 1e-9, 1, 0.25, FRAME)).toBe(1);
  });

  it("is frame-rate independent", () => {
    // 60 steps at 60fps must land in the same place as 120 steps at 120fps,
    // otherwise the hero animates at double speed on a high-refresh display.
    let at60 = 0;
    for (let i = 0; i < 60; i++) at60 = dampStep(at60, 1, 0.12, FRAME);

    let at120 = 0;
    for (let i = 0; i < 120; i++) at120 = dampStep(at120, 1, 0.12, FRAME / 2);

    expect(at120).toBeCloseTo(at60, 3);
  });

  it("clamps absurd frame deltas so a backgrounded tab does not jump", () => {
    // A tab restored after 10s reports a huge delta; without a ceiling the
    // damping degenerates into an instant snap and the stagger is lost.
    const afterStall = dampStep(0, 1, 0.12, 10_000);
    expect(afterStall).toBeLessThan(1);
  });
});

describe("flick-scroll behaviour", () => {
  const FRAME = 1000 / 60;

  /**
   * Simulates the rAF loop for a hard flick: raw progress jumps from 0.2 to 1.0
   * between two samples. Returns, for each simulated frame, which pins are
   * visible.
   */
  function simulateFlick(frames = 240) {
    let damped = 0.2;
    const timeline: string[][] = [];
    for (let i = 0; i < frames; i++) {
      damped = dampStep(damped, 1, REVEAL_DAMPING, FRAME);
      timeline.push(visiblePins(splitProgress(damped).revealProgress));
    }
    return timeline;
  }

  it("does not reveal every pin on the same frame", () => {
    const timeline = simulateFlick();
    let previous = 0;
    for (const pins of timeline) {
      expect(pins.length - previous).toBeLessThanOrEqual(1);
      previous = pins.length;
    }
  });

  it("reveals pins in order even when the user flicks past the whole section", () => {
    const timeline = simulateFlick();
    const appearanceOrder: string[] = [];
    for (const pins of timeline) {
      for (const pin of pins) {
        if (!appearanceOrder.includes(pin)) appearanceOrder.push(pin);
      }
    }
    expect(appearanceOrder).toEqual(["buildings", "roads", "water"]);
  });

  it("spaces the pins far enough apart to read as a stagger", () => {
    // Under ~6 frames (100ms) apart the three pins read as one simultaneous
    // pop, which is the failure this damping exists to prevent.
    const timeline = simulateFlick();
    const firstFrameOf = new Map<string, number>();
    timeline.forEach((pins, frame) => {
      for (const pin of pins) if (!firstFrameOf.has(pin)) firstFrameOf.set(pin, frame);
    });

    const buildings = firstFrameOf.get("buildings")!;
    const roads = firstFrameOf.get("roads")!;
    const water = firstFrameOf.get("water")!;

    expect(roads - buildings).toBeGreaterThanOrEqual(6);
    expect(water - roads).toBeGreaterThanOrEqual(6);
  });

  it("still completes the reveal in a reasonable time after a flick", () => {
    // Graceful degradation cuts both ways: it must not stagger so slowly that
    // a user who has already scrolled past sits waiting for it.
    const timeline = simulateFlick();
    const settledBy = timeline.findIndex((pins) => pins.length === 3);
    expect(settledBy).toBeGreaterThan(0);
    expect(settledBy).toBeLessThan(120); // under 2 seconds at 60fps
  });

  it("crosses every frame index in order during a flick rather than jumping", () => {
    // The same guarantee for the canvas: a flick must not skip from frame 40 to
    // frame 179 in one draw, which would look like a hard cut.
    let damped = 0.2;
    const indices: number[] = [];
    for (let i = 0; i < 240; i++) {
      damped = dampStep(damped, 1, SCRUB_DAMPING, FRAME);
      indices.push(progressToFrameIndex(splitProgress(damped).scrubProgress, 180));
    }

    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
    }
    expect(indices.at(-1)).toBe(179);
  });

  it("reverses cleanly when the user scrolls back up", () => {
    let damped = 1;
    const counts: number[] = [];
    for (let i = 0; i < 240; i++) {
      damped = dampStep(damped, 0, REVEAL_DAMPING, FRAME);
      counts.push(visiblePins(splitProgress(damped).revealProgress).length);
    }

    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
    expect(counts.at(-1)).toBe(0);
  });
});

describe("nearestLoadedIndex", () => {
  it("returns null when nothing has loaded yet", () => {
    expect(nearestLoadedIndex(5, new Set())).toBeNull();
  });

  it("returns the target itself when it is loaded", () => {
    expect(nearestLoadedIndex(5, new Set([3, 5, 9]))).toBe(5);
  });

  it("falls back to the closest loaded frame below the target", () => {
    expect(nearestLoadedIndex(8, new Set([1, 2, 3]))).toBe(3);
  });

  it("falls back to the closest loaded frame above the target", () => {
    expect(nearestLoadedIndex(1, new Set([9, 40]))).toBe(9);
  });

  it("prefers the lower index when two loaded frames are equidistant", () => {
    // Earlier frames are loaded first, so preferring the lower index biases
    // toward the frame more likely to still be in cache.
    expect(nearestLoadedIndex(5, new Set([3, 7]))).toBe(3);
  });

  it("handles a single loaded frame", () => {
    expect(nearestLoadedIndex(100, new Set([0]))).toBe(0);
  });

  it("returns a loaded index for every target across a sparse set", () => {
    const loaded = new Set([0, 10, 20, 137]);
    for (let target = 0; target < 180; target++) {
      const result = nearestLoadedIndex(target, loaded);
      expect(result).not.toBeNull();
      expect(loaded.has(result!)).toBe(true);
    }
  });
});
