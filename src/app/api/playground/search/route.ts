/**
 * POST /api/playground/search
 * Body: { extensionId, query, page?, filters? }
 */
import { NextRequest, NextResponse } from "next/server";
import { loadExtensionJson } from "@/lib/converter/persist";
import { fetchAndParseBrowse } from "@/lib/playground/parse";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  extensionId: z.string().min(1),
  query: z.string().default(""),
  page: z.number().int().min(1).default(1),
  filters: z.record(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid body" },
      { status: 400 },
    );
  }
  const ext = loadExtensionJson(parsed.extensionId);
  if (!ext) {
    return NextResponse.json({ error: "Extension not found" }, { status: 404 });
  }
  const result = await fetchAndParseBrowse(
    ext,
    ext.browse.search,
    parsed.page,
    parsed.query,
    parsed.filters,
  );
  return NextResponse.json(result);
}
