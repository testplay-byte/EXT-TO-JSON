/**
 * GET /api/jobs/[id] — get a single conversion job's status + logs.
 */
import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/converter/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({ job });
}
