# PS 1705 — SIH 2026 PPT Content Report
### Full slide-by-slide content, architecture diagrams, and talking points, mapped to the official SIH template (6 slides max, including title)

This report is written **in the exact order and structure of the official SIH2026-IDEA-Presentation-Format**. Each section below = one slide. Use this as the content source; you build the actual visual PPT from it. Diagrams are described precisely (boxes/arrows/layers) so you can redraw them cleanly in PowerPoint/Figma/draw.io.

Official constraints to respect (from the template's instruction slide):
- Max **6 slides total**, including title.
- **No paragraphs** — points, diagrams, infographics only.
- Precise, easy to understand.
- Idea must be unique and novel.
- Must use the provided template layout, can't change the pointer structure.
- Final upload is **PDF only**.

---

## SLIDE 1 — TITLE PAGE

Content fields to fill (per template):

| Field | Content |
|---|---|
| Problem Statement ID | 1705 |
| Problem Statement Title | Development and Optimization of AI model for Feature identification/Extraction from drone orthophotos |
| Theme | Robotics and Drones |
| PS Category | Software |
| Team ID | *(fill in from portal)* |
| Team Name | *(fill in)* |

**Design note:** keep it minimal — this slide is pure metadata, don't over-decorate it. Judges skim it in 2 seconds. Save your visual energy for Slides 2–3.

---

## SLIDE 2 — IDEA TITLE / PROPOSED SOLUTION

**Idea title (pick one, short and specific — not generic):**
> "GeoVision — Multi-Head AI Pipeline for Precision Feature Extraction from SVAMITVA Drone Orthophotos"
*(or similar — avoid one-word names like "Vaayu"/"CyberPunk" that say nothing about the approach; a name that signals the technical idea reads as more serious to judges)*

### 2.1 Detailed Explanation of the Proposed Solution (bullet form for slide)

- A **cloud-based AI pipeline** that ingests raw SVAMITVA drone orthophotos (ECW/GeoTIFF) and automatically extracts three feature layers — **building footprints (+ roof-type classification), road networks, and water bodies** — as GIS-ready vector outputs.
- Uses a **shared-backbone, multi-head segmentation architecture**: one common feature extractor, with **specialized decoder heads per feature class**, instead of one generic model for everything or unrelated model families stitched together.
- **Building footprints** → segmentation head tuned for compact, boundary-precise polygons → cropped per building → **roof-type classifier** (RCC / Tiled / Tin / Other) for solar & property-tax use cases.
- **Roads** → segmentation head with a **connectivity-aware loss** so thin, tile-spanning road networks stay topologically continuous instead of fragmenting.
- **Water bodies** → segmentation head with **class-balanced loss + heavy augmentation** to handle the scarcity and visual noise (algae, vegetation overlap) that historically make this the hardest of the three classes.
- Full **georeferencing-preserving pipeline**: every tile carries its coordinate reference system (CRS) through inference and back, so outputs can be losslessly recombined and exported as **Shapefile / GeoJSON / GeoPackage**, ready for GIS software already used by the Ministry.
- **Optimized for deployment**: quantized, ONNX-exported models served via an async job queue, so a full village orthophoto can be processed without blocking, with progress feedback in the UI.

### 2.2 How It Addresses the Problem

- Directly answers all three PS asks: **building + road + water extraction**, **95% target accuracy** (via specialized, per-class-tuned models rather than a single compromise model), and **efficient/optimized deployment** (quantization + async serving + benchmarked inference speed).
- Removes manual GIS digitization from the SVAMITVA pipeline, which today has to scale to **~3.3 lakh surveyed villages** — automation is not optional at this scale, it's the only way the scheme can be sustained.
- Produces the exact **RCC/Tiled/Tin/Other roof classification** the PS calls out, directly enabling downstream services: **solar potential estimation, property tax assessment**.
- Vector output (SHP/GeoJSON) is built to plug into **MoPR's existing GIS ecosystem** (e.g. Gram Manchitra-style village planning tools) — not a standalone tool that dead-ends.

### 2.3 Innovation and Uniqueness of the Solution

- **Shared-backbone multi-task architecture** instead of independent models per feature — improves generalization on the historically weak water-body class by letting it benefit from shared low-level features learned on the more abundant building/road data.
- **Georeferencing round-trip built into the pipeline as a first-class step**, not a manual post-processing patch — a common failure point in similar prior approaches to this exact problem, solved from day one.
- **Boundary-aware + connectivity-aware losses per feature type**, chosen specifically to fix the two most common segmentation failure modes for this task: blotchy/jagged building masks and fragmented road networks.
- **Quantified optimization**, not just an accuracy claim — the solution reports per-class IoU/F1, model size before/after quantization, and tiles-processed-per-second, so the "efficient deployment" requirement is demonstrable, not asserted.
- **Open-benchmark pretraining strategy** (WHU/Inria/SpaceNet for buildings, Massachusetts/DeepGlobe for roads) so the pipeline is validated and demo-ready even before large volumes of real SVAMITVA-labeled data are available — de-risks the entire project timeline.

---

## SLIDE 3 — TECHNICAL APPROACH

This is the slide where the ablation table + architecture diagrams live. Keep text minimal, let the diagrams carry the weight.

### 3.1 Technologies to Be Used

**Languages:** Python (AI/data pipeline), TypeScript/JavaScript (frontend)

**AI / Modeling:**
- PyTorch (training)
- Segmentation architectures: **UNet++** (buildings), **D-LinkNet-style dilated encoder-decoder** (roads), shared-backbone variant (water)
- **EfficientNet-B0/B4** (transfer learning) for roof-type classification
- ONNX Runtime / TensorRT (optimized inference)
- Albumentations (augmentation), segmentation-models-pytorch (backbone library)

**Geospatial processing:** GDAL, Rasterio, GeoPandas, Shapely, PyProj

**Backend:** FastAPI (REST API), Celery + Redis (async job queue for large-file inference), PostgreSQL + PostGIS (spatial database)

**Frontend:** React + Next.js, Tailwind CSS, Mapbox GL JS / Leaflet (interactive layer-toggle map viewer)

**Serving/Infra:** Docker + docker-compose, GPU spot instance for training, CPU/ONNX for inference serving, TiTiler or GeoServer for tile serving, AWS/GCP/Azure (any one, pick based on team's free credits)

**Formats supported:** Input — ECW, GeoTIFF; Output — Shapefile (.SHP), GeoJSON, GeoPackage, COG-GeoTIFF

### 3.2 Methodology & Process — Diagrams to Draw

Below are three diagrams. Draw these as clean boxes-and-arrows visuals (draw.io / PowerPoint SmartArt / Figma) — don't just paste this text onto the slide.

---

#### DIAGRAM A — End-to-End System Architecture (put this as the main visual on Slide 3)

```
┌─────────────────────┐        ┌──────────────────────────┐
│   USER / MoPR STAFF  │───────▶│   WEB FRONTEND (React)   │
│  (uploads orthophoto)│        │  Upload UI + Map Viewer  │
└─────────────────────┘        └───────────┬──────────────┘
                                            │ REST API (FastAPI)
                                            ▼
                              ┌───────────────────────────┐
                              │   JOB QUEUE (Celery+Redis) │
                              │  async, tracks progress    │
                              └───────────┬────────────────┘
                                            ▼
                    ┌───────────────────────────────────────────┐
                    │        GEOSPATIAL PRE-PROCESSING           │
                    │  ECW/TIFF → COG-GeoTIFF → Tiling (w/ CRS)  │
                    │        GDAL / Rasterio                     │
                    └───────────────────┬─────────────────────────┘
                                          ▼
                    ┌───────────────────────────────────────────┐
                    │         AI INFERENCE MICROSERVICE           │
                    │   (containerized, ONNX Runtime / TensorRT)  │
                    │  ┌───────────┐ ┌───────────┐ ┌───────────┐ │
                    │  │ Building  │ │   Road    │ │  Water    │ │
                    │  │  Head     │ │   Head    │ │  Head     │ │
                    │  └─────┬─────┘ └───────────┘ └───────────┘ │
                    │        ▼                                    │
                    │  ┌───────────────┐                          │
                    │  │ Roof-Type CNN │  (per building crop)     │
                    │  └───────────────┘                          │
                    └───────────────────┬─────────────────────────┘
                                          ▼
                    ┌───────────────────────────────────────────┐
                    │   POST-PROCESSING & VECTORIZATION           │
                    │  Re-apply CRS → merge tiles → polygonize    │
                    │  (GDAL) → simplify → attribute tagging      │
                    └───────────────────┬─────────────────────────┘
                                          ▼
              ┌────────────────────────────────────────────────┐
              │      OUTPUT LAYER                                │
              │  PostGIS DB  |  SHP/GeoJSON export  |  COG tiles │
              │  served via TiTiler/GeoServer to the map viewer  │
              └───────────────────┬────────────────────────────┘
                                    ▼
                    ┌───────────────────────────────┐
                    │  INTEGRATION-READY OUTPUT       │
                    │  for MoPR's existing GIS systems│
                    └───────────────────────────────┘
```

---

#### DIAGRAM B — Multi-Head Model Architecture (this is your key differentiator visual — make it prominent)

```
                 INPUT TILE (512×512 RGB, georeferenced)
                              │
                              ▼
                ┌───────────────────────────┐
                │   SHARED ENCODER BACKBONE  │
                │ (EfficientNet / ResNet /   │
                │   Swin, ImageNet-pretrained)│
                └─────────────┬───────────────┘
             ┌─────────────────┼─────────────────┐
             ▼                 ▼                 ▼
   ┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
   │ Building Decoder  │ │ Road Decoder │ │  Water Decoder    │
   │ (UNet++ style,     │ │ (dilated,    │ │ (class-balanced,  │
   │  boundary-aware    │ │ connectivity-│ │  Tversky loss,     │
   │  loss)              │ │  aware loss) │ │  heavy aug)        │
   └─────────┬──────────┘ └──────┬───────┘ └─────────┬──────────┘
             ▼                    ▼                    ▼
     Building Mask          Road Mask            Water Mask
             │
             ▼
   ┌───────────────────────┐
   │  Crop building regions │
   └───────────┬─────────────┘
                ▼
   ┌───────────────────────┐
   │ Roof-Type Classifier   │
   │ (EfficientNet, transfer│
   │  learning)              │
   │ → RCC / Tiled / Tin /   │
   │   Other                 │
   └───────────────────────┘
```

*Talking point for this diagram:* "We use one shared backbone so the model transfers general visual understanding across tasks, but each feature gets a decoder + loss function designed for its specific geometry — compact blobs for buildings, thin connected networks for roads, irregular sparse regions for water."

---

#### DIAGRAM C — Data Pipeline / Georeferencing Round-Trip (smaller supporting diagram, or fold into speaker notes if slide is crowded)

```
Raw ECW/TIFF (multi-GB)
        │  gdal_translate
        ▼
Cloud-Optimized GeoTIFF (COG)
        │  Tile (512×512, 15% overlap) — CRS metadata attached per tile
        ▼
┌───────────────┐        ┌────────────────────┐
│ Training tiles │──────▶│ Model training/     │
│ + mask labels  │        │ fine-tuning         │
└───────────────┘        └────────────────────┘
                                     │  Inference on new tiles
                                     ▼
                          Output mask tiles (CRS re-applied
                          from the matching input tile)
                                     │  gdalwarp (merge) + gdal_polygonize
                                     ▼
                          Final Shapefile / GeoJSON,
                          correctly georeferenced
```

*Talking point:* "A common failure point in this problem space is that output tiles lose their coordinate reference system after passing through a neural network — we treat CRS-preservation as a first-class pipeline step, not an afterthought, so recombination into a final Shapefile is lossless."

### 3.3 Suggested Ablation/Comparison Table (put a compact version of this on the slide — this is your credibility differentiator)

| Model tried | Buildings IoU | Roads IoU | Water IoU | Inference speed | Verdict |
|---|---|---|---|---|---|
| Single generic U-Net (all classes) | — | — | — | — | Baseline, underperforms on shape-diverse classes |
| SAM (zero-shot) | Medium | Low | Low | Slow | Good masks, poor class-specificity, off-the-shelf only |
| Detectron2 (fine-tuned) | Low (blotchy) | Very low | Medium | Medium | Box-based framing fails on tile-spanning roads |
| FPN | Medium | High | Low | Fast | Roads only strength; poor generalization elsewhere |
| **UNet++ (ours, buildings)** | **High** | — | — | Fast (post-quantization) | **Best for compact structures** |
| **D-LinkNet-style (ours, roads)** | — | **High** | — | Fast | **Purpose-built for connectivity** |
| **Class-balanced UNet variant (ours, water)** | — | — | **Medium-High** | Fast | **Targets scarce-data / algae-confusion problem directly** |

*(Fill in actual numbers once you run experiments — even approximate real numbers beat placeholder dashes; judges will ask where these came from.)*

---

## SLIDE 4 — FEASIBILITY AND VIABILITY

### 4.1 Analysis of Feasibility

- **Technical feasibility:** all core components (segmentation architectures, GDAL geospatial tooling, transfer-learning classifiers) are proven, open-source, and don't require novel research — the innovation is in **how they're combined and tuned for this specific problem**, which is a lower-risk, higher-certainty path to a working demo than depending on bleeding-edge unproven tech.
- **Data feasibility:** SVAMITVA sample datasets (10-village drone-labeled sets referenced in the PS) plus open global benchmarks (WHU, Inria, SpaceNet, Massachusetts, DeepGlobe) give a workable path even before large volumes of real labeled data arrive.
- **Infrastructure feasibility:** cloud GPU spot instances for training + CPU/ONNX inference keep costs low and scalable; **no specialized hardware required** beyond what any mid-size GPU cloud VM offers.
- **Operational feasibility:** SHP/GeoJSON output format matches what MoPR's GIS ecosystem already consumes — integration path is realistic, not speculative.

### 4.2 Potential Challenges and Risks

| Challenge | Why it's real |
|---|---|
| Water body segmentation accuracy | Historically the hardest class in this exact problem — small training sample sizes, algae/vegetation visual confusion |
| ECW licensing | ECW format needs a paid license to write/reprocess directly; free tier is read-only |
| Large file sizes | Multi-GB orthomosaics can't be processed synchronously or fit into memory as a single tensor |
| Domain gap between open benchmarks and SVAMITVA imagery | Global datasets differ in resolution, geography, and building style from Indian rural villages |
| Achieving 95% target while keeping inference fast | Larger/more accurate models are typically slower — a real accuracy-vs-speed trade-off has to be actively managed |

### 4.3 Strategies for Overcoming These Challenges

- **Water bodies:** class-balanced sampling, Tversky/Dice loss (penalizes false negatives more), heavy color/texture augmentation, and shared-backbone transfer from the (larger) building/road training data.
- **ECW licensing:** convert to Cloud-Optimized GeoTIFF immediately on ingest (one-time, license-free read operation); all downstream processing happens on COG, never on raw ECW.
- **Large files:** tiling with overlap + windowed/streamed reads (Rasterio) so memory footprint stays constant regardless of orthomosaic size; async job queue so uploads never block the UI.
- **Domain gap:** pretrain on open benchmarks to validate the pipeline end-to-end, then fine-tune on the real SVAMITVA sample set as soon as it's available — a staged transfer-learning strategy, not a cold start.
- **Accuracy vs. speed:** quantization (INT8/FP16) and ONNX export **after** reaching target accuracy in FP32, with before/after benchmarks reported — so the trade-off is measured, not guessed.

---

## SLIDE 5 — IMPACT AND BENEFITS

### 5.1 Potential Impact on the Target Audience

- **Rural households:** faster, more accurate property cards → faster access to **bank loans and formal credit** using land as collateral.
- **Gram Panchayats / local administration:** automated, consistent feature extraction removes dependence on manual GIS labor at a scale of **lakhs of villages** — directly supports the pace SVAMITVA needs to sustain (already ~95% of its ~3.44 lakh village target as of 2026).
- **Survey of India / MoPR:** a deployable, benchmarked AI layer that plugs into the existing survey-to-property-card pipeline, reducing turnaround time per village.

### 5.2 Benefits of the Solution

| Dimension | Benefit |
|---|---|
| **Social** | Fewer property disputes via precise, consistent boundary data; formal land ownership for historically undocumented rural households |
| **Economic** | Faster property card issuance → faster loan access; automated roof-type classification directly feeds **solar energy potential** and **property tax assessment** calculations at scale |
| **Administrative** | Removes manual digitization bottleneck; consistent, auditable, reproducible outputs across all surveyed villages |
| **Environmental** | Enables data-driven **village-level planning** — water body mapping supports conservation and flood-risk planning; solar potential mapping supports renewable-energy rollout |
| **Scalability** | Cloud-native, containerized design means the same pipeline that processes one village scales to the remaining lakh+ villages without architectural changes |

---

## SLIDE 6 — RESEARCH AND REFERENCES

List these on the slide (short titles + year is enough, keep full citations in your notes/report, not on the visual):

- Kirillov, A. et al., *"Segment Anything,"* ICCV 2023
- Zhou, L., Zhang, C., Wu, M., *"D-LinkNet: LinkNet with Pretrained Encoder and Dilated Convolution for High Resolution Satellite Imagery Road Extraction,"* CVPRW 2018
- ISPRS Inria Aerial Image Labeling Benchmark (building segmentation)
- ISPRS Archives, *"Deep Learning Based Roof Type Classification Using Very High Resolution Aerial Imagery,"* 2021
- Survey of India / Ministry of Panchayati Raj — SVAMITVA Scheme official press releases (PIB, 2026) — village coverage and property-card statistics
- SpaceNet, DeepGlobe, Massachusetts Roads Dataset — open benchmark datasets referenced for pretraining/validation strategy

*(Add live hyperlinks for each in the actual PPT, since it's exported to PDF — clickable links are fine.)*

---

## Speaker-Notes Cheat Sheet (for Q&A, not on slides)

Judges will likely probe these — have answers ready:

1. **"How exactly do you measure 95% accuracy?"** → Per-class IoU/F1 on a held-out validation split; be upfront that water bodies will likely be the hardest to hit 95% on, and explain your specific mitigation (class-balanced loss, shared backbone transfer).
2. **"What happens with a real multi-GB orthophoto, not a toy tile?"** → Explain the tiling + async job queue + COG-streaming approach; if possible, actually demo processing time on a large sample.
3. **"How is this different from just using SAM out of the box?"** → SAM is zero-shot and class-agnostic; you need class-specific, geometry-aware decoders with domain-specific fine-tuning to reliably distinguish buildings/roads/water and hit accuracy targets at production scale.
4. **"How does this integrate into what the Ministry already has?"** → SHP/GeoJSON/GeoPackage export, PostGIS storage, COG tile serving — standard GIS interoperability formats, not a closed proprietary output.
5. **"What's your model size / inference time per village?"** → Have actual numbers from your quantized ONNX model benchmarks ready — this is the single most concrete, most-differentiating number you can bring to the table.
