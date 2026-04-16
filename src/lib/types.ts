// ─── Shared pipeline context ────────────────────────────────────────────────

export interface PipelineContext {
  runId: string;
  date: string;
  seedTopics: string[];
}

// ─── Parallel research layer ─────────────────────────────────────────────────

export interface Keyword {
  term: string;
  intent: "informational" | "navigational" | "transactional";
  score: number;
  seed: string;
}

export interface KeywordResearchResult {
  keywords: Keyword[];
}

export interface Topic {
  title: string;
  type: "blog_post" | "tutorial" | "thought_leadership" | "product_announcement";
  cannibalizationRisk: "low" | "medium" | "high";
  rationale: string;
}

export interface TopicPrioritizationResult {
  topics: Topic[];
}

export interface ValidatedTopic {
  title: string;
  brandScore: number;
  passed: boolean;
  notes: string;
  type: "blog_post" | "tutorial" | "thought_leadership" | "product_announcement";
}

export interface BrandCheckResult {
  validated: ValidatedTopic[];
}

// ─── Sequential generation layer ─────────────────────────────────────────────

export interface Draft {
  topic: string;
  type: string;
  content: string;
  wordCount: number;
}

export interface ContentGenerationResult {
  drafts: Draft[];
}

export interface ReviewScores {
  accuracy: number;
  argument: number;
  seo: number;
  tone: number;
}

export interface Review {
  topic: string;
  scores: ReviewScores;
  passed: boolean;
  revisionInstructions?: string;
}

export interface CriticReviewResult {
  reviews: Review[];
}

export interface EditedDraft {
  topic: string;
  type: string;
  finalContent: string;
}

export interface EditResult {
  edited: EditedDraft[];
}

export interface ChannelContent {
  blog: string;
  twitter_thread: string[];
  linkedin: string;
  developer_newsletter: string;
}

export interface AdaptedContent {
  topic: string;
  channels: ChannelContent;
}

export interface ChannelAdaptResult {
  adapted: AdaptedContent[];
}

// ─── Pipeline run result ──────────────────────────────────────────────────────

export interface PipelineResult {
  runId: string;
  runDate: string;
  topicsProcessed: number;
  draftsPassed: number;
  draftsFlags: number;
  assets: AdaptedContent[];
}

// ─── Database row ─────────────────────────────────────────────────────────────

export interface PipelineRunRow {
  id: number;
  run_id: string;
  run_date: string;
  topics_processed: number;
  drafts_passed: number;
  drafts_flagged: number;
  created_at: string;
}
