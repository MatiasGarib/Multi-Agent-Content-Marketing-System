import { Pool } from "pg";
import type { PipelineRunRow } from "./types";

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
      id            SERIAL PRIMARY KEY,
      run_id        TEXT         NOT NULL,
      run_date      DATE         NOT NULL,
      topics_processed INTEGER,
      drafts_passed INTEGER,
      drafts_flagged   INTEGER,
      created_at    TIMESTAMPTZ  DEFAULT NOW()
    )
  `);
}

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
