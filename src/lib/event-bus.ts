/**
 * In-memory SSE event bus.
 *
 * Keyed by runId. The pipeline `run` route emits progress events here;
 * the `stream` route subscribes and forwards them to the client via SSE.
 *
 * Works correctly in local dev (single Node process).
 * For production/serverless scale, replace with Upstash Redis pub/sub.
 */

import type { ProgressEvent } from "./types";

type Listener = (event: ProgressEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function emit(runId: string, event: ProgressEvent): void {
  const set = listeners.get(runId);
  if (set) {
    for (const fn of set) {
      fn(event);
    }
  }
}

export function subscribe(runId: string, listener: Listener): void {
  if (!listeners.has(runId)) {
    listeners.set(runId, new Set());
  }
  listeners.get(runId)!.add(listener);
}

export function unsubscribe(runId: string, listener: Listener): void {
  listeners.get(runId)?.delete(listener);
  if (listeners.get(runId)?.size === 0) {
    listeners.delete(runId);
  }
}

/** Emit a synthetic "done" sentinel so the SSE stream can close itself. */
export function emitDone(runId: string): void {
  emit(runId, {
    agent: "__done__",
    status: "completed",
    summary: "Pipeline finished",
    timestamp: new Date().toISOString(),
  });
}
