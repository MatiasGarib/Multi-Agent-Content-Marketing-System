/**
 * ChannelAdapterAgent
 *
 * Responsibility: Produce channel-specific content variants from each final
 * edited draft:
 *   - blog: full markdown as-is
 *   - twitter_thread: 5–7 numbered tweets, each ≤ 280 chars
 *   - linkedin: ≤ 1300-char professional post, max 3 hashtags
 *   - developer_newsletter: ~150-word digest blurb
 *
 * Inputs:  PipelineContext, EditResult
 * Outputs: ChannelAdaptResult
 */

import { callClaude, extractJson } from "../lib/anthropic";
import type {
  PipelineContext,
  EditResult,
  ChannelAdaptResult,
  AdaptedContent,
  EditedDraft,
} from "../lib/types";

// ─── Twitter ─────────────────────────────────────────────────────────────────

async function buildTwitterThread(draft: EditedDraft): Promise<string[]> {
  const prompt = `Convert the following GitHub blog post into a Twitter/X thread.

Article:
---
${draft.finalContent}
---

Rules:
- 5–7 tweets total
- EACH tweet MUST be ≤ 280 characters — count every character carefully
- Numbering format: "1/N" at the START of each tweet (use the actual total, e.g. "1/6")
- Tweet 1 (hook): a provocative question, a surprising fact, or a bold claim — make it scroll-stopping
- Tweets 2 to N-1: one key insight each, building on the previous
- Last tweet: CTA pointing to the full article (use the placeholder text "[full article]")
- Developer tone — technically credible, no emoji spam (0–1 emoji total), max 2 hashtags in the last tweet
- Each tweet must stand alone and make sense without reading the others

Return ONLY a JSON array of strings — no markdown fencing, no extra text:
["1/6 hook tweet text", "2/6 second tweet", "3/6 third tweet", ...]`;

  const response = await callClaude(prompt, {
    systemPrompt:
      "You are a developer advocate at GitHub who writes technically credible Twitter threads. Output ONLY a JSON array of tweet strings.",
    maxTokens: 1200,
  });

  const tweets = extractJson<string[]>(response);
  if (!Array.isArray(tweets) || tweets.length < 5) {
    throw new Error(
      `ChannelAdapterAgent: Twitter thread for "${draft.topic}" returned ${tweets?.length ?? 0} tweets (need 5–7)`
    );
  }

  // Enforce 280 char limit — truncate with ellipsis if necessary
  return tweets.map((t: string) =>
    t.length > 280 ? t.slice(0, 277) + "…" : t
  );
}

// ─── LinkedIn ─────────────────────────────────────────────────────────────────

async function buildLinkedIn(draft: EditedDraft): Promise<string> {
  const prompt = `Write a LinkedIn post based on the following GitHub blog article.

Article:
---
${draft.finalContent}
---

Rules:
- MAXIMUM 1 300 characters (hard limit — count carefully)
- First line must be a hook that makes people want to click "see more"
- Professional but conversational; write like a thoughtful senior engineer, not a marketing manager
- Include 2–3 concrete insights from the article
- End with an engaging question or a direct CTA
- Exactly 3 hashtags at the end, on their own line — choose the most relevant ones
- 0–2 emojis total; no 🚀, 💡, or ✨
- No "I'm excited to share", no "game-changing", no "revolutionize"

Return ONLY the post text — no JSON, no label, no explanation.`;

  const post = await callClaude(prompt, {
    systemPrompt:
      "You are a senior developer advocate at GitHub. Output ONLY the LinkedIn post text.",
    maxTokens: 600,
  });

  // Enforce 1300 char limit
  return post.length > 1300 ? post.slice(0, 1297) + "…" : post;
}

// ─── Newsletter blurb ─────────────────────────────────────────────────────────

async function buildNewsletter(draft: EditedDraft): Promise<string> {
  const prompt = `Write a newsletter digest blurb for the following GitHub blog article.

Article:
---
${draft.finalContent}
---

Rules:
- 140–160 words (aim for exactly 150)
- Third-person perspective — describe the article's value to the reader
- Lead with the key problem solved or insight delivered
- Mention who benefits most from reading it (e.g. "developers working with large monorepos")
- End with a concrete reason to click through — what will they be able to DO after reading?
- No bullet points, no headings — clean prose only
- No hype, no superlatives, no "this article will change the way you…"

Return ONLY the blurb text — no JSON, no label.`;

  return await callClaude(prompt, {
    systemPrompt:
      "You are the editor of GitHub's developer newsletter. Output ONLY the newsletter blurb text.",
    maxTokens: 300,
  });
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function runChannelAdapterAgent(
  ctx: PipelineContext,
  editResult: EditResult
): Promise<ChannelAdaptResult> {
  console.log(
    `[ChannelAdapter] Adapting ${editResult.edited.length} articles to 4 channels`
  );

  const adapted: AdaptedContent[] = [];

  for (const draft of editResult.edited) {
    console.log(`[ChannelAdapter] Processing "${draft.topic}"`);

    // Run all three derived formats in parallel; blog is the draft as-is
    const [twitter_thread, linkedin, developer_newsletter] = await Promise.all([
      buildTwitterThread(draft),
      buildLinkedIn(draft),
      buildNewsletter(draft),
    ]);

    adapted.push({
      topic: draft.topic,
      channels: {
        blog: draft.finalContent,
        twitter_thread,
        linkedin,
        developer_newsletter,
      },
    });
  }

  return { adapted };
}
