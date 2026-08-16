import Link from "next/link";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight text-forest">
            GeoVision
          </Link>
          <Link href="/" className="text-sm text-muted transition-colors hover:text-forest">
            ← Back to overview
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-12">{children}</main>
    </div>
  );
}

/**
 * States plainly that results come from a placeholder, not the trained model.
 *
 * Shown wherever results are. A demo that lets a viewer believe placeholder
 * output is model output is worse than one that has no results at all.
 */
export function ProvenanceNotice({ provenance }: { provenance: string }) {
  if (provenance !== "heuristic-placeholder" && provenance !== "unsupported-raster") return null;

  const message =
    provenance === "unsupported-raster"
      ? "This raster was stored but could not be decoded for preview. Georeferenced GeoTIFF handling arrives with the model integration."
      : "These layers come from a colour-threshold placeholder, not the trained model. They demonstrate the pipeline and the interface; accuracy is not meaningful yet.";

  return (
    <div className="mb-6 flex gap-3 rounded-xl border border-class-buildings/30 bg-class-buildings/5 px-4 py-3">
      <span className="mt-0.5 text-class-buildings" aria-hidden="true">
        ⚠
      </span>
      <p className="text-sm leading-relaxed text-ink">
        <span className="font-medium">Placeholder output. </span>
        {message}
      </p>
    </div>
  );
}
