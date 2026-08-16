"""GeoVision API.

Run from the repo root:

    uvicorn api.main:app --reload --port 8000
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.jobs.store import JobStore
from api.models.adapter import FeatureExtractor
from api.models.stub import StubExtractor
from api.routes import jobs

STORAGE_ROOT = Path(__file__).parent / "storage"

#: Frontend dev server. Tightened before anything is deployed.
ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]


def select_extractor() -> FeatureExtractor:
    """Chooses the extractor implementation.

    This is the whole integration story for the trained model: implement
    ``FeatureExtractor``, register it here, set ``GEOVISION_EXTRACTOR=onnx``.
    No route, schema, or frontend change.
    """
    match os.environ.get("GEOVISION_EXTRACTOR", "stub"):
        case "stub":
            return StubExtractor()
        case unknown:
            raise ValueError(f"Unknown extractor '{unknown}'. Available: stub")


def create_app(extractor: FeatureExtractor | None = None, storage_root: Path | None = None) -> FastAPI:
    app = FastAPI(title="GeoVision API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    root = storage_root or STORAGE_ROOT
    root.mkdir(parents=True, exist_ok=True)
    app.state.store = JobStore(extractor or select_extractor(), root)

    app.include_router(jobs.router)
    app.mount("/files", StaticFiles(directory=root), name="files")

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
