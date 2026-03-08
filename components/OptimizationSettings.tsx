"use client";

import type { OptimizeMode, Seniority, UserContext } from "@/lib/types";

const SENIORITY_OPTIONS: Seniority[] = [
  "Junior",
  "Mid",
  "Senior",
  "Lead",
  "Director",
  "VP",
];

const MODE_OPTIONS: { value: OptimizeMode; label: string; hint: string }[] = [
  {
    value: "Branding",
    label: "Branding",
    hint: "Human-readable. Differentiated voice. Best for profile visibility.",
  },
  {
    value: "Recruiter",
    label: "Recruiter / ATS",
    hint: "Keyword-dense. ATS-optimized. Best when applying to specific jobs.",
  },
  {
    value: "Executive",
    label: "Executive",
    hint: "Leadership tone. Strategic language. Best for senior/C-level roles.",
  },
];

export function OptimizationSettings({
  value,
  onChange,
}: {
  value: UserContext;
  onChange: (v: UserContext) => void;
}) {
  const selectedMode = MODE_OPTIONS.find((m) => m.value === (value.mode ?? "Branding"));

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div className="text-lg font-semibold text-white">Optimization Context</div>
      <div className="mt-1 text-sm leading-6 text-white/68">
        This controls positioning, keyword focus, and tone. Keep it tight so
        each section call stays efficient.
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Target Role */}
        <Field label="Target Role" hint="Required — drives all keyword and tone decisions.">
          <input
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white placeholder-white/30 outline-none transition focus:border-[color:var(--luna-200)]/60"
            value={value.targetRole}
            onChange={(e) => onChange({ ...value, targetRole: e.target.value })}
            placeholder="e.g. Senior Data Engineer"
          />
        </Field>

        {/* Industry */}
        <Field label="Industry" hint="Optional. Helps with niche keyword alignment.">
          <input
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white placeholder-white/30 outline-none transition focus:border-[color:var(--luna-200)]/60"
            value={value.industry ?? ""}
            onChange={(e) => onChange({ ...value, industry: e.target.value })}
            placeholder="e.g. FinTech, Healthcare, SaaS"
          />
        </Field>

        {/* Seniority */}
        <Field label="Seniority">
          <select
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none transition focus:border-[color:var(--luna-200)]/60"
            value={value.seniority}
            onChange={(e) =>
              onChange({ ...value, seniority: e.target.value as Seniority })
            }
          >
            {SENIORITY_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        {/* Mode */}
        <Field label="Optimization Mode">
          <select
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none transition focus:border-[color:var(--luna-200)]/60"
            value={value.mode ?? "Branding"}
            onChange={(e) =>
              onChange({ ...value, mode: e.target.value as OptimizeMode })
            }
          >
            {MODE_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {selectedMode && (
            <div className="mt-1.5 text-xs text-white/45 leading-5">
              {selectedMode.hint}
            </div>
          )}
        </Field>

        {/* Target Job Text */}
        <div className="md:col-span-2">
          <Field
            label="Target Job Description"
            hint="Optional. Paste key requirements, tools, and responsibilities. The AI will align your profile to it."
          >
            <textarea
              className="min-h-[140px] w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-white placeholder-white/30 outline-none transition focus:border-[color:var(--luna-200)]/60"
              value={value.targetJobText ?? ""}
              onChange={(e) =>
                onChange({ ...value, targetJobText: e.target.value })
              }
              placeholder="Paste key requirements, tools, and responsibilities from the job posting."
            />
            {value.targetJobText && value.targetJobText.length > 1800 && (
              <div className="mt-1.5 text-xs text-amber-400/80">
                Long JD detected — only the first ~2500 characters are used.
              </div>
            )}
          </Field>
        </div>
      </div>

      {/* Context summary badge */}
      {value.targetRole && (
        <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-xs text-white/60 leading-5">
          <span className="text-white/80 font-medium">Active context:</span>{" "}
          {value.seniority} {value.targetRole}
          {value.industry ? ` · ${value.industry}` : ""}
          {" · "}
          <span className="text-[color:var(--luna-200)]">
            {MODE_OPTIONS.find((m) => m.value === (value.mode ?? "Branding"))?.label}
          </span>
          {value.targetJobText ? " · JD attached" : ""}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-white/82">{label}</div>
      {children}
      {hint && !String(hint).includes("Long JD") ? (
        <div className="mt-1 text-xs text-white/45">{hint}</div>
      ) : null}
    </div>
  );
}
