"use client";

import type { KeywordInsights as KI } from "@/lib/types";

export function KeywordInsights({ data }: { data: KI }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Matched Keywords" items={data.matched} />
      <Card title="Missing Keywords" items={data.missing} accent="red" />
      <Card title="Weak Usage Keywords" items={data.weak} />
      <div className="rounded-2xl border border-white/10 bg-[color:var(--card)] p-6">
        <div className="text-lg font-semibold">Suggestions</div>
        <ul className="mt-3 space-y-2 text-gray-300 list-disc pl-5">
          {data.suggestions.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </div>
    </div>
  );
}

function Card({ title, items, accent }: { title: string; items: string[]; accent?: "red" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[color:var(--card)] p-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">{title}</div>
        <div className={accent === "red" ? "text-red-400" : "text-gray-400"}>{items.length}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.slice(0, 60).map((k) => (
          <span key={k} className="text-xs rounded-full border border-white/10 bg-black/30 px-3 py-1 text-gray-200">
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}