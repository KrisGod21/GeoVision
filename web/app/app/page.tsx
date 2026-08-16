"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { Dropzone, type SelectedFile } from "@/components/app/Dropzone";
import { createJob } from "@/lib/api";

export default function UploadPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);

    try {
      const { job_id } = await createJob(selected.file);
      router.push(`/app/jobs/${job_id}`);
    } catch (cause) {
      setSubmitting(false);
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not reach the API. Is it running on port 8000?"
      );
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-forest">Extract features</h1>
        <p className="mt-3 text-muted">
          Upload a village orthophoto. It will be tiled, passed through the segmentation heads,
          polygonised and stitched back into vector layers you can inspect class by class.
        </p>

        <div className="mt-10">
          <Dropzone onSelect={setSelected} disabled={submitting} />
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-class-buildings">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!selected || submitting}
          className="mt-8 w-full rounded-full bg-green-bright px-6 py-3.5 font-medium text-white transition-colors hover:bg-green disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted"
        >
          {submitting ? "Uploading…" : "Run extraction"}
        </button>
      </div>
    </AppShell>
  );
}
