/**
 * POST /api/playground/details
 * Body: { extensionId, url }
 */
import { NextRequest, NextResponse } from "next/server";
import { loadEffectiveExtension } from "@/lib/playground/load-effective";
import { fetchAndParseDetails } from "@/lib/playground/parse";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  extensionId: z.string().min(1),
  url: z.string().url(),
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
  const result = await fetchAndParseDetails(ext, parsed.url);
  return NextResponse.json(result);
}
