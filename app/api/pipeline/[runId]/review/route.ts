import { NextRequest, NextResponse } from "next/server";
import { saveContentReview, saveFeedbackLearning, getPipelineOutputs } from "../../../../../src/lib/db";
import { runFeedbackAgent } from "../../../../../src/agents/feedback-agent";

export const dynamic = "force-dynamic";

interface ReviewSubmission {
  topic: string;
  approved: boolean;
  feedback: string | null;
}

/**
 * POST /api/pipeline/[runId]/review
 *
 * Body: { reviews: ReviewSubmission[] }
 *
 * 1. Saves each decision to content_reviews table
 * 2. Runs FeedbackAgent to extract learnings
 * 3. Saves learnings to feedback_learnings table
 * 4. Returns the saved learning summary
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { runId: string } }
): Promise<NextResponse> {
  const { runId } = params;
  let body: { reviews: ReviewSubmission[] };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.reviews) || body.reviews.length === 0) {
    return NextResponse.json({ error: "reviews array is required" }, { status: 400 });
  }

  // 1. Save each decision
  for (const review of body.reviews) {
    await saveContentReview({
      runId,
      topic: review.topic,
      approved: review.approved,
      feedback: review.feedback ?? null,
    });
  }

  // 2. Run FeedbackAgent
  let learningResult;
  try {
    const outputs = await getPipelineOutputs(runId);
    const reviewRows = body.reviews.map((r, i) => ({
      id: i,
      run_id: runId,
      topic: r.topic,
      approved: r.approved,
      feedback: r.feedback,
      reviewed_at: new Date().toISOString(),
    }));
    learningResult = await runFeedbackAgent(reviewRows, outputs);
  } catch (err) {
    console.error("[/api/pipeline/[runId]/review] FeedbackAgent error:", err);
    // Don't fail the whole request if FeedbackAgent errors — reviews are already saved
    return NextResponse.json({
      ok: true,
      savedReviews: body.reviews.length,
      learnings: null,
      error: "FeedbackAgent failed: " + (err instanceof Error ? err.message : String(err)),
    });
  }

  // 3. Save learnings
  await saveFeedbackLearning({
    runId,
    approvedPatterns: learningResult.approvedPatterns,
    rejectedPatterns: learningResult.rejectedPatterns,
    improvementNotes: learningResult.improvementNotes,
  });

  return NextResponse.json({
    ok: true,
    savedReviews: body.reviews.length,
    learnings: learningResult,
  });
}
