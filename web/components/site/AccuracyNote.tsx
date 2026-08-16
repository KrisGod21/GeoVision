/**
 * Realistic per-class targets from section 4 of the architecture document.
 *
 * This section exists because the distinction it draws is a differentiator, not
 * a caveat: claiming 95% IoU across every class -- water especially -- is an
 * obvious red flag to anyone who has benchmarked these datasets.
 */
const TARGETS = [
  { label: "Buildings", range: "85–90%", color: "var(--color-class-buildings)", width: "88%" },
  { label: "Roads", range: "65–75%", color: "var(--color-class-roads)", width: "70%" },
  { label: "Water", range: "75–80%", color: "var(--color-class-water)", width: "78%" },
] as const;

export function AccuracyNote() {
  return (
    <section id="accuracy" className="mx-auto max-w-6xl px-6 py-24">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-green-bright">Accuracy</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
            Which number hits 95%, and which does not
          </h2>
          <p className="mt-5 leading-relaxed text-muted">
            On an aerial scene, background pixels dominate every tile — so overall pixel accuracy and
            per-class IoU are very different numbers. Overall pixel accuracy at or above 95% is
            realistic and matches public benchmarks. Per-class IoU is the harder, more honest metric,
            and we report it separately.
          </p>
          <p className="mt-4 leading-relaxed text-muted">
            Methodology follows from that: no tile-level leakage between splits, per-class IoU and F1
            reported rather than one aggregate, a confusion matrix, and a worst-performing-tiles view
            so failure modes stay visible.
          </p>
        </div>

        <div className="rounded-2xl border border-hairline bg-surface p-8">
          <div className="flex items-baseline justify-between border-b border-hairline pb-4">
            <span className="text-sm font-medium text-forest">Overall pixel accuracy</span>
            <span className="text-2xl font-semibold tabular-nums text-green-bright">95%+</span>
          </div>

          <p className="mt-6 text-xs font-medium uppercase tracking-[0.15em] text-muted">
            Target per-class IoU
          </p>

          <dl className="mt-4 space-y-5">
            {TARGETS.map((target) => (
              <div key={target.label}>
                <div className="flex items-baseline justify-between text-sm">
                  <dt className="flex items-center gap-2 text-ink">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: target.color }}
                      aria-hidden="true"
                    />
                    {target.label}
                  </dt>
                  <dd className="tabular-nums text-muted">{target.range}</dd>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full"
                    style={{ width: target.width, backgroundColor: target.color }}
                  />
                </div>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
