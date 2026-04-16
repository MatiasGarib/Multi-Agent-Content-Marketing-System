import { NextRequest } from "next/server";
import { subscribe, unsubscribe } from "../../../../src/lib/event-bus";
import type { ProgressEvent } from "../../../../src/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/pipeline/stream?runId=<runId>
 *
 * Server-Sent Events stream. Stays open while the pipeline runs and forwards
 * every ProgressEvent emitted by the event bus for the given runId.
 * Closes automatically when it receives the "__done__" sentinel event.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) {
    return new Response("Missing runId query parameter", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const listener = (event: ProgressEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));

        if (event.agent === "__done__" || event.agent === "__error__") {
          unsubscribe(runId, listener);
          controller.close();
        }
      };

      subscribe(runId, listener);

      // Send a heartbeat immediately so the client knows the connection is open
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ agent: "__connected__", status: "started", summary: "Stream connected", timestamp: new Date().toISOString() })}\n\n`
        )
      );

      // Auto-close after 10 minutes to prevent zombie connections
      setTimeout(() => {
        unsubscribe(runId, listener);
        try { controller.close(); } catch {}
      }, 10 * 60 * 1000);
    },
    cancel() {
      // Client disconnected — nothing to clean up since unsubscribe already handles it
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx buffering
    },
  });
}
