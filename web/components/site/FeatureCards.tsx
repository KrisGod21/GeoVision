/**
 * What the model extracts. Colours match the classes everywhere else on the
 * site, so a reader learns the legend once.
 */
const FEATURES = [
  {
    title: "Building footprints",
    color: "var(--color-class-buildings)",
    body: "Polygonised footprints with attention-gated boundaries, then a second-stage classifier labels each roof RCC, Tiled, Tin or Other — feeding solar-potential and property-tax calculations.",
  },
  {
    title: "Road networks",
    color: "var(--color-class-roads)",
    body: "A dilated-convolution bottleneck gives the road head a receptive field wide enough to keep tile-spanning roads connected, with a connectivity-aware loss term.",
  },
  {
    title: "Water bodies",
    color: "var(--color-class-water)",
    body: "The scarcest class in the training data. Class-balanced sampling and a Tversky loss penalise false negatives, addressing the algae-versus-vegetation confusion directly.",
  },
  {
    title: "Georeferenced output",
    color: "var(--color-green-bright)",
    body: "CRS and affine transform preserved per tile end to end, exported as GeoJSON, SHP and KML — the formats existing QGIS and MoPR workflows already consume.",
  },
] as const;

export function FeatureCards() {
  return (
    <section id="capabilities" className="mx-auto max-w-6xl px-6 py-24">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-green-bright">Capabilities</p>
      <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
        One shared encoder, four task-specific heads
      </h2>
      <p className="mt-4 max-w-2xl text-muted">
        A single pretrained backbone extracts visual features once per tile. Each head then specialises
        on top of them — one training run, one checkpoint, one inference path.
      </p>

      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="rounded-2xl border border-hairline bg-surface p-6 transition-shadow hover:shadow-lg hover:shadow-forest/5"
          >
            <span
              className="mb-4 block size-2.5 rounded-full"
              style={{ backgroundColor: feature.color }}
              aria-hidden="true"
            />
            <h3 className="text-lg font-semibold text-forest">{feature.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
