# Assignment 4: Multi-Agent Content Marketing System

**Course:** Agentic AI Systems  
**System:** Daily GitHub Content Marketing Pipeline  
**Stack:** Next.js · Anthropic Claude claude-sonnet-4-5 · Neon Postgres · Vercel Cron · GitHub REST API

---

## 1. Agent Definitions and Responsibilities

### Agent 1 — KeywordResearcherAgent

| Field | Detail |
|---|---|
| **File** | `src/agents/keyword-researcher.ts` |
| **Core responsibility** | Transform a hardcoded list of 10 GitHub-relevant seed topics into 30 ranked keyword variations, each annotated with search intent and a strategic priority score. |
| **Inputs** | `PipelineContext` — contains `seedTopics: string[]` (10 seeds), `runId`, `date` |
| **Outputs** | `KeywordResearchResult` — `{ keywords: Array<{ term, intent, score, seed }> }` |
| **Tools needed** | Anthropic Claude API (single-turn, structured JSON response) |
| **NOT responsible for** | Choosing which keywords become content topics; scoring actual search volume or real-time SERP data; deduplication across runs |
| **Typical failure modes** | Claude returns fewer than 30 keywords (partial generation); JSON extraction fails if Claude wraps output in explanation text; all keywords receive the same score (collapsed discrimination) |

---

### Agent 2 — TopicPrioritizerAgent

| Field | Detail |
|---|---|
| **File** | `src/agents/topic-prioritizer.ts` |
| **Core responsibility** | Select the top 3 content topics from keyword research output, assign a specific article title and content type to each, and assess cannibalization risk against obvious existing GitHub content. |
| **Inputs** | `PipelineContext`, `KeywordResearchResult` (filtered to score ≥ 6) |
| **Outputs** | `TopicPrioritizationResult` — `{ topics: Array<{ title, type, cannibalizationRisk, rationale }> }` |
| **Tools needed** | Anthropic Claude API (single-turn, structured JSON response) |
| **NOT responsible for** | Brand voice validation; content generation; querying live GitHub blog or docs for actual cannibalization; enforcing content type diversity beyond prompt guidance |
| **Typical failure modes** | All three topics assigned the same content type; `cannibalizationRisk` systematically under-assessed as "low" (Claude optimism bias); topic titles that closely restate keyword phrases rather than forming genuine article titles |

---

### Agent 3 — BrandCheckerAgent

| Field | Detail |
|---|---|
| **File** | `src/agents/brand-checker.ts` |
| **Core responsibility** | Score each topic against GitHub's five brand principles (developer-first, technically credible, not salesy, open source values, pragmatic optimism). Block any topic scoring below 6/10 from entering the generation layer. |
| **Inputs** | `PipelineContext`, `TopicPrioritizationResult` |
| **Outputs** | `BrandCheckResult` — `{ validated: Array<{ title, brandScore, passed, notes, type }> }` |
| **Tools needed** | Anthropic Claude API (single-turn, structured JSON response) |
| **NOT responsible for** | Topic selection; content generation; SEO analysis; enforcing the same brand standards inside the generated article (that is EditorAgent's job) |
| **Typical failure modes** | Brand scores systematically high (Claude is lenient with content it just helped create); `type` field dropped from output (patched in orchestrator via merge); conflicting rulings vs. CriticReviewerAgent on tone |

---

### Agent 4 — ContentGeneratorAgent

| Field | Detail |
|---|---|
| **File** | `src/agents/content-generator.ts` |
| **Core responsibility** | Write a full draft article for each approved topic. Target word counts: blog post 800 w, tutorial 1200 w, thought leadership 600 w, product announcement 500 w. Retry once if the draft is under 400 words. |
| **Inputs** | `PipelineContext`, `ValidatedTopic[]` (brand-approved), optional `Map<topicTitle, revisionInstructions>` |
| **Outputs** | `ContentGenerationResult` — `{ drafts: Array<{ topic, type, content, wordCount }> }` |
| **Tools needed** | Anthropic Claude API (single-turn, structured Markdown response) |
| **NOT responsible for** | Critic scoring; channel adaptation; SEO keyword density optimisation beyond what the prompt instructs; deciding which drafts proceed to review |
| **Typical failure modes** | Claude produces a polished stub under 400 words that still passes the retry (word count measured after stripping code blocks); revision instructions are ignored when the original system prompt conflicts; code blocks in tutorials cause word-count mis-measurement |

---

### Agent 5 — CriticReviewerAgent

| Field | Detail |
|---|---|
| **File** | `src/agents/critic-reviewer.ts` |
| **Core responsibility** | Score each draft across four dimensions: technical accuracy, argument strength, SEO alignment, and tone consistency. Fail any draft where any single dimension scores below 6. For failing drafts, produce specific, actionable revision instructions. |
| **Inputs** | `PipelineContext`, `ContentGenerationResult` |
| **Outputs** | `CriticReviewResult` — `{ reviews: Array<{ topic, scores: { accuracy, argument, seo, tone }, passed, revisionInstructions? }> }` |
| **Tools needed** | Anthropic Claude API (single-turn, structured JSON response) |
| **NOT responsible for** | Generating revised content; enforcing a maximum revision cycle count (that is the orchestrator's job); channel-specific format validation |
| **Typical failure modes** | Claude marks a draft `"passed": true` but returns a score of 5 in one dimension (orchestrator re-enforces the rule programmatically); revision instructions are vague ("improve the tone") rather than specific; self-contradiction: the same model that generated the draft also reviews it, introducing a systematic leniency bias |

---

### Agent 6 — EditorAgent

| Field | Detail |
|---|---|
| **File** | `src/agents/editor.ts` |
| **Core responsibility** | Final copy-edit: enforce second-person voice, sentence-case headings, remove filler words, prefer active voice, break up long paragraphs, and ensure the CTA is specific. Returns the complete edited Markdown. |
| **Inputs** | `PipelineContext`, `ContentGenerationResult` (passed drafts only) |
| **Outputs** | `EditResult` — `{ edited: Array<{ topic, type, finalContent }> }` |
| **Tools needed** | Anthropic Claude API (single-turn, full Markdown response) |
| **NOT responsible for** | Scoring or gating content; rewriting for structure or argument; SEO optimisation; channel-specific formatting |
| **Typical failure modes** | Filler word removal is incomplete (Claude misses contextual uses of "just"); heading case is inconsistently enforced (abbreviations capitalised incorrectly); CTA rewritten too aggressively, losing the original's specificity |

---

### Agent 7 — ChannelAdapterAgent

| Field | Detail |
|---|---|
| **File** | `src/agents/channel-adapter.ts` |
| **Core responsibility** | Produce four content variants per article: (1) the blog post as-is, (2) a 5–7 tweet thread (≤ 280 chars/tweet), (3) a LinkedIn post (≤ 1300 chars, max 3 hashtags), (4) a ~150-word newsletter digest. Twitter, LinkedIn, and newsletter are generated in parallel via `Promise.all`. |
| **Inputs** | `PipelineContext`, `EditResult` |
| **Outputs** | `ChannelAdaptResult` — `{ adapted: Array<{ topic, channels: { blog, twitter_thread, linkedin, developer_newsletter } }> }` |
| **Tools needed** | Anthropic Claude API (three parallel single-turn calls per topic) |
| **NOT responsible for** | Scheduling or distributing content to actual channels; image generation; A/B testing variants; modifying the blog content |
| **Typical failure modes** | Twitter thread tweet exceeds 280 chars (truncation applied programmatically); LinkedIn post exceeds 1300 chars; fewer than 5 tweets generated; newsletter blurb drifts to 200+ words; cross-channel inconsistency (tweet thread takes a different angle than the LinkedIn post) |

---

## 2. Collaboration Structure

### Architecture overview

The system uses a **hybrid orchestration model**: a single stateful orchestrator (`daily-pipeline.ts`) coordinates two distinct execution tiers — a research tier and a generation tier.

```
Orchestrator (daily-pipeline.ts)
│
├── RESEARCH TIER (data-dependent sequential execution)
│   KeywordResearcher → TopicPrioritizer → BrandChecker
│   [orchestrator merges outputs → approvedTopics]
│
└── GENERATION TIER (sequential with revision loop)
    ContentGenerator
         ↓
    CriticReviewer ←─── (revision cycle, max 2 per draft)
         │
         ↓ (passed drafts only)
    EditorAgent
         ↓
    ChannelAdapterAgent (Twitter / LinkedIn / newsletter in parallel)
         ↓
    [GitHub push + Postgres write]
```

### Who initiates

The **Vercel Cron scheduler** triggers `POST /api/cron/daily` at 00:00 UTC. The route handler calls `runDailyPipeline()`, which acts as the sole orchestrator. There is no peer-to-peer agent communication — all state flows through the orchestrator.

### Work assignment

The orchestrator creates a `PipelineContext` object (`{ runId, date, seedTopics }`) and passes it, along with the appropriate prior-stage output, into each agent call. Agents are pure functions: they receive their full input, call Claude, and return a typed output. They hold no internal state between invocations.

### Parallel vs. sequential logic

| Tier | Execution mode | Reason |
|---|---|---|
| Research tier (KR → TP → BC) | Sequential | Strict data dependency: each agent's output feeds the next |
| Generation tier (CG → CR → EA → CA) | Sequential | Each stage requires the prior stage's validated output |
| Channel adaptation (Twitter / LinkedIn / newsletter) | Parallel (`Promise.all`) | Three independent Claude calls; no data dependency between channels |
| CriticReviewer revision loop | Sequential per draft | Must complete before deciding whether to re-generate |

### Veto power

**CriticReviewerAgent** holds veto power over every draft. A draft cannot enter the EditorAgent unless it passes all four review dimensions (≥ 6/10 each). After two failed revision cycles, the orchestrator removes the draft from the active set and adds it to a `humanReviewQueue` — it does not proceed further. **BrandCheckerAgent** also has veto power at the topic level: topics scoring < 6 are removed before any generation work begins.

### Final approval

A content asset is considered "approved" when it has passed CriticReview, been edited by EditorAgent, and been channel-adapted without error. The orchestrator pushes it to GitHub and records the run in Postgres. There is no human-in-the-loop approval step in the automated flow.

---

## 3. Agent Handoff Contracts

### Handoff 1: KeywordResearcher → TopicPrioritizer

| | Detail |
|---|---|
| **From** | KeywordResearcherAgent |
| **To** | TopicPrioritizerAgent |
| **Input schema** | `KeywordResearchResult: { keywords: Keyword[] }` |
| **Output schema** | `TopicPrioritizationResult: { topics: Topic[] }` |
| **Validation rules** | `keywords` must be a non-empty array; each entry must have `term`, `intent` (one of three values), `score` (1–10), `seed` (non-empty string); minimum 3 keywords required to proceed |
| **Evidence pointers** | `runId` logged at agent entry; keyword count logged; TypeScript types enforced at compile time |

**TypeScript types:**
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
| **Validation rules** | `topics` must have 1–3 entries; each entry must have `title` (non-empty), `type` (one of four values), `cannibalizationRisk` (one of three values), `rationale` (non-empty string) |
| **Evidence pointers** | `runId`, topic count; orchestrator logs each topic title before BrandChecker runs |

**TypeScript types:**
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
| **Validation rules** | Input array must be non-empty (orchestrator aborts if all topics fail brand check); each `ValidatedTopic` must carry a `type` field (merged in from `TopicPrioritizationResult` if absent) |
| **Evidence pointers** | `runId`, approved topic count, brand scores logged |

---

### Handoff 4: ContentGenerator → CriticReviewer

| | Detail |
|---|---|
| **From** | ContentGeneratorAgent |
| **To** | CriticReviewerAgent |
| **Input schema** | `ContentGenerationResult: { drafts: Draft[] }` |
| **Output schema** | `CriticReviewResult: { reviews: Review[] }` |
| **Validation rules** | Each `Draft` must have `topic` (matching an approved topic title), `type`, `content` (non-empty string), `wordCount` (> 0). One `Review` must be returned per `Draft`. Orchestrator re-enforces pass/fail rule: `passed = min(scores) >= 6` |
| **Evidence pointers** | `runId`, draft topic, revision cycle count (`revisionCycles` map), per-dimension scores logged |

```typescript
type Draft = { topic: string; type: string; content: string; wordCount: number };

type Review = {
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
| **Input schema** | `ValidatedTopic[]` (topics that failed) + `Map<title, revisionInstructions>` |
| **Output schema** | `ContentGenerationResult` (revised drafts for failing topics only) |
| **Validation rules** | `revisionInstructions` must be present and non-empty for any topic entering this path; orchestrator enforces `cycleCount < 2` before allowing a revision attempt |
| **Evidence pointers** | `revisionCycles` map keyed by topic title; cycle count logged before each revision call |

---

### Handoff 6: CriticReviewer → EditorAgent

| | Detail |
|---|---|
| **From** | CriticReviewerAgent (passing reviews, via orchestrator) |
| **To** | EditorAgent |
| **Input schema** | `ContentGenerationResult` (drafts where `passed === true`) |
| **Output schema** | `EditResult: { edited: EditedDraft[] }` |
| **Validation rules** | Input drafts must have `passed === true` in the latest review; human-flagged topics must have been removed from the set before this call |
| **Evidence pointers** | `runId`, list of passing topic titles logged; `passedDrafts.drafts.length` recorded in run metadata |

---

### Handoff 7: EditorAgent → ChannelAdapterAgent

| | Detail |
|---|---|
| **From** | EditorAgent |
| **To** | ChannelAdapterAgent |
| **Input schema** | `EditResult: { edited: EditedDraft[] }` |
| **Output schema** | `ChannelAdaptResult: { adapted: AdaptedContent[] }` |
| **Validation rules** | Each `EditedDraft` must have `topic`, `type`, `finalContent` (non-empty Markdown string); one `AdaptedContent` must be returned per `EditedDraft`; Twitter thread must have 5–7 entries; LinkedIn post ≤ 1300 chars; newsletter blurb non-empty |
| **Evidence pointers** | `runId`, topic title logged per adaptation; tweet count, LinkedIn char count, newsletter word count available in logs |

---

## 4. Coordination Risks

### Risk 1: Brand checker and critic reviewer give conflicting guidance on the same draft

**Why it occurs:** BrandCheckerAgent evaluates topics before generation. CriticReviewerAgent evaluates generated drafts after the fact. Both assess "tone" and "developer-first voice" — but they use different rubrics and different Claude invocation contexts. A topic can pass BrandChecker with a score of 7 and then fail CriticReviewer on the `tone` dimension because the generated article used corporate language the topic-level check could not anticipate.

**How it manifests:** A topic passes the research layer, draft generation begins, and the draft is then blocked by CriticReviewer on the exact same dimension BrandChecker approved. From the orchestrator's log, it looks like the brand check was useless — and the run consumes tokens for generation work that was ultimately blocked.

**How the design mitigates it:** The two agents have explicitly separated scopes (topic framing vs. article execution). CriticReviewer's revision instructions are actionable — they describe specific paragraphs to fix, not just the dimension score. The EditorAgent then applies a final rule-based pass to catch mechanical tone issues that neither agent reliably catches (filler words, passive voice, heading case). The design accepts some degree of double-checking rather than eliminating it.

---

### Risk 2: Parallel agents in the research tier finishing at different speeds, causing stale context

**Why it occurs:** In a fully parallel architecture (KR + TP + BC running concurrently with `Promise.all`), TP and BC would both run while KR is still in flight. If the orchestrator passed them a shared context object that KR is mutating, TP and BC could read incomplete keyword data.

**How it manifests:** TP selects topics based on partial keyword output. BC validates topics that TP chose from an incomplete view. The result is lower-quality topic selection — the best-scoring keywords may not appear in the context TP used.

**How the design mitigates it:** The implementation runs the research tier **sequentially** (KR → TP → BC), resolving the stale-context risk entirely. KR's output is fully resolved before it is passed to TP. This is a deliberate architectural trade-off: latency increases slightly, but correctness is guaranteed. The "parallel" framing in the architecture docs describes the conceptual independence of the three research functions, not their runtime execution model.

---

### Risk 3: Revision loop exhausting the token budget

**Why it occurs:** Each revision cycle involves two Claude API calls (one ContentGeneratorAgent call for the revised draft, one CriticReviewerAgent call for the re-review). A 1200-word tutorial draft can consume ~3000 tokens per generation call. With three topics and two revision cycles each, the pipeline could make up to 18 additional Claude calls beyond the baseline.

**How it manifests:** The pipeline exceeds Vercel's function timeout (300 seconds on Pro), causing a mid-run termination. Alternatively, it completes but consumes significantly more tokens than a typical run, triggering rate limits or unexpectedly high API costs.

**How the design mitigates it:** The orchestrator enforces a hard cap of **2 revision cycles per draft**. After two failures, the draft is moved to `humanReviewQueue` and removed from the active set — no further Claude calls are made for that topic. The pipeline continues with remaining passing drafts rather than blocking on a single troublesome topic. This is a deliberate quality-vs-cost trade-off documented in the architecture.

---

### Risk 4: ChannelAdapterAgent producing a Twitter thread that contradicts the LinkedIn post for the same topic

**Why it occurs:** Twitter, LinkedIn, and newsletter adaptations are generated with three independent Claude calls running in parallel (`Promise.all`). Each call receives the same source article but operates in isolation. Claude may emphasise different sub-topics, take different rhetorical angles, or interpret the "hook" differently across the three calls.

**How it manifests:** The Twitter thread leads with a provocative counter-intuitive claim ("Most CI/CD pipelines are over-engineered"), while the LinkedIn post takes a conservative, consensus-validating angle ("CI/CD automation is now table stakes"). A reader who sees both pieces will notice the inconsistency and lose trust in the content program.

**How the design mitigates it:** All three channel calls receive the **identical** `finalContent` from EditorAgent as their source material. The system prompts instruct Claude to derive insights from the article rather than invent a new angle. The blog post as-is is always the canonical version, and channel variants are explicitly positioned as summaries or derivations of it. A post-generation consistency check (cross-referencing claims between channels) is listed in the escalation path as a future improvement.

---

## 5. Deadlock Scenarios

### Deadlock Scenario A: CriticReviewer and ContentGenerator looping on a draft that can never pass

**Trigger conditions:**
1. A topic passes BrandChecker with a borderline score (e.g. 6/10 — just above the threshold).
2. The content type is `tutorial`, which requires deep technical accuracy — a dimension where Claude claude-sonnet-4-5 has known limitations for highly specialised topics.
3. CriticReviewerAgent consistently scores `accuracy` at 5/10 regardless of revisions because the factual gap is in the LLM's training data, not in the writing quality.
4. ContentGeneratorAgent follows the revision instructions but cannot fix factually incorrect claims about a niche technical topic.

**How it manifests without a mitigation:**
The orchestrator enters an infinite loop: `generate → review (fail) → revise → review (fail) → revise → …`. Each iteration consumes tokens and time. The function eventually times out, losing all other in-flight content assets.

**Detection mechanism:**
The `revisionCycles` map in `daily-pipeline.ts` tracks the cycle count per topic. After each review, the orchestrator checks `revisionCycles.get(review.topic) >= 2`.

**Escape mechanism:**
After 2 failed revision cycles, the orchestrator:
1. Adds the topic to `humanReviewQueue` (flagged for manual inspection).
2. Removes the topic's draft from `activeDrafts` (it will not proceed to Editor or ChannelAdapter).
3. Continues the pipeline with remaining passing drafts.
4. Records `draftsFlags + 1` in the Postgres run metadata.

**Escalation path:**
The `humanReviewQueue` is returned in the pipeline result and logged to the console. In a production extension, this would trigger a Slack notification or create a GitHub issue with the draft content and all review failures attached, so a human editor can decide whether to publish with modifications, spike the topic, or update the seed list to avoid similar topics in future runs.

---

### Deadlock Scenario B: ChannelAdapterAgent stuck between a draft too short for Twitter and too long for LinkedIn

**Trigger conditions:**
1. EditorAgent produces a `finalContent` of exactly 420 words — above the 400-word retry floor but at the very low end for a blog post.
2. At 420 words, the article does not contain enough distinct insights to fill 5 tweets (minimum for the Twitter thread contract), each needing to stand alone at ≤ 280 characters.
3. The same 420-word article has a dense, compressed argument that resists trimming — converting it to a LinkedIn post produces a 1600-character result that exceeds the 1300-character hard limit, but cutting further loses the core argument.
4. Both the Twitter thread generation and the LinkedIn post generation fail validation on the first attempt. Neither can proceed.

**How it manifests without a mitigation:**
Both sub-calls inside `Promise.all` return unusable output. The orchestrator either crashes on the `throw` inside `buildTwitterThread`, or silently stores a truncated, incoherent LinkedIn post. The topic is committed to GitHub with malformed channel content.

**Detection mechanism:**
`buildTwitterThread` throws if the parsed tweet array has fewer than 5 entries:
```typescript
if (!Array.isArray(tweets) || tweets.length < 5) {
  throw new Error(`ChannelAdapterAgent: Twitter thread returned ${tweets?.length ?? 0} tweets`);
}
```
LinkedIn truncation is detected by `post.length > 1300`.

**Escape mechanism:**
If `buildTwitterThread` throws, the `Promise.all` rejects. The orchestrator catches this in the top-level `try/catch` in the API route and marks the run as a partial failure. The blog content (which IS the `finalContent` and requires no transformation) is still pushed to GitHub for the affected topic, since the GitHub push loop is separate from the channel adaptation step. The topic is added to `humanReviewQueue` with a `channel_adaptation_failure` flag.

**Escalation path:**
The partial-failure run is recorded in Postgres with `drafts_flagged` incremented. A production extension would: (1) push only the blog variant to GitHub with a `[CHANNELS PENDING]` marker, (2) create a GitHub issue on the content repo requesting manual Twitter/LinkedIn copy, (3) notify the content team via webhook. The root cause — drafts that are too short — is addressed by raising the minimum word threshold in ContentGeneratorAgent's retry logic.

---

## 6. Conflict Resolution Strategy

### Critic and brand checker disagreeing on a topic's suitability

**Scenario:** BrandCheckerAgent approves a topic (score 7/10), ContentGeneratorAgent writes the draft, and then CriticReviewerAgent repeatedly fails it on the `tone` dimension (score 4/10) citing "salesy language and marketing speak."

**Resolution strategy:**
The system applies a **generation-gate authority model**: the agent closest to the final artifact has higher authority.

- BrandChecker evaluates the **topic framing** (the title and angle). Its approval is a necessary but not sufficient condition.
- CriticReviewer evaluates the **executed content**. Its failure verdict overrides BrandChecker's approval because a well-framed topic can still produce poor execution.
- If the conflict persists across two revision cycles, the draft is flagged for human review. The human reviewer sees the BrandChecker approval score, all CriticReviewer scores, and all revision instructions — giving them full audit context to decide whether the topic should be re-attempted with a different content type or spiked.

The orchestrator records both the `brandScore` and the final `CriticReview` scores in the run metadata pushed to GitHub, making the disagreement traceable.

---

### Two parallel research agents producing incompatible topic recommendations

**Scenario:** If TopicPrioritizer and BrandChecker were running in true parallel (as originally described in the architecture spec), TP might select Topic A as high-priority while BC evaluates a different set of topics and gives Topic A a brand score of 4. The orchestrator would then have no valid approved topics.

**Resolution strategy:**
The current implementation resolves this structurally: TP runs first and defines the topic set; BC then evaluates exactly that set. There is no possibility of incompatible parallel recommendations because the agents are sequentially chained.

In a hypothetical parallel architecture where both agents receive the same seed keyword list independently:
1. The orchestrator would collect both outputs and apply an **intersection rule**: only topics that both TP ranks in its top 3 AND BC scores ≥ 6 proceed.
2. If the intersection is empty, the orchestrator falls back to the single highest-ranked topic from TP that achieves the highest brand score, even if below 6 — with a warning logged.
3. If no topic from TP achieves even a brand score of 4, the run aborts with an `ABORT_NO_VALID_TOPICS` code recorded in Postgres.

---

### Final decision recording for audit

Every pipeline run is immutably recorded in Postgres with:
- `run_id` — UUID unique to the run
- `run_date` — calendar date of the run
- `topics_processed` — count of brand-approved topics that entered generation
- `drafts_passed` — count of drafts that cleared critic review
- `drafts_flagged` — count of topics escalated to human review

Every content asset pushed to GitHub includes a YAML-style header with `Generated`, `Type`, and `Brand score` metadata. The commit message includes the `run_id` prefix (first 8 characters), creating a traceable link between the Postgres record, the GitHub commit, and the specific pipeline invocation.

Revision cycle data (`revisionCycles` map, `humanReviewQueue` array) is available in the pipeline's return value and is logged to the console/Vercel function logs, where it is retained for the platform's default log retention period (typically 7 days on Vercel). For long-term audit, a production extension would write revision history as a JSONB column in the `pipeline_runs` table.
