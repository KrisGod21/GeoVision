"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { FrameSequenceCanvas, type FrameSequenceHandle } from "./FrameSequenceCanvas";
import { HeroOverlay, type HeroOverlayHandle } from "./HeroOverlay";
import { ModelOutputReveal, type ModelOutputRevealHandle } from "./ModelOutputReveal";
import { PerfCollector, PerfMonitor, type PerfSample } from "./PerfMonitor";
import { useScrollScrub } from "./useScrollScrub";
import { heroManifest } from "@/lib/hero/manifest.generated";
import { frameSrcs } from "@/lib/hero/manifest";
import { splitProgress } from "@/lib/hero/scrub";
import { useHeroEnvironment } from "@/lib/hero/useHeroEnvironment";
import { sectionHeightVh } from "@/lib/hero/variant";

/** Images awaited before the section is treated as interactive. */
const PRELOAD_COUNT = 20;

/**
 * The hero: a pinned canvas scrubbed by scroll, ending on a reveal of real
 * model output.
 *
 * Composition only. The scrub maths, the image queue, the canvas drawing and
 * the reveal each live in their own unit, so changing frame count or resolution
 * touches the asset script rather than this file.
 */
export function HeroSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<FrameSequenceHandle | null>(null);
  const revealRef = useRef<ModelOutputRevealHandle | null>(null);
  const overlayRef = useRef<HeroOverlayHandle | null>(null);

  const perf = useRef(new PerfCollector());

  // Null until the client resolves it: the variant decides which frames to
  // fetch, so nothing may be requested before it is known. The hook only
  // re-renders when the breakpoint or the motion preference actually changes.
  const { variant, narrow } = useHeroEnvironment();
  const [canvasReady, setCanvasReady] = useState(false);

  const frameSet = variant === "compact" ? heroManifest.mobile : heroManifest.desktop;
  const srcs = useMemo(() => frameSrcs(frameSet), [frameSet]);
  const posterSrc = srcs[0];

  const isStatic = variant === "static";
  const isScrubbing = variant === "full" || variant === "compact";
  // Side-by-side is unreadable on a phone, whichever variant got us there.
  const revealLayout = variant === "compact" || narrow ? "below" : "beside";

  const onFrame = useCallback(
    ({ raw, scrub, reveal, deltaMs }: { raw: number; scrub: number; reveal: number; deltaMs: number }) => {
      perf.current.record(deltaMs);

      canvasRef.current?.draw(splitProgress(scrub).scrubProgress);
      overlayRef.current?.apply(raw);

      const revealProgress = splitProgress(reveal).revealProgress;
      revealRef.current?.apply(revealProgress);

      // The canvas eases aside to make room rather than being covered.
      const wrap = canvasWrapRef.current;
      if (wrap) {
        wrap.style.transform =
          revealLayout === "beside"
            ? `translate3d(${-revealProgress * 16}%,0,0) scale(${1 - revealProgress * 0.3})`
            : `translate3d(0,${-revealProgress * 16}%,0) scale(${1 - revealProgress * 0.28})`;
      }
    },
    [revealLayout]
  );

  useScrollScrub({ sectionRef, enabled: isScrubbing, onFrame });

  const readPerf = useCallback(
    (): PerfSample => ({
      fps: perf.current.fps(),
      droppedFrames: perf.current.dropped,
      totalFrames: perf.current.total,
      loaded: canvasRef.current?.loadedCount() ?? 0,
      totalImages: srcs.length,
      frameIndex: canvasRef.current?.lastIndex() ?? 0,
      drawMs: canvasRef.current?.lastDrawMs() ?? 0,
    }),
    [srcs.length]
  );

  return (
    <section
      ref={sectionRef}
      className="relative bg-[#070D0A]"
      style={{ height: `${sectionHeightVh(variant ?? "full")}vh` }}
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <div
          ref={canvasWrapRef}
          className="absolute inset-0 will-change-transform"
          style={{ transformOrigin: "50% 50%" }}
        >
          {/*
            A poster gives an immediate first paint. The canvas has to wait for
            its preload window to settle, and an empty hero in the meantime
            would be the worst possible first impression.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={posterSrc}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
            style={{ opacity: canvasReady && isScrubbing ? 0 : 1 }}
            fetchPriority="high"
          />

          {isScrubbing && (
            <FrameSequenceCanvas
              // Remounting on variant change discards the wrong-sized frame set.
              key={variant}
              ref={canvasRef}
              srcs={srcs}
              sequence={frameSet.sequence}
              preloadCount={PRELOAD_COUNT}
              onReady={() => setCanvasReady(true)}
              className="absolute inset-0 h-full w-full"
            />
          )}

          {/* Keeps white type legible over bright fields and pale roofs. */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/10 to-black/45" />
        </div>

        {variant !== null && (
          <ModelOutputReveal ref={revealRef} layout={revealLayout} alwaysVisible={isStatic} />
        )}

        <HeroOverlay
          ref={overlayRef}
          static={isStatic}
          // Only the static variant shows the wordmark and the panel at the
          // same time, so only it needs them side by side.
          placement={isStatic && !narrow ? "split" : "center"}
        />
      </div>

      <PerfMonitor read={readPerf} />
    </section>
  );
}
