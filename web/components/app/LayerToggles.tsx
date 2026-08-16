"use client";

/** Class colours, matching the tokens and the masks the backend paints. */
export const CLASS_COLOURS: Record<string, string> = {
  buildings: "var(--color-class-buildings)",
  roads: "var(--color-class-roads)",
  water: "var(--color-class-water)",
  vegetation: "var(--color-class-vegetation)",
};

export const CLASS_LABELS: Record<string, string> = {
  buildings: "Buildings",
  roads: "Roads",
  water: "Water",
  vegetation: "Vegetation",
};

export function LayerToggles({
  available,
  enabled,
  onToggle,
}: {
  available: string[];
  enabled: Set<string>;
  onToggle: (name: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {available.map((name) => {
        const on = enabled.has(name);
        return (
          <button
            key={name}
            type="button"
            onClick={() => onToggle(name)}
            aria-pressed={on}
            className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-colors ${
              on
                ? "border-transparent bg-forest text-white"
                : "border-hairline bg-surface text-muted hover:border-green-soft"
            }`}
          >
            <span
              className="size-2.5 rounded-full transition-opacity"
              style={{ backgroundColor: CLASS_COLOURS[name] ?? "var(--color-muted)", opacity: on ? 1 : 0.35 }}
            />
            {CLASS_LABELS[name] ?? name}
          </button>
        );
      })}
    </div>
  );
}
