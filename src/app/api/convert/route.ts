/**
 * POST /api/convert
 * Accepts a multipart upload with an APK file (field name "apk").
 * Saves the APK, creates a conversion job, and runs the pipeline async.
 * Returns { jobId } immediately.
 *
 * Query params:
 *   ?importJson=1  -> accept a JSON file (field "json") and import it directly
 *                     without conversion. Returns { extensionId }.
 */
import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createJob, updateJob, appendLog, stageToStatus } from "@/lib/converter/jobs";
import { convertApk } from "@/lib/converter/convert";
import { persistExtension } from "@/lib/converter/persist";
import type { ExtensionJson } from "@/lib/converter/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UPLOAD_DIR = join(process.cwd(), "upload");

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const importJson = url.searchParams.get("importJson") === "1";

  const form = await req.formData();

  if (importJson) {
    return handleJsonImport(form);
  }

  const file = form.get("apk");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'apk' file in form data." },
      { status: 400 },
    );
  }
  if (!file.name.toLowerCase().endsWith(".apk")) {
    return NextResponse.json(
      { error: "File must have an .apk extension." },
      { status: 400 },
    );
  }

  mkdirSync(UPLOAD_DIR, { recursive: true });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const apkPath = join(UPLOAD_DIR, `${Date.now()}-${safeName}`);
  const buf = Buffer.from(await file.arrayBuffer());
  writeFileSync(apkPath, buf);

  const job = createJob(file.name);
  appendLog(job.id, "info", `Received ${file.name} (${buf.length} bytes)`);

  // Run conversion in the background (do not await).
  void runConversion(job.id, apkPath, file.name);

  return NextResponse.json({ jobId: job.id, status: "queued" });
}

async function runConversion(jobId: string, apkPath: string, apkName: string) {
  try {
    updateJob(jobId, {
      status: "unpacking",
      progress: 2,
      message: "Starting conversion...",
    });
    const { json } = await convertApk(apkPath, apkName, {
      onProgress: (stage, progress, message) => {
        updateJob(jobId, {
          status: stageToStatus(stage),
          progress,
          message,
        });
        appendLog(jobId, "info", `[${stage}] ${message}`);
      },
    });

    appendLog(jobId, "info", "Persisting extension to DB + disk...");
    const saved = await persistExtension(json);
    updateJob(jobId, {
      status: "done",
      progress: 100,
      message: `Conversion complete (health: ${json.health.score}% ${json.health.status}).`,
      extensionId: saved.id,
    });
    appendLog(jobId, "info", `Saved as ${saved.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendLog(jobId, "error", message);
    updateJob(jobId, {
      status: "error",
      progress: 0,
      message,
      error: message,
    });
  }
}

async function handleJsonImport(form: FormData) {
  const file = form.get("json");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'json' file in form data." },
      { status: 400 },
    );
  }
  let json: ExtensionJson;
  try {
    json = JSON.parse(await file.text()) as ExtensionJson;
  } catch (e) {
    return NextResponse.json(
      { error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 },
    );
  }
  if (!json.meta || !json.schemaVersion) {
    return NextResponse.json(
      { error: "JSON does not look like an ExtensionJson (missing meta/schemaVersion)." },
      { status: 400 },
    );
  }
  const saved = await persistExtension(json);
  return NextResponse.json({ extensionId: saved.id, imported: true });
}
