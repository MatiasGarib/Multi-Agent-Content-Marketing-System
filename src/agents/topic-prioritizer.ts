/**
 * TopicPrioritizerAgent
 *
 * Responsibility: Select the top 3 content topics from keyword research output,
 * check for cannibalization risk, and assign a content type per topic.
 *
 * Inputs:  PipelineContext, KeywordResearchResult
 * Outputs: TopicPrioritizationResult
 */

import { callClaude, extractJson } from "../lib/anthropic";
import type {
  PipelineContext,
  KeywordResearchResult,
  TopicPrioritizationResult,
} from "../lib/types";

const SYSTEM_PROMPT = `You are a content strategy director at GitHub. You decide which topics deserve production investment based on strategic value, uniqueness, and audience fit. You are ruthless about avoiding content that would cannibalize or duplicate existing GitHub docs, GitHub blog posts, or topics that GitHub covers so authoritatively that a new article adds no value.`;

export async function runTopicPrioritizerAgent(
  ctx: PipelineContext,
  keywordResult: KeywordResearchResult
): Promise<TopicPrioritizationResult> {
  console.log("[TopicPrioritizer] Selecting top 3 topics from keyword research");

  const highValueKeywords = keywordResult.keywords
    .filter((k) => k.score >= 6)
    .sort((a, b) => b.score - a.score);

  const prompt = `Analyse the following keyword research and select exactly 3 topics for GitHub's content pipeline.

Top-scoring keywords (score ≥ 6):
${JSON.stringify(highValueKeywords, null, 2)}

For each selected topic:
1. Write a specific, compelling content title (not just the keyword — make it a real article title)
2. Assign content type: "blog_post" | "tutorial" | "thought_leadership" | "product_announcement"
3. Assess cannibalization risk:
   - "high": GitHub already covers this deeply in docs.github.com or official blog
   - "medium": Partial coverage exists; a fresh angle is possible
   - "low": Genuinely underserved topic or fresh perspective
4. Write a 2–3 sentence strategic rationale explaining why this topic matters now

Selection rules:
- Choose topics with score ≥ 7 where possible
- Do NOT select all the same content type (vary them)
- Prefer informational and transactional intent keywords
- Prefer topics with low or medium cannibalization risk
- Topics must be genuinely useful to GitHub's developer audience

Return ONLY valid JSON with no markdown fencing:
{
  "topics": [
    {
      "title": "Specific article title",
      "type": "blog_post",
      "cannibalizationRisk": "low",
      "rationale": "Why this topic is strategically valuable right now."
    }
  ]
}`;

  const response = await callClaude(prompt, { systemPrompt: SYSTEM_PROMPT, maxTokens: 1500 });
  const result = extractJson<TopicPrioritizationResult>(response);

  if (!Array.isArray(result.topics) || result.topics.length === 0) {
    throw new Error("TopicPrioritizerAgent: response missing 'topics' array");
  }

  console.log(`[TopicPrioritizer] Selected ${result.topics.length} topics`);
  return result;
}
