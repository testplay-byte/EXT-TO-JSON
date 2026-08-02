/**
 * GET  /api/extensions/[id]/settings — load saved preference values.
 * PUT  /api/extensions/[id]/settings — save preference values.
 *
 * Body for PUT: { values: Record<string, string|boolean|string[]> }
 */
import { NextRequest, NextResponse } from "next/server";
import { loadSettings, saveSettings } from "@/lib/converter/settings-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return NextResponse.json({ values: loadSettings(id) });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const values = body?.values;
  if (!values || typeof values !== "object") {
    return NextResponse.json(
      { error: "Body must be { values: { ... } }" },
      { status: 400 },
    );
  }
  saveSettings(id, values);
  return NextResponse.json({ ok: true, values });
}
