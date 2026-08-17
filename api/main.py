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

#: Overridable so a deployment can mount a volume instead of writing into the
#: source tree, where artifacts would be lost on every redeploy.
STORAGE_ROOT = Path(os.environ.get("GEOVISION_STORAGE_DIR", Path(__file__).parent / "storage"))

#: Defaults cover local development. In deployment set GEOVISION_ALLOWED_ORIGINS
#: to the frontend's origin -- a comma-separated list. Never "*": these
#: endpoints accept uploads.
DEFAULT_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"


def _normalise_origin(value: str) -> str:
    """Strips whitespace and any trailing slash from a configured origin.

    A browser sends `Origin: https://example.com` and never includes a trailing
    slash, so a configured `https://example.com/` silently matches nothing --
    every request is rejected with "Disallowed CORS origin" while the value in
    the dashboard looks perfectly correct. Copying a URL from an address bar
    picks up that slash, which makes it an easy and very confusing mistake.
    """
    return value.strip().rstrip("/")


ALLOWED_ORIGINS = [
    normalised
    for origin in os.environ.get("GEOVISION_ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",")
    if (normalised := _normalise_origin(origin))
]

#: Optional regex for origins that cannot be enumerated. Vercel gives every
#: preview deployment a unique hostname, so pinning only the production domain
#: breaks every preview. Example:
#:   GEOVISION_ALLOWED_ORIGIN_REGEX=https://.*\.vercel\.app
#: Keep it anchored and specific; a loose pattern is as dangerous as "*".
ALLOWED_ORIGIN_REGEX = os.environ.get("GEOVISION_ALLOWED_ORIGIN_REGEX") or None


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
        allow_origin_regex=ALLOWED_ORIGIN_REGEX,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    root = storage_root or STORAGE_ROOT
    root.mkdir(parents=True, exist_ok=True)
    app.state.store = JobStore(extractor or select_extractor(), root)

    app.include_router(jobs.router)
    app.mount("/files", StaticFiles(directory=root), name="files")

    @app.get("/api/health")
    async def health() -> dict[str, object]:
        # The CORS configuration is echoed back deliberately. A misconfigured
        # origin is the single most likely deployment failure, and it is
        # otherwise invisible: the browser reports an opaque network error and
        # the server logs a rejection nobody sees. None of this is secret --
        # any client can discover it by sending a preflight.
        return {
            "status": "ok",
            "allowed_origins": ALLOWED_ORIGINS,
            "allowed_origin_regex": ALLOWED_ORIGIN_REGEX,
            "extractor": os.environ.get("GEOVISION_EXTRACTOR", "stub"),
        }

    return app


app = create_app()
