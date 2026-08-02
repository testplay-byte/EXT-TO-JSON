/**
 * POST /api/playground/browse
 * Body: { extensionId, type: "popular" | "latest", page?: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { loadEffectiveExtension } from "@/lib/playground/load-effective";
import { fetchAndParseBrowse } from "@/lib/playground/parse";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  extensionId: z.string().min(1),
  type: z.enum(["popular", "latest"]),
  page: z.number().int().min(1).default(1),
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
  const ext = loadEffectiveExtension(parsed.extensionId);
  if (!ext) {
    return NextResponse.json({ error: "Extension not found" }, { status: 404 });
  }
  const endpoint =
    parsed.type === "popular" ? ext.browse.popular : ext.browse.latest;
  const result = await fetchAndParseBrowse(ext, endpoint, parsed.page);
  return NextResponse.json(result);
}
