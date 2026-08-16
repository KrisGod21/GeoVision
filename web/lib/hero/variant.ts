/**
 * Which version of the hero a visitor gets.
 *
 * Chosen once, before any image request, so a phone never downloads the
 * desktop frame set. This is the single most important performance decision in
 * the hero: getting it wrong costs a mobile visitor several megabytes.
 */

export type HeroVariant =
  /** Full 180-position scrub, side-by-side reveal, three pins. */
  | "full"
  /** 30-position scrub at half resolution, reveal stacked below the canvas. */
  | "compact"
  /** No scrub at all: last frame beside the model output, pins already shown. */
  | "static";

export const MOBILE_BREAKPOINT_PX = 768;

export interface VariantEnvironment {
  viewportWidth: number;
  prefersReducedMotion: boolean;
}

export function selectVariant({ viewportWidth, prefersReducedMotion }: VariantEnvironment): HeroVariant {
  // Motion preference wins over everything: a reduced-motion visitor on a
  // desktop still gets the static hero.
  if (prefersReducedMotion) return "static";
  if (viewportWidth < MOBILE_BREAKPOINT_PX) return "compact";
  return "full";
}

export function readEnvironment(): VariantEnvironment {
  return {
    viewportWidth: window.innerWidth,
    prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

/** Scroll budget for the pinned section, as a multiple of viewport height. */
export function sectionHeightVh(variant: HeroVariant): number {
  switch (variant) {
    case "full":
      return 500;
    case "compact":
      // Fewer frames need less distance, and phone scrolling covers ground fast.
      return 350;
    case "static":
      return 100;
  }
}
