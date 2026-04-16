"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PipelineOutputRow {
  id: number;
  run_id: string;
  topic: string;
  content_type: string;
  brand_score: number;
  review_scores: { accuracy: number; argument: number; seo: number; tone: number } | null;
  blog_content: string;
  twitter_thread: string[];
  linkedin_post: string;
  newsletter_blurb: string;
}

interface ReviewDecision {
  topic: string;
  approved: boolean | null;
  feedback: string;
}

interface FeedbackLearnings {
  approvedPatterns: string[];
  rejectedPatterns: string[];
  improvementNotes: string;
}

type Channel = "blog" | "twitter" | "linkedin" | "newsletter";

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ label, score }: { label: string; score: number }) {
  const color = score >= 8 ? "#22c55e" : score >= 6 ? "#eab308" : "#ef4444";
  return (
    <span style={{ ...styles.badge, borderColor: color, color }}>
      {label} {score}/10
    </span>
  );
}

// ─── Channel tab viewer ───────────────────────────────────────────────────────

function ChannelViewer({ output }: { output: PipelineOutputRow }) {
  const [tab, setTab] = useState<Channel>("blog");

  const tabs: { key: Channel; label: string }[] = [
    { key: "blog", label: "Blog" },
    { key: "twitter", label: "Twitter thread" },
    { key: "linkedin", label: "LinkedIn" },
    { key: "newsletter", label: "Newsletter" },
  ];

  const content = {
    blog: output.blog_content,
    twitter: Array.isArray(output.twitter_thread) ? output.twitter_thread.join("\n\n") : "",
    linkedin: output.linkedin_post,
    newsletter: output.newsletter_blurb,
  };

  return (
    <div>
      <div style={styles.tabs}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{ ...styles.tab, ...(tab === t.key ? styles.tabActive : {}) }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <pre style={styles.contentBox}>{content[tab]}</pre>
    </div>
  );
}

// ─── Individual topic review card ─────────────────────────────────────────────

function TopicCard({
  output,
  decision,
  onChange,
}: {
  output: PipelineOutputRow;
  decision: ReviewDecision;
  onChange: (d: Partial<ReviewDecision>) => void;
}) {
  const scores = output.review_scores;

  return (
    <div style={styles.topicCard}>
      <h2 style={styles.topicTitle}>{output.topic}</h2>

      <div style={styles.scoreLine}>
        <ScoreBadge label="Brand" score={output.brand_score} />
        {scores && (
          <>
            <ScoreBadge label="Accuracy" score={scores.accuracy} />
            <ScoreBadge label="Argument" score={scores.argument} />
            <ScoreBadge label="SEO" score={scores.seo} />
            <ScoreBadge label="Tone" score={scores.tone} />
          </>
        )}
        <span style={styles.typeTag}>{output.content_type.replace(/_/g, " ")}</span>
      </div>

      <ChannelViewer output={output} />

      <div style={styles.decisionRow}>
        <div style={styles.decisionButtons}>
          <button
            onClick={() => onChange({ approved: true })}
            style={{ ...styles.approveBtn, ...(decision.approved === true ? styles.approveBtnActive : {}) }}
          >
            ✓ Approve
          </button>
          <button
            onClick={() => onChange({ approved: false })}
            style={{ ...styles.rejectBtn, ...(decision.approved === false ? styles.rejectBtnActive : {}) }}
          >
            ✗ Reject
          </button>
        </div>
        <textarea
          placeholder="Feedback (optional — explain what worked or what to fix)"
          value={decision.feedback}
          onChange={(e) => onChange({ feedback: e.target.value })}
          style={styles.feedbackInput}
          rows={2}
        />
      </div>
    </div>
  );
}

// ─── Main review page ─────────────────────────────────────────────────────────

export default function ReviewPage() {
  const params = useParams();
  const runId = params.runId as string;

  const [outputs, setOutputs] = useState<PipelineOutputRow[]>([]);
  const [decisions, setDecisions] = useState<ReviewDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [learnings, setLearnings] = useState<FeedbackLearnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pipeline/${runId}/outputs`)
      .then((r) => r.json())
      .then((data) => {
        const rows: PipelineOutputRow[] = data.outputs ?? [];
        setOutputs(rows);
        setDecisions(rows.map((o) => ({ topic: o.topic, approved: null, feedback: "" })));
      })
      .catch(() => setError("Failed to load pipeline outputs"))
      .finally(() => setLoading(false));
  }, [runId]);

  const updateDecision = (topic: string, patch: Partial<ReviewDecision>) => {
    setDecisions((prev) =>
      prev.map((d) => (d.topic === topic ? { ...d, ...patch } : d))
    );
  };

  const handleSubmit = async () => {
    const undecided = decisions.filter((d) => d.approved === null);
    if (undecided.length > 0) {
      setError(`Please approve or reject all ${undecided.length} piece(s) before submitting.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/pipeline/${runId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviews: decisions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setLearnings(data.learnings ?? null);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={styles.page}><p style={styles.muted}>Loading outputs…</p></div>;
  }

  if (outputs.length === 0 && !loading) {
    return (
      <div style={styles.page}>
        <a href="/" style={styles.backLink}>← Back to dashboard</a>
        <p style={styles.muted}>No outputs found for run <code>{runId}</code>. The pipeline may still be running.</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <a href="/" style={styles.backLink}>← Back to dashboard</a>
      <h1 style={styles.h1}>Review — {runId.slice(0, 8)}…</h1>
      <p style={styles.subtitle}>{outputs.length} piece(s) to review. Approve or reject each, then submit to train the next run.</p>

      {error && <div style={styles.errorBanner}>{error}</div>}

      {!submitted ? (
        <>
          {outputs.map((output, i) => (
            <TopicCard
              key={output.id}
              output={output}
              decision={decisions[i] ?? { topic: output.topic, approved: null, feedback: "" }}
              onChange={(patch) => updateDecision(output.topic, patch)}
            />
          ))}

          <div style={styles.submitRow}>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ ...styles.submitBtn, opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? "Submitting…" : "Submit review →"}
            </button>
            <span style={styles.muted}>
              {decisions.filter((d) => d.approved === true).length} approved ·{" "}
              {decisions.filter((d) => d.approved === false).length} rejected ·{" "}
              {decisions.filter((d) => d.approved === null).length} pending
            </span>
          </div>
        </>
      ) : (
        <div style={styles.successBox}>
          <h2 style={{ margin: "0 0 12px", color: "#86efac" }}>✓ Review submitted</h2>
          <p style={{ margin: "0 0 20px", color: "#94a3b8" }}>
            The FeedbackAgent has processed your decisions. These learnings will be
            injected into the next pipeline run.
          </p>

          {learnings && (
            <div style={styles.learningsBox}>
              <h3 style={styles.learningsH3}>What worked</h3>
              <ul style={styles.ul}>
                {learnings.approvedPatterns.map((p, i) => <li key={i}>{p}</li>)}
              </ul>

              <h3 style={styles.learningsH3}>What to avoid</h3>
              <ul style={styles.ul}>
                {learnings.rejectedPatterns.map((p, i) => <li key={i}>{p}</li>)}
              </ul>

              <h3 style={styles.learningsH3}>Instructions for next run</h3>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: 14, lineHeight: 1.6 }}>
                {learnings.improvementNotes}
              </p>
            </div>
          )}

          <a href="/" style={{ ...styles.submitBtn, display: "inline-block", textDecoration: "none", marginTop: 16 }}>
            ← Back to dashboard
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: { fontFamily: "system-ui, -apple-system, sans-serif", maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem", background: "#0f172a", minHeight: "100vh", color: "#e2e8f0" } as React.CSSProperties,
  backLink: { color: "#60a5fa", textDecoration: "none", fontSize: 14, display: "inline-block", marginBottom: 20 },
  h1: { margin: "0 0 8px", fontSize: 22, fontWeight: 700, color: "#f1f5f9" },
  subtitle: { margin: "0 0 2rem", color: "#64748b", fontSize: 14 },
  errorBanner: { background: "#450a0a", border: "1px solid #ef4444", color: "#fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: "1.5rem", fontSize: 14 },
  topicCard: { background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: "20px 24px", marginBottom: 24 },
  topicTitle: { margin: "0 0 12px", fontSize: 18, fontWeight: 700, color: "#f1f5f9" },
  scoreLine: { display: "flex", flexWrap: "wrap" as const, gap: 8, marginBottom: 16 },
  badge: { border: "1px solid", borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600 },
  typeTag: { background: "#0f172a", color: "#94a3b8", borderRadius: 6, padding: "2px 8px", fontSize: 12, border: "1px solid #334155" },
  tabs: { display: "flex", gap: 4, marginBottom: 12 },
  tab: { background: "transparent", border: "1px solid #334155", color: "#94a3b8", borderRadius: 6, padding: "6px 14px", fontSize: 13, cursor: "pointer" },
  tabActive: { background: "#1d4ed8", border: "1px solid #3b82f6", color: "#eff6ff" },
  contentBox: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 16, fontSize: 13, color: "#cbd5e1", maxHeight: 400, overflowY: "auto" as const, whiteSpace: "pre-wrap" as const, fontFamily: "monospace", lineHeight: 1.6, marginBottom: 16 },
  decisionRow: { display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" as const },
  decisionButtons: { display: "flex", gap: 8, flexShrink: 0 },
  approveBtn: { background: "#052e16", border: "1px solid #374151", color: "#94a3b8", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  approveBtnActive: { background: "#14532d", border: "1px solid #22c55e", color: "#86efac" },
  rejectBtn: { background: "#1c0606", border: "1px solid #374151", color: "#94a3b8", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  rejectBtnActive: { background: "#450a0a", border: "1px solid #ef4444", color: "#fca5a5" },
  feedbackInput: { flex: 1, background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, resize: "vertical" as const, minWidth: 200 },
  submitRow: { display: "flex", alignItems: "center", gap: 20, marginTop: 8 },
  submitBtn: { background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "12px 24px", fontSize: 15, fontWeight: 600, cursor: "pointer" },
  successBox: { background: "#052e16", border: "1px solid #22c55e", borderRadius: 12, padding: "24px 28px" },
  learningsBox: { background: "#0f172a", borderRadius: 8, padding: 20, marginTop: 16 },
  learningsH3: { margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  ul: { margin: "0 0 16px 20px", padding: 0, color: "#94a3b8", fontSize: 14, lineHeight: 1.7 },
  muted: { color: "#475569", fontSize: 14 },
} as const;
