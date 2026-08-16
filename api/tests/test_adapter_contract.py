"""Conformance tests every FeatureExtractor must pass.

Written against the protocol, not against the placeholder. When the trained
model arrives, add it to ``EXTRACTORS`` and these run against it unchanged --
so a mismatch between the real model and what the frontend expects surfaces as
a test failure rather than a broken page.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from api.models.adapter import (
    STAGE_ORDER,
    ExtractionResult,
    FeatureExtractor,
    Stage,
)
from api.models.stub import StubExtractor

#: Register every extractor implementation here.
EXTRACTORS: list[tuple[str, FeatureExtractor]] = [
    ("stub", StubExtractor(stage_duration_s=0.0)),
]

pytestmark = pytest.mark.asyncio


@pytest.fixture(params=[name for name, _ in EXTRACTORS], ids=lambda n: n)
def any_extractor(request: pytest.FixtureRequest) -> FeatureExtractor:
    return dict(EXTRACTORS)[request.param]


async def run(extractor: FeatureExtractor, image: Path, out_dir: Path):
    calls: list[tuple[Stage, float]] = []
    result = await extractor.extract(image, out_dir, lambda s, f: calls.append((s, f)))
    return result, calls


async def test_returns_an_extraction_result(any_extractor, village_png, tmp_path):
    result, _ = await run(any_extractor, village_png, tmp_path / "out")
    assert isinstance(result, ExtractionResult)


async def test_reports_every_stage_in_order(any_extractor, village_png, tmp_path):
    _, calls = await run(any_extractor, village_png, tmp_path / "out")

    reported = []
    for stage, _fraction in calls:
        if not reported or reported[-1] is not stage:
            reported.append(stage)

    assert reported == list(STAGE_ORDER)


async def test_progress_fractions_stay_in_range(any_extractor, village_png, tmp_path):
    _, calls = await run(any_extractor, village_png, tmp_path / "out")
    assert calls, "an extractor must report progress at least once"
    for _stage, fraction in calls:
        assert 0.0 <= fraction <= 1.0


async def test_all_artifacts_exist_on_disk(any_extractor, village_png, tmp_path):
    out_dir = tmp_path / "out"
    result, _ = await run(any_extractor, village_png, out_dir)

    assert result.overlay_path.exists()
    assert result.geojson_path.exists()
    for path in result.layer_paths.values():
        assert path.exists()


async def test_artifacts_are_written_inside_the_output_directory(
    any_extractor, village_png, tmp_path
):
    # Otherwise the static file mount cannot serve them and job cleanup leaks.
    out_dir = (tmp_path / "out").resolve()
    result, _ = await run(any_extractor, village_png, out_dir)

    for path in [result.geojson_path, *result.layer_paths.values()]:
        assert out_dir in path.resolve().parents


async def test_geojson_is_a_valid_feature_collection(any_extractor, village_png, tmp_path):
    import json

    result, _ = await run(any_extractor, village_png, tmp_path / "out")
    document = json.loads(result.geojson_path.read_text(encoding="utf-8"))

    assert document["type"] == "FeatureCollection"
    assert isinstance(document["features"], list)
    for feature in document["features"]:
        assert feature["geometry"]["type"] == "Polygon"
        ring = feature["geometry"]["coordinates"][0]
        assert ring[0] == ring[-1], "polygon rings must be closed"


async def test_stats_are_non_negative(any_extractor, village_png, tmp_path):
    result, _ = await run(any_extractor, village_png, tmp_path / "out")
    stats = result.stats

    assert stats.building_count >= 0
    assert stats.road_length_m >= 0
    assert stats.water_area_m2 >= 0
    assert sum(stats.roof_types.values()) in (0, stats.building_count)


async def test_declares_its_provenance(any_extractor, village_png, tmp_path):
    # The UI relies on this to avoid presenting placeholder output as model
    # output. An extractor that leaves it unset is a bug.
    result, _ = await run(any_extractor, village_png, tmp_path / "out")
    assert result.provenance
    assert result.provenance != "unknown"


async def test_raises_rather_than_returning_a_partial_result(any_extractor, tmp_path):
    missing = tmp_path / "does-not-exist.png"
    with pytest.raises(Exception):
        await run(any_extractor, missing, tmp_path / "out")
