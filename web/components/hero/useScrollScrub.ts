"use client";

import { useEffect, useRef } from "react";
import { REVEAL_DAMPING, SCRUB_DAMPING, clamp01, dampStep } from "@/lib/hero/scrub";

export interface ScrubFrame {
  /** Undamped progress, straight from the scroll position. */
  raw: number;
  /** Damped progress driving the frame sequence. Snappy. */
  scrub: number;
  /** Damped progress driving the reveal. Slower, to preserve the pin stagger. */
  reveal: number;
  /** Milliseconds since the previous frame, for the perf readout. */
  deltaMs: number;
}

export interface UseScrollScrubOptions {
  sectionRef: React.RefObject<HTMLElement | null>;
  enabled: boolean;
  /** Called once per animation frame. Must not trigger a React render. */
  onFrame: (frame: ScrubFrame) => void;
}

/** Keeps animating briefly after the section leaves, so a flick settles offscreen. */
const GRACE_MS = 600;

/**
 * Maps scroll position within a pinned section onto damped progress values,
 * throttled to one update per animation frame.
 *
 * The loop deliberately never calls setState. At 60fps a React render per frame
 * would dominate the frame budget and produce exactly the jank the canvas
 * approach exists to avoid -- consumers apply the values to the DOM directly.
 */
export function useScrollScrub({ sectionRef, enabled, onFrame }: UseScrollScrubOptions) {
  // Held in a ref so changing the callback never restarts the loop. Updated in
  // an effect rather than during render; this effect is declared first, so the
  // ref is current before the loop below starts.
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (!enabled) return;
    const section = sectionRef.current;
    if (!section) return;

    let rafId = 0;
    let running = false;
    let stopAt = 0;
    let lastTime = performance.now();

    let target = 0;
    let scrub = 0;
    let reveal = 0;

    function readTarget() {
      const rect = section!.getBoundingClientRect();
      // The pinned child is one viewport tall, so the scrollable distance
      // through the section is its height minus one viewport.
      const travel = rect.height - window.innerHeight;
      if (travel <= 0) return 0;
      return clamp01(-rect.top / travel);
    }

    function tick(now: number) {
      const deltaMs = now - lastTime;
      lastTime = now;

      target = readTarget();
      scrub = dampStep(scrub, target, SCRUB_DAMPING, deltaMs);
      reveal = dampStep(reveal, target, REVEAL_DAMPING, deltaMs);

      onFrameRef.current({ raw: target, scrub, reveal, deltaMs });

      const settled = scrub === target && reveal === target;
      if (settled && now > stopAt) {
        running = false;
        return;
      }
      rafId = requestAnimationFrame(tick);
    }

    function start() {
      // Extending the deadline keeps a settled loop alive through the grace
      // window, so a flick that overshoots finishes animating offscreen rather
      // than freezing mid-reveal and looking broken on the way back up.
      stopAt = performance.now() + GRACE_MS;
      if (running) return;
      running = true;
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    }

    const onScroll = () => start();
    const onResize = () => start();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    // Prime it so the first paint is correct even if the page loads scrolled
    // partway down (a refresh, or a restored scroll position).
    target = readTarget();
    scrub = target;
    reveal = target;
    start();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafId);
      running = false;
    };
  }, [enabled, sectionRef]);
}
