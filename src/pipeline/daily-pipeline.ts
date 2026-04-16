/**
 * Daily Pipeline Orchestrator
 *
 * Execution order:
 *   1. Prepare shared context (run ID, date, seed topics, prior feedback learnings)
 *   2. RESEARCH LAYER — KeywordResearcher → TopicPrioritizer → BrandChecker
 *   3. Merge outputs into approved topic list
 *   4. GENERATION LAYER — ContentGenerator → CriticReviewer (revision loop)
 *      → Editor → ChannelAdapter
 *   5. Save full outputs to pipeline_outputs table
 *   6. Push content assets to GitHub
 *   7. Write run metadata to pipeline_runs table
 *   8. Return structured run summary
 *
 * Progress events are emitted via onProgress callback after each agent completes.
 */

import { runKeywordResearcherAgent } from "../agents/keyword-researcher";
import { runTopicPrioritizerAgent } from "../agents/topic-prioritizer";
import { runBrandCheckerAgent } from "../agents/brand-checker";
import { runContentGeneratorAgent } from "../agents/content-generator";
import { runCriticReviewerAgent } from "../agents/critic-reviewer";
import { runEditorAgent } from "../agents/editor";
import { runChannelAdapterAgent } from "../agents/channel-adapter";
import { initDb, saveRun, savePipelineOutput, getLatestFeedbackLearnings } from "../lib/db";
import { pushToGitHub } from "../lib/github";
import type {
  PipelineContext,
  PipelineResult,
  PipelineOptions,
  ValidatedTopic,
  ContentGenerationResult,
  Draft,
  ProgressEvent,
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
  adapted: {
    topic: string;
    channels: {
      blog: string;
      twitter_thread: string[];
      linkedin: string;
      developer_newsletter: string;
    };
  },
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

function progress(
  onProgress: ((e: ProgressEvent) => void) | undefined,
  event: Omit<ProgressEvent, "timestamp">
): void {
  if (onProgress) {
    onProgress({ ...event, timestamp: new Date().toISOString() });
  }
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function runDailyPipeline(
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const { onProgress } = options;
  const runId = options.runId ?? crypto.randomUUID();
  const runDate = new Date().toISOString().split("T")[0];

  console.log(`\n${"=".repeat(60)}`);
  console.log(`[Pipeline] Starting run ${runId} — ${runDate}`);
  console.log(`${"=".repeat(60)}\n`);

  // ── 0. DB init ──────────────────────────────────────────────────────────────
  await initDb();

  // ── 1. Load prior feedback & build context ─────────────────────────────────
  let feedbackContext = "";
  try {
    const learnings = await getLatestFeedbackLearnings(3);
    if (learnings.length > 0) {
      const lines: string[] = [];
      for (const l of learnings) {
        if (l.improvement_notes) lines.push(l.improvement_notes);
        if (l.approved_patterns?.length)
          lines.push(`What worked: ${l.approved_patterns.join("; ")}`);
        if (l.rejected_patterns?.length)
          lines.push(`What to avoid: ${l.rejected_patterns.join("; ")}`);
      }
      feedbackContext = lines.join("\n");
      console.log(`[Pipeline] Loaded ${learnings.length} prior feedback learnings`);
    }
  } catch {
    console.warn("[Pipeline] Could not load feedback learnings — proceeding without");
  }

  const ctx: PipelineContext = {
    runId,
    date: runDate,
    seedTopics: SEED_TOPICS,
    feedbackContext,
  };

  // ── 2. Research layer ───────────────────────────────────────────────────────
  console.log("[Pipeline] ── RESEARCH LAYER ──────────────────────────────");

  progress(onProgress, {
    agent: "KeywordResearcher",
    status: "started",
    summary: `Researching ${SEED_TOPICS.length} seed topics…`,
  });
  const keywordResult = await runKeywordResearcherAgent(ctx);
  progress(onProgress, {
    agent: "KeywordResearcher",
    status: "completed",
    summary: `${keywordResult.keywords.length} keywords generated`,
    data: { count: keywordResult.keywords.length, topKeywords: keywordResult.keywords.slice(0, 5) },
  });

  progress(onProgress, {
    agent: "TopicPrioritizer",
    status: "started",
    summary: "Selecting top topics…",
  });
  const topicResult = await runTopicPrioritizerAgent(ctx, keywordResult);
  progress(onProgress, {
    agent: "TopicPrioritizer",
    status: "completed",
    summary: `${topicResult.topics.length} topics selected`,
    data: { topics: topicResult.topics.map((t) => ({ title: t.title, type: t.type, risk: t.cannibalizationRisk })) },
  });

  progress(onProgress, {
    agent: "BrandChecker",
    status: "started",
    summary: "Validating brand fit…",
  });
  const brandResult = await runBrandCheckerAgent(ctx, topicResult);
  const passedBrand = brandResult.validated.filter((v) => v.passed);
  const failedBrand = brandResult.validated.filter((v) => !v.passed);
  progress(onProgress, {
    agent: "BrandChecker",
    status: "completed",
    summary: `${passedBrand.length} passed, ${failedBrand.length} blocked`,
    data: { validated: brandResult.validated.map((v) => ({ title: v.title, score: v.brandScore, passed: v.passed })) },
  });

  // ── 3. Merge approved topics ────────────────────────────────────────────────
  const approvedTopics: ValidatedTopic[] = passedBrand;

  if (approvedTopics.length === 0) {
    console.warn("[Pipeline] No topics passed brand check — aborting");
    await saveRun({ runId, runDate, topicsProcessed: 0, draftsPassed: 0, draftsFlags: failedBrand.length });
    return { runId, runDate, topicsProcessed: 0, draftsPassed: 0, draftsFlags: failedBrand.length, assets: [] };
  }

  // ── 4. Generation layer ─────────────────────────────────────────────────────
  console.log("[Pipeline] ── GENERATION LAYER ────────────────────────────");

  const revisionCycles = new Map<string, number>();
  const humanReviewQueue: string[] = [];

  progress(onProgress, {
    agent: "ContentGenerator",
    status: "started",
    summary: `Drafting ${approvedTopics.length} articles…`,
  });
  let activeDrafts: ContentGenerationResult = await runContentGeneratorAgent(ctx, approvedTopics);
  progress(onProgress, {
    agent: "ContentGenerator",
    status: "completed",
    summary: `${activeDrafts.drafts.length} drafts written`,
    data: { drafts: activeDrafts.drafts.map((d) => ({ topic: d.topic, wordCount: d.wordCount })) },
  });

  // CriticReviewer → revise loop
  progress(onProgress, {
    agent: "CriticReviewer",
    status: "started",
    summary: "Reviewing drafts…",
  });
  let reviewResult = await runCriticReviewerAgent(ctx, activeDrafts);
  let failedReviews = reviewResult.reviews.filter((r) => !r.passed);

  while (failedReviews.length > 0) {
    const topicsNeedingRevision: ValidatedTopic[] = [];
    const revisionMap = new Map<string, string>();

    for (const review of failedReviews) {
      const cycle = (revisionCycles.get(review.topic) ?? 0) + 1;
      revisionCycles.set(review.topic, cycle);

      if (cycle >= 2) {
        if (!humanReviewQueue.includes(review.topic)) {
          console.warn(`[Pipeline] "${review.topic}" flagged after ${cycle} cycles`);
          humanReviewQueue.push(review.topic);
        }
      } else {
        const topicInfo = approvedTopics.find((t) => t.title === review.topic);
        if (topicInfo && review.revisionInstructions) {
          topicsNeedingRevision.push(topicInfo);
          revisionMap.set(review.topic, review.revisionInstructions);
        }
      }
    }

    activeDrafts = { drafts: activeDrafts.drafts.filter((d) => !humanReviewQueue.includes(d.topic)) };
    if (topicsNeedingRevision.length === 0) break;

    const revisedBatch = await runContentGeneratorAgent(ctx, topicsNeedingRevision, revisionMap);
    const revisedMap = new Map<string, Draft>(revisedBatch.drafts.map((d) => [d.topic, d]));
    activeDrafts = { drafts: activeDrafts.drafts.map((d) => revisedMap.get(d.topic) ?? d) };

    const revisedTitles = new Set(topicsNeedingRevision.map((t) => t.title));
    const reReviewResult = await runCriticReviewerAgent(ctx, { drafts: activeDrafts.drafts.filter((d) => revisedTitles.has(d.topic)) });
    for (const r of reReviewResult.reviews) {
      const idx = reviewResult.reviews.findIndex((x) => x.topic === r.topic);
      if (idx >= 0) reviewResult.reviews[idx] = r;
    }

    failedReviews = reviewResult.reviews.filter(
      (r) => !r.passed && !humanReviewQueue.includes(r.topic) && (revisionCycles.get(r.topic) ?? 0) < 2
    );
  }

  for (const r of reviewResult.reviews) {
    if (!r.passed && !humanReviewQueue.includes(r.topic)) {
      humanReviewQueue.push(r.topic);
      activeDrafts = { drafts: activeDrafts.drafts.filter((d) => d.topic !== r.topic) };
    }
  }

  const passedDrafts: ContentGenerationResult = {
    drafts: activeDrafts.drafts.filter((d) => reviewResult.reviews.find((r) => r.topic === d.topic)?.passed !== false),
  };

  progress(onProgress, {
    agent: "CriticReviewer",
    status: "completed",
    summary: `${passedDrafts.drafts.length} passed, ${humanReviewQueue.length} flagged`,
    data: {
      reviews: reviewResult.reviews.map((r) => ({
        topic: r.topic,
        passed: r.passed,
        scores: r.scores,
        cycles: revisionCycles.get(r.topic) ?? 0,
      })),
    },
  });

  if (passedDrafts.drafts.length === 0) {
    await saveRun({ runId, runDate, topicsProcessed: approvedTopics.length, draftsPassed: 0, draftsFlags: humanReviewQueue.length });
    return { runId, runDate, topicsProcessed: approvedTopics.length, draftsPassed: 0, draftsFlags: humanReviewQueue.length, assets: [] };
  }

  progress(onProgress, { agent: "Editor", status: "started", summary: "Final copy-edit…" });
  const editResult = await runEditorAgent(ctx, passedDrafts);
  progress(onProgress, {
    agent: "Editor",
    status: "completed",
    summary: `${editResult.edited.length} articles polished`,
    data: { topics: editResult.edited.map((e) => e.topic) },
  });

  progress(onProgress, { agent: "ChannelAdapter", status: "started", summary: "Adapting to 4 channels…" });
  const adaptResult = await runChannelAdapterAgent(ctx, editResult);
  progress(onProgress, {
    agent: "ChannelAdapter",
    status: "completed",
    summary: `${adaptResult.adapted.length} articles × 4 channels`,
    data: { topics: adaptResult.adapted.map((a) => a.topic) },
  });

  // ── 5. Save full outputs to DB ──────────────────────────────────────────────
  for (const content of adaptResult.adapted) {
    const brandInfo = brandResult.validated.find((v) => v.title === content.topic);
    const reviewInfo = reviewResult.reviews.find((r) => r.topic === content.topic);
    const topicInfo = approvedTopics.find((t) => t.title === content.topic);

    try {
      await savePipelineOutput({
        runId,
        topic: content.topic,
        contentType: topicInfo?.type ?? "blog_post",
        brandScore: brandInfo?.brandScore ?? 0,
        reviewScores: reviewInfo?.scores ?? null,
        blogContent: content.channels.blog,
        twitterThread: content.channels.twitter_thread,
        linkedinPost: content.channels.linkedin,
        newsletterBlurb: content.channels.developer_newsletter,
      });
    } catch (err) {
      console.error(`[Pipeline] Failed to save output for "${content.topic}":`, err);
    }
  }

  // ── 6. Push to GitHub ───────────────────────────────────────────────────────
  console.log("[Pipeline] ── GITHUB OUTPUT ───────────────────────────────");

  for (const content of adaptResult.adapted) {
    const slug = slugify(content.topic);
    const filePath = `content/${runDate}/${slug}.md`;
    const brandScore = brandResult.validated.find((v) => v.title === content.topic)?.brandScore ?? 0;
    const topicType = approvedTopics.find((t) => t.title === content.topic)?.type ?? "blog_post";

    try {
      await pushToGitHub(filePath, formatContentFile(content, { date: runDate, type: topicType, brandScore }), `content: add ${slug} [run:${runId.slice(0, 8)}]`);
      console.log(`[Pipeline] ✓ Pushed ${filePath}`);
    } catch (err) {
      console.error(`[Pipeline] ✗ Failed to push ${filePath}:`, err);
    }
  }

  // ── 7. Persist run metadata ─────────────────────────────────────────────────
  await saveRun({
    runId,
    runDate,
    topicsProcessed: approvedTopics.length,
    draftsPassed: passedDrafts.drafts.length,
    draftsFlags: humanReviewQueue.length,
  });

  const result: PipelineResult = {
    runId,
    runDate,
    topicsProcessed: approvedTopics.length,
    draftsPassed: passedDrafts.drafts.length,
    draftsFlags: humanReviewQueue.length,
    assets: adaptResult.adapted,
  };

  console.log(`\n[Pipeline] Run ${runId} complete — ${result.draftsPassed} passed, ${result.draftsFlags} flagged\n`);
  return result;
}
