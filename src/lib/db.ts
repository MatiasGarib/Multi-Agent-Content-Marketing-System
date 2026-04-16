import { Pool } from "pg";
import type {
  PipelineRunRow,
  PipelineOutputRow,
  ContentReviewRow,
  FeedbackLearningRow,
  ReviewScores,
} from "./types";

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    _pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return _pool;
}

export async function initDb(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id               SERIAL PRIMARY KEY,
      run_id           TEXT         NOT NULL,
      run_date         DATE         NOT NULL,
      topics_processed INTEGER,
      drafts_passed    INTEGER,
      drafts_flagged   INTEGER,
      created_at       TIMESTAMPTZ  DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pipeline_outputs (
      id               SERIAL PRIMARY KEY,
      run_id           TEXT    NOT NULL,
      topic            TEXT    NOT NULL,
      content_type     TEXT    NOT NULL,
      brand_score      INTEGER,
      review_scores    JSONB,
      blog_content     TEXT,
      twitter_thread   JSONB,
      linkedin_post    TEXT,
      newsletter_blurb TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS content_reviews (
      id          SERIAL PRIMARY KEY,
      run_id      TEXT    NOT NULL,
      topic       TEXT    NOT NULL,
      approved    BOOLEAN NOT NULL,
      feedback    TEXT,
      reviewed_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS feedback_learnings (
      id                SERIAL PRIMARY KEY,
      run_id            TEXT    NOT NULL,
      approved_patterns TEXT[],
      rejected_patterns TEXT[],
      improvement_notes TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// ─── pipeline_runs ────────────────────────────────────────────────────────────

export async function saveRun(run: {
  runId: string;
  runDate: string;
  topicsProcessed: number;
  draftsPassed: number;
  draftsFlags: number;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO pipeline_runs
       (run_id, run_date, topics_processed, drafts_passed, drafts_flagged)
     VALUES ($1, $2, $3, $4, $5)`,
    [run.runId, run.runDate, run.topicsProcessed, run.draftsPassed, run.draftsFlags]
  );
}

export async function getRecentRuns(limit = 10): Promise<PipelineRunRow[]> {
  const pool = getPool();
  const result = await pool.query<PipelineRunRow>(
    `SELECT * FROM pipeline_runs ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ─── pipeline_outputs ─────────────────────────────────────────────────────────

export async function savePipelineOutput(output: {
  runId: string;
  topic: string;
  contentType: string;
  brandScore: number;
  reviewScores: ReviewScores | null;
  blogContent: string;
  twitterThread: string[];
  linkedinPost: string;
  newsletterBlurb: string;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO pipeline_outputs
       (run_id, topic, content_type, brand_score, review_scores,
        blog_content, twitter_thread, linkedin_post, newsletter_blurb)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      output.runId,
      output.topic,
      output.contentType,
      output.brandScore,
      output.reviewScores ? JSON.stringify(output.reviewScores) : null,
      output.blogContent,
      JSON.stringify(output.twitterThread),
      output.linkedinPost,
      output.newsletterBlurb,
    ]
  );
}

export async function getPipelineOutputs(runId: string): Promise<PipelineOutputRow[]> {
  const pool = getPool();
  const result = await pool.query<PipelineOutputRow>(
    `SELECT * FROM pipeline_outputs WHERE run_id = $1 ORDER BY created_at ASC`,
    [runId]
  );
  return result.rows;
}

// ─── content_reviews ──────────────────────────────────────────────────────────

export async function saveContentReview(review: {
  runId: string;
  topic: string;
  approved: boolean;
  feedback: string | null;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO content_reviews (run_id, topic, approved, feedback)
     VALUES ($1, $2, $3, $4)`,
    [review.runId, review.topic, review.approved, review.feedback]
  );
}

export async function getContentReviews(runId: string): Promise<ContentReviewRow[]> {
  const pool = getPool();
  const result = await pool.query<ContentReviewRow>(
    `SELECT * FROM content_reviews WHERE run_id = $1 ORDER BY reviewed_at ASC`,
    [runId]
  );
  return result.rows;
}

// ─── feedback_learnings ───────────────────────────────────────────────────────

export async function saveFeedbackLearning(learning: {
  runId: string;
  approvedPatterns: string[];
  rejectedPatterns: string[];
  improvementNotes: string;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO feedback_learnings
       (run_id, approved_patterns, rejected_patterns, improvement_notes)
     VALUES ($1, $2, $3, $4)`,
    [
      learning.runId,
      learning.approvedPatterns,
      learning.rejectedPatterns,
      learning.improvementNotes,
    ]
  );
}

export async function getLatestFeedbackLearnings(limit = 3): Promise<FeedbackLearningRow[]> {
  const pool = getPool();
  const result = await pool.query<FeedbackLearningRow>(
    `SELECT * FROM feedback_learnings ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}
