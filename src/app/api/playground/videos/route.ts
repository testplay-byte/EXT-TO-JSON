/**
 * POST /api/playground/videos
 * Body: { extensionId, url, serverName? }
 */
import { NextRequest, NextResponse } from "next/server";
import { loadEffectiveExtension } from "@/lib/playground/load-effective";
import { resolveVideos } from "@/lib/playground/videos";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const Body = z.object({
  extensionId: z.string().min(1),
  url: z.string().url(),
  serverName: z.string().optional(),
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
  const result = await resolveVideos(ext, parsed.url, parsed.serverName);
  return NextResponse.json(result);
}
