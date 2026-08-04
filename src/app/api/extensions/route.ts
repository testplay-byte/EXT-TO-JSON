/**
 * GET /api/extensions — list all converted extensions (summary fields only).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.extension.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      lang: true,
      baseUrl: true,
      packageName: true,
      sourceType: true,
      isNsfw: true,
      apkFileName: true,
      apkVersionName: true,
      healthScore: true,
      healthStatus: true,
      healthSummary: true,
      capabilities: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const extensions = rows.map((r) => ({
    ...r,
    capabilities: safeParse(r.capabilities),
  }));
  return NextResponse.json({ extensions });
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
