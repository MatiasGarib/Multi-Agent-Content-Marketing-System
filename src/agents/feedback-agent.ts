/**
 * FeedbackAgent
 *
 * Responsibility: Turn human approval/rejection decisions into structured
 * learnings that can be injected as context into future pipeline runs.
 *
 * Inputs:  array of content reviews (human decisions) + pipeline output summaries
 * Outputs: FeedbackLearning saved to DB
 *
 * These learnings are loaded at the start of each pipeline run and injected into
 * TopicPrioritizer and ContentGenerator system prompts via PipelineContext.feedbackContext.
 */

import { callClaude, extractJson } from "../lib/anthropic";
import type { ContentReviewRow, PipelineOutputRow } from "../lib/types";

interface FeedbackResult {
  approvedPatterns: string[];
  rejectedPatterns: string[];
  improvementNotes: string;
}

const SYSTEM_PROMPT = `You are a content strategy analyst. You analyse human editorial decisions — which pieces were approved or rejected and why — and extract actionable patterns to improve future content generation. Be concrete and specific. Do not repeat the obvious. Focus on what is surprising or non-intuitive.`;

export async function runFeedbackAgent(
  reviews: ContentReviewRow[],
  outputs: PipelineOutputRow[]
): Promise<FeedbackResult> {
  console.log(`[FeedbackAgent] Processing ${reviews.length} human reviews`);

  const reviewContext = reviews.map((r) => {
    const output = outputs.find((o) => o.topic === r.topic);
    return {
      topic: r.topic,
      contentType: output?.content_type ?? "unknown",
      brandScore: output?.brand_score ?? null,
      approved: r.approved,
      humanFeedback: r.feedback ?? "(no feedback provided)",
    };
  });

  const prompt = `Analyse these human editorial decisions on AI-generated GitHub content:

${JSON.stringify(reviewContext, null, 2)}

Extract three categories of insights:

1. approvedPatterns: What made approved pieces work? Look for: topic angles, content types, framing style, specificity level, audience targeting. List 2–5 concrete, actionable patterns (e.g. "Tutorial format with step-by-step CLI commands outperformed conceptual posts").

2. rejectedPatterns: What caused pieces to be rejected? Look for: vague titles, wrong tone, off-brand angles, missing technical depth, wrong content type for the audience. List 2–5 concrete patterns to avoid.

3. improvementNotes: A single paragraph of specific writing and topic-selection advice for future runs. This will be injected directly into the content generation system prompt, so write it as direct instructions (e.g. "Prioritise tutorials over thought leadership when the keyword has high transactional intent…").

Return ONLY valid JSON with no markdown fencing:
{
  "approvedPatterns": ["pattern 1", "pattern 2"],
  "rejectedPatterns": ["pattern 1", "pattern 2"],
  "improvementNotes": "Direct instructions for the next run..."
}`;

  const response = await callClaude(prompt, {
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 1000,
  });

  const result = extractJson<FeedbackResult>(response);

  if (!Array.isArray(result.approvedPatterns) || !Array.isArray(result.rejectedPatterns)) {
    throw new Error("FeedbackAgent: malformed response — missing pattern arrays");
  }

  console.log(
    `[FeedbackAgent] Extracted ${result.approvedPatterns.length} approved patterns, ` +
    `${result.rejectedPatterns.length} rejected patterns`
  );

  return result;
}
