/**
 * BrandCheckerAgent
 *
 * Responsibility: Validate each topic against GitHub's brand voice.
 * Topics scoring < 6 are flagged as failed and blocked from the generation layer.
 *
 * Inputs:  PipelineContext, TopicPrioritizationResult
 * Outputs: BrandCheckResult
 */

import { callClaude, extractJson } from "../lib/anthropic";
import type {
  PipelineContext,
  TopicPrioritizationResult,
  BrandCheckResult,
  ValidatedTopic,
  Topic,
} from "../lib/types";

const SYSTEM_PROMPT = `You are GitHub's brand guardian. GitHub's brand principles:
1. Developer-first — speak to developers as technical peers, never as customers or users
2. Technically credible — never oversimplify; assume the audience can read code
3. Not salesy — solve problems, do not pitch features; avoid "powerful", "best-in-class", "game-changing"
4. Open source values — collaborative, transparent, community-driven framing
5. Pragmatic optimism — build things that matter; focus on real, measurable impact

You score content topic proposals and block anything that would embarrass GitHub's brand.`;

export async function runBrandCheckerAgent(
  ctx: PipelineContext,
  topicResult: TopicPrioritizationResult
): Promise<BrandCheckResult> {
  console.log(`[BrandChecker] Validating ${topicResult.topics.length} topics`);

  const prompt = `Validate the following content topics against GitHub's brand voice guidelines.

Topics to validate:
${JSON.stringify(topicResult.topics, null, 2)}

For each topic, assess ALL five dimensions:
1. Developer-first framing (does it speak to developers as peers?)
2. Technical credibility (could a senior engineer read this without cringing?)
3. Problem-focused (is it about solving a real dev problem, not selling features?)
4. Open source alignment (collaborative, community-driven angle available?)
5. Not salesy (no buzzwords, no "powerful", "seamless", "game-changing"?)

Score 1–10 for overall brand fit. If ANY dimension is a hard fail (score ≤ 3), cap overall at 5.
Set "passed": true only if score ≥ 6.

In "notes", be specific: name the exact dimension that passed or failed and why.

Return ONLY valid JSON with no markdown fencing — one entry per input topic, in the same order:
{
  "validated": [
    {
      "title": "exact title from input",
      "brandScore": 8,
      "passed": true,
      "notes": "Strong developer-first framing. Technical depth evident in title. Not salesy.",
      "type": "blog_post"
    }
  ]
}`;

  const response = await callClaude(prompt, { systemPrompt: SYSTEM_PROMPT, maxTokens: 1500 });
  const raw = extractJson<{ validated: Omit<ValidatedTopic, "type">[] }>(response);

  if (!Array.isArray(raw.validated)) {
    throw new Error("BrandCheckerAgent: response missing 'validated' array");
  }

  // Merge type from original topics (brand checker might omit it)
  const validated: ValidatedTopic[] = raw.validated.map((v) => {
    const original = topicResult.topics.find(
      (t: Topic) => t.title === v.title
    );
    return {
      ...v,
      type: original?.type ?? "blog_post",
    } as ValidatedTopic;
  });

  const passed = validated.filter((v) => v.passed).length;
  const failed = validated.filter((v) => !v.passed).length;
  console.log(`[BrandChecker] ${passed} passed, ${failed} failed brand check`);

  return { validated };
}
