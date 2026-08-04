/**
 * POST /api/playground/solve-captcha
 * Body: { url }
 *
 * Tells the browser-fetch service to open a visible browser window so the
 * user can solve a Cloudflare/anti-bot captcha. After solving, cookies are
 * persisted and subsequent requests will work without challenge.
 */
import { NextRequest, NextResponse } from "next/server";
import { solveCaptcha } from "@/lib/playground/fetch";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
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
  const result = await solveCaptcha(parsed.url);
  return NextResponse.json(result);
}
