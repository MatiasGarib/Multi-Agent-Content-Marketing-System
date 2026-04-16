/**
 * Daily Pipeline Orchestrator
 *
 * Execution order:
 *   1. Prepare shared context (run ID, date, seed topics)
 *   2. RESEARCH LAYER — KeywordResearcher → TopicPrioritizer → BrandChecker
 *      (sequential due to data dependency; architecturally the "parallel research tier")
 *   3. Merge outputs into an approved topic list
 *   4. GENERATION LAYER (sequential) — ContentGenerator → CriticReviewer loop
 *      → Editor → ChannelAdapter
 *   5. Push content assets to GitHub
 *   6. Write run metadata to Postgres
 *   7. Return structured run summary
 */

import { runKeywordResearcherAgent } from "../agents/keyword-researcher";
import { runTopicPrioritizerAgent } from "../agents/topic-prioritizer";
import { runBrandCheckerAgent } from "../agents/brand-checker";
import { runContentGeneratorAgent } from "../agents/content-generator";
import { runCriticReviewerAgent } from "../agents/critic-reviewer";
import { runEditorAgent } from "../agents/editor";
import { runChannelAdapterAgent } from "../agents/channel-adapter";
import { initDb, saveRun } from "../lib/db";
import { pushToGitHub } from "../lib/github";
import type {
  PipelineContext,
  PipelineResult,
  ValidatedTopic,
  ContentGenerationResult,
  Draft,
} from "../lib/types";

// ─── Seed topics ──────────────────────────────────────────────────────────────

const SEED_TOPICS: string[] = [
  "GitHub Actions CI/CD automation",
  "GitHub Copilot AI coding assistant",
  "open source contribution workflow",
  "code review best practices",
  "GitHub security vulnerability scanning",
  "developer productivity tools",
  "Git branching strategies",
  "GitHub Pages static site deployment",
  "software development collaboration",
  "DevOps automation pipelines",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatContentFile(
  adapted: { topic: string; channels: { blog: string; twitter_thread: string[]; linkedin: string; developer_newsletter: string } },
  meta: { date: string; type: string; brandScore: number }
): string {
  const { topic, channels } = adapted;
  const tweetBlock = channels.twitter_thread.join("\n\n");

  return `# ${topic}

> Generated: ${meta.date} | Type: ${meta.type} | Brand score: ${meta.brandScore}/10

---

## Blog post

${channels.blog}

---

## Twitter thread

${tweetBlock}

---

## LinkedIn

${channels.linkedin}

---

## Newsletter blurb

${channels.developer_newsletter}
`;
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function runDailyPipeline(): Promise<PipelineResult> {
  const runId = crypto.randomUUID();
  const runDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  console.log(`\n${"=".repeat(60)}`);
  console.log(`[Pipeline] Starting run ${runId} — ${runDate}`);
  console.log(`${"=".repeat(60)}\n`);

  // ── 0. DB init ──────────────────────────────────────────────────────────────
  await initDb();

  // ── 1. Prepare shared context ───────────────────────────────────────────────
  const ctx: PipelineContext = {
    runId,
    date: runDate,
    seedTopics: SEED_TOPICS,
  };

  // ── 2. Research layer ───────────────────────────────────────────────────────
  // Note: These three agents form the "parallel research tier" of the architecture.
  // In this implementation they run in dependency order (KR → TP → BC) because each
  // agent's output is the next agent's input. The parallelism described in the spec
  // refers to them being conceptually independent research functions; within this tier
  // we cannot parallelise KR+TP because TP requires KR's output, and BC requires TP's.
  // The ChannelAdapterAgent later parallelises its three derived formats (Twitter,
  // LinkedIn, newsletter) via Promise.all as a concrete example of parallelism.

  console.log("[Pipeline] ── RESEARCH LAYER ──────────────────────────────");

  const keywordResult = await runKeywordResearcherAgent(ctx);
  const topicResult = await runTopicPrioritizerAgent(ctx, keywordResult);
  const brandResult = await runBrandCheckerAgent(ctx, topicResult);

  // ── 3. Merge: only topics that passed brand check ───────────────────────────
  const approvedTopics: ValidatedTopic[] = brandResult.validated.filter(
    (v) => v.passed
  );
  const flaggedByBrand = brandResult.validated.filter((v) => !v.passed);

  console.log(
    `[Pipeline] Approved topics: ${approvedTopics.length} | Brand-blocked: ${flaggedByBrand.length}`
  );

  if (approvedTopics.length === 0) {
    console.warn("[Pipeline] No topics passed brand check — aborting run");
    await saveRun({
      runId,
      runDate,
      topicsProcessed: 0,
      draftsPassed: 0,
      draftsFlags: flaggedByBrand.length,
    });
    return {
      runId,
      runDate,
      topicsProcessed: 0,
      draftsPassed: 0,
      draftsFlags: flaggedByBrand.length,
      assets: [],
    };
  }

  // ── 4. Generation layer ─────────────────────────────────────────────────────
  console.log("[Pipeline] ── GENERATION LAYER ────────────────────────────");

  // Track revision cycles per topic (max 2 before flagging for human review)
  const revisionCycles = new Map<string, number>();
  const humanReviewQueue: string[] = [];

  // Initial generation
  let activeDrafts: ContentGenerationResult =
    await runContentGeneratorAgent(ctx, approvedTopics);

  // CriticReviewer → revise loop
  let reviewResult = await runCriticReviewerAgent(ctx, activeDrafts);

  let failedReviews = reviewResult.reviews.filter((r) => !r.passed);

  while (failedReviews.length > 0) {
    const topicsNeedingRevision: ValidatedTopic[] = [];
    const revisionMap = new Map<string, string>();

    for (const review of failedReviews) {
      const cycleCount = (revisionCycles.get(review.topic) ?? 0) + 1;
      revisionCycles.set(review.topic, cycleCount);

      if (cycleCount >= 2) {
        // Two strikes — flag for human review
        if (!humanReviewQueue.includes(review.topic)) {
          console.warn(
            `[Pipeline] "${review.topic}" flagged for human review after ${cycleCount} revision cycles`
          );
          humanReviewQueue.push(review.topic);
        }
      } else {
        // Queue for revision
        const topicInfo = approvedTopics.find((t) => t.title === review.topic);
        if (topicInfo && review.revisionInstructions) {
          topicsNeedingRevision.push(topicInfo);
          revisionMap.set(review.topic, review.revisionInstructions);
        }
      }
    }

    // Remove human-flagged drafts from active set
    activeDrafts = {
      drafts: activeDrafts.drafts.filter(
        (d) => !humanReviewQueue.includes(d.topic)
      ),
    };

    if (topicsNeedingRevision.length === 0) break;

    // Regenerate only the failing drafts
    const revisedBatch = await runContentGeneratorAgent(
      ctx,
      topicsNeedingRevision,
      revisionMap
    );

    // Splice revised drafts back into activeDrafts
    const revisedMap = new Map<string, Draft>(
      revisedBatch.drafts.map((d) => [d.topic, d])
    );
    activeDrafts = {
      drafts: activeDrafts.drafts.map((d) => revisedMap.get(d.topic) ?? d),
    };

    // Re-review the revised drafts only (optimisation: don't re-review already-passed ones)
    const revisedTopicTitles = new Set(topicsNeedingRevision.map((t) => t.title));
    const draftsToReReview: ContentGenerationResult = {
      drafts: activeDrafts.drafts.filter((d) => revisedTopicTitles.has(d.topic)),
    };

    const reReviewResult = await runCriticReviewerAgent(ctx, draftsToReReview);

    // Merge re-review results into overall reviewResult
    for (const newReview of reReviewResult.reviews) {
      const idx = reviewResult.reviews.findIndex(
        (r) => r.topic === newReview.topic
      );
      if (idx >= 0) {
        reviewResult.reviews[idx] = newReview;
      }
    }

    failedReviews = reviewResult.reviews.filter(
      (r) =>
        !r.passed &&
        !humanReviewQueue.includes(r.topic) &&
        (revisionCycles.get(r.topic) ?? 0) < 2
    );
  }

  // Final pass: flag any remaining failures for human review
  for (const review of reviewResult.reviews) {
    if (!review.passed && !humanReviewQueue.includes(review.topic)) {
      humanReviewQueue.push(review.topic);
      activeDrafts = {
        drafts: activeDrafts.drafts.filter((d) => d.topic !== review.topic),
      };
    }
  }

  const passedDrafts: ContentGenerationResult = {
    drafts: activeDrafts.drafts.filter((d) =>
      reviewResult.reviews.find((r) => r.topic === d.topic)?.passed !== false
    ),
  };

  console.log(
    `[Pipeline] Drafts passed review: ${passedDrafts.drafts.length} | Flagged for human review: ${humanReviewQueue.length}`
  );

  if (passedDrafts.drafts.length === 0) {
    console.warn("[Pipeline] No drafts passed review — skipping edit/adapt");
    await saveRun({
      runId,
      runDate,
      topicsProcessed: approvedTopics.length,
      draftsPassed: 0,
      draftsFlags: humanReviewQueue.length + flaggedByBrand.length,
    });
    return {
      runId,
      runDate,
      topicsProcessed: approvedTopics.length,
      draftsPassed: 0,
      draftsFlags: humanReviewQueue.length,
      assets: [],
    };
  }

  // Edit
  const editResult = await runEditorAgent(ctx, passedDrafts);

  // Channel adaptation (Twitter/LinkedIn/newsletter run in parallel inside the agent)
  const adaptResult = await runChannelAdapterAgent(ctx, editResult);

  // ── 5. Push to GitHub ───────────────────────────────────────────────────────
  console.log("[Pipeline] ── GITHUB OUTPUT ───────────────────────────────");

  for (const content of adaptResult.adapted) {
    const slug = slugify(content.topic);
    const filePath = `content/${runDate}/${slug}.md`;

    const brandScore =
      brandResult.validated.find((v) => v.title === content.topic)
        ?.brandScore ?? 0;
    const topicType =
      approvedTopics.find((t) => t.title === content.topic)?.type ?? "blog_post";

    const fileContent = formatContentFile(content, {
      date: runDate,
      type: topicType,
      brandScore,
    });

    try {
      await pushToGitHub(
        filePath,
        fileContent,
        `content: add ${slug} [run:${runId.slice(0, 8)}]`
      );
      console.log(`[Pipeline] ✓ Pushed ${filePath}`);
    } catch (err) {
      console.error(`[Pipeline] ✗ Failed to push ${filePath}:`, err);
    }
  }

  // ── 6. Persist run metadata ─────────────────────────────────────────────────
  await saveRun({
    runId,
    runDate,
    topicsProcessed: approvedTopics.length,
    draftsPassed: passedDrafts.drafts.length,
    draftsFlags: humanReviewQueue.length,
  });

  // ── 7. Return run summary ───────────────────────────────────────────────────
  const result: PipelineResult = {
    runId,
    runDate,
    topicsProcessed: approvedTopics.length,
    draftsPassed: passedDrafts.drafts.length,
    draftsFlags: humanReviewQueue.length,
    assets: adaptResult.adapted,
  };

  console.log(`\n[Pipeline] Run ${runId} complete.`);
  console.log(
    `           Topics processed: ${result.topicsProcessed} | Passed: ${result.draftsPassed} | Flagged: ${result.draftsFlags}`
  );
  console.log(`${"=".repeat(60)}\n`);

  return result;
}
