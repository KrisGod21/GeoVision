"""Placeholder extractor used until the trained model is ready.

Design intent: exercise the real contract end to end -- staged progress,
per-class mask artifacts, GeoJSON, statistics -- so that swapping in the ONNX
model changes this file and nothing else.

The masks come from crude HSV colour thresholds on the uploaded image. They are
genuinely derived from the input, so the compare slider lines up and the layer
toggles do something real. They are emphatically NOT model output, and every
result is tagged with ``provenance`` so the UI can say so plainly. Pretending
otherwise would be the one genuinely dishonest thing this prototype could do.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import numpy as np
from PIL import Image

from .adapter import (
    STAGE_ORDER,
    ExtractionResult,
    ExtractionStats,
    FeatureClass,
    ProgressCallback,
    Stage,
)

PROVENANCE = "heuristic-placeholder"

#: RGB paint for each class. Matches the frontend tokens exactly.
CLASS_COLOURS: dict[FeatureClass, tuple[int, int, int]] = {
    FeatureClass.BUILDINGS: (239, 68, 68),
    FeatureClass.ROADS: (250, 204, 21),
    FeatureClass.WATER: (59, 130, 246),
    FeatureClass.VEGETATION: (74, 222, 128),
}

#: Working resolution for thresholding. Full-size rasters are pointlessly slow
#: to threshold and the masks are upscaled back before being written.
MAX_WORK_EDGE = 1400

#: Resolution for connected-component labelling, which is the expensive step.
MAX_LABEL_EDGE = 420

#: Components smaller than this fraction of the labelled image are noise.
MIN_BUILDING_AREA_FRACTION = 0.00035

#: Seconds of simulated work per stage, so the staged progress UI is visible.
STAGE_DURATION_S = 0.9


class StubExtractor:
    """Implements :class:`~api.models.adapter.FeatureExtractor`."""

    def __init__(self, stage_duration_s: float = STAGE_DURATION_S) -> None:
        self._stage_duration_s = stage_duration_s

    async def extract(
        self,
        image_path: Path,
        out_dir: Path,
        on_progress: ProgressCallback,
    ) -> ExtractionResult:
        # A missing input is a real failure and must surface as one. It is
        # distinct from a file that exists but cannot be decoded, which
        # degrades gracefully below.
        if not image_path.exists():
            raise FileNotFoundError(f"No such image: {image_path}")

        out_dir.mkdir(parents=True, exist_ok=True)

        image = self._open(image_path)
        if image is None:
            # A GeoTIFF variant Pillow cannot decode. The job still succeeds --
            # the file is accepted and stored -- but there is nothing to show
            # until rasterio arrives with the real model.
            for stage in STAGE_ORDER:
                on_progress(stage, 1.0)
                await asyncio.sleep(self._stage_duration_s / 4)
            return ExtractionResult(
                overlay_path=image_path,
                layer_paths={},
                geojson_path=self._write_geojson(out_dir, []),
                stats=ExtractionStats(),
                provenance="unsupported-raster",
            )

        await self._run_stage(Stage.TILING, on_progress)

        work = self._downscale(image, MAX_WORK_EDGE)
        masks = self._classify(work)
        await self._run_stage(Stage.INFERENCE, on_progress)

        boxes, roof_types = self._label_buildings(masks[FeatureClass.BUILDINGS], work.size)
        geojson_path = self._write_geojson(out_dir, boxes)
        await self._run_stage(Stage.POLYGONIZING, on_progress)

        layer_paths = self._write_layers(masks, image.size, out_dir)
        overlay_path = self._write_overlay(image, masks, out_dir)
        await self._run_stage(Stage.STITCHING, on_progress)

        stats = self._summarise(masks, boxes, roof_types, image.size, work.size)

        return ExtractionResult(
            overlay_path=overlay_path,
            layer_paths=layer_paths,
            geojson_path=geojson_path,
            stats=stats,
            provenance=PROVENANCE,
        )

    # -- stages ---------------------------------------------------------------

    async def _run_stage(self, stage: Stage, on_progress: ProgressCallback) -> None:
        """Reports a stage as a few steps so the progress bar moves smoothly."""
        steps = 4
        for step in range(1, steps + 1):
            on_progress(stage, step / steps)
            await asyncio.sleep(self._stage_duration_s / steps)

    # -- image handling -------------------------------------------------------

    @staticmethod
    def _open(image_path: Path) -> Image.Image | None:
        try:
            with Image.open(image_path) as opened:
                return opened.convert("RGB")
        except Exception:
            return None

    @staticmethod
    def _downscale(image: Image.Image, max_edge: int) -> Image.Image:
        width, height = image.size
        longest = max(width, height)
        if longest <= max_edge:
            return image
        scale = max_edge / longest
        return image.resize((max(1, int(width * scale)), max(1, int(height * scale))), Image.BILINEAR)

    # -- classification -------------------------------------------------------

    @staticmethod
    def _classify(image: Image.Image) -> dict[FeatureClass, np.ndarray]:
        """Splits an image into class masks by HSV thresholds.

        Pillow's HSV packs hue into 0-255 rather than degrees, so the bounds
        below are degrees scaled by 255/360.
        """
        hsv = np.asarray(image.convert("HSV"), dtype=np.int16)
        hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]

        vegetation = (hue >= 42) & (hue <= 120) & (sat > 60) & (val > 30)

        # Water is dark blue. The upper bound on value matters: without it, sky
        # in an oblique photograph is classified as a water body, which on a
        # test image produced 26 hectares of water in a village that has none.
        water = (hue >= 127) & (hue <= 184) & (sat > 50) & (val > 25) & (val < 140)

        # Warm roofs: the red/brown tiles that dominate rural Indian rooftops.
        warm_roof = ((hue <= 21) | (hue >= 241)) & (sat > 70) & (val > 45)
        # Flat concrete roofs read as bright and desaturated. The upper bound
        # excludes blown-out cloud, which is otherwise indistinguishable and
        # produced building footprints floating in the sky.
        concrete_roof = (sat < 46) & (val > 110) & (val < 205)
        buildings = (warm_roof | concrete_roof) & ~vegetation & ~water

        # Whatever grey is left in the mid tones stands in for road surface.
        roads = (sat < 55) & (val > 60) & (val <= 150) & ~buildings & ~vegetation & ~water

        return {
            FeatureClass.BUILDINGS: buildings,
            FeatureClass.ROADS: roads,
            FeatureClass.WATER: water,
            FeatureClass.VEGETATION: vegetation,
        }

    # -- building components --------------------------------------------------

    def _label_buildings(
        self, mask: np.ndarray, work_size: tuple[int, int]
    ) -> tuple[list[tuple[int, int, int, int]], list[str]]:
        """Finds building components and guesses a roof type for each.

        Uses an iterative flood fill on a downscaled mask. Recursion would blow
        the stack on any real-sized raster, and pulling in scipy for one
        labelling call is not worth the dependency.
        """
        height, width = mask.shape
        longest = max(width, height)
        if longest > MAX_LABEL_EDGE:
            scale = MAX_LABEL_EDGE / longest
            small = np.asarray(
                Image.fromarray(mask.astype(np.uint8) * 255).resize(
                    (max(1, int(width * scale)), max(1, int(height * scale))), Image.NEAREST
                )
            ) > 127
        else:
            scale = 1.0
            small = mask

        visited = np.zeros_like(small, dtype=bool)
        min_area = max(4, int(small.size * MIN_BUILDING_AREA_FRACTION))

        boxes: list[tuple[int, int, int, int]] = []
        rows, cols = small.shape

        for start_row in range(rows):
            for start_col in range(cols):
                if not small[start_row, start_col] or visited[start_row, start_col]:
                    continue

                stack = [(start_row, start_col)]
                visited[start_row, start_col] = True
                pixels = 0
                min_r = max_r = start_row
                min_c = max_c = start_col

                while stack:
                    r, c = stack.pop()
                    pixels += 1
                    min_r, max_r = min(min_r, r), max(max_r, r)
                    min_c, max_c = min(min_c, c), max(max_c, c)

                    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < rows and 0 <= nc < cols and small[nr, nc] and not visited[nr, nc]:
                            visited[nr, nc] = True
                            stack.append((nr, nc))

                if pixels >= min_area:
                    inv = 1.0 / scale
                    boxes.append(
                        (
                            int(min_c * inv),
                            int(min_r * inv),
                            int((max_c + 1) * inv),
                            int((max_r + 1) * inv),
                        )
                    )

        # Roof type needs the real classifier. Until then every footprint is
        # reported as unclassified rather than invented.
        roof_types = ["Unclassified"] * len(boxes)
        return boxes, roof_types

    # -- artifacts ------------------------------------------------------------

    @staticmethod
    def _write_layers(
        masks: dict[FeatureClass, np.ndarray],
        full_size: tuple[int, int],
        out_dir: Path,
    ) -> dict[FeatureClass, Path]:
        """Writes one transparent PNG per class.

        Separate files are what let the UI toggle layers instantly, with no
        server round-trip.
        """
        paths: dict[FeatureClass, Path] = {}
        for feature_class, mask in masks.items():
            red, green, blue = CLASS_COLOURS[feature_class]
            height, width = mask.shape
            rgba = np.zeros((height, width, 4), dtype=np.uint8)
            rgba[..., 0] = red
            rgba[..., 1] = green
            rgba[..., 2] = blue
            rgba[..., 3] = mask.astype(np.uint8) * 190

            layer = Image.fromarray(rgba, mode="RGBA")
            if layer.size != full_size:
                layer = layer.resize(full_size, Image.NEAREST)

            path = out_dir / f"layer-{feature_class.value}.png"
            layer.save(path, optimize=True)
            paths[feature_class] = path
        return paths

    @staticmethod
    def _write_overlay(
        image: Image.Image,
        masks: dict[FeatureClass, np.ndarray],
        out_dir: Path,
    ) -> Path:
        composite = image.convert("RGBA")
        for feature_class, mask in masks.items():
            red, green, blue = CLASS_COLOURS[feature_class]
            height, width = mask.shape
            rgba = np.zeros((height, width, 4), dtype=np.uint8)
            rgba[..., 0] = red
            rgba[..., 1] = green
            rgba[..., 2] = blue
            rgba[..., 3] = mask.astype(np.uint8) * 150

            layer = Image.fromarray(rgba, mode="RGBA")
            if layer.size != composite.size:
                layer = layer.resize(composite.size, Image.NEAREST)
            composite = Image.alpha_composite(composite, layer)

        path = out_dir / "overlay.png"
        composite.convert("RGB").save(path, optimize=True)
        return path

    @staticmethod
    def _write_geojson(out_dir: Path, boxes: list[tuple[int, int, int, int]]) -> Path:
        """Writes building footprints as GeoJSON.

        Coordinates are pixel space. Real world coordinates require the source
        raster's CRS and affine transform, which arrive with rasterio and the
        trained model -- inventing a CRS here would produce a file that looks
        georeferenced and is not.
        """
        features = [
            {
                "type": "Feature",
                "properties": {"class": "building", "roof_type": None, "id": index},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
                    ],
                },
            }
            for index, (x0, y0, x1, y1) in enumerate(boxes)
        ]

        document = {
            "type": "FeatureCollection",
            "crs": None,
            "properties": {
                "coordinate_space": "pixel",
                "provenance": PROVENANCE,
                "note": "Pixel coordinates. Georeferencing arrives with the trained model.",
            },
            "features": features,
        }

        path = out_dir / "features.geojson"
        path.write_text(json.dumps(document, indent=2), encoding="utf-8")
        return path

    # -- statistics -----------------------------------------------------------

    @staticmethod
    def _summarise(
        masks: dict[FeatureClass, np.ndarray],
        boxes: list[tuple[int, int, int, int]],
        roof_types: list[str],
        full_size: tuple[int, int],
        work_size: tuple[int, int],
    ) -> ExtractionStats:
        metres_per_pixel = 0.5

        # Areas are measured on the working raster, so scale back to full size.
        scale = (full_size[0] / work_size[0]) * (full_size[1] / work_size[1])
        pixel_area_m2 = metres_per_pixel**2 * scale

        water_px = int(masks[FeatureClass.WATER].sum())
        vegetation_px = int(masks[FeatureClass.VEGETATION].sum())
        road_px = int(masks[FeatureClass.ROADS].sum())

        # A rough centreline length: road area divided by an assumed width.
        assumed_road_width_m = 4.0
        road_length_m = (road_px * pixel_area_m2) / assumed_road_width_m

        roof_counts: dict[str, int] = {}
        for roof_type in roof_types:
            roof_counts[roof_type] = roof_counts.get(roof_type, 0) + 1

        return ExtractionStats(
            building_count=len(boxes),
            roof_types=roof_counts,
            road_length_m=round(road_length_m, 1),
            water_area_m2=round(water_px * pixel_area_m2, 1),
            vegetation_area_m2=round(vegetation_px * pixel_area_m2, 1),
            metres_per_pixel=metres_per_pixel,
        )
