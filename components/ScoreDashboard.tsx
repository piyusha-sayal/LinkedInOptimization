"use client";

import type { OptimizationScore } from "@/lib/types";

export function ScoreDashboard({ score }: { score: OptimizationScore }) {
  const bars: { label: string; val: number }[] = [
    { label: "Headline", val: score.breakdown.headline },
    { label: "About", val: score.breakdown.about },
    { label: "Experience", val: score.breakdown.experience },
    { label: "Skills", val: score.breakdown.skills },
  ];

  const factors = Object.entries(score.factors);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-2xl border border-white/10 bg-[color:var(--card)] p-6">
        <div className="text-lg font-semibold">Overall Score</div>
        <div className="mt-2 text-5xl font-bold text-red-500">{score.overall}</div>
        <div className="mt-2 text-sm text-gray-400">Weighted across keywords, impact, clarity, completeness.</div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[color:var(--card)] p-6">
        <div className="text-lg font-semibold">Section Breakdown</div>
        <div className="mt-4 space-y-3">
          {bars.map((b) => (
            <div key={b.label}>
              <div className="flex justify-between text-sm text-gray-300">
                <span>{b.label}</span><span>{b.val}</span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-red-500" style={{ width: `${b.val}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-[color:var(--card)] p-6">
        <div className="text-lg font-semibold">Factor Signals</div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          {factors.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="text-sm text-gray-400">{k}</div>
              <div className="text-xl font-semibold">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}