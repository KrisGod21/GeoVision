from __future__ import annotations

import io
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from api.models.stub import StubExtractor


@pytest.fixture
def village_image() -> Image.Image:
    """A synthetic aerial-looking scene with each class present.

    Real fixtures would be better, but a committed orthophoto is large and the
    thresholds only need something with green fields, grey roads, warm roofs and
    a blue pond.
    """
    image = Image.new("RGB", (320, 240), (60, 140, 70))  # vegetation
    draw = ImageDraw.Draw(image)

    draw.rectangle([0, 100, 320, 130], fill=(140, 140, 138))  # road
    draw.rectangle([30, 30, 90, 80], fill=(170, 60, 45))  # tiled roof
    draw.rectangle([150, 20, 210, 70], fill=(200, 200, 198))  # concrete roof
    draw.rectangle([230, 160, 310, 220], fill=(40, 90, 190))  # water

    return image


@pytest.fixture
def village_png(tmp_path: Path, village_image: Image.Image) -> Path:
    path = tmp_path / "village.png"
    village_image.save(path)
    return path


@pytest.fixture
def village_bytes(village_image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    village_image.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def extractor() -> StubExtractor:
    # No simulated delay: the staging behaviour is asserted, not waited on.
    return StubExtractor(stage_duration_s=0.0)
