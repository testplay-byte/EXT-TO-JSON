/**
 * jobs.ts — In-memory conversion job store.
 *
 * Conversion is a multi-stage process (unpack -> decompile -> analyze ->
 * assemble -> health). We track each job's progress so the UI can poll.
 * Jobs live in process memory; completed results are persisted to the DB +
 * /converted/<id>.json on disk.
 */
import { randomUUID } from "node:crypto";
import type { ConversionJob, JobStatus } from "./types";

// Persist jobs across hot reloads in dev.
const globalForJobs = globalThis as unknown as {
  __extJobs?: Map<string, ConversionJob>;
};
const jobs: Map<string, ConversionJob> =
  globalForJobs.__extJobs ?? new Map();
globalForJobs.__extJobs = jobs;

export function createJob(apkFileName: string): ConversionJob {
  const now = new Date().toISOString();
  const job: ConversionJob = {
    id: randomUUID(),
    status: "queued",
    progress: 0,
    message: "Queued",
    apkFileName,
    startedAt: now,
    updatedAt: now,
    logs: [],
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): ConversionJob | undefined {
  return jobs.get(id);
}

export function listJobs(): ConversionJob[] {
  return [...jobs.values()].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
}

export function updateJob(
  id: string,
  patch: Partial<Omit<ConversionJob, "id" | "startedAt">>,
): ConversionJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  return job;
}

export function appendLog(
  id: string,
  level: "info" | "warn" | "error",
  message: string,
): void {
  const job = jobs.get(id);
  if (!job) return;
  job.logs.push({ ts: new Date().toISOString(), level, message });
  if (job.logs.length > 500) job.logs = job.logs.slice(-500);
  job.updatedAt = new Date().toISOString();
}

/** Map a converter stage name to a JobStatus. */
export function stageToStatus(stage: string): JobStatus {
  switch (stage) {
    case "unpacking":
      return "unpacking";
    case "decoding-manifest":
      return "decoding-manifest";
    case "decompiling":
      return "decompiling";
    case "analyzing":
      return "analyzing";
    case "assembling":
      return "assembling";
    case "health-check":
      return "health-check";
    case "done":
      return "done";
    case "error":
      return "error";
    default:
      return "queued";
  }
}
