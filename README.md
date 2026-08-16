# GeoVision
Link : https://geo-vision-rosy.vercel.app/

AI-powered feature extraction from SVAMITVA drone orthophotos — building footprints with roof
classification, roads, and water bodies.

Smart India Hackathon 2026 · Problem Statement 1705 · Team Recursion

The architecture this implements is documented in
[`GeoVision_Final_Architecture_Review.pdf`](GeoVision_Final_Architecture_Review.pdf), and the web
prototype's design in [`docs/superpowers/specs/`](docs/superpowers/specs).

> **The ML model is not integrated yet.** It is being built separately. Everything behind the
> `FeatureExtractor` interface is currently a labelled placeholder — see
> [Model integration](#model-integration).

---

## Layout

```
web/       Next.js 16 frontend — landing page and the upload/results app
api/       FastAPI backend — jobs, artifacts, the model seam
scripts/   Hero asset pipeline (frame extraction and optimisation)
docs/      Design specs
assets/    Source media, not shipped directly
```

## Running locally

Two processes. Node 20+ and Python 3.11+ required.

**Backend** — from the repo root:

```bash
python -m venv .venv && .venv/Scripts/activate && pip install -r api/requirements.txt
```

```bash
uvicorn api.main:app --reload --port 8000
```

**Frontend** — from the repo root:

```bash
npm --prefix web install && npm --prefix web run dev
```

Then open http://localhost:3000.

> On Windows, `localhost` can resolve to `::1` while uvicorn binds IPv4 only, which shows up as a
> hang rather than an error. The frontend defaults to `http://127.0.0.1:8000` for this reason.

## Tests

```bash
npm --prefix web test
```

```bash
.venv/Scripts/python -m pytest
```

76 frontend tests cover the hero scrub maths, the frame loader queue, and upload validation.
27 backend tests cover the job lifecycle and the extractor contract.

## Hero assets

The landing page hero scrubs a 180-frame sequence on a canvas as you scroll. The frames are built
by a one-off script whose output is committed, so a fresh clone works without running it:

```bash
npm run assets
```

Re-run it only when the source media changes. It prints the real payload cost of every decision:

| | Shipped |
|---|---|
| Desktop frames (146 distinct, 34 duplicates removed) | 5.34 MB |
| Mobile frames (30, 640×360 WebP) | 0.78 MB |
| Model output panel | 0.30 MB |
| **Desktop visitor total** | **5.64 MB** |
| **Mobile visitor total** | **1.08 MB** |

Two findings are worth knowing before changing this:

- **Desktop frames are not re-encoded.** Converting them to WebP made the payload *larger* at every
  quality tested — the source JPGs are already near-optimally compressed for grainy aerial footage.
- **The source video is 1280×720**, so that is the quality ceiling. A higher-resolution export
  would be a genuine improvement; the pipeline handles any resolution without code changes.

Append `?perf=1` to the landing page URL for a live FPS, dropped-frame and draw-time readout.

## Model integration

The entire ML surface is one interface, `api/models/adapter.py`:

```python
class FeatureExtractor(Protocol):
    async def extract(self, image_path, out_dir, on_progress) -> ExtractionResult: ...
```

To integrate the trained model:

1. Implement `FeatureExtractor` (e.g. `api/models/onnx.py`).
2. Register it in `select_extractor()` in `api/main.py`.
3. Set `GEOVISION_EXTRACTOR=onnx`.

No route, response schema, or frontend change is required. The contract tests in
`api/tests/test_adapter_contract.py` are written against the protocol rather than the placeholder,
so the real extractor is held to the same expectations — add it to `EXTRACTORS` and they run
against it unchanged.

**What the placeholder does today:** derives masks from HSV colour thresholds on the uploaded image,
so the compare slider aligns and the layer toggles do something real. Every result carries a
`provenance` field, and the UI displays a notice whenever it is not real model output. Roof types
are reported as `Unclassified` rather than invented, and the GeoJSON declares pixel coordinates with
a null CRS rather than implying georeferencing it does not have.

## Deployment

### Frontend

Any Next.js host. On Vercel, set the **root directory to `web/`**; the build is a standard
`next build` with no extra configuration.

Required environment variable:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_BASE` | Origin of the deployed API, e.g. `https://api.example.org` |

### Backend

A Dockerfile is provided. Build from the **repo root**, not `api/`:

```bash
docker build -f api/Dockerfile -t geovision-api .
```

```bash
docker run -p 8000:8000 -e GEOVISION_ALLOWED_ORIGINS=https://your-frontend.example -v geovision-data:/data/storage geovision-api
```

| Variable | Purpose | Default |
|---|---|---|
| `GEOVISION_ALLOWED_ORIGINS` | Comma-separated CORS origins. Never `*` — these endpoints accept uploads. | localhost dev origins |
| `GEOVISION_STORAGE_DIR` | Where job artifacts are written. Mount a volume, or results vanish on redeploy. | `api/storage` |
| `GEOVISION_EXTRACTOR` | Which extractor to use. | `stub` |

The architecture document names **GI Cloud (MeghRaj) / NIC-empanelled infrastructure** as the
intended deployment target, for the data-sovereignty reasons that apply to land records.

### Known limitations before production

These are deliberate prototype trade-offs, not oversights:

- **Jobs are in-process.** The queue is an asyncio task set, so in-flight jobs are lost on restart
  and the service does not scale horizontally. The architecture document's Celery + Redis queue
  substitutes at exactly one seam: `JobStore.submit`.
- **No database.** Job records are in memory; artifacts are on disk. PostGIS is the intended store.
- **No authentication.** Anyone who can reach the API can upload.
- **Artifacts are never cleaned up.** Storage grows without bound.
- **GeoTIFF is stored but not decoded.** Real windowed reads with CRS preservation arrive with
  rasterio alongside the model.
