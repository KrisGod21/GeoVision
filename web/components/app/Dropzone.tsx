"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACCEPTED_EXTENSIONS, formatBytes, validateUpload } from "@/lib/upload";

export interface SelectedFile {
  file: File;
  previewUrl: string | null;
}

export function Dropzone({
  onSelect,
  disabled,
}: {
  onSelect: (selected: SelectedFile | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedFile | null>(null);

  // Object URLs leak until revoked, and a user may try several files.
  useEffect(() => {
    return () => {
      if (selected?.previewUrl) URL.revokeObjectURL(selected.previewUrl);
    };
  }, [selected]);

  const accept = useCallback(
    (file: File | undefined) => {
      if (!file) return;

      const validation = validateUpload(file);
      if (!validation.ok) {
        setError(validation.reason);
        setSelected(null);
        onSelect(null);
        return;
      }

      setError(null);
      const next: SelectedFile = {
        file,
        previewUrl: validation.previewable ? URL.createObjectURL(file) : null,
      };
      setSelected(next);
      onSelect(next);
    },
    [onSelect]
  );

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) accept(event.dataTransfer.files[0]);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors ${
          dragging
            ? "border-green-bright bg-surface-tint"
            : "border-hairline bg-surface hover:border-green-soft"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(event) => accept(event.target.files?.[0])}
        />

        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-tint text-xl text-green">
          ↑
        </div>
        <p className="font-medium text-forest">Drop an orthophoto here, or click to browse</p>
        <p className="mt-1.5 text-sm text-muted">
          PNG, JPG or WebP · GeoTIFF accepted · up to 50 MB
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-class-buildings">
          {error}
        </p>
      )}

      {selected && (
        <div className="mt-6 flex items-center gap-4 rounded-xl border border-hairline bg-surface p-4">
          {selected.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selected.previewUrl}
              alt=""
              className="size-20 rounded-lg object-cover"
            />
          ) : (
            /* The browser cannot decode GeoTIFF, so say so rather than
               rendering a broken image. */
            <div className="flex size-20 flex-col items-center justify-center rounded-lg bg-surface-sunken text-center">
              <span className="text-[0.6rem] font-medium uppercase tracking-wider text-muted">
                GeoTIFF
              </span>
              <span className="mt-0.5 text-[0.6rem] text-muted">no preview</span>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-forest">{selected.file.name}</p>
            <p className="text-sm text-muted">{formatBytes(selected.file.size)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
