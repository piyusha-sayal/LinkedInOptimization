"use client";

const DEFAULT_STEPS = [
  "Uploading resume",
  "Parsing and structuring profile",
  "Preparing workspace",
  "Generating section output",
  "Saving result",
];

export function LoadingState({
  stepIndex,
  title = "Processing",
  steps = DEFAULT_STEPS,
}: {
  stepIndex: number;
  title?: string;
  steps?: string[];
}) {
  const clamped = Math.min(Math.max(stepIndex, 0), steps.length - 1);
  const pct = ((clamped + 1) / steps.length) * 100;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-white">{title}</div>
          <div className="mt-1 text-sm text-white/60">
            One request at a time keeps the workflow more stable.
          </div>
        </div>

        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/60">
          {clamped + 1}/{steps.length}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {steps.map((step, i) => {
          const active = i <= clamped;
          return (
            <div key={step} className="flex items-center gap-3">
              <div
                className={[
                  "h-2.5 w-2.5 rounded-full transition",
                  active ? "bg-[color:var(--luna-200)]" : "bg-white/12",
                ].join(" ")}
              />
              <div className={active ? "text-white/88" : "text-white/42"}>{step}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[color:var(--luna-200)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}