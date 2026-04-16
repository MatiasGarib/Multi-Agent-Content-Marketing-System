/**
 * CriticReviewerAgent
 *
 * Responsibility: Review each draft across four dimensions. Return structured
 * scores and, for failing drafts, specific revision instructions.
 *
 * Inputs:  PipelineContext, ContentGenerationResult
 * Outputs: CriticReviewResult
 *
 * A draft fails if ANY dimension scores < 6.
 */

import { callClaude, extractJson } from "../lib/anthropic";
import type {
  PipelineContext,
  ContentGenerationResult,
  CriticReviewResult,
  Review,
} from "../lib/types";

const SYSTEM_PROMPT = `You are a demanding technical editor at GitHub with a background in software engineering and developer marketing. You hold content to the standard of the GitHub Engineering Blog — technically rigorous, clearly structured, useful to working developers.

You score on four dimensions:
1. accuracy  — Are technical claims correct? Are any code examples valid? No dangerous oversimplifications?
2. argument  — Clear thesis? Does the piece deliver on its headline? Is the structure logical and complete?
3. seo       — Does the content naturally weave in relevant keywords? Are headings meaningful for search? Is search intent clearly met?
4. tone      — Developer-first voice? Second-person? Sentence case headings? Not salesy? No filler words?

If a draft fails, your revision instructions must be specific and actionable — cite the exact paragraph or heading that needs to change.`;

export async function runCriticReviewerAgent(
  ctx: PipelineContext,
  generationResult: ContentGenerationResult
): Promise<CriticReviewResult> {
  console.log(
    `[CriticReviewer] Reviewing ${generationResult.drafts.length} drafts`
  );

  const reviews: Review[] = [];

  for (const draft of generationResult.drafts) {
    const prompt = `Review the following GitHub blog draft for publication readiness.

Topic: ${draft.topic}
Content type: ${draft.type}
Word count: ${draft.wordCount}

---BEGIN ARTICLE---
${draft.content}
---END ARTICLE---

Score each dimension 1–10 and set "passed": true only if ALL four scores are ≥ 6.
If any score is < 6, set "passed": false and include actionable "revisionInstructions" that specify:
- Which section or heading is the problem
- What exactly needs to change
- Why it currently fails the criterion

Return ONLY valid JSON with no markdown fencing:
{
  "topic": "${draft.topic.replace(/"/g, '\\"')}",
  "scores": {
    "accuracy": 0,
    "argument": 0,
    "seo": 0,
    "tone": 0
  },
  "passed": true,
  "revisionInstructions": "Only present when passed is false. Be specific."
}`;

    const response = await callClaude(prompt, {
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 1000,
    });

    const review = extractJson<Review>(response);

    // Enforce the pass/fail rule regardless of what Claude returns
    const lowestScore = Math.min(
      review.scores.accuracy,
      review.scores.argument,
      review.scores.seo,
      review.scores.tone
    );
    review.passed = lowestScore >= 6;

    const scoreStr = `acc:${review.scores.accuracy} arg:${review.scores.argument} seo:${review.scores.seo} tone:${review.scores.tone}`;
    console.log(
      `[CriticReviewer] "${draft.topic}" → ${review.passed ? "PASS" : "FAIL"} [${scoreStr}]`
    );

    reviews.push(review);
  }

  return { reviews };
}
