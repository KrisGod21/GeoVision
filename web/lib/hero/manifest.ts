/**
 * Shape of the generated hero manifest, plus the helpers that turn it into the
 * URLs the loader consumes.
 *
 * `files` holds distinct images; `sequence` maps each timeline position onto
 * one of them. They differ because 34 of the 180 source frames are byte
 * identical to their predecessor -- see the asset script for the measurement.
 */

export interface FrameSet {
  dir: string;
  /** Distinct image filenames. */
  files: string[];
  /** sequence[timelinePosition] = index into files. */
  sequence: number[];
  width: number;
  height: number;
}

export interface HeroManifest {
  desktop: FrameSet;
  mobile: FrameSet;
  modelOutput: { src: string; width: number; height: number };
}

/** Absolute URLs for the distinct images in a frame set, in load order. */
export function frameSrcs(set: FrameSet): string[] {
  return set.files.map((name) => `${set.dir}/${name}`);
}

/** Number of scrub positions, which is larger than the number of images. */
export function timelineLength(set: FrameSet): number {
  return set.sequence.length;
}
