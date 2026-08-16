/**
 * Pure scroll-scrub maths for the hero. No DOM, no React, no canvas.
 *
 * Everything here is deterministic and unit tested, because the failure modes
 * (off-by-one at the last frame, pins snapping in all at once on a flick) are
 * exactly the kind that are painful to catch by eye.
 */

/**
 * Fraction of the pinned section spent scrubbing frames. The remainder is a
 * hold, during which the frame stays on the last image while the model-output
 * panel and its pins are revealed.
 */
export const SCRUB_END = 0.82;

/** Reveal progress at which each pin appears. Must stay ascending. */
export const PIN_THRESHOLDS = {
  buildings: 0.5,
  roads: 0.65,
  water: 0.8,
} as const;

export type PinName = keyof typeof PIN_THRESHOLDS;

/** Render and reveal order. */
export const PIN_ORDER: readonly PinName[] = ["buildings", "roads", "water"];

/**
 * Damping factors, expressed as the fraction of remaining distance covered in
 * one 60fps frame.
 *
 * The scrub is snappy so frames stay glued to the scroll position. The reveal
 * is deliberately slower: it is what keeps the three pins staggered when the
 * user flicks through the whole section in a single gesture.
 *
 * The reveal value is not arbitrary. At 0.08 the first two pins land only four
 * frames apart on a hard flick, which reads as a simultaneous pop; 0.05 spaces
 * them roughly 7 and 11 frames apart while still settling in about a second.
 * The flick tests in scrub.test.ts enforce both ends of that trade-off.
 */
export const SCRUB_DAMPING = 0.25;
export const REVEAL_DAMPING = 0.05;

/** A frame delta longer than this is treated as this long. */
const MAX_FRAME_DELTA_MS = 50;
const REFERENCE_FRAME_MS = 1000 / 60;

/** Below this remaining distance, snap: otherwise the rAF loop never settles. */
const SNAP_EPSILON = 1e-6;

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export interface SplitProgress {
  /** 0..1 across the frame sequence. Reaches 1 at SCRUB_END and stays there. */
  scrubProgress: number;
  /** 0..1 across the reveal. Stays 0 until SCRUB_END. */
  revealProgress: number;
}

/**
 * Splits raw scroll progress through the pinned section into its two phases.
 *
 * The hold exists because the reveal panel plus three staggered pins need real
 * scroll distance to read; compressed into the tail of the scrub they flash
 * past.
 */
export function splitProgress(raw: number, scrubEnd: number = SCRUB_END): SplitProgress {
  const clamped = clamp01(raw);
  return {
    scrubProgress: clamp01(clamped / scrubEnd),
    revealProgress: clamp01((clamped - scrubEnd) / (1 - scrubEnd)),
  };
}

/**
 * Maps scrub progress onto a timeline position in the frame sequence.
 *
 * Note this returns a timeline position, not an image index -- duplicated
 * frames share one image, and that mapping lives in the manifest's `sequence`.
 */
export function progressToFrameIndex(scrubProgress: number, frameCount: number): number {
  if (frameCount <= 1) return 0;
  const raw = Math.floor(clamp01(scrubProgress) * frameCount);
  return Math.min(frameCount - 1, raw);
}

/** Which pins are visible at a given reveal progress, as a full record. */
export function pinVisibility(revealProgress: number): Record<PinName, boolean> {
  return {
    buildings: revealProgress >= PIN_THRESHOLDS.buildings,
    roads: revealProgress >= PIN_THRESHOLDS.roads,
    water: revealProgress >= PIN_THRESHOLDS.water,
  };
}

/** Visible pins, in reveal order. */
export function visiblePins(revealProgress: number): PinName[] {
  const visible = pinVisibility(revealProgress);
  return PIN_ORDER.filter((name) => visible[name]);
}

/**
 * One step of exponential smoothing toward a target.
 *
 * This is what makes fast scrolling degrade gracefully. Progress is sampled
 * once per animation frame, so a hard flick can move raw progress from 0.2 to
 * 1.0 between two samples -- crossing all three pin thresholds at once. Driving
 * rendering from a damped value instead means the value moves continuously, so
 * thresholds are always crossed in order and the stagger survives any gesture
 * speed.
 *
 * `deltaMs` makes the result frame-rate independent: without it the hero would
 * animate at more than double speed on a 144Hz display. Large deltas (a
 * backgrounded tab being restored) are capped, since an uncapped delta
 * degenerates into an instant snap and loses the stagger entirely.
 */
export function dampStep(
  current: number,
  target: number,
  perFrameFactor: number,
  deltaMs: number = REFERENCE_FRAME_MS
): number {
  if (Math.abs(target - current) < SNAP_EPSILON) return target;

  const k = clamp01(perFrameFactor);
  if (k >= 1) return target;

  const frames = Math.min(deltaMs, MAX_FRAME_DELTA_MS) / REFERENCE_FRAME_MS;
  const factor = 1 - Math.pow(1 - k, frames);

  return current + (target - current) * factor;
}

/**
 * The closest loaded image to the one we want to draw.
 *
 * During progressive loading the target image may not have arrived yet. Drawing
 * a nearby frame is far better than drawing nothing -- the canvas is never
 * blank once the initial preload completes. Ties prefer the lower index, which
 * is the frame more likely to still be decoded since loading runs in order.
 *
 * Returns null only when nothing at all has loaded.
 */
export function nearestLoadedIndex(target: number, loaded: ReadonlySet<number>): number | null {
  if (loaded.size === 0) return null;
  if (loaded.has(target)) return target;

  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const index of loaded) {
    const distance = Math.abs(index - target);
    if (distance < bestDistance || (distance === bestDistance && index < (best ?? Infinity))) {
      best = index;
      bestDistance = distance;
    }
  }

  return best;
}
