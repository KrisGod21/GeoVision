/** Scale of the problem, drawn from the SVAMITVA brief in the architecture document. */
const STATS = [
  { value: "3.3 lakh", label: "Villages under SVAMITVA" },
  { value: "50 cm", label: "Drone orthophoto resolution" },
  { value: "3", label: "Feature classes extracted" },
  { value: "4", label: "Roof types classified" },
] as const;

export function StatsStrip() {
  return (
    <section className="border-y border-hairline bg-surface-sunken">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-6 py-12 sm:gap-8 lg:grid-cols-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="px-2 py-4 text-center sm:text-left">
            <div className="text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
              {stat.value}
            </div>
            <div className="mt-1 text-sm text-muted">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
