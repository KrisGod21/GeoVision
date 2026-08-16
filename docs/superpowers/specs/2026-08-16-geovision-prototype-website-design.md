# GeoVision Prototype Website — Design

**Date:** 2026-08-16
**Context:** SIH 2026, Problem Statement 1705 (Feature extraction from SVAMITVA drone orthophotos). Team Recursion.
**Scope of this spec:** The web prototype — landing page and upload/results app. The ML model is being built separately and is not part of this work.

---

## 1. Purpose and constraints

Build a working web prototype that demonstrates the GeoVision pipeline end to end, with the ML model
represented by a swappable stub. When the real model lands, integrating it must not require changes to
API routes, response schemas, or any frontend code.

Two audiences: SIH judges viewing a live demo, and the team using it as the integration target for the model.

**Constraints**

- Runs locally on Windows with no Docker, Redis, Postgres, or GDAL toolchain required.
- Node and Python 3.13 are available. `ffmpeg`, `cwebp`, and ImageMagick are not.
- The landing page hero is a 180-frame scroll-scrub sequence and must not feel janky.
- The architecture must stay recognisably the one described in `GeoVision_Final_Architecture_Review.pdf`,
  so the demo and the documented architecture tell the same story.

**Success criteria**

- A visitor can scroll the hero at 55+ FPS on a mid-range laptop and see the segmentation reveal land.
- A visitor can upload an image, watch staged progress, and inspect a result with per-class layer toggles.
- Replacing `StubExtractor` with a real ONNX extractor requires touching exactly one file.

---

## 2. Out of scope

Deliberately excluded from this build, deferred to a later phase:

- Leaflet/Mapbox map view and editable review polygons
- SHP / KML export (GeoJSON is produced but the export panel UI is not built)
- Authentication, user accounts, persistent database
- Celery, Redis, PostGIS
- Real GeoTIFF decoding via rasterio/GDAL
- Any actual ML inference

---

## 3. Repository layout

```
web/                  Next.js 15, App Router, TypeScript, Tailwind
  app/
    page.tsx                    landing page
    app/page.tsx                upload screen
    app/jobs/[id]/page.tsx      results screen
  components/
    hero/                       hero subsystem (see §5)
    app/                        upload + results components
    site/                       nav, footer, cards, stats
  lib/
    hero/                       pure scrub logic (unit tested)
    api.ts                      typed client for the FastAPI backend
  public/
    frames/hero/                180 desktop WebP frames
    frames/hero-sm/             30 mobile WebP frames
    hero/model-output.webp      real model output image

api/                  FastAPI, Python 3.13
  main.py                       app factory, CORS, static mount
  routes/jobs.py                job endpoints
  jobs/store.py                 in-memory job store + background runner
  models/adapter.py             FeatureExtractor protocol + result types
  models/stub.py                StubExtractor (current implementation)
  storage/                      per-job artifacts on disk (gitignored)
  tests/

scripts/
  frames-to-webp.mjs            one-off asset pipeline

docs/superpowers/specs/         this document
assets/                         source media, untouched
```

`web/` and `api/` run independently: Next.js dev server on `:3000`, uvicorn on `:8000`.

---

## 4. Asset pipeline

A single Node script, `scripts/frames-to-webp.mjs`, using `sharp`. Run once; output is committed so the
site works from a fresh clone without running it.

**Inputs**

- `assets/ezgif-5ea5e051e9d0a528-jpg/ezgif-frame-001.jpg` … `-180.jpg` — 180 files, 1280×720, 6.48 MB total
- `assets/model-output.png` — 1672×941, 2.9 MB

**Outputs**

| Output | Source | Transform |
|---|---|---|
| `web/public/frames/hero/frame-001.webp` … `-180.webp` | all 180 JPGs | WebP q80, 1280×720 unchanged |
| `web/public/frames/hero-sm/frame-001.webp` … `-030.webp` | every 6th JPG | WebP q72, resized to 640×360 |
| `web/public/hero/model-output.webp` | `model-output.png` | WebP q82, 1672×941 unchanged |

The script prints before/after byte totals per output group. Those numbers are reported to the user
before any decision about trimming frame count or resolution is made.

Frames are named with a zero-padded 3-digit index so `pathFor(i)` is a pure string template.

---

## 5. Hero scroll-scrubber

The most complex part of the build. Decomposed so that a later decision to cut frame count or resolution
is a contained change.

### 5.1 Components

| Unit | Responsibility | Depends on |
|---|---|---|
| `lib/hero/scrub.ts` | Pure functions: `progressToFrameIndex`, `splitProgress`, `nearestLoadedIndex`. No DOM. | nothing |
| `lib/hero/frameLoader.ts` | Concurrency-limited image loader. Exposes `preload(n)`, `loadRest()`, `get(i)`, `loadedSet`. No DOM layout, no canvas. | `Image` |
| `components/hero/FrameSequenceCanvas.tsx` | Owns a `<canvas>`. Given `progress`, draws the right frame. Knows nothing about scroll. | `frameLoader` |
| `components/hero/useScrollScrub.ts` | Maps window scroll within a ref'd element to raw progress `0→1`, rAF-throttled. | DOM |
| `components/hero/ModelOutputReveal.tsx` | The real model-output panel and its three pins. Own asset, own lazy fetch. | none |
| `components/hero/HeroOverlay.tsx` | Wordmark, subheadline, scroll indicator. Opacity driven by progress. | none |
| `components/hero/HeroSection.tsx` | Composes the above; owns the pin container. | all of the above |
| `components/hero/PerfMonitor.tsx` | Dev-only FPS / jank readout. | none |

`FrameSequenceCanvas` receives `frameCount`, `pathFor`, `preloadCount`, and `progress` as props. It has no
knowledge of the hero's layout or of the reveal panel. Changing 180 frames to 90 means changing the props
passed by `HeroSection` and re-running the asset script — nothing inside the canvas component changes.

### 5.2 Pinning

Pure CSS sticky, no scroll-hijacking library.

```
<section style="height: 500vh">        outer, defines scroll budget
  <div class="sticky top-0 h-screen">  inner, pinned while outer is in view
```

`useScrollScrub` computes raw progress from the outer section's `getBoundingClientRect()`. Scrolling past
the outer section releases the pin naturally with no cleanup or class toggling.

### 5.3 Progress split

Raw progress splits into two phases:

| Raw range | Phase | Behaviour |
|---|---|---|
| `0 → 0.82` | scrub | `scrubProgress = raw / 0.82`, mapped to frame index `0 → 179` |
| `0.82 → 1.0` | reveal | frame stays locked at 179; `revealProgress = (raw − 0.82) / 0.18` |

The hold phase exists because the reveal panel plus three staggered pins need real scroll distance to read
comfortably; compressing them into the tail of the scrub made them flash past.

`splitProgress(raw)` returns `{ scrubProgress, revealProgress }` and is unit tested at the boundaries.

### 5.4 Frame loading

1. On mount, decide the variant (see §5.7) **before any fetch**.
2. `await` frames 1–20. The section is marked interactive only after this resolves.
3. Background-load the remaining frames in ascending order, 6 concurrent requests.
4. If the target frame is not yet loaded, draw `nearestLoadedIndex(target, loadedSet)` instead. The canvas
   is never blank once step 2 completes.

`ModelOutputReveal` fetches its single WebP when raw progress exceeds `0.45` — early enough to be decoded before
the reveal begins, late enough not to contend with the initial 20-frame preload.

### 5.5 Reveal choreography

Within `revealProgress`:

| revealProgress | Effect |
|---|---|
| `0 → 0.45` | Canvas eases into a ~52% left column. Panel translates `48px → 0` on X and fades `0 → 1`. |
| `0.50` | "Buildings" pin fades in |
| `0.65` | "Roads" pin fades in |
| `0.80` | "Water" pin fades in |
| `0.80 → 1.0` | Composed hold; nothing further animates |

The panel is a rounded card with a thin light border, soft shadow, and the caption
"Model Output · Feature Extraction" above it. It sits beside the canvas and never overlaps it.

The three pins are children of the panel element, positioned in percentage coordinates relative to it, with
short leader lines to their targets in the real overlay image. They therefore track the panel on resize and
can never drift onto the video canvas.

### 5.6 Hero content timing

| Element | Behaviour |
|---|---|
| "GeoVision" wordmark | Full opacity at raw `0`. Fades and eases down across raw `0.55 → 0.82`, gone before the reveal begins. |
| Subheadline "AI-Powered Feature Extraction from Drone Orthophotos" | Same curve as the wordmark, lighter weight. |
| Scroll-down indicator | Visible at raw `0`, fades out by raw `0.08`. Never returns. |
| Nav bar, stats strip, feature cards | Not in the hero at all. They live below the pinned section. |

The first frame must be uncluttered: wordmark, subheadline, scroll indicator, nothing else.

### 5.7 Variants

Chosen once at mount, before any image request, so a phone never downloads desktop frames.

| Condition | Behaviour | Payload |
|---|---|---|
| `prefers-reduced-motion: reduce` | No scrub. Static two-up: final frame beside `model-output.webp`, pins already visible. | 3 images |
| viewport width `< 768px` | 30-frame scrub from `hero-sm`. Reveal panel stacks **below** the canvas rather than beside it. Pins collapse into a compact colour-key legend row. | ~30 small frames + 1 |
| otherwise | Full 180-frame scrub, side-by-side reveal, full pins. | 180 frames + 1 |

The variant is recomputed on a debounced resize only if it crosses the 768px boundary, and switching
variants remounts the canvas.

### 5.8 Performance safety net

`PerfMonitor` renders only when `?perf=1` is present in the URL. It displays:

- rolling FPS (1s window)
- count of frames where the rAF delta exceeded 32ms ("dropped")
- frames loaded / total
- current frame index
- mean canvas draw time in ms

This exists so that a judgement about jank is made from numbers, not impressions. If the numbers are bad,
the user is told the actual figures and chooses between reducing frame count and reducing resolution.
Silent degradation is not acceptable.

---

## 6. Landing page below the hero

In order, after the pinned section releases:

1. **Nav bar** — becomes sticky only once the hero has exited. Links: Overview, Pipeline, Try It.
2. **Stats strip** — problem-scale figures from the PS: ~3.3 lakh villages covered, 50 cm resolution,
   4 extracted classes, 4 roof types.
3. **Feature cards** — Building footprints + roof classification, Road extraction, Water bodies,
   Georeferenced output.
4. **Pipeline section** — the six layers from the architecture document: Ingestion → Pre-processing →
   AI inference → Human verification → Post-processing → Output & integration.
5. **Accuracy note** — brief, honest framing of pixel accuracy versus per-class IoU, matching §4 of the
   architecture document. This is a differentiator, not a footnote.
6. **CTA** → `/app`.
7. **Footer.**

---

## 7. Visual system

Light site, white and green shades.

| Token | Value | Use |
|---|---|---|
| `bg` | `#FDFDFB` | page background |
| `surface` | `#FFFFFF` | cards, panels |
| `surface-tint` | `#D8F3DC` | tinted sections, subtle fills |
| `forest` | `#1B4332` | headings, dark surfaces, footer |
| `green` | `#2D6A4F` | body accents, borders |
| `green-bright` | `#40916C` | buttons, links, interactive states |
| `ink` | `#1C2321` | body text |
| `muted` | `#5A6B62` | secondary text |

**Class colours** — used identically in the hero pins, the results overlay, and the legend. Green is the
brand colour, so it cannot also encode a data class.

| Class | Colour |
|---|---|
| Buildings | `#E8A33D` amber |
| Roads | `#8B5CF6` violet |
| Water | `#22B8CF` cyan |

The hero is the one dark moment: white type over the aerial footage. Everything below it is light.

---

## 8. Upload and results app

### 8.1 `/app` — upload

Dropzone plus file picker.

- **PNG / JPG** — previewed immediately client-side.
- **TIF / TIFF** — accepted, uploaded, and stored, but shown as a placeholder card with the note that
  georeferenced preview arrives with the model integration. The browser cannot decode GeoTIFF and
  rasterio is out of scope here.
- Client-side validation: extension allow-list, 50 MB ceiling. Rejections are shown inline, not as alerts.

On submit: `POST /api/jobs` (multipart) → `{ job_id }` → navigate to `/app/jobs/{job_id}`.

### 8.2 `/app/jobs/[id]` — processing and results

Polls `GET /api/jobs/{id}` every 1000ms while status is `queued` or `running`.

**While running** — a staged progress display: Tiling → Inference → Polygonizing → Stitching. The current
stage is highlighted, completed stages are checked, and a progress bar reflects `progress` from the API.

**When complete** — fetches `GET /api/jobs/{id}/result` and renders:

- **Compare view** — a drag-to-swipe slider between the original image and the composited overlay.
- **Layer toggles** — Buildings / Roads / Water. Each class is delivered as its own transparent mask PNG,
  composited client-side, so toggling is instant and requires no server round-trip.
- **Stats panel** — building count, roof-type breakdown (RCC / Tiled / Tin / Other), total road length,
  total water area.

**On failure** — the error message from the API, and a retry link back to `/app`.

---

## 9. Backend

FastAPI. In-process asyncio job execution. No external services.

### 9.1 Endpoints

| Method | Path | Returns |
|---|---|---|
| `POST` | `/api/jobs` | `{ job_id }` — accepts multipart `file` |
| `GET` | `/api/jobs/{id}` | `{ job_id, status, stage, progress, error }` |
| `GET` | `/api/jobs/{id}/result` | `{ stats, layers[], overlay_url, geojson_url }` |
| `GET` | `/files/{job_id}/{name}` | static artifact (input, overlay, per-class masks, geojson) |

`status` is one of `queued`, `running`, `complete`, `failed`.
`stage` is one of `tiling`, `inference`, `polygonizing`, `stitching`, or `null`.
`progress` is a float `0.0 → 1.0`.

CORS permits `http://localhost:3000`.

### 9.2 Job store

`jobs/store.py` holds a dict of job records and spawns each job as an `asyncio.Task`. Artifacts are written
to `api/storage/{job_id}/`. Restarting the server loses in-flight jobs, which is acceptable for a prototype
and is the seam where Celery + Redis would later be substituted.

### 9.3 The model seam

This is the single most important interface in the build.

```python
class ExtractionResult(BaseModel):
    overlay_path: Path
    layer_paths: dict[str, Path]     # "buildings" | "roads" | "water"
    geojson_path: Path
    stats: ExtractionStats

class FeatureExtractor(Protocol):
    async def extract(
        self,
        image_path: Path,
        out_dir: Path,
        on_progress: Callable[[str, float], None],
    ) -> ExtractionResult: ...
```

`StubExtractor` implements this by walking the four stages with realistic delays, calling `on_progress` at
each, and producing artifacts derived from `assets/model-output.png` plus synthetic per-class masks,
GeoJSON, and statistics.

When the trained model is ready, `OnnxExtractor` implements the same protocol and is selected by an
environment variable. No route, no response schema, and no frontend code changes.

---

## 10. Testing

| Layer | Tool | What is covered |
|---|---|---|
| Scrub logic | Vitest | `progressToFrameIndex` across the full range and at boundaries; `splitProgress` at 0, 0.82, 1.0; `nearestLoadedIndex` with sparse loaded sets including empty and single-element cases |
| Frame loader | Vitest | Concurrency ceiling is respected; load order is ascending; a failed image does not stall the queue |
| API | pytest | Upload accepts allowed types and rejects others; job lifecycle transitions queued → running → complete; result shape matches the schema; a failing extractor produces status `failed` with a message |
| Adapter contract | pytest | A shared conformance test suite that any `FeatureExtractor` must pass, so the real extractor is verified against the same expectations as the stub |

Canvas rendering itself is not unit tested. It is verified visually and by `PerfMonitor` numbers.

---

## 11. Open risks

| Risk | Handling |
|---|---|
| 180 frames feels janky on the target machine | `PerfMonitor` gives objective numbers. If bad, report the figures and let the user choose between 90 frames and lower resolution. Do not degrade silently. |
| WebP conversion output is larger than expected | The asset script reports real totals before anything is built on top of them. |
| The real model's output shape differs from the stub's | The adapter conformance suite is written against the protocol, not the stub, so the mismatch surfaces as a test failure rather than a broken page. |
| GeoTIFF placeholder reads as a missing feature to a judge | The placeholder card states explicitly that georeferenced handling arrives with model integration, rather than failing silently. |
