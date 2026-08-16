"""In-process job store and runner.

Deliberately not Celery. The prototype has to run on a laptop with no Redis and
no broker, and the architecture document's Celery + Redis queue substitutes in
at exactly one seam: :meth:`JobStore.submit`. Everything else -- the routes, the
response schemas, the frontend -- is unaware of which one is in use.

The trade-off is explicit: in-flight jobs are lost if the server restarts.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

from api.models.adapter import (
    STAGE_ORDER,
    ExtractionResult,
    FeatureExtractor,
    Stage,
)


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"


@dataclass
class Job:
    id: str
    filename: str
    input_path: Path
    out_dir: Path
    status: JobStatus = JobStatus.QUEUED
    stage: Stage | None = None
    progress: float = 0.0
    error: str | None = None
    result: ExtractionResult | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class JobStore:
    """Holds jobs and runs them as asyncio tasks."""

    def __init__(self, extractor: FeatureExtractor, storage_root: Path) -> None:
        self._extractor = extractor
        self._storage_root = storage_root
        self._jobs: dict[str, Job] = {}
        self._tasks: set[asyncio.Task[None]] = set()

    @property
    def storage_root(self) -> Path:
        return self._storage_root

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def create(self, filename: str, data: bytes) -> Job:
        job_id = uuid.uuid4().hex[:12]
        out_dir = self._storage_root / job_id
        out_dir.mkdir(parents=True, exist_ok=True)

        # Keep the original extension: the extractor decides what it can decode.
        suffix = Path(filename).suffix.lower() or ".bin"
        input_path = out_dir / f"input{suffix}"
        input_path.write_bytes(data)

        job = Job(id=job_id, filename=filename, input_path=input_path, out_dir=out_dir)
        self._jobs[job_id] = job
        return job

    def submit(self, job: Job) -> None:
        """Starts the job. The Celery hand-off would replace this method."""
        task = asyncio.create_task(self._run(job))
        # Held so the task is not garbage collected mid-flight.
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _run(self, job: Job) -> None:
        job.status = JobStatus.RUNNING
        job.stage = STAGE_ORDER[0]
        job.progress = 0.0

        def on_progress(stage: Stage, fraction_within_stage: float) -> None:
            # Overall progress is the stage's slot plus how far into it we are,
            # so the bar advances smoothly rather than in four jumps.
            index = STAGE_ORDER.index(stage)
            job.stage = stage
            job.progress = (index + min(max(fraction_within_stage, 0.0), 1.0)) / len(STAGE_ORDER)

        try:
            job.result = await self._extractor.extract(job.input_path, job.out_dir, on_progress)
            job.status = JobStatus.COMPLETE
            job.progress = 1.0
            job.stage = None
        except Exception as exc:  # noqa: BLE001 - surfaced to the client verbatim
            job.status = JobStatus.FAILED
            job.error = str(exc) or exc.__class__.__name__
            job.stage = None
