import { NextRequest, NextResponse } from "next/server";
import { getPipelineOutputs } from "../../../../../src/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/pipeline/[runId]/outputs
 *
 * Returns all pipeline_outputs rows for a run (full content per topic).
 * Used by the review page to render channel variants.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { runId: string } }
): Promise<NextResponse> {
  try {
    const outputs = await getPipelineOutputs(params.runId);
    return NextResponse.json({ outputs }, { status: 200 });
  } catch (err) {
    console.error("[/api/pipeline/[runId]/outputs]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
