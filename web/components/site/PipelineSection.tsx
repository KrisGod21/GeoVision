/** The six layers from section 3 of the architecture document. */
const LAYERS = [
  {
    name: "Ingestion",
    body: "An orthophoto is uploaded through the web app. FastAPI receives it and pushes the job to an async queue — large rasters cannot block an HTTP request.",
  },
  {
    name: "Pre-processing",
    body: "Windowed reads convert to Cloud-Optimized GeoTIFF and tile into overlapping 512×512 patches, with the CRS and affine transform preserved per tile.",
  },
  {
    name: "AI inference",
    body: "Each tile passes through the shared-encoder multi-head network via ONNX Runtime. Detected building crops are routed on to the roof-type classifier.",
  },
  {
    name: "Human verification",
    body: "A reviewing officer sees the overlays and can correct polygons before certification. The system does not claim full autonomy.",
  },
  {
    name: "Post-processing",
    body: "Feather-blended stitching removes seams between overlapping tiles. Masks are polygonised, simplified, and tagged with class, roof type and area.",
  },
  {
    name: "Output & integration",
    body: "Stored in PostGIS and exported as SHP, GeoJSON or KML, with raster layers served as COG tiles to the map viewer.",
  },
] as const;

export function PipelineSection() {
  return (
    <section id="pipeline" className="border-y border-hairline bg-surface-sunken">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-green-bright">Pipeline</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
          Orthophoto in, certified vector layers out
        </h2>

        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline md:grid-cols-2 lg:grid-cols-3">
          {LAYERS.map((layer, index) => (
            <li key={layer.name} className="bg-surface p-6">
              <div className="flex items-baseline gap-3">
                <span className="text-xs font-medium tabular-nums text-green-bright">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="font-semibold text-forest">{layer.name}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{layer.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
