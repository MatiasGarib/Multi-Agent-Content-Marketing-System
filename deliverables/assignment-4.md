# Assignment 4: Multi-Agent Content Marketing System

**Course:** Agentic AI Systems  
**System:** Daily GitHub Content Marketing Pipeline  
**Stack:** Next.js · Anthropic Claude claude-sonnet-4-5 · Neon Postgres · Vercel Cron · GitHub REST API  
**Repo:** `MatiasGarib/Multi-Agent-Content-Marketing-System`  
**Submission file:** `deliverables/assignment-4.md`

---

## 1. Agent Definitions and Responsibilities

### Agent 1 — KeywordResearcherAgent

| Field | Detail |
|---|---|
| **File** | `src/agents/keyword-researcher.ts` |
| **Core responsibility** | Transform a hardcoded list of 10 GitHub-relevant seed topics into 30 ranked keyword variations, each annotated with search intent classification and a strategic priority score 1–10. |
| **Inputs** | `PipelineContext` — `{ runId: string, date: string, seedTopics: string[10], feedbackContext: string }` |
| **Outputs** | `KeywordResearchResult` — `{ keywords: Array<{ term, intent, score, seed }> }` |
| **Model** | `claude-sonnet-4-5` |
| **Call pattern** | Single-turn structured JSON response |
| **External reads/writes** | None — reads only from `PipelineContext.seedTopics` |
| **NOT responsible for** | Choosing which keywords become content topics; scoring actual live search volume; deduplication across pipeline runs |
| **Typical failure modes** | Claude returns fewer than 30 keywords (partial generation); JSON extraction fails when Claude wraps output in explanation prose; all keywords receive the same score (collapsed discrimination) |

---

### Agent 2 — TopicPrioritizerAgent

| Field | Detail |
|---|---|
| **File** | `src/agents/topic-prioritizer.ts` |
| **Core responsibility** | Select the top 3 content topics from keyword research output, assign a specific article title and content type to each, and assess cannibalization risk against obvious existing GitHub content. Prior human feedback learnings from `PipelineContext.feedbackContext` are injected into the system prompt. |
| **Inputs** | `PipelineContext`, `KeywordResearchResult` (filtered to `score ≥ 6`) |
| **Outputs** | `TopicPrioritizationResult` — `{ topics: Array<{ title, type, cannibalizationRisk, rationale }> }` |
| **Model** | `claude-sonnet-4-5` |
| **Call pattern** | Single-turn structured JSON response; system prompt dynamically extended with `feedbackContext` if prior learnings exist |
| **External reads/writes** | Reads `PipelineContext.feedbackContext` (string compiled from `feedback_learnings` rows by orchestrator before this agent runs) |
| **NOT responsible for** | Brand voice validation; content generation; querying live GitHub docs for actual cannibalization data |
| **Typical failure modes** | All three topics assigned the same content type; `cannibalizationRisk` systematically under-assessed as "low" (Claude optimism bias); topic titles that closely restate keyword phrases rather than forming genuine article titles; prior feedback learnings ignored when they conflict with high-scoring keywords |

---

### Agent 3 — BrandCheckerAgent

| Field | Detail |
|---|---|
| **File** | `src/agents/brand-checker.ts` |
| **Core responsibility** | Score each topic against GitHub's five brand principles (developer-first, technically credible, not salesy, open source values, pragmatic optimism). Block any topic scoring below 6/10 from entering the generation layer. |
| **Inputs** | `PipelineContext`, `TopicPrioritizationResult` |
| **Outputs** | `BrandCheckResult` — `{ validated: Array<{ title, brandScore, passed, notes, type }> }` |
| **Model** | `claude-sonnet-4-5` |
| **Call pattern** | Single-turn structured JSON response |
| **External reads/writes** | None |
| **NOT responsible for** | Topic selection; content generation; SEO analysis; enforcing brand standards inside generated article text (that is EditorAgent's responsibility) |
| **Typical failure modes** | Brand scores systematically high (Claude leniency toward content it did not generate but is contextually adjacent to); `type` field absent from response (patched in orchestrator via merge with `TopicPrioritizationResult`); conflicting rulings vs. CriticReviewerAgent on the same topic's tone |

---

### Agent 4 — ContentGeneratorAgent

| Field | Detail |
|---|---|
| **File** | `src/agents/content-generator.ts` |
| **Core responsibility** | Write a full draft article for each brand-approved topic. Target word counts: blog post 800 w, tutorial 1200 w, thought leadership 600 w, product announcement 500 w. Retry once if the draft is under 400 words using a stricter prompt. |
| **Inputs** | `PipelineContext`, `ValidatedTopic[]` (brand-approved), optional `Map<topicTitle, revisionInstructions>` (supplied by orchestrator on revision cycles) |
| **Outputs** | `ContentGenerationResult` — `{ drafts: Array<{ topic, type, content, wordCount }> }` |
| **Model** | `claude-sonnet-4-5` |
| **Call pattern** | Single-turn Markdown response, one sequential call per topic. If a draft is under 400 words, one automatic retry with a reinforced minimum-length prompt |
| **External reads/writes** | Reads `PipelineContext.feedbackContext` (injected into revision prompts when non-empty) |
| **NOT responsible for** | Critic scoring; channel adaptation; SEO keyword density optimisation beyond prompt guidance; deciding which drafts proceed to review |
| **Typical failure modes** | Claude produces a polished stub under 400 words that still passes the retry floor; revision instructions are partially ignored when they conflict with the agent's system prompt; word count mis-measured because code blocks are stripped before counting |

---

### Agent 5 — CriticReviewerAgent

| Field | Detail |
|---|---|
| **File** | `src/agents/critic-reviewer.ts` |
| **Core responsibility** | Score each draft across four dimensions: technical accuracy, argument strength, SEO alignment, and tone consistency. Fail any draft where any single dimension scores below 6. Return specific, actionable revision instructions for failing drafts. |
| **Inputs** | `PipelineContext`, `ContentGenerationResult` |
| **Outputs** | `CriticReviewResult` — `{ reviews: Array<{ topic, scores: { accuracy, argument, seo, tone }, passed, revisionInstructions? }> }` |
| **Model** | `claude-sonnet-4-5` |
| **Call pattern** | Single-turn structured JSON response, one sequential call per draft |
| **External reads/writes** | None — purely evaluative |
| **NOT responsible for** | Generating revised content; enforcing the maximum revision cycle count (that is the orchestrator's job); channel-specific format validation |
| **Typical failure modes** | Model marks `"passed": true` but returns a sub-6 dimension score (orchestrator re-enforces: `passed = min(scores) >= 6`); revision instructions are vague ("improve the tone") rather than paragraph-specific; same-model leniency bias — see Section 6 for full treatment |

---

### Agent 6 — EditorAgent

| Field | Detail |
|---|---|
| **File** | `src/agents/editor.ts` |
| **Core responsibility** | Final copy-edit pass: enforce second-person voice, sentence-case all headings, remove filler words (very, really, just, leverage, streamline, etc.), prefer active voice, break up paragraphs > 5 sentences, and ensure the CTA is specific. |
| **Inputs** | `PipelineContext`, `ContentGenerationResult` (passed drafts only) |
| **Outputs** | `EditResult` — `{ edited: Array<{ topic, type, finalContent }> }` |
| **Model** | `claude-sonnet-4-5` |
| **Call pattern** | Single-turn full Markdown response, one sequential call per draft |
| **External reads/writes** | None |
| **NOT responsible for** | Scoring or gating content; rewriting for structure or argument quality; SEO optimisation; channel-specific formatting |
| **Typical failure modes** | Filler word removal is incomplete (contextual "just" missed); heading case inconsistently enforced for abbreviations; CTA rewritten too aggressively, losing the original's specificity |

---

### Agent 7 — ChannelAdapterAgent

| Field | Detail |
|---|---|
| **File** | `src/agents/channel-adapter.ts` |
| **Core responsibility** | Produce four content variants per article: (1) blog — `finalContent` as-is, (2) Twitter thread — 5–7 tweets ≤ 280 chars each numbered 1/N, (3) LinkedIn post — ≤ 1300 chars / max 3 hashtags, (4) developer newsletter blurb — ~150 words. Angle-locked: all three derived formats are seeded with the article's opening two sentences as a required hook to prevent cross-channel narrative drift. |
| **Inputs** | `PipelineContext`, `EditResult` |
| **Outputs** | `ChannelAdaptResult` — `{ adapted: Array<{ topic, channels: { blog, twitter_thread, linkedin, developer_newsletter } }> }` |
| **Model** | `claude-sonnet-4-5` |
| **Call pattern** | Three parallel `Promise.all` calls per topic (Twitter + LinkedIn + newsletter). Blog is copied from `finalContent` without a Claude call. |
| **External reads/writes** | Writes full channel variants to `pipeline_outputs` table via orchestrator after this agent returns |
| **NOT responsible for** | Scheduling or distributing content to live channels; image generation; A/B testing variants; modifying blog content |
| **Typical failure modes** | Twitter thread tweets exceed 280 chars (programmatic truncation with ellipsis applied); LinkedIn post exceeds 1300 chars (programmatic truncation); fewer than 5 tweets generated (throws, caught by orchestrator); newsletter blurb drifts to 200+ words |

---

### Agent 8 — FeedbackAgent

| Field | Detail |
|---|---|
| **File** | `src/agents/feedback-agent.ts` |
| **Core responsibility** | Process human editorial decisions (approve/reject + written feedback per topic) from the review UI into structured learnings: approved content patterns, rejected content patterns, and a direct-instruction paragraph for the next pipeline run. |
| **Inputs** | `ContentReviewRow[]` (human decisions from `content_reviews` table) + `PipelineOutputRow[]` (content summaries from `pipeline_outputs` table) |
| **Outputs** | `FeedbackLearning` — `{ approvedPatterns: string[], rejectedPatterns: string[], improvementNotes: string }` — written to `feedback_learnings` Postgres table |
| **Model** | `claude-sonnet-4-5` |
| **Call pattern** | Single-turn structured JSON response, triggered once per human review submission via `POST /api/pipeline/[runId]/review` |
| **External reads/writes** | Reads `pipeline_outputs` (Postgres); writes `feedback_learnings` (Postgres). On next pipeline run, orchestrator reads the three most recent `feedback_learnings` rows (`getLatestFeedbackLearnings(3)`) and compiles them into `PipelineContext.feedbackContext`, injected into TopicPrioritizer and ContentGenerator system prompts. |
| **NOT responsible for** | Generating content; making publish/reject decisions autonomously; modifying already-pushed GitHub files |
| **Typical failure modes** | Approved/rejected pattern arrays are empty when all review feedback fields were left blank by the human reviewer; `improvementNotes` too generic to be actionable ("write better content"); feedback from a single rejection over-weighted if the `feedback_learnings` history is shallow (< 3 prior runs) |

---

## 2. Collaboration Structure

### Architecture overview

The system uses a **hybrid orchestration model**: a single stateful orchestrator (`daily-pipeline.ts`) coordinates three execution layers — a research tier, a generation tier, and an asynchronous human-review loop that feeds back into future runs.

```
┌─────────────────────────────────────────────────────────────────┐
│  ORCHESTRATOR  daily-pipeline.ts                                │
│                                                                 │
│  RESEARCH TIER (data-dependent sequential)                      │
│  KeywordResearcher → TopicPrioritizer → BrandChecker            │
│       ↓ [approvedTopics: ValidatedTopic[]]                      │
│                                                                 │
│  GENERATION TIER (sequential with revision loop)                │
│  ContentGenerator → CriticReviewer ←──(max 2 cycles)           │
│       ↓ [passedDrafts]                                          │
│  EditorAgent                                                    │
│       ↓ [finalContent]                                          │
│  ChannelAdapterAgent (Twitter ‖ LinkedIn ‖ Newsletter)          │
│       ↓                                                         │
│  [GitHub push + Postgres pipeline_outputs + pipeline_runs]      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ SSE progress stream
                           ▼
              Dashboard UI (app/page.tsx)
                           │
                    [Human reviewer]
                           │ POST /api/pipeline/[runId]/review
                           ▼
                    FeedbackAgent
                           │ writes feedback_learnings
                           ▼
              [Next run: feedbackContext injected into
               TopicPrioritizer + ContentGenerator]
```

### Who initiates

Two trigger paths exist:

1. **Scheduled:** Vercel Cron triggers `POST /api/cron/daily` at 00:00 UTC — used in production.
2. **Manual:** The dashboard UI (`app/page.tsx`) opens `GET /api/pipeline/stream`, which starts the pipeline inline and streams progress events via SSE — used for demo and QA.

In both cases, `runDailyPipeline()` is the sole orchestrator. There is no peer-to-peer agent communication — all state flows through the orchestrator.

### Work assignment

The orchestrator creates a `PipelineContext` object (`{ runId, date, seedTopics, feedbackContext }`) and passes it, along with the appropriate prior-stage output, into each agent call. Agents are pure functions: they receive their full typed input, call Claude, and return a typed output. They hold no internal state between invocations.

`feedbackContext` is assembled by the orchestrator at startup from the three most recent `feedback_learnings` rows and is available to every agent, though only TopicPrioritizer and ContentGenerator currently inject it into their system prompts.

### Parallel vs. sequential logic

| Tier | Execution mode | Reason |
|---|---|---|
| Research tier (KR → TP → BC) | Sequential | Strict data dependency: each agent's output is the next agent's input |
| Generation tier (CG → CR → EA → CA) | Sequential | Each stage requires the prior stage's validated output |
| Channel adaptation (Twitter / LinkedIn / newsletter) | Parallel (`Promise.all`) | Three independent Claude calls with no inter-channel dependency |
| CriticReviewer revision loop | Sequential per draft | Must complete before deciding whether to re-generate |
| FeedbackAgent | Asynchronous, post-run | Triggered by human submission, outside the automated pipeline |

### Veto power

**BrandCheckerAgent** holds veto power at the topic level: topics scoring < 6/10 are removed before any generation work begins. Their `brandScore` and `notes` are recorded in `pipeline_outputs` for audit even if `blog_content` is null.

**CriticReviewerAgent** holds veto power at the draft level: a draft cannot enter EditorAgent unless all four dimensions score ≥ 6. The orchestrator re-enforces this programmatically (`passed = min(scores) >= 6`) regardless of the model's own `passed` field. After two failed revision cycles, the draft is moved to `humanReviewQueue` — it does not proceed further.

Veto holders cannot be overridden by other agents; they can only be overridden by human reviewers via the review queue. Every veto is recorded in `pipeline_outputs` (null `blog_content` + `drafts_flagged` increment), creating an auditable record of every blocked topic.

### Progress telemetry (SSE channel)

As each agent completes, the orchestrator fires an `onProgress(ProgressEvent)` callback. When triggered via the dashboard, this callback writes to an SSE-compatible `ReadableStream` that the browser consumes as a live `EventSource`. Each `ProgressEvent` carries:

```typescript
interface ProgressEvent {
  agent: string;               // e.g. "CriticReviewer"
  status: "started" | "completed" | "failed";
  summary: string;             // e.g. "2 passed, 1 flagged"
  data?: unknown;              // structured snapshot (scores, word counts, etc.)
  timestamp: string;
}
```

The dashboard renders a live flow diagram where each agent card transitions: idle → running (blue glow) → completed (green) or failed (red), with output data panels expanding below each completed card.

### Final approval and cross-run learning

The automated pipeline pushes all passed content to GitHub immediately and records the run in Postgres. This is the default path for the Vercel Cron trigger.

After a run, a human reviewer navigates to `/review/[runId]`, reads each topic's four channel variants, and marks each as approved or rejected with optional written feedback. On submission, `FeedbackAgent` processes those decisions into structured learnings that are written to `feedback_learnings`. On the **next** pipeline run, the orchestrator loads the three most recent learnings and injects them into `PipelineContext.feedbackContext`, which is included in the TopicPrioritizer and ContentGenerator system prompts — directly shaping topic selection and writing style for future content.

This creates a flywheel: more human reviews → richer learnings → higher-quality topic selection → fewer critic failures → more content passes per run.

---

## 3. Agent Handoff Contracts

### Handoff 1: KeywordResearcher → TopicPrioritizer

| | Detail |
|---|---|
| **From** | KeywordResearcherAgent |
| **To** | TopicPrioritizerAgent |
| **Input schema** | `KeywordResearchResult: { keywords: Keyword[] }` |
| **Output schema** | `TopicPrioritizationResult: { topics: Topic[] }` |
| **Validation rules** | `keywords` must be a non-empty array; each entry must have `term`, `intent` (one of three enum values), `score` (1–10 integer), `seed` (non-empty string); minimum 3 keywords required to proceed; TopicPrioritizer filters to `score ≥ 6` before calling Claude |
| **Evidence pointers** | `runId` logged at agent entry; keyword count logged; no DB row written at this stage — traceable via Vercel function logs keyed to `runId` |

```typescript
type Keyword = {
  term: string;
  intent: "informational" | "navigational" | "transactional";
  score: number;   // 1–10
  seed: string;
};
type KeywordResearchResult = { keywords: Keyword[] };
```

---

### Handoff 2: TopicPrioritizer → BrandChecker

| | Detail |
|---|---|
| **From** | TopicPrioritizerAgent |
| **To** | BrandCheckerAgent |
| **Input schema** | `TopicPrioritizationResult: { topics: Topic[] }` |
| **Output schema** | `BrandCheckResult: { validated: ValidatedTopic[] }` |
| **Validation rules** | `topics` must have 1–3 entries; each must have `title` (non-empty), `type` (one of four enum values), `cannibalizationRisk` (one of three values), `rationale` (non-empty string) |
| **Evidence pointers** | `runId`, topic titles and count logged before BrandChecker call; no DB row written — traceable via function logs |

```typescript
type Topic = {
  title: string;
  type: "blog_post" | "tutorial" | "thought_leadership" | "product_announcement";
  cannibalizationRisk: "low" | "medium" | "high";
  rationale: string;
};
type ValidatedTopic = Topic & {
  brandScore: number;   // 1–10
  passed: boolean;      // true if brandScore >= 6
  notes: string;
};
```

---

### Handoff 3: BrandChecker → ContentGenerator

| | Detail |
|---|---|
| **From** | BrandCheckerAgent (via orchestrator merge) |
| **To** | ContentGeneratorAgent |
| **Input schema** | `ValidatedTopic[]` (filtered to `passed === true`) |
| **Output schema** | `ContentGenerationResult: { drafts: Draft[] }` |
| **Validation rules** | Input array must be non-empty (orchestrator aborts and writes a zero-output run record if all topics fail brand check); each `ValidatedTopic` must carry a `type` field (merged in from `TopicPrioritizationResult` if absent from BrandChecker response) |
| **Evidence pointers** | `runId`, approved topic count, brand scores logged; `pipeline_outputs` rows later written keyed by `run_id + topic` — `brand_score` column is the durable evidence of the BrandChecker decision |

---

### Handoff 4: ContentGenerator → CriticReviewer

| | Detail |
|---|---|
| **From** | ContentGeneratorAgent |
| **To** | CriticReviewerAgent |
| **Input schema** | `ContentGenerationResult: { drafts: Draft[] }` |
| **Output schema** | `CriticReviewResult: { reviews: Review[] }` |
| **Validation rules** | Each `Draft` must have `topic` (matching an approved topic title), `type`, `content` (non-empty string), `wordCount` (> 0). One `Review` per `Draft`. Orchestrator re-enforces: `passed = min(accuracy, argument, seo, tone) >= 6` |
| **Evidence pointers** | `runId`, per-draft word counts logged; review scores persisted in `pipeline_outputs.review_scores` (JSONB) keyed by `run_id + topic` |

```typescript
type Draft   = { topic: string; type: string; content: string; wordCount: number };
type Review  = {
  topic: string;
  scores: { accuracy: number; argument: number; seo: number; tone: number };
  passed: boolean;
  revisionInstructions?: string;
};
```

---

### Handoff 5: CriticReviewer → ContentGenerator (revision cycle)

| | Detail |
|---|---|
| **From** | CriticReviewerAgent (failing reviews) |
| **To** | ContentGeneratorAgent (revision call) |
| **Input schema** | `ValidatedTopic[]` (failing topics only) + `Map<title, revisionInstructions>` |
| **Output schema** | `ContentGenerationResult` (revised drafts for failing topics only) |
| **Validation rules** | `revisionInstructions` must be present and non-empty for any topic entering this path; orchestrator enforces `cycleCount < 2` before allowing a revision; topics at `cycleCount >= 2` bypass this handoff entirely and go to `humanReviewQueue` |
| **Evidence pointers** | `revisionCycles` map keyed by topic title; cycle count logged before each revision call; revision cycle count available in SSE progress event `data.reviews[].cycles` |

---

### Handoff 6: CriticReviewer → EditorAgent

| | Detail |
|---|---|
| **From** | CriticReviewerAgent (passing reviews, via orchestrator filter) |
| **To** | EditorAgent |
| **Input schema** | `ContentGenerationResult` (drafts where `passed === true` in latest review) |
| **Output schema** | `EditResult: { edited: EditedDraft[] }` |
| **Validation rules** | Input drafts must have `passed === true` in the latest review; human-flagged topics removed from set before this call; orchestrator verifies `passedDrafts.drafts.length > 0` before invoking Editor |
| **Evidence pointers** | `runId`, passing topic list logged; `pipeline_runs.drafts_passed` records the count durably |

---

### Handoff 7: EditorAgent → ChannelAdapterAgent

| | Detail |
|---|---|
| **From** | EditorAgent |
| **To** | ChannelAdapterAgent |
| **Input schema** | `EditResult: { edited: EditedDraft[] }` |
| **Output schema** | `ChannelAdaptResult: { adapted: AdaptedContent[] }` |
| **Validation rules** | Each `EditedDraft` must have `topic`, `type`, `finalContent` (non-empty Markdown); one `AdaptedContent` per `EditedDraft`; Twitter thread must have 5–7 entries; LinkedIn ≤ 1300 chars; newsletter blurb non-empty |
| **Evidence pointers** | Full channel content persisted to `pipeline_outputs` columns `blog_content`, `twitter_thread` (JSONB), `linkedin_post`, `newsletter_blurb` keyed by `run_id + topic` — every channel variant independently replayable from DB |

---

### Handoff 8: Human Reviewer → FeedbackAgent

| | Detail |
|---|---|
| **From** | Human reviewer (via `POST /api/pipeline/[runId]/review`) |
| **To** | FeedbackAgent |
| **Input schema** | `{ reviews: Array<{ topic, approved: boolean, feedback: string \| null }> }` + `PipelineOutputRow[]` (fetched from `pipeline_outputs` by the route handler) |
| **Output schema** | `FeedbackLearning: { approvedPatterns: string[], rejectedPatterns: string[], improvementNotes: string }` |
| **Validation rules** | `reviews` array must be non-empty; each entry must have `approved` (boolean, not null); `feedback` is optional but improves learning quality; FeedbackAgent called after all `content_reviews` rows are written, ensuring DB consistency |
| **Evidence pointers** | `content_reviews` rows keyed by `run_id + topic` are the authoritative record of human decisions; `feedback_learnings.run_id` links the learning back to the source run |

---

### Handoff 9: FeedbackAgent → PipelineContext (cross-run)

| | Detail |
|---|---|
| **From** | FeedbackAgent (writes `feedback_learnings` to Postgres) |
| **To** | Orchestrator → `PipelineContext.feedbackContext` (on the **next** run) |
| **Input schema** | `FeedbackLearningRow[]` — up to 3 most recent rows from `feedback_learnings` |
| **Output schema** | `feedbackContext: string` — compiled paragraph injected into TopicPrioritizer and ContentGenerator system prompts |
| **Validation rules** | Orchestrator loads at most 3 rows (`getLatestFeedbackLearnings(3)`) to prevent context bloat; if no rows exist (first run), `feedbackContext` is an empty string and agents run on base prompts |
| **Evidence pointers** | `feedback_learnings.run_id` links each learning to its source run; `feedback_learnings.created_at` ordering ensures the three most recent learnings are used |

---

## 4. Coordination Risks

### Risk 1: Brand checker and critic reviewer give conflicting guidance on the same draft

**Why it occurs:** BrandCheckerAgent evaluates topics before generation using a title-level rubric. CriticReviewerAgent evaluates generated drafts after the fact using a content-level rubric. Both assess "tone" and "developer-first voice" but with different prompts and different Claude invocation contexts. A topic can pass BrandChecker with a score of 7 and then fail CriticReviewer on the `tone` dimension because the generated article used corporate language the topic-level check could not anticipate.

**How it manifests:** A topic passes the research layer, draft generation begins, and the draft is then blocked by CriticReviewer on the exact same dimension BrandChecker approved. From the orchestrator's log, it looks like the brand check was wasteful — and the run consumes tokens for generation work that was ultimately blocked.

**How the design mitigates it:** The two agents have explicitly separated scopes (topic framing vs. article execution). CriticReviewer's revision instructions are actionable — they describe specific paragraphs to fix, not just the dimension score. EditorAgent then applies a final rule-based pass to catch mechanical tone issues that neither scoring agent reliably catches (filler words, passive voice, heading case). BrandChecker approval is recorded in `pipeline_outputs.brand_score`; CriticReviewer scores are recorded in `pipeline_outputs.review_scores` — both are visible to the human reviewer, who can see the disagreement and decide whether the topic angle should be changed for future runs.

---

### Risk 2: Parallel agents in the research tier finishing at different speeds, causing stale context

**Why it occurs:** In a fully parallel architecture (KR + TP + BC running concurrently with `Promise.all`), TP and BC would both run while KR is still in flight. If the orchestrator passed them a shared context object that KR is mutating, TP and BC could read incomplete keyword data.

**How it manifests:** TP selects topics based on partial keyword output. BC validates topics that TP chose from an incomplete view. The result is lower-quality topic selection — the best-scoring keywords may not appear in the context TP used.

**How the design mitigates it:** The implementation runs the research tier **sequentially** (KR → TP → BC), resolving the stale-context risk entirely. Each agent's output is fully resolved and type-checked before it is passed to the next. This is a deliberate architectural trade-off: latency increases slightly (~30–60 s extra), but correctness is guaranteed. The "parallel research tier" framing in the architecture docs describes the conceptual independence of the three research functions, not their runtime execution model.

---

### Risk 3: Revision loop exhausting the token budget and Vercel function timeout

**Why it occurs:** Each revision cycle involves two Claude API calls (one ContentGeneratorAgent call for the revised draft, one CriticReviewerAgent call for the re-review). A 1200-word tutorial draft can consume ~3000 input+output tokens per generation call. With three topics and two revision cycles each, the pipeline could make up to 18 additional Claude calls beyond the baseline, pushing total run time toward or past Vercel Pro's 300-second function timeout.

**How it manifests:** The pipeline times out mid-run, losing all in-flight content assets. Or it completes but consumes significantly more tokens than a typical run, triggering API rate limits or unexpectedly high cost.

**How the design mitigates it:** The orchestrator enforces a hard cap of **2 revision cycles per draft**. After two failures, the draft is moved to `humanReviewQueue` and removed from `activeDrafts` — no further Claude calls are made for that topic. The pipeline continues with remaining passing drafts. `drafts_flagged` is incremented in `pipeline_runs`, making the token-overflow event traceable. The `maxDuration = 300` setting on the API route ensures Vercel does not silently cut the connection.

---

### Risk 4: ChannelAdapterAgent producing a Twitter thread that contradicts the LinkedIn post for the same topic

**Why it occurs:** Twitter, LinkedIn, and newsletter adaptations are generated with three independent Claude calls running in parallel (`Promise.all`). Each call receives the same source article but operates in isolation. Claude may emphasise different sub-topics, take different rhetorical angles, or choose different "hooks" across the three calls.

**How it manifests:** The Twitter thread leads with a provocative counter-intuitive claim ("Most CI/CD pipelines are over-engineered"), while the LinkedIn post takes a conservative consensus-validating angle ("CI/CD automation is now table stakes"). A reader who sees both pieces from the same content program notices the inconsistency and loses trust.

**How the design mitigates it:** The system uses **angle-locked prompting**: the orchestrator extracts the article's opening two sentences from `finalContent` (the canonical hook established by EditorAgent) and injects them as a required opening constraint into all three channel prompts. Because every channel variant must begin from — or directly respond to — the same hook sentence, the rhetorical angle is anchored before any Claude call diverges. The blog post is always the canonical version; all channel variants are required by their system prompts to derive from it rather than invent new angles. This design eliminates the need for a post-generation cross-channel consistency check.

---

## 5. Deadlock Scenarios

### Deadlock Scenario A: CriticReviewer and ContentGenerator looping on a draft that can never pass

**Trigger conditions:**
1. A topic passes BrandChecker with a borderline score (6/10 — just above the threshold).
2. The content type is `tutorial`, requiring deep technical accuracy — a dimension where `claude-sonnet-4-5` has known limitations for highly specialised topics.
3. CriticReviewerAgent consistently scores `accuracy` at 5/10 regardless of revisions because the factual gap is in the model's training data, not in the writing quality.
4. ContentGeneratorAgent follows the revision instructions but cannot fix factually incorrect claims.

**How it manifests without a mitigation:** The orchestrator enters an infinite loop: `generate → review (fail) → revise → review (fail) → revise → …`. Each iteration consumes tokens and time. The function eventually times out, losing all other in-flight content assets.

**Detection mechanism:** The `revisionCycles` map in `daily-pipeline.ts` tracks the cycle count per topic. After each review, the orchestrator checks `revisionCycles.get(review.topic) >= 2`.

**Escape mechanism:** After 2 failed revision cycles, the orchestrator:
1. Adds the topic to `humanReviewQueue`.
2. Removes the topic's draft from `activeDrafts` (will not reach Editor or ChannelAdapter).
3. Continues the pipeline with remaining passing drafts.
4. Increments `drafts_flagged` in `pipeline_runs`.

**Escalation path:** The `humanReviewQueue` appears in the pipeline result and Vercel function logs. A human reviewer can inspect the draft, the review scores, and all revision instructions via the review UI. They can decide to publish with modifications, spike the topic, or add the seed to a blocklist for future runs via the FeedbackAgent rejection flow.

---

### Deadlock Scenario B: ChannelAdapterAgent stuck between a draft too short for Twitter and too long for LinkedIn

**Trigger conditions:**
1. EditorAgent produces a `finalContent` of exactly 420 words — above the 400-word retry floor but at the very low end for a blog post.
2. At 420 words, the article does not contain enough distinct insights to fill 5 tweets (minimum contract), each needing to stand alone at ≤ 280 characters.
3. The same 420-word article has a dense, compressed argument — converting it to a LinkedIn post produces a 1600-character result that exceeds the 1300-character hard limit, and cutting further loses the core argument.
4. Both Twitter thread generation and LinkedIn post generation fail validation on the first attempt.

**How it manifests without a mitigation:** Both sub-calls inside `Promise.all` return unusable output. The orchestrator crashes on the `throw` inside `buildTwitterThread`, or silently stores a truncated, incoherent LinkedIn post. The topic is committed to GitHub with malformed channel content.

**Detection mechanism:** `buildTwitterThread` throws if the parsed tweet array has fewer than 5 entries:
```typescript
if (!Array.isArray(tweets) || tweets.length < 5) {
  throw new Error(`ChannelAdapterAgent: Twitter thread returned ${tweets?.length ?? 0} tweets`);
}
```
LinkedIn truncation is detected by `post.length > 1300` — programmatic truncation is applied but the partial-failure is logged.

**Escape mechanism:** If `buildTwitterThread` throws, the `Promise.all` rejects. The orchestrator's top-level `try/catch` marks the run as a partial failure. The blog content (which is the `finalContent` directly and requires no Claude call) is still pushed to GitHub for the affected topic, since the GitHub push loop is independent of the channel adaptation step. The topic is added to `humanReviewQueue` with a `channel_adaptation_failure` note.

**Escalation path:** The partial-failure run is recorded in Postgres with `drafts_flagged` incremented. The human reviewer sees the blog-only output in the review UI. A production extension would push the blog variant to GitHub with a `[CHANNELS PENDING]` marker and create a GitHub issue requesting manual Twitter/LinkedIn copy. The root cause — drafts near the 400-word floor — is addressed by raising the retry threshold in ContentGeneratorAgent from 400 to 500 words.

---

### Deadlock Scenario C: Feedback-context contradiction — learnings rule out all viable topics

**Trigger conditions:**
1. Over several runs, human reviewers reject topics across all four content types: they reject a tutorial ("too shallow"), a blog post ("too salesy"), a thought leadership piece ("too generic"), and a product announcement ("not relevant to developers").
2. FeedbackAgent encodes all four rejection reasons into `rejectedPatterns` across three `feedback_learnings` rows.
3. On the next run, TopicPrioritizer receives a `feedbackContext` that effectively prohibits every content type the keyword set supports.
4. TopicPrioritizer selects fewer than 3 topics, or selects topics that BrandChecker then rejects — the pipeline produces zero approved topics.

**How it manifests without a mitigation:** Every run returns `topicsProcessed: 0`. The seed list is static, so the next run re-selects the same keywords and re-encounters the same learnings. Zero content is published indefinitely.

**Detection mechanism:** Two consecutive `pipeline_runs` rows with `topics_processed = 0` trigger the detection condition. This is checkable as: `SELECT COUNT(*) FROM pipeline_runs WHERE topics_processed = 0 ORDER BY created_at DESC LIMIT 2`.

**Escape mechanism:** The orchestrator limits feedback injection to the three most recent `feedback_learnings` rows (`getLatestFeedbackLearnings(3)`). This natural window prevents ancient rejections from compounding indefinitely. If `topics_processed = 0` occurs on two consecutive runs, the escalation path is: (1) the next run is allowed to proceed on base prompts only (no `feedbackContext` injected) — effectively a reset — and (2) a warning is logged indicating the feedback corpus has become too restrictive.

**Escalation path:** The content team is alerted (via Vercel logs / dashboard zero-output indicator) to rotate the seed topic list in `daily-pipeline.ts:SEED_TOPICS` or to submit broader approvals in the next review cycle to rebalance the `rejectedPatterns` corpus.

---

## 6. Conflict Resolution Strategy

### Critic and brand checker disagreeing on a topic's suitability

**Scenario:** BrandCheckerAgent approves a topic (score 7/10), ContentGeneratorAgent writes the draft, and CriticReviewerAgent repeatedly fails it on the `tone` dimension (score 4/10) citing "salesy language and marketing speak."

**Resolution strategy:** The system applies a **generation-gate authority model**: the agent closest to the final artifact has higher authority.

- BrandChecker evaluates **topic framing** (title and angle). Its approval is necessary but not sufficient.
- CriticReviewer evaluates **executed content**. Its failure verdict overrides BrandChecker's approval — a well-framed topic can still produce poor execution.
- If the conflict persists across two revision cycles, the draft is flagged for human review. The reviewer sees both the BrandChecker score and all CriticReviewer dimension scores in the review UI, providing full audit context to decide whether the topic should be re-attempted with a different content type or spiked.

Veto holders (BrandChecker, CriticReviewer) cannot be overridden by other agents; they can only be overridden by human reviewers via the review queue. Every veto decision is recorded durably: `pipeline_outputs.brand_score` for BrandChecker vetoes, `pipeline_outputs.review_scores` for CriticReviewer vetoes, `pipeline_runs.drafts_flagged` for the aggregate count.

---

### Two parallel research agents producing incompatible topic recommendations

**Scenario:** If TopicPrioritizer and BrandChecker were running in true parallel, TP might select Topic A as high-priority while BC simultaneously evaluates a different set of topics and gives Topic A a brand score of 4. The orchestrator would then have no valid approved topics.

**Resolution strategy:** The current implementation resolves this structurally. TP runs first and defines the topic set; BC then evaluates exactly that set. There is no possibility of incompatible parallel recommendations because the agents are sequentially chained with strict data dependency.

In a hypothetical future parallel architecture:
1. The orchestrator would apply an **intersection rule**: only topics that TP ranks in its top 3 AND BC scores ≥ 6 proceed.
2. If the intersection is empty, fall back to the single highest TP-ranked topic with the highest brand score, with a warning logged.
3. If no topic achieves a brand score ≥ 4, the run aborts with `ABORT_NO_VALID_TOPICS` recorded in `pipeline_runs`.

---

### Same-model evaluation bias (critic reviewing its own generator's output)

**Scenario:** `claude-sonnet-4-5` both generates the draft (ContentGeneratorAgent) and reviews it (CriticReviewerAgent). A model reviewing content it could have produced itself may exhibit systematic leniency — scoring drafts higher than a truly independent reviewer would.

**Resolution strategy:** Four layers of mitigation are active in the current design:

1. **Structural isolation:** ContentGenerator and CriticReviewer use entirely separate system prompts with no shared framing text. ContentGenerator's prompt is writer-persona ("you are a technical writer…"); CriticReviewer's prompt is adversarial-editor-persona ("you are a demanding technical editor…"). The adversarial framing suppresses the cooperative bias that emerges when the same model acts as both generator and rater.

2. **Score-based enforcement override:** The orchestrator programmatically recomputes `passed = min(accuracy, argument, seo, tone) >= 6` after every review and ignores the model's own `passed` field (see `daily-pipeline.ts`, CriticReviewer result processing). This means a leniently-written `"passed": true` with a 5 in any dimension is still treated as a failure — the model cannot approve a failing draft by marking the boolean field without earning it on all four dimensions.

3. **Human override via review queue:** After at most 2 revision cycles, any draft that cannot pass automated review is escalated to a human reviewer. The human reviewer sees all dimension scores and revision instructions. Human rejections via the review UI flow into FeedbackAgent as `rejectedPatterns`, which recalibrate the content type and tone expectations for future runs — providing a long-term correction signal for any systematic leniency bias.

4. **Cross-model upgrade path (documented trade-off):** Routing CriticReviewer to a different model (e.g., `claude-haiku-3-5` for cost, or `claude-opus-4` for higher standards) would maximally eliminate the same-model bias. The current implementation uses `claude-sonnet-4-5` for both because (a) the adversarial prompt design and score-override mechanism provide sufficient safeguard for the demo, and (b) the cost of adding a second model tier is non-trivial for a student project. A production deployment should evaluate this trade-off explicitly.

---

### Final decision recording for audit

Every pipeline run is immutably recorded across three Postgres tables:

| Table | Key columns | Purpose |
|---|---|---|
| `pipeline_runs` | `run_id`, `run_date`, `topics_processed`, `drafts_passed`, `drafts_flagged` | Run-level summary |
| `pipeline_outputs` | `run_id`, `topic`, `brand_score`, `review_scores` (JSONB), `blog_content`, `twitter_thread` (JSONB), `linkedin_post`, `newsletter_blurb` | Full per-topic content + all agent scores |
| `content_reviews` | `run_id`, `topic`, `approved`, `feedback` | Human editorial decisions |
| `feedback_learnings` | `run_id`, `approved_patterns`, `rejected_patterns`, `improvement_notes` | Processed learnings for next-run context |

Every GitHub push includes a commit message with the `run_id` prefix (first 8 characters), creating a traceable link between the Postgres record, the GitHub commit, and the specific pipeline invocation. The review UI renders all four tables' data in a single view per topic, making the full decision chain — seed → keyword → topic → brand score → critic scores → human approval → learning — inspectable from one page.
