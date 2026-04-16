import { NextResponse } from "next/server";
import { getRecentRuns } from "../../../src/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/runs
 *
 * Returns the last 10 pipeline run records from Postgres.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const runs = await getRecentRuns(10);
    return NextResponse.json({ runs }, { status: 200 });
  } catch (err) {
    console.error("[/api/runs]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
