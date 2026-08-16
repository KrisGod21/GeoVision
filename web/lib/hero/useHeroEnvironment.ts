"use client";

import { useSyncExternalStore } from "react";
import {
  MOBILE_BREAKPOINT_PX,
  readEnvironment,
  selectVariant,
  type HeroVariant,
} from "./variant";

/**
 * Reads the hero variant from the browser environment.
 *
 * ``useSyncExternalStore`` rather than an effect: the viewport and the motion
 * preference are external systems, and subscribing to them is exactly what this
 * hook is for. It also gives correct server rendering for free -- the server
 * snapshot is "unknown", so nothing is fetched until the real variant is known.
 *
 * The snapshot is encoded as a string so that referential equality is value
 * equality. Returning an object would allocate a new one on every resize event
 * and re-render continuously. As a bonus this makes the hook naturally
 * debounced: resizing only re-renders when the breakpoint is actually crossed.
 */

const SERVER_SNAPSHOT = "unknown|wide";

function subscribe(onChange: () => void): () => void {
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  window.addEventListener("resize", onChange);
  motionQuery.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    motionQuery.removeEventListener("change", onChange);
  };
}

function getSnapshot(): string {
  const environment = readEnvironment();
  const width = environment.viewportWidth < MOBILE_BREAKPOINT_PX ? "narrow" : "wide";
  return `${selectVariant(environment)}|${width}`;
}

export interface HeroEnvironment {
  /** Null until the client has resolved it; nothing may be fetched before then. */
  variant: HeroVariant | null;
  narrow: boolean;
}

export function useHeroEnvironment(): HeroEnvironment {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  const [variant, width] = snapshot.split("|");

  return {
    variant: variant === "unknown" ? null : (variant as HeroVariant),
    narrow: width === "narrow",
  };
}
