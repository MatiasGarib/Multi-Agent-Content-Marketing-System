/**
 * ContentGeneratorAgent
 *
 * Responsibility: Generate full draft articles for each approved topic.
 * Includes retry logic: if Claude returns < 400 words, retries once with a
 * stricter prompt demanding minimum length.
 *
 * Inputs:  PipelineContext, ValidatedTopic[], optional revision instructions map
 * Outputs: ContentGenerationResult
 */

import { callClaude } from "../lib/anthropic";
import type {
  PipelineContext,
  ValidatedTopic,
  ContentGenerationResult,
  Draft,
} from "../lib/types";

/** Target word counts by content type */
const WORD_TARGETS: Record<string, number> = {
  blog_post: 800,
  tutorial: 1200,
  thought_leadership: 600,
  product_announcement: 500,
};

const SYSTEM_PROMPT = `You are a senior technical writer at GitHub. You write for developers, by developers.
Voice rules you ALWAYS follow:
- Second-person ("you", "your") — never "the user", "users", or "developers" in the narrative
- Sentence case for ALL headings (H1/H2/H3): capitalise only the first word and proper nouns
- Direct, specific, technically credible — no fluff
- Never salesy — you solve problems, you do not sell features
- Active voice preferred`;

async function generateOneDraft(
  topic: ValidatedTopic,
  revisionInstructions?: string,
  isRetry = false
): Promise<Draft> {
  const target = WORD_TARGETS[topic.type] ?? 800;
  const minWords = isRetry ? target : Math.floor(target * 0.85);

  const revisionBlock = revisionInstructions
    ? `\n\n⚠️  REVISION — address ALL of the following before writing:\n${revisionInstructions}\n`
    : "";

  const retryBlock = isRetry
    ? `\n\n⚠️  RETRY — the previous draft was too short. You MUST write at least ${target} words. Be comprehensive: add examples, step-by-step breakdowns, code snippets where appropriate, and deeper explanations of each concept.\n`
    : "";

  const prompt = `Write a ${topic.type.replace(/_/g, " ")} article for GitHub's engineering blog.

Title: "${topic.title}"
${revisionBlock}${retryBlock}
Requirements:
- Minimum ${minWords} words (hard floor — do not go under)
- Structure: H1 headline → 3–5 H2/H3 subheadings → body paragraphs → CTA
- Include concrete examples, command-line snippets, or code blocks where they add value
- End with a clear, specific call-to-action (what should the reader do next?)
- Format: valid GitHub-flavoured Markdown
- Do NOT include any preamble, meta-commentary, or "Here is the article" text — output only the article

Write the complete article now.`;

  const content = await callClaude(prompt, {
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 3500,
  });

  const wordCount = content
    .replace(/```[\s\S]*?```/g, "") // strip code blocks from word count
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  return { topic: topic.title, type: topic.type, content, wordCount };
}

export async function runContentGeneratorAgent(
  ctx: PipelineContext,
  approvedTopics: ValidatedTopic[],
  revisionMap?: Map<string, string>
): Promise<ContentGenerationResult> {
  console.log(
    `[ContentGenerator] Generating ${approvedTopics.length} drafts (run ${ctx.runId})`
  );

  const drafts: Draft[] = [];

  for (const topic of approvedTopics) {
    const revisionInstructions = revisionMap?.get(topic.title);
    let draft = await generateOneDraft(topic, revisionInstructions);

    // Retry once if under 400 words
    if (draft.wordCount < 400) {
      console.log(
        `[ContentGenerator] Draft "${topic.title}" only ${draft.wordCount} words — retrying`
      );
      draft = await generateOneDraft(topic, revisionInstructions, true);
      console.log(
        `[ContentGenerator] Retry produced ${draft.wordCount} words for "${topic.title}"`
      );
    }

    drafts.push(draft);
  }

  return { drafts };
}
