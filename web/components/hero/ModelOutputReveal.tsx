"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { PIN_ORDER, PIN_THRESHOLDS, clamp01, type PinName } from "@/lib/hero/scrub";
import { heroManifest } from "@/lib/hero/manifest.generated";

export interface ModelOutputRevealHandle {
  /** Applies reveal progress directly to the DOM. Called from the rAF loop. */
  apply(revealProgress: number): void;
}

export interface ModelOutputRevealProps {
  /** Beside the canvas on desktop; stacked below it on a phone. */
  layout: "beside" | "below";
  /** Static variant renders fully revealed with no animation. */
  alwaysVisible?: boolean;
}

/**
 * Pin anchors, as percentages of the panel image.
 *
 * These point at real features in the model output: a dense roof cluster, the
 * main road junction, and the field block on the right. The colours mirror what
 * the model actually paints, so a pin always matches the thing it points at.
 *
 * Note the third pin is Farmland, not Water. This particular sample orthophoto
 * contains no water body -- a "Water" pin here would point at grass. Swap the
 * entry when a sample containing water is available.
 */
export const PIN_ANCHORS: Record<PinName, { x: number; y: number; label: string; color: string }> = {
  buildings: { x: 44, y: 34, label: "Buildings", color: "var(--color-class-buildings)" },
  roads: { x: 37, y: 61, label: "Roads", color: "var(--color-class-roads)" },
  water: { x: 80, y: 30, label: "Farmland", color: "var(--color-class-vegetation)" },
};

/** How far into the reveal the panel finishes sliding in. */
const PANEL_IN_BY = 0.45;

export const ModelOutputReveal = forwardRef<ModelOutputRevealHandle, ModelOutputRevealProps>(
  function ModelOutputReveal({ layout, alwaysVisible = false }, ref) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const pinRefs = useRef<Partial<Record<PinName, HTMLDivElement | null>>>({});

    // The image is only fetched once the reveal is approaching, so it never
    // competes with the frame preload. Loading is a render-level concern, so
    // this one piece of state is allowed -- it flips at most once.
    const [shouldLoad, setShouldLoad] = useState(alwaysVisible);
    const shouldLoadRef = useRef(alwaysVisible);

    useEffect(() => {
      if (alwaysVisible) setShouldLoad(true);
    }, [alwaysVisible]);

    function apply(revealProgress: number) {
      const panel = panelRef.current;
      if (!panel) return;

      const entry = clamp01(revealProgress / PANEL_IN_BY);

      // Composited properties only -- no layout, no paint.
      panel.style.opacity = String(entry);
      const offset = (1 - entry) * 48;
      panel.style.transform =
        layout === "beside" ? `translate3d(${offset}px,0,0)` : `translate3d(0,${offset}px,0)`;

      for (const name of PIN_ORDER) {
        const pin = pinRefs.current[name];
        if (!pin) continue;
        const visible = revealProgress >= PIN_THRESHOLDS[name];
        pin.style.opacity = visible ? "1" : "0";
        pin.style.transform = visible ? "translate3d(0,0,0) scale(1)" : "translate3d(0,6px,0) scale(0.92)";
      }
    }

    useImperativeHandle(ref, () => ({
      apply(revealProgress) {
        // Begin fetching slightly before the panel is needed, so it is decoded
        // by the time it slides in.
        if (!shouldLoadRef.current && revealProgress > 0) {
          shouldLoadRef.current = true;
          setShouldLoad(true);
        }
        apply(revealProgress);
      },
    }));

    const besideLayout =
      "absolute right-[3vw] top-1/2 w-[40vw] max-w-[44rem] -translate-y-1/2";
    const belowLayout = "absolute inset-x-4 bottom-6";

    return (
      <div
        ref={panelRef}
        className={`${layout === "beside" ? besideLayout : belowLayout} will-change-[opacity,transform]`}
        style={{ opacity: alwaysVisible ? 1 : 0 }}
      >
        <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-white/60">
          Model output · Feature extraction
        </p>

        <div className="relative overflow-hidden rounded-xl border border-white/20 shadow-2xl shadow-black/50">
          {/* Reserving the aspect ratio prevents a layout shift when it loads. */}
          <div style={{ aspectRatio: `${heroManifest.modelOutput.width} / ${heroManifest.modelOutput.height}` }}>
            {shouldLoad && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroManifest.modelOutput.src}
                alt="Segmentation output over a village orthophoto, with building footprints, roads and field boundaries outlined."
                width={heroManifest.modelOutput.width}
                height={heroManifest.modelOutput.height}
                className="h-full w-full object-cover"
                decoding="async"
              />
            )}
          </div>

          {PIN_ORDER.map((name) => {
            const anchor = PIN_ANCHORS[name];
            return (
              <div
                key={name}
                ref={(node) => {
                  pinRefs.current[name] = node;
                }}
                className="absolute transition-[opacity,transform] duration-200 ease-out will-change-[opacity,transform]"
                style={{
                  left: `${anchor.x}%`,
                  top: `${anchor.y}%`,
                  opacity: alwaysVisible ? 1 : 0,
                }}
              >
                {/* Leader line from the anchor point up to the label. */}
                <span
                  className="absolute bottom-0 left-0 block w-px"
                  style={{ height: "1.6rem", backgroundColor: anchor.color, opacity: 0.8 }}
                />
                <span
                  className="absolute bottom-0 left-0 block size-1.5 -translate-x-1/2 translate-y-1/2 rounded-full"
                  style={{ backgroundColor: anchor.color }}
                />
                <span
                  className="absolute bottom-[1.6rem] left-0 flex -translate-x-1 items-center gap-1.5 whitespace-nowrap rounded-md bg-black/70 px-2 py-1 text-[0.68rem] font-medium text-white backdrop-blur-sm"
                  style={{ boxShadow: `inset 0 0 0 1px ${anchor.color}55` }}
                >
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: anchor.color }} />
                  {anchor.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
