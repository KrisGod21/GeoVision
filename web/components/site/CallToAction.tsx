import Link from "next/link";

export function CallToAction() {
  return (
    <section className="bg-forest">
      <div className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Run it on your own imagery
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-green-soft">
          Upload a village orthophoto and watch the pipeline tile, infer, polygonise and stitch it
          back into vector layers you can inspect class by class.
        </p>
        <Link
          href="/app"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-medium text-forest transition-transform hover:scale-[1.02]"
        >
          Try the pipeline
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-bg">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-semibold text-forest">GeoVision</span> — Team Recursion
        </p>
        <p>
          Smart India Hackathon 2026 · Problem Statement 1705 · Ministry of Panchayati Raj
        </p>
      </div>
    </footer>
  );
}
