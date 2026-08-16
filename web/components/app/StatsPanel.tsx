import type { StatsResponse } from "@/lib/api";

function formatArea(squareMetres: number): string {
  if (squareMetres >= 10_000) return `${(squareMetres / 10_000).toFixed(2)} ha`;
  return `${Math.round(squareMetres).toLocaleString()} m²`;
}

function formatLength(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(2)} km`;
  return `${Math.round(metres).toLocaleString()} m`;
}

export function StatsPanel({ stats }: { stats: StatsResponse }) {
  const rows = [
    { label: "Buildings detected", value: stats.building_count.toLocaleString() },
    { label: "Road length", value: formatLength(stats.road_length_m) },
    { label: "Water area", value: formatArea(stats.water_area_m2) },
    { label: "Vegetation area", value: formatArea(stats.vegetation_area_m2) },
  ];

  const roofEntries = Object.entries(stats.roof_types);

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-6">
      <h2 className="font-semibold text-forest">Extracted features</h2>

      <dl className="mt-5 space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-muted">{row.label}</dt>
            <dd className="tabular-nums font-medium text-forest">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 border-t border-hairline pt-5">
        <h3 className="text-xs font-medium uppercase tracking-[0.15em] text-muted">Roof types</h3>
        {roofEntries.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No footprints to classify.</p>
        ) : (
          <dl className="mt-3 space-y-2">
            {roofEntries.map(([type, count]) => (
              <div key={type} className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-muted">{type}</dt>
                <dd className="tabular-nums text-sm font-medium text-forest">{count}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Roof classification into RCC, Tiled, Tin and Other requires the trained second-stage
          classifier. Until then footprints are reported unclassified rather than guessed.
        </p>
      </div>

      <p className="mt-5 border-t border-hairline pt-4 text-xs text-muted">
        Areas assume {stats.metres_per_pixel} m per pixel.
      </p>
    </div>
  );
}
