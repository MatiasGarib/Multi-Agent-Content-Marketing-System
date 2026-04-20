import { NextRequest } from "next/server";
import { runDailyPipeline } from "../../../../src/pipeline/daily-pipeline";
import type { ProgressEvent } from "../../../../src/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/pipeline/stream
 *
 * Opens an SSE stream AND starts the pipeline inline — no separate POST needed.
 * All progress events are captured from the very first agent because the pipeline
 * runs inside the stream's ReadableStream.start(), eliminating the timing gap
 * that caused events to be lost with the previous event-bus approach.
 *
 * The first event sent is { agent: "__started__", data: { runId } } so the
 * client knows which run it is watching.
 */
export async function GET(_request: NextRequest): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // client disconnected — ignore
        }
      };

      const runId = crypto.randomUUID();

      // Tell the client the runId before anything else
      send({
        agent: "__started__",
        status: "started",
        summary: "Pipeline started",
        data: { runId },
        timestamp: new Date().toISOString(),
      });

      try {
        await runDailyPipeline({ runId, onProgress: send });
      } catch (err) {
        send({
          agent: "__error__",
          status: "failed",
          summary: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        });
      } finally {
        send({
          agent: "__done__",
          status: "completed",
          summary: "Pipeline finished",
          timestamp: new Date().toISOString(),
        });
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
