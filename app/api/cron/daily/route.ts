import { NextRequest, NextResponse } from "next/server";
import { runDailyPipeline } from "../../../../src/pipeline/daily-pipeline";

export const maxDuration = 300; // 5-minute timeout (Vercel Pro limit)
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/daily
 *
 * Protected by CRON_SECRET header. Invoked automatically by Vercel Cron at
 * 00:00 UTC daily. Can also be triggered manually for testing.
 *
 * Auth: request must include header  x-cron-secret: <CRON_SECRET>
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const providedSecret = request.headers.get("x-cron-secret");
    if (providedSecret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Run pipeline ──────────────────────────────────────────────────────────
  try {
    console.log("[/api/cron/daily] Pipeline triggered");
    const result = await runDailyPipeline();

    return NextResponse.json(
      {
        ok: true,
        runId: result.runId,
        runDate: result.runDate,
        topicsProcessed: result.topicsProcessed,
        draftsPassed: result.draftsPassed,
        draftsFlags: result.draftsFlags,
        assetsGenerated: result.assets.length,
        assets: result.assets.map((a) => ({
          topic: a.topic,
          channels: Object.keys(a.channels),
        })),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[/api/cron/daily] Pipeline error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/daily — health check / last run info (no auth required)
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    endpoint: "POST /api/cron/daily",
    schedule: "0 0 * * * (daily midnight UTC)",
    auth: "x-cron-secret header required",
    status: "ready",
  });
}
