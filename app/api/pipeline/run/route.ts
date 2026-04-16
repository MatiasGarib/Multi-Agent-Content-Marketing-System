import { NextRequest, NextResponse } from "next/server";
import { runDailyPipeline } from "../../../../src/pipeline/daily-pipeline";
import { emit, emitDone } from "../../../../src/lib/event-bus";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/pipeline/run
 *
 * Manually trigger the full pipeline. Protected by CRON_SECRET if set.
 * Returns { runId } immediately (202 Accepted).
 * Progress events stream via GET /api/pipeline/stream?runId=<runId>
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = request.headers.get("x-cron-secret");
    if (provided !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Generate runId here so we can return it before the pipeline finishes
  const runId = crypto.randomUUID();

  // Fire pipeline in background — do NOT await
  void (async () => {
    try {
      await runDailyPipeline({
        runId,
        onProgress: (event) => {
          emit(runId, event);
        },
      });
    } catch (err) {
      console.error("[/api/pipeline/run] Pipeline error:", err);
      emit(runId, {
        agent: "__error__",
        status: "failed",
        summary: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    } finally {
      emitDone(runId);
    }
  })();

  return NextResponse.json({ runId }, { status: 202 });
}
