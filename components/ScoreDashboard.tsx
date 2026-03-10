import type { OptimizationScore } from "@/lib/types";

type ScoreDashboardProps = {
  score: OptimizationScore;
};

const LABELS: Record<keyof OptimizationScore["breakdown"], string> = {
  headline: "Headline",
  about: "About",
  experience: "Experience",
  skills: "Skills",
};

export function ScoreDashboard({ score }: ScoreDashboardProps) {
  const factors = Object.entries(score.breakdown) as Array<
    [keyof OptimizationScore["breakdown"], number]
  >;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-2 text-sm text-white/60">Overall Score</div>
        <div className="text-4xl font-semibold text-white">{score.overall}</div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-4 text-sm text-white/60">Breakdown</div>

        <div className="space-y-4">
          {factors.map(([key, value]) => {
            const pct = Math.max(0, Math.min(100, value));

            return (
              <div key={key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-white/80">{LABELS[key]}</span>
                  <span className="text-white/60">{value}</span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ScoreDashboard;