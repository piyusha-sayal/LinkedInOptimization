"use client";

export type ResultsTab = "Branding Version" | "Recruiter Version" | "Keyword Insights" | "Optimization Score";

const TABS: ResultsTab[] = ["Branding Version", "Recruiter Version", "Keyword Insights", "Optimization Score"];

export function ProfileTabs({ active, onChange }: { active: ResultsTab; onChange: (t: ResultsTab) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={[
            "rounded-xl px-4 py-2 text-sm border transition",
            active === t
              ? "border-red-500/60 bg-red-500/10 text-white"
              : "border-white/10 bg-black/30 text-gray-300 hover:border-white/20",
          ].join(" ")}
        >
          {t}
        </button>
      ))}
    </div>
  );
}