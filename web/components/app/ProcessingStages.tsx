"use client";

import { STAGES, type Stage } from "@/lib/api";

/** Staged progress display, mirroring the pipeline layers on the landing page. */
export function ProcessingStages({
  currentStage,
  progress,
}: {
  currentStage: Stage | null;
  progress: number;
}) {
  const currentIndex = currentStage ? STAGES.findIndex((s) => s.id === currentStage) : -1;

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-8">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold text-forest">Processing</h2>
        <span className="tabular-nums text-sm text-muted">{Math.round(progress * 100)}%</span>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className="h-full rounded-full bg-green-bright transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(progress * 100, 2)}%` }}
        />
      </div>

      <ol className="mt-8 space-y-4">
        {STAGES.map((stage, index) => {
          const done = currentIndex > index || progress >= 1;
          const active = currentIndex === index && progress < 1;

          return (
            <li key={stage.id} className="flex gap-4">
              <span
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${
                  done
                    ? "bg-green-bright text-white"
                    : active
                      ? "bg-surface-tint text-green ring-2 ring-green-bright"
                      : "bg-surface-sunken text-muted"
                }`}
                aria-hidden="true"
              >
                {done ? "✓" : index + 1}
              </span>
              <div>
                <p className={`font-medium ${done || active ? "text-forest" : "text-muted"}`}>
                  {stage.label}
                </p>
                <p className="text-sm text-muted">{stage.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
