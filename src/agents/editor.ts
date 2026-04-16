/**
 * EditorAgent
 *
 * Responsibility: Final copy-edit pass on drafts that passed critic review.
 * Enforces second-person voice, sentence-case headings, removes filler words,
 * prefers active voice, and breaks up long paragraphs.
 *
 * Inputs:  PipelineContext, ContentGenerationResult (passed drafts only)
 * Outputs: EditResult
 */

import { callClaude } from "../lib/anthropic";
import type {
  PipelineContext,
  ContentGenerationResult,
  EditResult,
  EditedDraft,
} from "../lib/types";

const SYSTEM_PROMPT = `You are the final copy editor at GitHub's engineering blog. You return ONLY the edited article — no preamble, no explanations, no "Here is the edited version:". Just the Markdown.

Your non-negotiable rules:
1. VOICE: Replace every instance of "the user", "users" (when used as a narrative subject), "developers" (as a group the article is speaking about), with "you" or "your".
2. HEADINGS: Enforce sentence case on ALL headings (H1, H2, H3). Capitalise only the first word and proper nouns (GitHub, JavaScript, Python, CI/CD, etc.). Lowercase everything else.
3. FILLER WORDS: Remove or replace: "very", "really", "just" (when not structurally necessary), "leverage", "streamline", "utilize", "synergy", "robust", "seamless", "game-changer", "revolutionize", "cutting-edge", "state-of-the-art", "best-in-class".
4. ACTIVE VOICE: Rewrite passive constructions where active voice is clearer.
5. PARAGRAPH LENGTH: Break up any paragraph longer than 5 sentences into two or more paragraphs.
6. CTA: Ensure the final CTA is a concrete, specific action (not vague like "Learn more").`;

export async function runEditorAgent(
  ctx: PipelineContext,
  passedDrafts: ContentGenerationResult
): Promise<EditResult> {
  console.log(`[Editor] Editing ${passedDrafts.drafts.length} drafts`);

  const edited: EditedDraft[] = [];

  for (const draft of passedDrafts.drafts) {
    const prompt = `Apply final copy editing to the following GitHub blog article. Return ONLY the complete edited Markdown — nothing else.

---BEGIN ARTICLE---
${draft.content}
---END ARTICLE---`;

    const finalContent = await callClaude(prompt, {
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 4096,
    });

    edited.push({
      topic: draft.topic,
      type: draft.type,
      finalContent,
    });

    console.log(`[Editor] Finished editing "${draft.topic}"`);
  }

  return { edited };
}
