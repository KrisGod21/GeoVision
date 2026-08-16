import { HeroSection } from "@/components/hero/HeroSection";

export default function Home() {
  return (
    <main>
      <HeroSection />
      {/* Everything below the hero is built next. This placeholder exists so
          the pin releases into real content rather than into nothing. */}
      <section className="mx-auto max-w-5xl px-6 py-32">
        <p className="text-sm uppercase tracking-[0.2em] text-muted">Below the hero</p>
        <h2 className="mt-4 text-4xl font-semibold text-forest">Sections land here next.</h2>
      </section>
    </main>
  );
}
