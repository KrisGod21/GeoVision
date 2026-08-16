"use client";

import { useEffect, useState } from "react";

export interface PerfSample {
  fps: number;
  droppedFrames: number;
  totalFrames: number;
  loaded: number;
  totalImages: number;
  frameIndex: number;
  drawMs: number;
}

/** A frame taking longer than this is counted as dropped (roughly two frames at 60fps). */
export const JANK_THRESHOLD_MS = 32;

/**
 * Collects frame timings. Lives outside React so the rAF loop can feed it
 * without causing renders; the overlay polls it a few times a second.
 */
export class PerfCollector {
  private times: number[] = [];
  dropped = 0;
  total = 0;

  record(deltaMs: number) {
    this.total++;
    if (deltaMs > JANK_THRESHOLD_MS) this.dropped++;
    this.times.push(deltaMs);
    // Keep roughly a one-second window.
    if (this.times.length > 120) this.times.shift();
  }

  fps(): number {
    if (this.times.length === 0) return 0;
    const mean = this.times.reduce((a, b) => a + b, 0) / this.times.length;
    return mean > 0 ? 1000 / mean : 0;
  }
}

/**
 * Objective performance readout for the hero, shown only with ?perf=1.
 *
 * This exists so a judgement about jank comes from numbers rather than
 * impressions -- and so that if the hero does need trimming, the decision is
 * made against real figures.
 */
export function PerfMonitor({ read }: { read: () => PerfSample }) {
  const [enabled, setEnabled] = useState(false);
  const [sample, setSample] = useState<PerfSample | null>(null);

  useEffect(() => {
    setEnabled(new URLSearchParams(window.location.search).get("perf") === "1");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setSample(read()), 250);
    return () => clearInterval(id);
  }, [enabled, read]);

  if (!enabled || !sample) return null;

  const dropRate = sample.totalFrames > 0 ? (sample.droppedFrames / sample.totalFrames) * 100 : 0;
  const fpsColor = sample.fps >= 55 ? "#4ade80" : sample.fps >= 45 ? "#facc15" : "#ef4444";

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 rounded-lg bg-black/85 px-3 py-2 font-mono text-[11px] leading-relaxed text-white/80 backdrop-blur">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-white/40">Hero perf</div>
      <Row label="fps" value={sample.fps.toFixed(1)} color={fpsColor} />
      <Row
        label="dropped"
        value={`${sample.droppedFrames} / ${sample.totalFrames} (${dropRate.toFixed(1)}%)`}
        color={dropRate < 2 ? "#4ade80" : dropRate < 8 ? "#facc15" : "#ef4444"}
      />
      <Row label="images" value={`${sample.loaded} / ${sample.totalImages}`} />
      <Row label="frame" value={String(sample.frameIndex)} />
      <Row label="draw" value={`${sample.drawMs.toFixed(2)} ms`} />
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-16 text-white/40">{label}</span>
      <span style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}
