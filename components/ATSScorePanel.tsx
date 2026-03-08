// components/ATSScorePanel.tsx
"use client";

import { useState } from "react";
import type { ATSScoreResult, ATSCategory, ATSSeverity } from "@/lib/atsScorer";

interface Props {
  sessionId: string;
  targetRole?: string;
  targetJobText?: string;
}

const CATEGORY_ORDER: ATSCategory[] = [
  "keyword_match",
  "completeness",
  "impact",
  "formatting",
  "role_alignment",
];

const SEVERITY_COLOR: Record<ATSSeverity, string> = {
  critical: "text-red-400",
  warning: "text-amber-400",
  suggestion: "text-sky-400",
};

const SEVERITY_DOT: Record<ATSSeverity, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-400",
  suggestion: "bg-sky-400",
};

const GRADE_COLOR: Record<string, string> = {
  A: "text-emerald-400",
  B: "text-green-400",
  C: "text-amber-400",
  D: "text-orange-400",
  F: "text-red-500",
};

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;

  return (
    <div className="relative flex items-center justify-center w-32 h-32">
      <svg width="128" height="128" className="-rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="#1e2a3a" strokeWidth="10" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={
            score >= 80
              ? "#34d399"
              : score >= 60
              ? "#fbbf24"
              : "#f87171"
          }
          strokeWidth="10"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-3xl font-bold ${GRADE_COLOR[grade] ?? "text-white"}`}>
          {grade}
        </span>
        <span className="text-sm text-slate-400">{score}/100</span>
      </div>
    </div>
  );
}

function CategoryBar({ label, score, maxScore }: { label: string; score: number; maxScore: number }) {
  const pct = Math.round((score / maxScore) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span>
          {score}/{maxScore}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            backgroundColor: pct >= 80 ? "#34d399" : pct >= 55 ? "#fbbf24" : "#f87171",
          }}
        />
      </div>
    </div>
  );
}

export function ATSScorePanel({ sessionId, targetRole, targetJobText }: Props) {
  const [result, setResult] = useState<ATSScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<ATSCategory | null>(null);

  async function runScore() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ats-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, targetRole, targetJobText }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data.score);
      setOpenCategory("keyword_match"); // open most important category by default
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Score failed");
    } finally {
      setLoading(false);
    }
  }

  const orderedCategories = result
    ? CATEGORY_ORDER.map((key) => result.categories.find((c) => c.category === key)).filter(
        Boolean
      )
    : [];

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">ATS Score</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            How well your resume will perform in Applicant Tracking Systems
          </p>
        </div>
        <button
          onClick={runScore}
          disabled={loading}
          className="shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
        >
          {loading ? "Analyzing…" : result ? "Re-score" : "Run ATS Score"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-950/40 rounded-lg px-3 py-2">{error}</p>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
          <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
          Running keyword analysis…
        </div>
      )}

      {result && !loading && (
        <div className="space-y-5">
          {/* Score overview */}
          <div className="flex items-center gap-6">
            <ScoreRing score={result.overallScore} grade={result.grade} />
            <div className="flex-1 space-y-3 min-w-0">
              {orderedCategories.map((cat) =>
                cat ? (
                  <CategoryBar
                    key={cat.category}
                    label={cat.label}
                    score={cat.score}
                    maxScore={cat.maxScore}
                  />
                ) : null
              )}
            </div>
          </div>

          {/* Summary */}
          <p className="text-xs text-slate-300 leading-relaxed border-t border-slate-800 pt-4">
            {result.summary}
          </p>

          {/* Keywords */}
          {(result.topKeywordsFound.length > 0 || result.topKeywordsMissing.length > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {result.topKeywordsFound.length > 0 && (
                <div className="rounded-lg bg-emerald-950/30 border border-emerald-800/30 p-3 space-y-2">
                  <p className="text-[11px] font-medium text-emerald-400">✓ Keywords Found</p>
                  <div className="flex flex-wrap gap-1">
                    {result.topKeywordsFound.map((kw) => (
                      <span
                        key={kw}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {result.topKeywordsMissing.length > 0 && (
                <div className="rounded-lg bg-red-950/30 border border-red-800/30 p-3 space-y-2">
                  <p className="text-[11px] font-medium text-red-400">✗ Keywords Missing</p>
                  <div className="flex flex-wrap gap-1">
                    {result.topKeywordsMissing.map((kw) => (
                      <span
                        key={kw}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-300"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Issue accordion */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              Issues & Fixes
            </p>
            {orderedCategories.map((cat) =>
              cat && cat.issues.length > 0 ? (
                <div
                  key={cat.category}
                  className="rounded-lg border border-slate-800 overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setOpenCategory(openCategory === cat.category ? null : cat.category)
                    }
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-800/50 transition-colors"
                  >
                    <span className="text-xs font-medium text-slate-300">{cat.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        {cat.issues.length} issue{cat.issues.length !== 1 ? "s" : ""}
                      </span>
                      <span className="text-slate-500 text-xs">
                        {openCategory === cat.category ? "▲" : "▼"}
                      </span>
                    </div>
                  </button>

                  {openCategory === cat.category && (
                    <div className="border-t border-slate-800 divide-y divide-slate-800/50">
                      {cat.issues.map((issue, i) => (
                        <div key={i} className="px-3 py-2.5 space-y-1">
                          <div className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_DOT[issue.severity]}`}
                            />
                            <p className={`text-xs ${SEVERITY_COLOR[issue.severity]}`}>
                              {issue.message}
                            </p>
                          </div>
                          <p className="text-[11px] text-slate-400 pl-3.5 leading-relaxed">
                            {issue.fix}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  );
}
