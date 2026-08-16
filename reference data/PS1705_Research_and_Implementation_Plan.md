# PS 1705 — AI Feature Extraction from SVAMITVA Drone Orthophotos
## Research Findings, Critical Analysis & Winning Implementation Plan

---

## 1. What Judges Are Actually Scoring You On

Before any tech talk: SIH evaluators score on **innovation, technical depth, feasibility, and demonstrable working impact** — and repeatedly, past winners and mentors say two things decide finals: **(1) a genuinely working prototype that matches the PPT**, and **(2) a solution that shows you understood the problem statement owner's (Ministry of Panchayati Raj) real operational pain**, not just "we used AI." A polished PPT full of buzzwords with no functioning demo loses to a scrappier team with a live model. So the plan below is built backwards from *what you can actually demo on stage*, not just what looks good on a slide.

The PS owner cares about: **95% accuracy target, processing speed/optimization, and deployment readiness into MoPR's existing systems** — these three are explicitly called out in the PS text. Your PPT and prototype must visibly address all three, not just "we built a model."

---

## 2. Deconstructing the Problem Statement

| PS requirement (verbatim) | What it actually means for you |
|---|---|
| Building footprint extraction + roof classification (RCC/Tiled/Tin/Other) | Two-stage: **instance/semantic segmentation** of built-up area, then a **classification head** per building polygon |
| Road feature extraction | Segmentation with **topological connectivity** — broken/fragmented roads look amateurish and score poorly |
| Waterbody extraction | Segmentation on a **severely underrepresented class** — this is the hardest part technically, and where every past team (including Vaayu) struggled |
| 95% target accuracy | Judges will ask "95% of what metric, measured how?" — you need **IoU/F1 per class**, not a vague "accuracy" number. Be ready to defend this |
| Optimize for efficient processing/deployment | Judges will ask about **inference time per village/tile**, model size, and whether it can run on modest government-cloud hardware — not just a Colab demo |
| Cloud-based solution | Needs an actual **deployed, reachable URL/API**, not "we plan to deploy" |
| Integration into MoPR's existing systems | You should show a plan for **SHP/GeoTIFF/GeoJSON export** compatible with the Gram Manchitra / GIS ecosystem MoPR already uses |

---

## 3. Critical Analysis of the Two Reference Teams

### Team CyberPunk (WCOE20) — the weaker submission
**What's wrong with it, concretely:**
- Single monolithic U-Net for *all* features (buildings + roads + water) with **no separate handling per feature class** — this almost always underperforms because buildings, roads, and water have very different shape statistics (compact blobs vs. thin connected networks vs. irregular polygons).
- No roof-type classification pipeline described at all, despite it being explicitly in the PS.
- No mention of **how ECW/SHP data is actually handled** (tiling, georeferencing, CRS) — a glaring gap; judges who know the domain will catch this immediately.
- "Cloud-based platform" and "95% accuracy" are asserted with zero methodology to back them — pure marketing language, easy to pick apart in Q&A.
- Very thin tech stack (Flask/Django + TensorFlow/Keras) with no deployment/serving architecture, no MLOps, no monitoring, no scalability story.
- Only 6 slides, generic "impact" language, weak/irrelevant research citations mixed with typos ("Xun Thong Cham" paper is actually about *domain adaptation*, not really central to their approach — feels bolted on for the reference slide rather than genuinely informing the design).

**Verdict:** This is a "made the deck the night before" submission. Easy to beat on substance alone.

### Team Vaayu (13682) — the stronger submission, but with real, documented flaws
Their own open-sourced repo is a goldmine — they candidly documented what failed. Key lessons to **exploit**:

1. **They didn't win** despite a very ambitious stack (SAM + YOLO + UNet + blockchain + AR + LLM chatbot). This is the single most important data point: **feature bloat did not win**. Blockchain for land records, AR visualization, and an LLM chatbot are impressive-sounding but tangential — they likely diluted engineering time away from the core 95%-accuracy segmentation problem the PS actually asks for, and could have looked like "buzzword stuffing" to judges who explicitly warn against this.
2. **Model selection process** (documented in their README):
   - **SAM (zero-shot)**: decent masks but picks up irrelevant objects; unusable for roads/water out of the box.
   - **LangSAM**: broke down on dense building clusters (overlapping bounding boxes) — a scaling failure mode you must anticipate.
   - **Detectron2 (fine-tuned)**: best for water bodies (their only model that generalized with scarce water training data) but produced **blotchy, jagged building masks**, and totally failed on roads because roads span the whole tile, breaking Detectron's box-based instance framing.
   - **FPN**: good for roads, poor for buildings and water (same blotchiness issue, worse water generalization due to sparse data).
   - **UNet++ (final winner internally)**: best all-round, especially for buildings — but they explicitly admit **water body accuracy was much lower than buildings/roads because of (a) limited training data and (b) algae-covered water bodies being confused with grass/vegetation** — a spectral/textural confusion problem, not just a data volume problem.
3. Their actual competition-day pipeline was a **patchwork** (FPN for roads + buildings, Detectron2 for water) that they themselves admit had unacceptable building performance and ran out of time before fixing it.
4. Real infra pain they documented: **ECW is a proprietary format you can't process directly without a paid GDAL license** (read-only for free), multi-GB TIFFs after conversion, and a **fragile georeferencing round-trip** — output mask tiles lose their CRS after inference and must be manually re-stamped before they can be polygonized back to Shapefiles. This is a non-obvious but critical engineering detail almost every team gets wrong on day one.

**The opportunity for you:** Vaayu essentially left a roadmap of exactly what to fix. Winning this PS in 2026 is about **taking their honest post-mortem and actually solving it**, while being disciplined about NOT re-adding scope-creep features (blockchain/AR/chatbot) that didn't help them win.

---

## 4. What's Changed in the Field Since Late 2024 (Use This to Look Current)

- **SVAMITVA scale (as of mid-2026, from PIB/Survey of India):** drone survey completed in **~3.3 lakh villages** (~95% of the ~3.44 lakh target), **2.7–3.1 crore property cards** issued, covering **31 states/UTs**. Quote this — it shows you understand the operational scale (this is not a toy problem; MoPR needs something that works at *lakhs of villages*, which argues strongly for automation over manual GIS work). <br> *(Sources: PIB, Survey of India, ESRI India blog — Aug 2026)*
- Foundation-model-for-remote-sensing research has matured a lot since 2024: models like **SAMPolyBuild** (SAM adapted specifically for polygonal *building* extraction) and prompt-driven "Offset Building Model" work show the field has moved from generic SAM to **domain-adapted SAM variants** purpose-built for footprints — exactly Vaayu's weak point.
- For **roads specifically**, 2025-26 research (FADENet, hybrid D-LinkNet variants) confirms **D-LinkNet-style dilated-convolution encoder-decoders with connectivity-aware losses** remain the strongest lightweight approach, consistently benchmarked on DeepGlobe/Massachusetts road datasets — this is a much better starting point than FPN or Detectron2 for roads.
- For **water bodies**, current literature pairs **spectral indices (NDWI-style band ratios) as an auxiliary channel** with a segmentation CNN specifically to solve the "algae/vegetation confusion" problem Vaayu ran into — since your imagery is RGB-only (no NIR band typically in these drone datasets), the practical equivalent is **texture/color-based auxiliary features + heavier augmentation + class-balanced loss (Dice/Tversky) + transfer learning from a pretrained water-segmentation checkpoint**, not just "more UNet."
- **Transformer-based segmenters (SegFormer, Mask2Former w/ Swin backbone)** now consistently beat CNN-only encoders (DeepLabV3+, PSPNet) on building extraction benchmarks when compute allows — a good **stretch goal / ablation** to show in your "we explored X and chose Y because Z" slide, which is exactly the kind of rigor judges reward.

---

## 5. Recommended Technical Architecture

### 5.1 Data Pipeline (fix Vaayu's exact pain points)
1. **Ingest**: accept ECW/TIFF + shapefiles (training) or raw drone-flight orthomosaic (inference).
2. **Convert**: `gdal_translate` ECW→COG-GeoTIFF (Cloud-Optimized GeoTIFF) — COG instead of a flat TIFF avoids the "multi-GB unusable file" problem and enables partial/windowed reads.
3. **Tile**: fixed-size overlapping tiles (e.g., 512×512 or 1024×1024 with ~15% overlap) instead of Vaayu's 3000×3000 — smaller tiles train faster, fit consumer GPUs, and overlap + weighted stitching removes the tile-boundary seams that cause "blotchy" outputs (their documented failure mode).
4. **Preserve georeferencing across inference**: bake this into the pipeline as a first-class step (not an afterthought like Vaayu's) — carry each tile's affine transform/CRS as metadata alongside the tensor, and re-apply it programmatically to every output mask before recombination. This alone fixes one of Vaayu's most annoying documented bugs.
5. **Recombine + vectorize**: `gdal_merge`/`gdalwarp` → `gdal_polygonize` → simplify polygons (Douglas-Peucker) → attach attributes (roof type, area, class) → export **.SHP / GeoJSON / GeoPackage**.

### 5.2 Model Strategy — Specialized Models, Not One-Size-Fits-All
Do **not** repeat CyberPunk's mistake of one U-Net for everything, and don't repeat Vaayu's mistake of stitching together unrelated model families without a common backbone. Use **one shared encoder family, task-specific decoder heads** — this is both technically sound (multi-task learning improves generalization on scarce classes like water) and a strong "innovation" talking point.

| Feature | Recommended model | Why |
|---|---|---|
| **Buildings** | UNet++ / SegFormer with EfficientNet or Swin backbone, boundary-aware loss (Dice + boundary IoU) | UNet++'s nested skip connections were empirically Vaayu's best performer; adding a boundary loss term directly targets the "blotchy mask" failure everyone hit |
| **Roads** | D-LinkNet-style dilated encoder-decoder + connectivity/topology loss | Purpose-built for thin, elongated, tile-spanning structures — exactly where FPN/Detectron2 struggled |
| **Water bodies** | Same backbone as buildings, fine-tuned with **class-balanced sampling, heavy color/texture augmentation, Tversky loss (penalize false negatives more)**, optionally pretrained on a water-segmentation checkpoint before fine-tuning on SVAMITVA data | Directly targets Vaayu's documented algae-vs-vegetation confusion and small-sample problem |
| **Roof-type classification (RCC/Tiled/Tin/Other)** | Two-stage: segment building → crop → EfficientNet-B0/B4 classifier (transfer learning, ImageNet-pretrained) per crop | Literature (ISPRS roof-classification studies) shows EfficientNet-based transfer learning is compute-efficient and strong even with limited labeled roofs — much cheaper than retraining a segmentation backbone per roof type like Vaayu did |
| **Optional stretch** | Mask2Former (Swin backbone) as an ablation/comparison slide | Shows rigor: "we benchmarked CNN vs. transformer segmenters and chose X because of Y speed/accuracy trade-off" — a strong technical-depth talking point in Q&A |

**Model optimization for the "efficient deployment" requirement** (a PS line almost every team ignores in the prototype, only in words):
- Quantize (INT8/FP16) + prune final models — actually **measure and report** inference-time/model-size before vs. after in your PPT.
- Export to **ONNX/TensorRT** for serving — mention this explicitly; it directly answers the PS's "optimize the model for efficient processing and deployment" clause.
- Report **tiles/sec on a single GPU vs CPU**, and extrapolate to "time to process one village's orthophoto" — a concrete, defensible number beats a vague "95% accuracy" claim.

### 5.3 System / Tech Stack

**Frontend:** React + Next.js, Tailwind CSS, Mapbox GL JS / Leaflet for interactive map visualization of extracted layers (buildings/roads/water toggle, roof-type color coding) — this is a big visual "wow factor" for the demo.

**Backend:** FastAPI (async, good for I/O-heavy geospatial jobs) with a **task queue (Celery + Redis)** for long-running inference jobs — large orthophotos cannot be processed synchronously in an HTTP request; a queue + job-status endpoint is both correct engineering and a good demo talking point ("look, we show a progress bar while it processes the drone imagery").

**AI Serving:** PyTorch models exported to ONNX Runtime / TorchServe (or a lightweight FastAPI inference microservice) — keep AI serving as its own container, decoupled from the web backend (microservices, which the PS explicitly hints at with "integration into MoPR's existing systems").

**Geospatial processing:** GDAL, Rasterio, GeoPandas, Shapely — same core as Vaayu but automated in Python instead of manual QGIS/OSGeo4W batch scripts, which is both faster to demo and removes a huge amount of manual-step fragility.

**Storage & serving of geospatial outputs:** PostGIS (spatial DB for querying extracted features), and serve raster tiles via a **COG + TiTiler** setup (or GeoServer/MapTiler) rather than shipping raw giant TIFFs to the frontend — this is exactly the kind of "we thought about production, not just a Colab demo" detail that separates finalist teams from the rest.

**Cloud infra:** any one of AWS/GCP/Azure with GPU spot instances for training, CPU/ONNX inference for serving (cost-realistic — mention $/village processed as an economic-feasibility number, judges love a concrete cost figure).

**Containerization:** Docker + docker-compose (or a single k8s manifest if you want to look more mature) for reproducible deployment — trivial to add, high credibility payoff.

**Output/GIS interoperability:** SHP, GeoJSON, KML, and GeoPackage export — explicitly support `.SHP` since that's what MoPR/Survey of India's existing GIS tooling consumes (this is literally called out in the PS and in Vaayu's slide).

### 5.4 What to *Deliberately Cut* From Vaayu's Scope
Be explicit about this in your PPT's "Innovation & Uniqueness" or "Feasibility" slide — it signals maturity, not weakness:
- **Blockchain for land records** — orthogonal to the PS (which is about *feature extraction*, not land-title custody), adds huge unnecessary complexity, and wasn't what got them judged on. Cut it or mention it only as a "future scope" one-liner.
- **AR visualization / Unity-Unreal integration** — cool but not what the 95%-accuracy, deployment-efficiency PS is testing. Also a huge time sink for a hackathon build.
- **LLM chatbot over segmented images** — fine as a lightweight "ask a question about this village's features" natural-language wrapper over your GeoJSON output (cheap to build with a small RAG layer over structured attribute data), but don't let it become a distraction from the core segmentation quality.

Replace that saved effort with things that **directly move the accuracy/deployment needle**: more rigorous data augmentation, an actual quantitative ablation table (model vs. IoU vs. inference time), and a genuinely working, demoable inference pipeline end-to-end (upload → processing → downloadable SHP + map view).

---

## 6. Data Strategy (Since You Likely Won't Have Real SVAMITVA Data Yet)

- Request the **official SVAMITVA sample dataset** (10-village drone-labeled set mentioned in the PS) from your SIH nodal center / PS mentor as early as possible — this is the single highest-leverage ask.
- While waiting, **pretrain/prototype on open benchmarks** so your pipeline and code are ready on day one:
  - **Buildings:** WHU Building Dataset, Inria Aerial Image Labeling, SpaceNet 1/2 (all VHR aerial, closely match SVAMITVA's ~50cm-and-finer drone resolution).
  - **Roads:** Massachusetts Roads Dataset, DeepGlobe Road Extraction.
  - **Water bodies:** any of the open water-segmentation datasets built for the DeepGlobe/Sentinel water-extraction tasks (or crop water-body classes out of ISPRS Potsdam/Vaihingen).
  - **Roof material:** harder to find open-labeled data for RCC/Tiled/Tin classes specifically (this is an India-specific taxonomy) — plan on **manual labeling of a few hundred crops** from whatever sample imagery you get, aided by transfer learning so you don't need thousands of examples.
- Mention this "pretrain on open global benchmarks → fine-tune on the SVAMITVA sample set" strategy explicitly in your PPT's methodology — it answers the inevitable judge question "what if you don't get much real data?" before it's asked.

---

## 7. Suggested PPT Structure (6 slides, SIH finals format)

Multiple guides converge on the same advice: **4-6 slides, visuals over text, a working demo link/video embedded**. Suggested structure:

1. **Title + Problem understanding** — restate the PS in your own words with the *scale* stat (3.3 lakh villages surveyed) to show you understand this is a national-scale infra problem, not a toy dataset.
2. **Proposed solution** — the multi-head, shared-backbone architecture diagram (buildings/roads/water/roof) — one clean architecture diagram beats five bullet points.
3. **Technical approach & what we tried** — a small **ablation/comparison table** (models tried → IoU/F1 → inference time) modeled on what Vaayu *should* have shown but didn't formalize. This single table is your biggest differentiator — it proves rigor instead of assertion.
4. **Feasibility & how we solved past teams' failure points** — briefly and diplomatically reference the *general* lessons the domain has taught (georeferencing loss, water-body scarcity, tile-boundary artifacts) and how your pipeline specifically addresses each — do **not** name-drop the other teams by name on a public slide; frame it as "known challenges in this problem space."
5. **Impact & deployment architecture** — system diagram (upload → queue → inference → vectorize → GIS export → MoPR system integration), plus concrete numbers: villages/hour processed, cost per village, model size.
6. **Demo + roadmap** — screenshot/GIF of your working map UI with layer toggles, a QR code or link to a live demo, and a 2-3 line future-scope (mention chatbot/AR as *future* work only, don't build it now).

---

## 8. Build Roadmap (Suggested Order of Work)

1. **Week 1:** Data pipeline — ECW/TIFF→COG conversion, tiling with overlap, georeference-preserving inference wrapper (fix Vaayu's #1 documented bug first, it blocks everything downstream).
2. **Week 1-2:** Train baseline UNet++ on open building datasets (WHU/Inria) to validate pipeline end-to-end before real data arrives.
3. **Week 2:** Add D-LinkNet road model + connectivity loss; validate on Massachusetts/DeepGlobe.
4. **Week 2-3:** Water-body model with class-balanced loss + augmentation; this is your hardest problem, budget the most iteration time here.
5. **Week 3:** Roof-type classifier (EfficientNet transfer learning) on manually labeled crops.
6. **Week 3-4:** Swap in real SVAMITVA sample data once available, fine-tune all four heads.
7. **Week 4:** Model optimization (quantization/ONNX export), inference-speed benchmarking.
8. **Week 4-5:** Web app (upload → job queue → map viewer → SHP/GeoJSON export), Docker packaging, deploy to cloud with a public demo URL.
9. **Final week:** PPT build using the structure above, rehearse the ablation-table Q&A, record a backup demo video in case of live-demo failure at finals.

---

## 9. Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| No real SVAMITVA data before internal round | Pipeline + models pre-validated on open benchmarks (Section 6); swap-in is then just a fine-tuning run |
| Water body accuracy stays low (documented industry-wide problem) | Set expectations honestly in your PPT — show it as your hardest metric and explain your specific mitigations (class-balanced loss, augmentation) rather than hiding a weak number |
| ECW licensing blocks processing | Use free-tier ECW *reading* (GDAL can read, not write/reproject without a license) — convert to COG immediately on ingest, never process ECW directly downstream |
| Demo fails live | Always have a recorded video backup; keep the live demo pointed at a **pre-warmed** small sample tile, not a cold multi-GB file |
| Judges probe the "95% accuracy" claim | Have per-class IoU/F1 numbers ready, not a single blended number — and be honest that water bodies will likely be your weakest metric |

---

## 10. Key References Worth Citing in Your PPT

- Kirillov et al., *"Segment Anything,"* ICCV 2023 — baseline SAM comparison.
- Zhou, Zhang & Wu, *"D-LinkNet: LinkNet with Pretrained Encoder and Dilated Convolution for High Resolution Satellite Imagery Road Extraction,"* CVPRW 2018 — road model justification.
- ISPRS Aerial Image Labeling benchmark (Inria) — building segmentation baseline.
- ISPRS Archives, *"Deep Learning Based Roof Type Classification Using Very High Resolution Aerial Imagery,"* 2021 — roof classifier justification.
- Survey of India / PIB press releases (2026) — SVAMITVA scale statistics.
- Team Vaayu's open-sourced repo (`github.com/Kabeer2004/ProjectVaayu`) — cite generally as "prior work in this problem space" for the model-comparison table, without over-relying on it as your own methodology.

---

### Bottom line
Nobody who tackled this PS before you actually solved water bodies well, nobody formalized a real accuracy/speed ablation table, and the strongest team lost partly because they spent effort on blockchain/AR/chatbot instead of the core 95%-accuracy ask. Your win condition is: **narrower scope, deeper rigor on the three segmentation tasks + roof classification, a genuinely working end-to-end demo with real georeferenced GIS output, and honest, quantified numbers in the PPT instead of assertions.**
