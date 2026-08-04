/**
 * GET /api/jobs — list all conversion jobs (newest first).
 */
import { NextResponse } from "next/server";
import { listJobs } from "@/lib/converter/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
}
