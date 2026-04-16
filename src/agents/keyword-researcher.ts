/**
 * KeywordResearcherAgent
 *
 * Responsibility: For each seed topic, generate 3 ranked keyword variations
 * with search intent classification and strategic priority scores.
 *
 * Inputs:  PipelineContext (seed topics embedded)
 * Outputs: KeywordResearchResult
 */

import { callClaude, extractJson } from "../lib/anthropic";
import type { PipelineContext, KeywordResearchResult } from "../lib/types";

const SYSTEM_PROMPT = `You are a senior SEO strategist specialising in developer tools and technical content marketing for GitHub. You identify high-value keyword opportunities that real developers search for — no fluff, no buzzwords.`;

export async function runKeywordResearcherAgent(
  ctx: PipelineContext
): Promise<KeywordResearchResult> {
  console.log(`[KeywordResearcher] Generating keywords for ${ctx.seedTopics.length} seeds`);

  const prompt = `For each of the following seed topics related to GitHub and developer tools, generate exactly 3 ranked keyword variations.

Seed topics:
${ctx.seedTopics.map((t, i) => `${i + 1}. ${t}`).join("\n")}

For each keyword variation, provide:
- term: the actual keyword phrase (2–5 words, as a developer would type it into Google)
- intent: one of "informational" | "navigational" | "transactional"
- score: strategic priority score 1–10 for GitHub's content marketing (10 = highest)
- seed: the exact seed topic string it derives from

Scoring criteria:
- High informational intent → score 7–9 (developers researching how to solve a problem)
- Transactional intent aligned with GitHub products → score 8–10
- Navigational intent → score 4–6 (lower value for content marketing)
- Prefer long-tail, specific phrases over single-word terms

Return ONLY valid JSON with no markdown fencing:
{
  "keywords": [
    { "term": "keyword phrase", "intent": "informational", "score": 8, "seed": "exact seed topic" }
  ]
}

Generate exactly ${ctx.seedTopics.length * 3} keywords (3 per seed).`;

  const response = await callClaude(prompt, { systemPrompt: SYSTEM_PROMPT, maxTokens: 3000 });
  const result = extractJson<KeywordResearchResult>(response);

  if (!Array.isArray(result.keywords)) {
    throw new Error("KeywordResearcherAgent: response missing 'keywords' array");
  }

  console.log(`[KeywordResearcher] Generated ${result.keywords.length} keywords`);
  return result;
}
