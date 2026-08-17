"use client";

import { useEffect, useRef, useState } from "react";
import { expandRect, mapRectToCover, type Rect } from "@/lib/hero/coverFit";
import { heroManifest } from "@/lib/hero/manifest.generated";

/**
 * Covers the generator watermark burned into the hero footage with the project
 * logo.
 *
 * Positioned through the same cover-fit transform the canvas uses, so it stays
 * locked to the watermark at every viewport shape rather than drifting. It
 * renders INSIDE the canvas wrapper, which means the reveal's translate and
 * scale carry it along for free -- no separate tracking, nothing to fall out of
 * sync.
 *
 * The watermark's position was measured, not guessed: averaging all 180 frames
 * blurs the moving background and leaves the static mark standing proud. It is
 * a 48x48 square at (1136, 576) in the 1280x720 source, identical every frame.
 */

/**
 * A little larger than the measured mark, to swallow its soft glow. Kept
 * deliberately tight -- the cover should hide the watermark and claim no more
 * of the picture than it has to.
 */
const COVER_SCALE = 1.15;

export interface WatermarkCoverProps {
  /** Intrinsic size of the frames being displayed. */
  source: { width: number; height: number };
}

export function WatermarkCover({ source }: WatermarkCoverProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      setRect(
        expandRect(
          mapRectToCover(source, { width, height }, heroManifest.watermark),
          COVER_SCALE
        )
      );
    };

    measure();

    // The wrapper is transformed during the reveal, and ResizeObserver reports
    // border-box size rather than transformed size, so this fires only on real
    // layout changes -- which is exactly what we want.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [source]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 overflow-hidden">
      {rect && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={heroManifest.logo.src}
          alt=""
          aria-hidden="true"
          className="absolute"
          style={{
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          }}
        />
      )}
    </div>
  );
}
