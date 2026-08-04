/**
 * GET  /api/extensions/[id] — full extension JSON (canonical document).
 * DELETE /api/extensions/[id] — remove extension (db + disk).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadExtensionJson, CONVERTED_DIR } from "@/lib/converter/persist";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const json = loadExtensionJson(id);
  if (!json) {
    return NextResponse.json({ error: "Extension not found" }, { status: 404 });
  }
  return NextResponse.json(json);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.extension.delete({ where: { id } });
  } catch {
    /* may already be gone */
  }
  const path = join(CONVERTED_DIR, `${id}.json`);
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      /* ignore */
    }
  }
  return NextResponse.json({ ok: true });
}
