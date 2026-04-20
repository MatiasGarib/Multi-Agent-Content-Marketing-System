"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Domain types ─────────────────────────────────────────────────────────────

interface Keyword { term: string; intent: string; score: number; }
interface TopicItem { title: string; type: string; risk?: string; cannibalizationRisk?: string; }
interface BrandItem { title: string; score: number; passed: boolean; }
interface DraftItem { topic: string; wordCount: number; }
interface ScoreBreakdown { accuracy: number; argument: number; seo: number; tone: number; }
interface ReviewItem { topic: string; passed: boolean; scores: ScoreBreakdown; cycles: number; }

type AgentOutputData =
  | { kind: "keywords"; count: number; topKeywords: Keyword[] }
  | { kind: "topics"; topics: TopicItem[] }
  | { kind: "brand"; validated: BrandItem[] }
  | { kind: "drafts"; drafts: DraftItem[] }
  | { kind: "reviews"; reviews: ReviewItem[] }
  | { kind: "list"; topics: string[] }
  | null;

type AgentStatus = "idle" | "running" | "completed" | "failed";
interface AgentState { status: AgentStatus; summary: string; output: AgentOutputData; }
type AgentMap = Record<string, AgentState>;

interface PipelineRunRow {
  id: number; run_id: string; run_date: string;
  topics_processed: number; drafts_passed: number; drafts_flagged: number; created_at: string;
}

interface ProgressEvent {
  agent: string; status: "started" | "completed" | "failed";
  summary: string; data?: unknown; timestamp: string;
}

// ─── Agent definitions ────────────────────────────────────────────────────────

const RESEARCH = [
  { id: "KeywordResearcher",  label: "Keyword Researcher",  icon: "🔍", desc: "10 seeds → 30 keyword variations" },
  { id: "TopicPrioritizer",   label: "Topic Prioritizer",   icon: "📊", desc: "Select top 3 topics + cannibalization check" },
  { id: "BrandChecker",       label: "Brand Checker",       icon: "🛡️", desc: "Score brand fit, block < 6/10" },
];

const GENERATION = [
  { id: "ContentGenerator",   label: "Content Generator",   icon: "✍️",  desc: "Write full drafts (800–1200 words)" },
  { id: "CriticReviewer",     label: "Critic Reviewer",     icon: "🔎",  desc: "Score accuracy / argument / SEO / tone" },
  { id: "Editor",             label: "Editor",              icon: "✏️",  desc: "Final copy-edit, voice & style polish" },
  { id: "ChannelAdapter",     label: "Channel Adapter",     icon: "📡",  desc: "Blog · Twitter thread · LinkedIn · Newsletter" },
];

const ALL_IDS = [...RESEARCH, ...GENERATION].map(a => a.id);

function blank(): AgentState { return { status: "idle", summary: "", output: null }; }
function blankMap(): AgentMap { return Object.fromEntries(ALL_IDS.map(id => [id, blank()])); }

// ─── Parse event data into typed output ──────────────────────────────────────

function parseOutput(agentId: string, data: unknown): AgentOutputData {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  switch (agentId) {
    case "KeywordResearcher":
      return { kind: "keywords", count: (d.count as number) ?? 0, topKeywords: (d.topKeywords as Keyword[]) ?? [] };
    case "TopicPrioritizer":
      return { kind: "topics", topics: (d.topics as TopicItem[]) ?? [] };
    case "BrandChecker":
      return { kind: "brand", validated: (d.validated as BrandItem[]) ?? [] };
    case "ContentGenerator":
      return { kind: "drafts", drafts: (d.drafts as DraftItem[]) ?? [] };
    case "CriticReviewer":
      return { kind: "reviews", reviews: (d.reviews as ReviewItem[]) ?? [] };
    case "Editor":
    case "ChannelAdapter":
      return { kind: "list", topics: (d.topics as string[]) ?? [] };
    default:
      return null;
  }
}

// ─── Output panel renderers ───────────────────────────────────────────────────

function intentColor(intent: string) {
  return intent === "informational" ? "#1d4ed8" : intent === "transactional" ? "#065f46" : "#374151";
}

function scoreColor(n: number) {
  return n >= 8 ? "#22c55e" : n >= 6 ? "#eab308" : "#ef4444";
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
      <span style={{ fontSize: 10, color: "#64748b", width: 56 }}>{label}</span>
      <div style={{ flex: 1, background: "#0f172a", borderRadius: 3, height: 5, overflow: "hidden" }}>
        <div style={{ width: `${value * 10}%`, height: "100%", background: scoreColor(value), borderRadius: 3, transition: "width 0.5s ease" }} />
      </div>
      <span style={{ fontSize: 10, color: scoreColor(value), width: 20, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function OutputPanel({ agentId, output }: { agentId: string; output: AgentOutputData }) {
  if (!output) return null;

  if (output.kind === "keywords") return (
    <div style={op.wrap}>
      <div style={op.stat}>{output.count} keywords generated · showing top {Math.min(5, output.topKeywords.length)}</div>
      {output.topKeywords.slice(0, 5).map((k, i) => (
        <div key={i} style={op.row}>
          <span style={op.pill} title={k.term}>{k.term}</span>
          <span style={{ ...op.badge, background: intentColor(k.intent) }}>{k.intent.slice(0, 4)}</span>
          <span style={{ fontSize: 11, color: scoreColor(k.score), flexShrink: 0 }}>★{k.score}</span>
        </div>
      ))}
    </div>
  );

  if (output.kind === "topics") return (
    <div style={op.wrap}>
      {output.topics.map((t, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.4, marginBottom: 4 }}>{t.title}</div>
          <div style={{ display: "flex", gap: 5 }}>
            <span style={{ ...op.badge, background: "#1e3a5f" }}>{(t.type || "").replace(/_/g, " ")}</span>
            {(t.cannibalizationRisk || t.risk) && (
              <span style={{ ...op.badge, background: (t.cannibalizationRisk || t.risk) === "low" ? "#052e16" : (t.cannibalizationRisk || t.risk) === "medium" ? "#451a03" : "#450a0a" }}>
                {(t.cannibalizationRisk || t.risk)} risk
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  if (output.kind === "brand") return (
    <div style={op.wrap}>
      {output.validated.map((v, i) => (
        <div key={i} style={op.row}>
          <span style={op.pill} title={v.title}>{v.title}</span>
          <span style={{ fontSize: 12, color: scoreColor(v.score), fontWeight: 700, flexShrink: 0 }}>{v.score}/10</span>
          <span style={{ fontSize: 13, flexShrink: 0 }}>{v.passed ? "✓" : "✗"}</span>
        </div>
      ))}
    </div>
  );

  if (output.kind === "drafts") return (
    <div style={op.wrap}>
      {output.drafts.map((d, i) => (
        <div key={i} style={op.row}>
          <span style={op.pill} title={d.topic}>{d.topic}</span>
          <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>{d.wordCount}w</span>
        </div>
      ))}
    </div>
  );

  if (output.kind === "reviews") return (
    <div style={op.wrap}>
      {output.reviews.map((r, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={op.row}>
            <span style={op.pill} title={r.topic}>{r.topic}</span>
            <span style={{ fontSize: 11, color: r.passed ? "#22c55e" : "#ef4444", fontWeight: 700, flexShrink: 0 }}>
              {r.passed ? "PASS" : "FAIL"}
            </span>
            {r.cycles > 0 && <span style={{ fontSize: 10, color: "#64748b", flexShrink: 0 }}>↺{r.cycles}</span>}
          </div>
          {r.scores && (
            <div style={{ paddingLeft: 4, marginTop: 4 }}>
              <ScoreBar label="Accuracy" value={r.scores.accuracy} />
              <ScoreBar label="Argument" value={r.scores.argument} />
              <ScoreBar label="SEO" value={r.scores.seo} />
              <ScoreBar label="Tone" value={r.scores.tone} />
            </div>
          )}
        </div>
      ))}
    </div>
  );

  if (output.kind === "list") return (
    <div style={op.wrap}>
      {output.topics.map((t, i) => (
        <div key={i} style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>• {t}</div>
      ))}
    </div>
  );

  return null;
}

// ─── Agent card ───────────────────────────────────────────────────────────────

function AgentCard({
  config, state, direction = "horizontal",
}: {
  config: typeof RESEARCH[0];
  state: AgentState;
  direction?: "horizontal" | "vertical";
}) {
  const isRunning = state.status === "running";
  const isDone    = state.status === "completed";
  const isFailed  = state.status === "failed";

  const border = isRunning ? "#3b82f6" : isDone ? "#22c55e" : isFailed ? "#ef4444" : "#1e293b";
  const bg     = isRunning ? "#0c1929" : isDone ? "#071a12" : "#131e2e";
  const glow   = isRunning ? `0 0 18px #3b82f640` : "none";

  return (
    <div style={{
      background: bg, border: `1.5px solid ${border}`, borderRadius: 10,
      padding: "14px 16px", transition: "all 0.35s ease", boxShadow: glow,
      ...(direction === "horizontal" ? { flex: 1, minWidth: 0 } : { width: "100%" }),
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 15 }}>{config.icon}</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#f1f5f9", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {config.label}
        </span>
        <span style={{ fontSize: 14, flexShrink: 0 }}>
          {isRunning ? <span className="spin" style={{ color: "#60a5fa" }}>⟳</span>
          : isDone    ? <span style={{ color: "#22c55e" }}>✓</span>
          : isFailed  ? <span style={{ color: "#ef4444" }}>✗</span>
          :              <span style={{ color: "#1e293b" }}>○</span>}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "#475569", marginBottom: 6, lineHeight: 1.3 }}>{config.desc}</div>
      {state.summary && (
        <div style={{ fontSize: 12, color: isRunning ? "#93c5fd" : isDone ? "#86efac" : "#94a3b8", marginBottom: 4, lineHeight: 1.4 }}>
          {state.summary}
        </div>
      )}
      {isDone && <OutputPanel agentId={config.id} output={state.output} />}
    </div>
  );
}

// ─── Connectors ───────────────────────────────────────────────────────────────

function HArrow({ active }: { active: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", flexShrink: 0, padding: "0 6px" }}>
      <div style={{ width: 24, height: 2, background: active ? "#22c55e" : "#1e293b", borderRadius: 1, transition: "background 0.4s" }} />
      <div style={{ fontSize: 14, color: active ? "#22c55e" : "#1e293b", marginLeft: -4, transition: "color 0.4s" }}>›</div>
    </div>
  );
}

function VArrow({ active }: { active: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "3px 0", flexShrink: 0 }}>
      <div style={{ width: 2, height: 18, background: active ? "#22c55e" : "#1e293b", borderRadius: 1, transition: "background 0.4s" }} />
      <div style={{ fontSize: 12, color: active ? "#22c55e" : "#1e293b", marginTop: -4, transition: "color 0.4s" }}>v</div>
    </div>
  );
}

// ─── Pipeline flow diagram ────────────────────────────────────────────────────

function PipelineFlow({ agents }: { agents: AgentMap }) {
  const done = (id: string) => agents[id]?.status === "completed";

  return (
    <div>
      {/* Research tier */}
      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
        ── Research layer
      </div>
      <div style={{ display: "flex", alignItems: "stretch", gap: 0, marginBottom: 6 }}>
        {RESEARCH.map((cfg, i) => (
          <div key={cfg.id} style={{ display: "flex", alignItems: "stretch", flex: 1, minWidth: 0 }}>
            <AgentCard config={cfg} state={agents[cfg.id] ?? blank()} direction="horizontal" />
            {i < RESEARCH.length - 1 && <HArrow active={done(cfg.id)} />}
          </div>
        ))}
      </div>

      {/* Bridge arrow: research → generation */}
      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
        <VArrow active={done("BrandChecker")} />
      </div>

      {/* Generation tier */}
      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
        ── Generation layer
      </div>
      <div style={{ display: "flex" }}>
        {/* Left accent line */}
        <div style={{ width: 2, borderRadius: 2, background: "#1e293b", marginRight: 16, flexShrink: 0, alignSelf: "stretch" }} />

        <div style={{ flex: 1 }}>
          {GENERATION.map((cfg, i) => (
            <div key={cfg.id}>
              <AgentCard config={cfg} state={agents[cfg.id] ?? blank()} direction="vertical" />
              {i < GENERATION.length - 1 && <VArrow active={done(cfg.id)} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [phase, setPhase]           = useState<"idle" | "running" | "done" | "error">("idle");
  const [agents, setAgents]         = useState<AgentMap>(blankMap);
  const [currentRunId, setRunId]    = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<PipelineRunRow[]>([]);
  const [errMsg, setErrMsg]         = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const r = await fetch("/api/runs");
      if (r.ok) setRecentRuns((await r.json()).runs ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const handleRun = () => {
    setErrMsg(null);
    setPhase("running");
    setAgents(blankMap());

    const es = new EventSource("/api/pipeline/stream");

    es.onmessage = (e: MessageEvent) => {
      const event: ProgressEvent = JSON.parse(e.data as string);
      const { agent, status, summary, data } = event;

      if (agent === "__started__") {
        const d = data as { runId?: string };
        if (d?.runId) setRunId(d.runId);
        return;
      }

      if (agent === "__done__") {
        es.close();
        setPhase("done");
        loadRuns();
        return;
      }

      if (agent === "__error__") {
        es.close();
        setPhase("error");
        setErrMsg(summary);
        return;
      }

      setAgents(prev => ({
        ...prev,
        [agent]: {
          status: status === "started" ? "running"
                : status === "completed" ? "completed"
                : "failed",
          summary,
          output: status === "completed" ? parseOutput(agent, data) : null,
        },
      }));
    };

    es.onerror = () => {
      es.close();
      setPhase("error");
      setErrMsg("Connection lost. Check the terminal for errors.");
    };
  };

  return (
    <>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { display: inline-block; animation: spin 1s linear infinite; }
      `}</style>

      <div style={pg.page}>
        {/* Header */}
        <div style={pg.header}>
          <div>
            <h1 style={pg.h1}>GitHub Content Marketing Pipeline</h1>
            <p style={pg.sub}>7 agents · Claude claude-sonnet-4-5 · Research → Generate → Review → Distribute</p>
          </div>
          <button
            onClick={handleRun}
            disabled={phase === "running"}
            style={{ ...pg.btn, opacity: phase === "running" ? 0.55 : 1, cursor: phase === "running" ? "not-allowed" : "pointer" }}
          >
            {phase === "running" ? "⟳ Running…" : "▶ Run Pipeline"}
          </button>
        </div>

        {errMsg && <div style={pg.err}>{errMsg}</div>}

        {/* Pipeline diagram — always visible */}
        <section style={pg.section}>
          <PipelineFlow agents={agents} />

          {phase === "done" && currentRunId && (
            <div style={pg.successBanner}>
              ✓ Run complete —{" "}
              <a href={`/review/${currentRunId}`} style={pg.link}>Review &amp; approve output →</a>
            </div>
          )}
        </section>

        {/* Recent runs */}
        <section style={pg.section}>
          <div style={pg.sectionLabel}>Recent runs</div>
          {recentRuns.length === 0
            ? <p style={pg.muted}>No runs yet.</p>
            : (
              <table style={pg.table}>
                <thead>
                  <tr>
                    {["Date", "Topics", "Passed", "Flagged", "Started", "Review"].map(h => (
                      <th key={h} style={pg.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map(run => (
                    <tr key={run.id}>
                      <td style={pg.td}>{run.run_date}</td>
                      <td style={pg.td}>{run.topics_processed}</td>
                      <td style={{ ...pg.td, color: "#22c55e" }}>{run.drafts_passed}</td>
                      <td style={{ ...pg.td, color: run.drafts_flagged > 0 ? "#f59e0b" : "#475569" }}>{run.drafts_flagged}</td>
                      <td style={{ ...pg.td, fontSize: 11, color: "#475569" }}>{new Date(run.created_at).toLocaleString()}</td>
                      <td style={pg.td}>
                        {run.drafts_passed > 0 && (
                          <a href={`/review/${run.run_id}`} style={pg.link}>Review →</a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </section>
      </div>
    </>
  );
}

// ─── Output panel styles ──────────────────────────────────────────────────────

const op = {
  wrap: { borderTop: "1px solid #1e293b", paddingTop: 8, marginTop: 6 } as React.CSSProperties,
  row:  { display: "flex", alignItems: "center", gap: 6, marginBottom: 5 } as React.CSSProperties,
  pill: { fontSize: 11, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, flex: 1, minWidth: 0 },
  badge: { fontSize: 9, color: "#fff", borderRadius: 4, padding: "1px 5px", fontWeight: 700, flexShrink: 0 as const },
  stat: { fontSize: 11, color: "#86efac", marginBottom: 6, fontWeight: 600 },
} as const;

// ─── Page styles ──────────────────────────────────────────────────────────────

const pg = {
  page:         { fontFamily: "system-ui,-apple-system,sans-serif", maxWidth: 980, margin: "0 auto", padding: "2rem 1.5rem", background: "#0a0f1a", minHeight: "100vh", color: "#e2e8f0" } as React.CSSProperties,
  header:       { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem", flexWrap: "wrap" as const, gap: 16 },
  h1:           { margin: 0, fontSize: 22, fontWeight: 800, color: "#f8fafc" },
  sub:          { margin: "4px 0 0", color: "#475569", fontSize: 13 },
  btn:          { background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" as const },
  err:          { background: "#450a0a", border: "1px solid #ef4444", color: "#fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13 },
  section:      { marginBottom: "2.5rem" },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 12 },
  successBanner:{ marginTop: 20, background: "#052e16", border: "1px solid #22c55e", color: "#86efac", borderRadius: 8, padding: "12px 16px", fontSize: 13 },
  link:         { color: "#60a5fa", fontWeight: 700, textDecoration: "none" },
  muted:        { color: "#334155", fontSize: 13 },
  table:        { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th:           { textAlign: "left" as const, padding: "7px 12px", borderBottom: "1px solid #1e293b", color: "#334155", fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em" },
  td:           { padding: "9px 12px", borderBottom: "1px solid #0f172a", color: "#94a3b8" },
} as const;
