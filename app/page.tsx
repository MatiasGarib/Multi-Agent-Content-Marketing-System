"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProgressEvent {
  agent: string;
  status: "started" | "completed" | "failed";
  summary: string;
  data?: unknown;
  timestamp: string;
}

interface PipelineRunRow {
  id: number;
  run_id: string;
  run_date: string;
  topics_processed: number;
  drafts_passed: number;
  drafts_flagged: number;
  created_at: string;
}

type AgentStatus = "idle" | "running" | "completed" | "failed";

interface AgentState {
  name: string;
  label: string;
  tier: "research" | "generation";
  status: AgentStatus;
  summary: string;
}

const AGENT_ORDER: Omit<AgentState, "status" | "summary">[] = [
  { name: "KeywordResearcher", label: "Keyword Researcher", tier: "research" },
  { name: "TopicPrioritizer", label: "Topic Prioritizer", tier: "research" },
  { name: "BrandChecker", label: "Brand Checker", tier: "research" },
  { name: "ContentGenerator", label: "Content Generator", tier: "generation" },
  { name: "CriticReviewer", label: "Critic Reviewer", tier: "generation" },
  { name: "Editor", label: "Editor", tier: "generation" },
  { name: "ChannelAdapter", label: "Channel Adapter", tier: "generation" },
];

const CRON_SECRET = process.env.NEXT_PUBLIC_CRON_SECRET ?? "";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: AgentStatus }) {
  if (status === "idle") return <span style={styles.iconIdle}>○</span>;
  if (status === "running") return <span style={styles.iconRunning}>⟳</span>;
  if (status === "completed") return <span style={styles.iconDone}>✓</span>;
  return <span style={styles.iconFailed}>✗</span>;
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleString();
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [agents, setAgents] = useState<AgentState[]>(
    AGENT_ORDER.map((a) => ({ ...a, status: "idle", summary: "" }))
  );
  const [running, setRunning] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<PipelineRunRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pipelineDone, setPipelineDone] = useState(false);

  // Load recent runs on mount
  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/runs");
      if (res.ok) {
        const data = await res.json();
        setRecentRuns(data.runs ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  // Handle "Run Pipeline" click
  const handleRun = async () => {
    setError(null);
    setPipelineDone(false);
    setAgents(AGENT_ORDER.map((a) => ({ ...a, status: "idle", summary: "" })));
    setRunning(true);

    // 1. Trigger pipeline
    let runId: string;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const secret = process.env.NEXT_PUBLIC_CRON_SECRET;
      if (secret) headers["x-cron-secret"] = secret;

      const res = await fetch("/api/pipeline/run", { method: "POST", headers });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      runId = data.runId;
      setCurrentRunId(runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRunning(false);
      return;
    }

    // 2. Open SSE stream
    const es = new EventSource(`/api/pipeline/stream?runId=${runId}`);

    es.onmessage = (e) => {
      const event: ProgressEvent = JSON.parse(e.data);
      const { agent, status, summary } = event;

      if (agent === "__connected__") return;

      if (agent === "__done__" || agent === "__error__") {
        es.close();
        setRunning(false);
        setPipelineDone(true);
        loadRuns();
        if (agent === "__error__") setError(summary);
        return;
      }

      setAgents((prev) =>
        prev.map((a) =>
          a.name === agent
            ? { ...a, status: status === "started" ? "running" : status === "completed" ? "completed" : "failed", summary }
            : a
        )
      );
    };

    es.onerror = () => {
      es.close();
      setRunning(false);
      setError("Connection to pipeline lost. Check server logs.");
    };
  };

  const researchAgents = agents.filter((a) => a.tier === "research");
  const generationAgents = agents.filter((a) => a.tier === "generation");

  return (
    <div style={styles.page}>
      {/* ── Header ── */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.h1}>GitHub Content Marketing Pipeline</h1>
          <p style={styles.subtitle}>Multi-agent · Claude claude-sonnet-4-5 · Daily content generation</p>
        </div>
        <button
          style={{ ...styles.runBtn, opacity: running ? 0.6 : 1 }}
          onClick={handleRun}
          disabled={running}
        >
          {running ? "⟳ Running…" : "▶ Run Pipeline"}
        </button>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}

      {/* ── Live progress ── */}
      {(running || pipelineDone) && (
        <section style={styles.section}>
          <h2 style={styles.h2}>Pipeline progress</h2>

          <div style={styles.tierLabel}>Research layer</div>
          <div style={styles.agentGrid}>
            {researchAgents.map((a) => (
              <AgentCard key={a.name} agent={a} />
            ))}
          </div>

          <div style={{ ...styles.tierLabel, marginTop: 12 }}>Generation layer</div>
          <div style={styles.agentGrid}>
            {generationAgents.map((a) => (
              <AgentCard key={a.name} agent={a} />
            ))}
          </div>

          {pipelineDone && currentRunId && (
            <div style={styles.reviewBanner}>
              ✓ Pipeline complete —{" "}
              <a href={`/review/${currentRunId}`} style={styles.reviewLink}>
                Review output →
              </a>
            </div>
          )}
        </section>
      )}

      {/* ── Recent runs ── */}
      <section style={styles.section}>
        <h2 style={styles.h2}>Recent runs</h2>
        {recentRuns.length === 0 ? (
          <p style={styles.muted}>No runs yet. Click "Run Pipeline" to start.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                {["Date", "Topics", "Passed", "Flagged", "Run at", "Review"].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr key={run.id} style={styles.tr}>
                  <td style={styles.td}>{run.run_date}</td>
                  <td style={styles.td}>{run.topics_processed}</td>
                  <td style={{ ...styles.td, color: "#22c55e" }}>{run.drafts_passed}</td>
                  <td style={{ ...styles.td, color: run.drafts_flagged > 0 ? "#f59e0b" : undefined }}>{run.drafts_flagged}</td>
                  <td style={{ ...styles.td, fontSize: 12 }}>{fmt(run.created_at)}</td>
                  <td style={styles.td}>
                    {run.drafts_passed > 0 && (
                      <a href={`/review/${run.run_id}`} style={styles.reviewLink}>
                        Review →
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Architecture reference ── */}
      <section style={styles.section}>
        <h2 style={styles.h2}>Architecture</h2>
        <div style={styles.archGrid}>
          <div>
            <div style={styles.tierLabel}>Research tier</div>
            <ol style={styles.ol}>
              <li>KeywordResearcher — 10 seeds → 30 keywords</li>
              <li>TopicPrioritizer — keywords → top 3 topics</li>
              <li>BrandChecker — topics → brand validation (blocks &lt; 6/10)</li>
            </ol>
          </div>
          <div>
            <div style={styles.tierLabel}>Generation tier</div>
            <ol style={styles.ol}>
              <li>ContentGenerator — approved topics → full drafts</li>
              <li>CriticReviewer — review loop, max 2 cycles per draft</li>
              <li>Editor — final copy-edit</li>
              <li>ChannelAdapter — blog / Twitter / LinkedIn / newsletter</li>
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Agent card ───────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentState }) {
  const borderColor =
    agent.status === "completed" ? "#22c55e"
    : agent.status === "running" ? "#3b82f6"
    : agent.status === "failed" ? "#ef4444"
    : "#374151";

  return (
    <div style={{ ...styles.card, borderColor }}>
      <div style={styles.cardHeader}>
        <StatusIcon status={agent.status} />
        <span style={styles.agentName}>{agent.label}</span>
      </div>
      {agent.summary && <p style={styles.cardSummary}>{agent.summary}</p>}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: { fontFamily: "system-ui, -apple-system, sans-serif", maxWidth: 960, margin: "0 auto", padding: "2rem 1.5rem", background: "#0f172a", minHeight: "100vh", color: "#e2e8f0" } as React.CSSProperties,
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem", flexWrap: "wrap" as const, gap: 16 },
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: "#f1f5f9" },
  h2: { margin: "0 0 1rem", fontSize: 16, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  subtitle: { margin: "4px 0 0", color: "#64748b", fontSize: 14 },
  runBtn: { background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" as const },
  errorBanner: { background: "#450a0a", border: "1px solid #ef4444", color: "#fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: "1.5rem", fontSize: 14 },
  section: { marginBottom: "2.5rem" },
  tierLabel: { fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 },
  agentGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginBottom: 4 },
  card: { background: "#1e293b", border: "1px solid", borderRadius: 8, padding: "12px 14px", transition: "border-color 0.2s" },
  cardHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 },
  agentName: { fontWeight: 600, fontSize: 13, color: "#f1f5f9" },
  cardSummary: { margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.4 },
  iconIdle: { color: "#475569", fontSize: 14 },
  iconRunning: { color: "#3b82f6", fontSize: 14, display: "inline-block", animation: "spin 1s linear infinite" },
  iconDone: { color: "#22c55e", fontSize: 14, fontWeight: 700 },
  iconFailed: { color: "#ef4444", fontSize: 14, fontWeight: 700 },
  reviewBanner: { marginTop: 20, background: "#052e16", border: "1px solid #22c55e", color: "#86efac", borderRadius: 8, padding: "12px 16px", fontSize: 14 },
  reviewLink: { color: "#60a5fa", textDecoration: "none", fontWeight: 600 },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 14 },
  th: { textAlign: "left" as const, padding: "8px 12px", borderBottom: "1px solid #1e293b", color: "#64748b", fontSize: 12, fontWeight: 600, textTransform: "uppercase" as const },
  tr: { borderBottom: "1px solid #1e293b" },
  td: { padding: "10px 12px", color: "#cbd5e1" },
  muted: { color: "#475569", fontSize: 14 },
  archGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 },
  ol: { margin: "8px 0 0 20px", padding: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.8 },
} as const;
