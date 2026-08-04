/**
 * GET /api/browser-fetch/status
 *
 * Checks if the browser-fetch service (port 3030) is running and healthy.
 * The frontend uses this to show a warning banner if the service is down.
 */
import { NextResponse } from "next/server";
import { checkBrowserFetchService } from "@/lib/playground/fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await checkBrowserFetchService();
  return NextResponse.json(status);
}
