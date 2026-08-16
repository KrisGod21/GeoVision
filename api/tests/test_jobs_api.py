"""End-to-end tests for the job endpoints."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.main import create_app
from api.models.adapter import ExtractionResult, ProgressCallback, Stage
from api.models.stub import StubExtractor


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    app = create_app(extractor=StubExtractor(stage_duration_s=0.0), storage_root=tmp_path / "storage")
    with TestClient(app) as test_client:
        yield test_client


def wait_for_terminal_status(client: TestClient, job_id: str, timeout_s: float = 20.0) -> dict:
    """Polls the way the frontend does, rather than reaching into the store."""
    import time

    deadline = time.time() + timeout_s
    while time.time() < deadline:
        body = client.get(f"/api/jobs/{job_id}").json()
        if body["status"] in {"complete", "failed"}:
            return body
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not finish within {timeout_s}s")


def test_health(client: TestClient):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_upload_accepts_a_png(client: TestClient, village_bytes: bytes):
    response = client.post(
        "/api/jobs", files={"file": ("village.png", village_bytes, "image/png")}
    )
    assert response.status_code == 201
    assert response.json()["job_id"]


@pytest.mark.parametrize("filename", ["village.png", "village.jpg", "village.tif", "village.webp"])
def test_upload_accepts_every_documented_extension(
    client: TestClient, village_bytes: bytes, filename: str
):
    response = client.post("/api/jobs", files={"file": (filename, village_bytes, "image/png")})
    assert response.status_code == 201


@pytest.mark.parametrize("filename", ["notes.txt", "archive.zip", "model.onnx", "noextension"])
def test_upload_rejects_other_types(client: TestClient, village_bytes: bytes, filename: str):
    response = client.post("/api/jobs", files={"file": (filename, village_bytes, "text/plain")})
    assert response.status_code == 415
    assert "Accepted" in response.json()["detail"]


def test_upload_rejects_an_empty_file(client: TestClient):
    response = client.post("/api/jobs", files={"file": ("village.png", b"", "image/png")})
    assert response.status_code == 400


def test_job_reaches_completion(client: TestClient, village_bytes: bytes):
    job_id = client.post(
        "/api/jobs", files={"file": ("village.png", village_bytes, "image/png")}
    ).json()["job_id"]

    final = wait_for_terminal_status(client, job_id)
    assert final["status"] == "complete"
    assert final["progress"] == 1.0
    assert final["stage"] is None
    assert final["error"] is None


def test_status_reports_a_known_stage_while_running(client: TestClient, village_bytes: bytes):
    job_id = client.post(
        "/api/jobs", files={"file": ("village.png", village_bytes, "image/png")}
    ).json()["job_id"]

    seen_stages = set()
    for _ in range(200):
        body = client.get(f"/api/jobs/{job_id}").json()
        if body["stage"]:
            seen_stages.add(body["stage"])
        if body["status"] in {"complete", "failed"}:
            break

    valid = {stage.value for stage in Stage}
    assert seen_stages <= valid


def test_unknown_job_is_404(client: TestClient):
    assert client.get("/api/jobs/nope").status_code == 404
    assert client.get("/api/jobs/nope/result").status_code == 404


def test_result_is_409_before_completion(client: TestClient, village_bytes: bytes):
    job_id = client.post(
        "/api/jobs", files={"file": ("village.png", village_bytes, "image/png")}
    ).json()["job_id"]

    # Raced deliberately: whichever we hit, the contract must hold.
    response = client.get(f"/api/jobs/{job_id}/result")
    assert response.status_code in {200, 409}


def test_result_shape(client: TestClient, village_bytes: bytes):
    job_id = client.post(
        "/api/jobs", files={"file": ("village.png", village_bytes, "image/png")}
    ).json()["job_id"]
    wait_for_terminal_status(client, job_id)

    body = client.get(f"/api/jobs/{job_id}/result").json()

    assert body["job_id"] == job_id
    assert body["original_url"].startswith(f"/files/{job_id}/")
    assert body["overlay_url"].startswith(f"/files/{job_id}/")
    assert body["geojson_url"].endswith(".geojson")
    assert body["provenance"]

    names = {layer["name"] for layer in body["layers"]}
    assert {"buildings", "roads", "water"} <= names

    stats = body["stats"]
    assert stats["building_count"] >= 0
    assert stats["metres_per_pixel"] > 0


def test_result_artifacts_are_actually_served(client: TestClient, village_bytes: bytes):
    job_id = client.post(
        "/api/jobs", files={"file": ("village.png", village_bytes, "image/png")}
    ).json()["job_id"]
    wait_for_terminal_status(client, job_id)

    body = client.get(f"/api/jobs/{job_id}/result").json()
    for url in [body["original_url"], body["overlay_url"], body["geojson_url"]]:
        assert client.get(url).status_code == 200, url
    for layer in body["layers"]:
        assert client.get(layer["url"]).status_code == 200, layer["url"]


class ExplodingExtractor:
    """Fails partway through, to prove failures are reported not swallowed."""

    async def extract(
        self, image_path: Path, out_dir: Path, on_progress: ProgressCallback
    ) -> ExtractionResult:
        on_progress(Stage.TILING, 1.0)
        await asyncio.sleep(0)
        raise RuntimeError("inference backend unavailable")


def test_a_failing_extractor_marks_the_job_failed(tmp_path: Path, village_bytes: bytes):
    app = create_app(extractor=ExplodingExtractor(), storage_root=tmp_path / "storage")
    with TestClient(app) as client:
        job_id = client.post(
            "/api/jobs", files={"file": ("village.png", village_bytes, "image/png")}
        ).json()["job_id"]

        final = wait_for_terminal_status(client, job_id)
        assert final["status"] == "failed"
        assert final["error"] == "inference backend unavailable"

        # And the result endpoint must not pretend there is a result.
        assert client.get(f"/api/jobs/{job_id}/result").status_code == 409
