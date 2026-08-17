"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell, ProvenanceNotice } from "@/components/app/AppShell";
import { CompareSlider } from "@/components/app/CompareSlider";
import { LayerToggles } from "@/components/app/LayerToggles";
import { ProcessingStages } from "@/components/app/ProcessingStages";
import { StatsPanel } from "@/components/app/StatsPanel";
import {
  fileUrl,
  getJob,
  getJobResult,
  type JobResultResponse,
  type JobStatusResponse,
} from "@/lib/api";

const POLL_INTERVAL_MS = 1000;

/**
 * A single failed poll is not a failed job. Free-tier hosts drop the odd
 * request, and giving up on the first one would abandon a job that is still
 * running perfectly well server-side.
 */
const MAX_CONSECUTIVE_POLL_FAILURES = 5;

export default function JobPage() {
  const { id } = useParams<{ id: string }>();

  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [result, setResult] = useState<JobResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let consecutiveFailures = 0;

    async function poll() {
      try {
        const next = await getJob(id);
        if (cancelled) return;
        consecutiveFailures = 0;
        setStatus(next);

        if (next.status === "complete") {
          const body = await getJobResult(id);
          if (cancelled) return;
          setResult(body);
          // Everything on by default: the point of the result view is to show
          // what was found, not to make the user go looking for it.
          setEnabled(new Set(body.layers.map((layer) => layer.name)));
          return;
        }

        if (next.status === "failed") {
          setError(next.error ?? "The job failed.");
          return;
        }

        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (cause) {
        if (cancelled) return;

        consecutiveFailures++;
        if (consecutiveFailures < MAX_CONSECUTIVE_POLL_FAILURES) {
          // Back off rather than hammering a struggling server.
          timer = setTimeout(poll, POLL_INTERVAL_MS * consecutiveFailures);
          return;
        }

        setError(
          cause instanceof Error
            ? `${cause.message} (gave up after ${consecutiveFailures} attempts)`
            : "Lost contact with the API."
        );
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  const visibleLayers = useMemo(
    () =>
      (result?.layers ?? [])
        .filter((layer) => enabled.has(layer.name))
        .map((layer) => ({ name: layer.name, url: fileUrl(layer.url) })),
    [result, enabled]
  );

  function toggle(name: string) {
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (error) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl rounded-2xl border border-hairline bg-surface p-8 text-center">
          <h1 className="text-xl font-semibold text-forest">Extraction failed</h1>
          <p className="mt-3 text-muted">{error}</p>
          <Link
            href="/app"
            className="mt-6 inline-block rounded-full bg-green-bright px-6 py-3 font-medium text-white transition-colors hover:bg-green"
          >
            Try another image
          </Link>
        </div>
      </AppShell>
    );
  }

  if (!result) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl">
          <h1 className="mb-6 text-2xl font-semibold tracking-tight text-forest">
            {status?.filename ?? "Loading…"}
          </h1>
          <ProcessingStages
            currentStage={status?.stage ?? null}
            progress={status?.progress ?? 0}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-forest">
          {status?.filename ?? "Result"}
        </h1>
        <Link href="/app" className="text-sm text-green-bright hover:underline">
          Run another →
        </Link>
      </div>

      <ProvenanceNotice provenance={result.provenance} />

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <CompareSlider
            originalUrl={fileUrl(result.original_url)}
            layers={visibleLayers}
          />

          <div className="mt-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.15em] text-muted">
              Layers
            </p>
            <LayerToggles
              available={result.layers.map((layer) => layer.name)}
              enabled={enabled}
              onToggle={toggle}
            />
          </div>
        </div>

        <div className="space-y-6">
          <StatsPanel stats={result.stats} />

          <a
            href={fileUrl(result.geojson_url)}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-hairline bg-surface px-4 py-3 text-center text-sm font-medium text-forest transition-colors hover:border-green-soft"
          >
            View GeoJSON
          </a>
        </div>
      </div>
    </AppShell>
  );
}
