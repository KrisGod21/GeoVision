"""CORS configuration tests.

A misconfigured origin is the most likely thing to break a deployment, and it
fails in the least helpful way possible: the browser reports an opaque network
error, the server logs a rejection nobody reads, and the value in the dashboard
looks correct. These tests pin the parsing rules that make that survivable.
"""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import api.main as main_module


def reload_with(monkeypatch: pytest.MonkeyPatch, **env: str | None):
    for key, value in env.items():
        if value is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, value)
    return importlib.reload(main_module)


@pytest.fixture(autouse=True)
def restore_module():
    yield
    importlib.reload(main_module)


def test_trailing_slash_is_stripped(monkeypatch: pytest.MonkeyPatch):
    # The bug this exists to prevent: a browser sends Origin without a trailing
    # slash, so a configured "https://x/" matches nothing and every request is
    # rejected while the dashboard value looks right.
    module = reload_with(
        monkeypatch, GEOVISION_ALLOWED_ORIGINS="https://geo-vision.vercel.app/"
    )
    assert module.ALLOWED_ORIGINS == ["https://geo-vision.vercel.app"]


def test_whitespace_around_entries_is_stripped(monkeypatch: pytest.MonkeyPatch):
    module = reload_with(
        monkeypatch,
        GEOVISION_ALLOWED_ORIGINS=" https://a.example , https://b.example ",
    )
    assert module.ALLOWED_ORIGINS == ["https://a.example", "https://b.example"]


def test_multiple_trailing_slashes_are_stripped(monkeypatch: pytest.MonkeyPatch):
    module = reload_with(monkeypatch, GEOVISION_ALLOWED_ORIGINS="https://a.example//")
    assert module.ALLOWED_ORIGINS == ["https://a.example"]


def test_empty_entries_are_dropped(monkeypatch: pytest.MonkeyPatch):
    module = reload_with(monkeypatch, GEOVISION_ALLOWED_ORIGINS="https://a.example,,  ,")
    assert module.ALLOWED_ORIGINS == ["https://a.example"]


def test_defaults_cover_local_development(monkeypatch: pytest.MonkeyPatch):
    module = reload_with(monkeypatch, GEOVISION_ALLOWED_ORIGINS=None)
    assert "http://localhost:3000" in module.ALLOWED_ORIGINS
    assert "http://127.0.0.1:3000" in module.ALLOWED_ORIGINS


def test_a_configured_origin_actually_passes_preflight(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
):
    # Parsing the value correctly is only half of it; the middleware has to
    # accept the request too.
    module = reload_with(
        monkeypatch, GEOVISION_ALLOWED_ORIGINS="https://geo-vision.vercel.app/"
    )
    app = module.create_app(storage_root=tmp_path / "storage")

    with TestClient(app) as client:
        response = client.options(
            "/api/jobs",
            headers={
                "Origin": "https://geo-vision.vercel.app",
                "Access-Control-Request-Method": "POST",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://geo-vision.vercel.app"


def test_an_unconfigured_origin_is_rejected(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    module = reload_with(monkeypatch, GEOVISION_ALLOWED_ORIGINS="https://allowed.example")
    app = module.create_app(storage_root=tmp_path / "storage")

    with TestClient(app) as client:
        response = client.options(
            "/api/jobs",
            headers={
                "Origin": "https://attacker.example",
                "Access-Control-Request-Method": "POST",
            },
        )

    assert "access-control-allow-origin" not in response.headers


def test_regex_allows_preview_deployments(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    # Vercel gives every preview deployment its own hostname, so pinning only
    # the production domain breaks previews.
    module = reload_with(
        monkeypatch,
        GEOVISION_ALLOWED_ORIGINS="https://geo-vision.vercel.app",
        GEOVISION_ALLOWED_ORIGIN_REGEX=r"https://.*\.vercel\.app",
    )
    app = module.create_app(storage_root=tmp_path / "storage")

    with TestClient(app) as client:
        response = client.options(
            "/api/jobs",
            headers={
                "Origin": "https://geo-vision-abc123-krishna.vercel.app",
                "Access-Control-Request-Method": "POST",
            },
        )

    assert response.status_code == 200
    assert "access-control-allow-origin" in response.headers


def test_health_reports_the_cors_configuration(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
):
    # So a broken deployment can be diagnosed with one request.
    module = reload_with(monkeypatch, GEOVISION_ALLOWED_ORIGINS="https://a.example/")
    app = module.create_app(storage_root=tmp_path / "storage")

    with TestClient(app) as client:
        body = client.get("/api/health").json()

    assert body["status"] == "ok"
    assert body["allowed_origins"] == ["https://a.example"]
