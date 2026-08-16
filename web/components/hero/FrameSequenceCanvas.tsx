"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { createFrameLoader, type FrameLoader } from "@/lib/hero/frameLoader";
import { nearestLoadedIndex, progressToFrameIndex } from "@/lib/hero/scrub";

export interface FrameSequenceHandle {
  /** Draws the frame for the given scrub progress. Called from the rAF loop. */
  draw(scrubProgress: number): void;
  /** Distinct images loaded so far, for the perf readout. */
  loadedCount(): number;
  /** Milliseconds the last drawImage call took. */
  lastDrawMs(): number;
  /** Timeline position most recently drawn. */
  lastIndex(): number;
}

export interface FrameSequenceCanvasProps {
  /** Distinct image URLs. Duplicated timeline frames are already collapsed. */
  srcs: string[];
  /** sequence[timelinePosition] = index into srcs. */
  sequence: number[];
  /** Images awaited before the section is considered interactive. */
  preloadCount?: number;
  /** Fired once the preload window has settled. */
  onReady?: () => void;
  className?: string;
}

/** Device pixel ratio is capped: beyond 2x the extra pixels cost more than they show. */
const MAX_DPR = 2;

/**
 * Draws a frame sequence onto a canvas.
 *
 * Deliberately knows nothing about scroll, layout, or the reveal panel -- it is
 * handed a progress value and draws. That isolation is what makes a later
 * decision to cut frame count or resolution a change to the asset script alone.
 */
export const FrameSequenceCanvas = forwardRef<FrameSequenceHandle, FrameSequenceCanvasProps>(
  function FrameSequenceCanvas({ srcs, sequence, preloadCount = 20, onReady, className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const loaderRef = useRef<FrameLoader<HTMLImageElement> | null>(null);

    // Draw bookkeeping, kept in refs so nothing here can trigger a render.
    const lastDrawnImageIndex = useRef(-1);
    const lastDrawMs = useRef(0);
    const lastIndex = useRef(0);
    const pendingProgress = useRef(0);

    useEffect(() => {
      const loader = createFrameLoader<HTMLImageElement>({ srcs, concurrency: 6 });
      loaderRef.current = loader;

      let cancelled = false;
      loader.preload(preloadCount).then(() => {
        if (cancelled) return;
        // Force the first paint now that something is available to draw.
        lastDrawnImageIndex.current = -1;
        drawInternal(pendingProgress.current);
        onReady?.();
        // Only now start pulling the rest, so the background queue never
        // competes with the frames needed to become interactive.
        loader.loadRest();
      });

      return () => {
        cancelled = true;
        loader.destroy();
        loaderRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [srcs, preloadCount]);

    /** Sizes the backing store to the element, accounting for DPR. */
    function resizeCanvas() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const width = Math.round(canvas.clientWidth * dpr);
      const height = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        // The backing store was cleared, so the cached frame is no longer on it.
        lastDrawnImageIndex.current = -1;
      }
    }

    useEffect(() => {
      resizeCanvas();
      const onResize = () => {
        resizeCanvas();
        drawInternal(pendingProgress.current);
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function drawInternal(scrubProgress: number) {
      pendingProgress.current = scrubProgress;

      const canvas = canvasRef.current;
      const loader = loaderRef.current;
      if (!canvas || !loader) return;

      const timelineIndex = progressToFrameIndex(scrubProgress, sequence.length);
      lastIndex.current = timelineIndex;

      const wanted = sequence[timelineIndex];
      // The wanted image may not have arrived yet during progressive loading.
      // Drawing a nearby frame beats drawing nothing.
      const available = loader.loaded.has(wanted)
        ? wanted
        : nearestLoadedIndex(wanted, loader.loaded);
      if (available === null) return;

      // Redrawing the same image is pure waste, and consecutive timeline
      // positions frequently resolve to the same image.
      if (available === lastDrawnImageIndex.current) return;

      const image = loader.get(available);
      if (!image) return;

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;

      const started = performance.now();

      // Cover fit: fill the canvas, cropping overflow, never letterboxing.
      const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      context.drawImage(
        image,
        (canvas.width - drawWidth) / 2,
        (canvas.height - drawHeight) / 2,
        drawWidth,
        drawHeight
      );

      lastDrawMs.current = performance.now() - started;
      lastDrawnImageIndex.current = available;
    }

    useImperativeHandle(ref, () => ({
      draw: drawInternal,
      loadedCount: () => loaderRef.current?.loaded.size ?? 0,
      lastDrawMs: () => lastDrawMs.current,
      lastIndex: () => lastIndex.current,
    }));

    return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
  }
);
