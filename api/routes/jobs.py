"""Job endpoints: upload, poll, fetch result."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile
from pydantic import BaseModel

from api.jobs.store import Job, JobStatus, JobStore

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

#: Extensions the prototype accepts. TIFFs are stored and attempted; whether
#: they can be decoded is the extractor's call, not the route's.
ALLOWED_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"}

MAX_UPLOAD_BYTES = 50 * 1024 * 1024


class CreateJobResponse(BaseModel):
    job_id: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    stage: str | None
    progress: float
    error: str | None
    filename: str


class LayerResponse(BaseModel):
    name: str
    url: str


class StatsResponse(BaseModel):
    building_count: int
    roof_types: dict[str, int]
    road_length_m: float
    water_area_m2: float
    vegetation_area_m2: float
    metres_per_pixel: float


class JobResultResponse(BaseModel):
    job_id: str
    original_url: str
    overlay_url: str
    layers: list[LayerResponse]
    geojson_url: str
    stats: StatsResponse
    #: How the result was produced, so the UI can label a placeholder honestly.
    provenance: str


def get_store(request: Request) -> JobStore:
    return request.app.state.store


def _file_url(job: Job, path: Path) -> str:
    return f"/files/{job.id}/{path.name}"


@router.post("", response_model=CreateJobResponse, status_code=201)
async def create_job(request: Request, file: UploadFile) -> CreateJobResponse:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{suffix or 'unknown'}'. Accepted: {', '.join(sorted(ALLOWED_SUFFIXES))}",
        )

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is {len(data) / 1024 / 1024:.1f} MB; the limit is {MAX_UPLOAD_BYTES // 1024 // 1024} MB.",
        )

    store = get_store(request)
    job = store.create(file.filename or f"upload{suffix}", data)
    store.submit(job)
    return CreateJobResponse(job_id=job.id)


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job(request: Request, job_id: str) -> JobStatusResponse:
    job = get_store(request).get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="No such job.")

    return JobStatusResponse(
        job_id=job.id,
        status=job.status,
        stage=job.stage.value if job.stage else None,
        progress=round(job.progress, 4),
        error=job.error,
        filename=job.filename,
    )


@router.get("/{job_id}/result", response_model=JobResultResponse)
async def get_job_result(request: Request, job_id: str) -> JobResultResponse:
    job = get_store(request).get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="No such job.")
    if job.status is JobStatus.FAILED:
        raise HTTPException(status_code=409, detail=job.error or "The job failed.")
    if job.status is not JobStatus.COMPLETE or job.result is None:
        raise HTTPException(status_code=409, detail="The job has not finished yet.")

    result = job.result
    stats = result.stats

    return JobResultResponse(
        job_id=job.id,
        original_url=_file_url(job, job.input_path),
        overlay_url=_file_url(job, result.overlay_path),
        layers=[
            LayerResponse(name=feature_class.value, url=_file_url(job, path))
            for feature_class, path in result.layer_paths.items()
        ],
        geojson_url=_file_url(job, result.geojson_path),
        stats=StatsResponse(
            building_count=stats.building_count,
            roof_types=stats.roof_types,
            road_length_m=stats.road_length_m,
            water_area_m2=stats.water_area_m2,
            vegetation_area_m2=stats.vegetation_area_m2,
            metres_per_pixel=stats.metres_per_pixel,
        ),
        provenance=result.provenance,
    )
