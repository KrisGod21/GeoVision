"""The seam between the web application and the ML model.

This is the most important interface in the backend. Everything upstream --
routes, job store, response schemas, the entire frontend -- depends only on
what is declared here. When the trained model is ready it arrives as another
implementation of ``FeatureExtractor`` and nothing else changes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Callable, Protocol


class Stage(str, Enum):
    """Pipeline stages, mirroring the architecture document's layers."""

    TILING = "tiling"
    INFERENCE = "inference"
    POLYGONIZING = "polygonizing"
    STITCHING = "stitching"


STAGE_ORDER: tuple[Stage, ...] = (
    Stage.TILING,
    Stage.INFERENCE,
    Stage.POLYGONIZING,
    Stage.STITCHING,
)


class FeatureClass(str, Enum):
    """Classes the pipeline extracts.

    ``VEGETATION`` is not part of Problem Statement 1705's deliverables; it is
    carried because it is trivially separable and helps a reviewer read the
    overlay. Consumers should not assume every extractor populates it.
    """

    BUILDINGS = "buildings"
    ROADS = "roads"
    WATER = "water"
    VEGETATION = "vegetation"


@dataclass
class ExtractionStats:
    """Summary figures shown beside the result."""

    building_count: int = 0
    #: RCC / Tiled / Tin / Other -> count. Empty when no classifier has run.
    roof_types: dict[str, int] = field(default_factory=dict)
    road_length_m: float = 0.0
    water_area_m2: float = 0.0
    vegetation_area_m2: float = 0.0
    #: Ground sampling distance assumed when converting pixels to metres.
    metres_per_pixel: float = 0.5


@dataclass
class ExtractionResult:
    """Everything an extractor produces for one image."""

    #: Full-colour overlay of every class composited over the original.
    overlay_path: Path
    #: One transparent mask per class, so the UI can toggle layers instantly.
    layer_paths: dict[FeatureClass, Path]
    geojson_path: Path
    stats: ExtractionStats
    #: How the result was produced. Surfaced in the UI so a placeholder is
    #: never mistaken for real model output.
    provenance: str = "unknown"


#: Called as ``on_progress(stage, fraction_within_stage)``.
ProgressCallback = Callable[[Stage, float], None]


class FeatureExtractor(Protocol):
    """Extracts features from a single image.

    Implementations must:

    * write all artifacts inside ``out_dir`` and return paths within it,
    * call ``on_progress`` at least once per stage, in ``STAGE_ORDER``,
    * raise on failure rather than returning a partial result.

    ``tests/test_adapter_contract.py`` enforces these against any
    implementation, so the real model is held to the same expectations as the
    placeholder.
    """

    async def extract(
        self,
        image_path: Path,
        out_dir: Path,
        on_progress: ProgressCallback,
    ) -> ExtractionResult:
        ...
