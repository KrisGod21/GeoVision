"use client";

import { useCallback, useRef, useState } from "react";

export interface CompareLayer {
  name: string;
  url: string;
}

/**
 * Drag-to-swipe comparison between the original image and the extracted layers.
 *
 * Layers are separate transparent PNGs composited in the browser, so toggling a
 * class is instant and needs no server round-trip.
 */
export function CompareSlider({
  originalUrl,
  layers,
  className,
}: {
  originalUrl: string;
  layers: CompareLayer[];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState(50);
  const draggingRef = useRef(false);

  const moveTo = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    setPosition(Math.min(100, Math.max(0, ratio * 100)));
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative touch-none select-none overflow-hidden rounded-2xl border border-hairline bg-surface-sunken ${className ?? ""}`}
      onPointerDown={(event) => {
        draggingRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        moveTo(event.clientX);
      }}
      onPointerMove={(event) => draggingRef.current && moveTo(event.clientX)}
      onPointerUp={(event) => {
        draggingRef.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      {/* The original establishes the intrinsic size everything else matches. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={originalUrl} alt="Uploaded orthophoto" className="block h-auto w-full" />

      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        aria-hidden="true"
      >
        {layers.map((layer) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={layer.name}
            src={layer.url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ))}
      </div>

      {/* Handle */}
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.4)]"
        style={{ left: `${position}%` }}
      >
        <div className="absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs text-forest shadow-lg">
          ↔
        </div>
      </div>

      <span className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-[0.65rem] font-medium uppercase tracking-wider text-white">
        Original
      </span>
      <span className="pointer-events-none absolute right-3 bottom-3 rounded-md bg-black/60 px-2 py-1 text-[0.65rem] font-medium uppercase tracking-wider text-white">
        Extracted
      </span>
    </div>
  );
}
