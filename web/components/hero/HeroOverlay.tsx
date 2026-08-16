"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { clamp01 } from "@/lib/hero/scrub";

export interface HeroOverlayHandle {
  /** Applies raw scroll progress directly to the DOM. Called from the rAF loop. */
  apply(rawProgress: number): void;
}

/**
 * Where the wordmark begins and finishes fading. It is gone before the reveal
 * starts at 0.82, so the two never compete for attention.
 */
const WORDMARK_FADE_START = 0.55;
const WORDMARK_FADE_END = 0.82;

/** The scroll cue is only useful before the user has started. */
const SCROLL_CUE_GONE_BY = 0.08;

const between = (value: number, start: number, end: number) => clamp01((value - start) / (end - start));

/**
 * The first thing a visitor sees: wordmark, one line of context, a scroll cue.
 *
 * Deliberately nothing else. No nav, no buttons, no stats -- those all live
 * below the pinned section.
 */
export interface HeroOverlayProps {
  /** Static variant: no scrub, no scroll cue. */
  static?: boolean;
  /**
   * "center" dominates the first frame, which is what the scrub variants want.
   * "split" moves the wordmark into the left half so the static variant can
   * show the model-output panel beside it without overlap.
   */
  placement?: "center" | "split";
}

export const HeroOverlay = forwardRef<HeroOverlayHandle, HeroOverlayProps>(
  function HeroOverlay({ static: isStatic = false, placement = "center" }, ref) {
    const wordmarkRef = useRef<HTMLDivElement | null>(null);
    const cueRef = useRef<HTMLDivElement | null>(null);

    useImperativeHandle(ref, () => ({
      apply(raw) {
        const wordmark = wordmarkRef.current;
        if (wordmark) {
          const faded = between(raw, WORDMARK_FADE_START, WORDMARK_FADE_END);
          wordmark.style.opacity = String(1 - faded);
          // Eases down and back slightly, so it recedes rather than just vanishing.
          wordmark.style.transform = `translate3d(0,${faded * 28}px,0) scale(${1 - faded * 0.06})`;
        }

        const cue = cueRef.current;
        if (cue) {
          cue.style.opacity = String(1 - clamp01(raw / SCROLL_CUE_GONE_BY));
        }
      },
    }));

    return (
      <>
        <div
          ref={wordmarkRef}
          className={
            placement === "center"
              ? "pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center will-change-[opacity,transform]"
              : "pointer-events-none absolute inset-y-0 left-0 flex w-[50%] flex-col items-start justify-center pl-[6vw] pr-4 text-left will-change-[opacity,transform]"
          }
        >
          <h1
            className={`font-bold leading-[0.9] tracking-[-0.03em] text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)] ${
              placement === "center" ? "text-[clamp(3rem,11vw,10rem)]" : "text-[clamp(2.5rem,6vw,5rem)]"
            }`}
          >
            GeoVision
          </h1>
          <p className="mt-5 max-w-2xl text-[clamp(0.9rem,1.7vw,1.35rem)] font-light tracking-wide text-white/80 drop-shadow-[0_1px_12px_rgba(0,0,0,0.5)]">
            AI-Powered Feature Extraction from Drone Orthophotos
          </p>
        </div>

        {!isStatic && (
          <div
            ref={cueRef}
            className="pointer-events-none absolute inset-x-0 bottom-8 flex flex-col items-center gap-2 will-change-[opacity]"
          >
            <span className="text-[0.65rem] uppercase tracking-[0.3em] text-white/50">Scroll</span>
            <span className="block h-8 w-px bg-gradient-to-b from-white/50 to-transparent" />
          </div>
        )}
      </>
    );
  }
);
