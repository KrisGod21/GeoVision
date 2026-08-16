/**
 * Typed client for the GeoVision API.
 *
 * The shapes here mirror the FastAPI response models exactly. They are the
 * contract the trained model will be dropped in behind, so they should change
 * only when the API changes.
 */

/**
 * 127.0.0.1 rather than localhost on purpose: on Windows, localhost can resolve
 * to ::1 first, and uvicorn binds IPv4 only by default -- which shows up as a
 * hang rather than a clear connection error.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export type JobStatus = "queued" | "running" | "complete" | "failed";
export type Stage = "tiling" | "inference" | "polygonizing" | "stitching";

export const STAGES: { id: Stage; label: string; detail: string }[] = [
  { id: "tiling", label: "Tiling", detail: "Splitting into overlapping 512×512 patches" },
  { id: "inference", label: "Inference", detail: "Running the shared-encoder multi-head network" },
  { id: "polygonizing", label: "Polygonising", detail: "Converting masks to simplified polygons" },
  { id: "stitching", label: "Stitching", detail: "Feather-blending tile boundaries" },
];

export interface JobStatusResponse {
  job_id: string;
  status: JobStatus;
  stage: Stage | null;
  progress: number;
  error: string | null;
  filename: string;
}

export interface LayerResponse {
  name: string;
  url: string;
}

export interface StatsResponse {
  building_count: number;
  roof_types: Record<string, number>;
  road_length_m: number;
  water_area_m2: number;
  vegetation_area_m2: number;
  metres_per_pixel: number;
}

export interface JobResultResponse {
  job_id: string;
  original_url: string;
  overlay_url: string;
  layers: LayerResponse[];
  geojson_url: string;
  stats: StatsResponse;
  /** "heuristic-placeholder" until the trained model is wired in. */
  provenance: string;
}

/** Turns a relative artifact path from the API into a loadable URL. */
export const fileUrl = (path: string) => `${API_BASE}${path}`;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `Request failed with ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      // A non-JSON error body is not worth failing over.
    }
    throw new ApiError(detail, response.status);
  }
  return response.json() as Promise<T>;
}

export async function createJob(file: File): Promise<{ job_id: string }> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE}/api/jobs`, { method: "POST", body: form });
  return parse(response);
}

export async function getJob(jobId: string): Promise<JobStatusResponse> {
  return parse(await fetch(`${API_BASE}/api/jobs/${jobId}`));
}

export async function getJobResult(jobId: string): Promise<JobResultResponse> {
  return parse(await fetch(`${API_BASE}/api/jobs/${jobId}/result`));
}
