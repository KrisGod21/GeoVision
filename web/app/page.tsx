import { HeroSection } from "@/components/hero/HeroSection";
import { AccuracyNote } from "@/components/site/AccuracyNote";
import { CallToAction, SiteFooter } from "@/components/site/CallToAction";
import { FeatureCards } from "@/components/site/FeatureCards";
import { PipelineSection } from "@/components/site/PipelineSection";
import { SiteNav } from "@/components/site/SiteNav";
import { StatsStrip } from "@/components/site/StatsStrip";

export default function Home() {
  return (
    <main>
      {/*
        Everything below the hero appears only once the pinned scrub section
        releases -- the first frame stays uncluttered by design.
      */}
      <HeroSection />
      <SiteNav />
      <StatsStrip />
      <FeatureCards />
      <PipelineSection />
      <AccuracyNote />
      <CallToAction />
      <SiteFooter />
    </main>
  );
}
