"use client";

import type { OptimizeMode, Seniority, UserContext } from "@/lib/types";

const SENIORITY: Seniority[] = ["Junior", "Mid", "Senior", "Lead", "Director", "VP"];
const MODES: OptimizeMode[] = ["Branding", "Recruiter", "Executive"];

export function OptimizationSettings({
  value,
  onChange,
}: {
  value: UserContext;
  onChange: (v: UserContext) => void;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div className="text-lg font-semibold text-white">Optimization Context</div>
      <div className="mt-1 text-sm leading-6 text-white/68">
        This controls positioning, keyword focus, and tone. Keep it tight so each section call stays efficient.
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Target Role" hint="This is required.">
          <input
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 outline-none transition focus:border-[color:var(--luna-200)]/60"
            value={value.targetRole}
            onChange={(e) => onChange({ ...value, targetRole: e.target.value })}
            placeholder="e.g. Data Engineer"
          />
        </Field>

        <Field label="Industry" hint="Optional, but useful when relevant.">
          <input
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 outline-none transition focus:border-[color:var(--luna-200)]/60"
            value={value.industry ?? ""}
            onChange={(e) => onChange({ ...value, industry: e.target.value })}
            placeholder="e.g. FinTech, Healthcare, SaaS"
          />
        </Field>

        <Field label="Seniority">
          <select
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 outline-none transition focus:border-[color:var(--luna-200)]/60"
            value={value.seniority}
            onChange={(e) => onChange({ ...value, seniority: e.target.value as Seniority })}
          >
            {SENIORITY.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Mode"
          hint="Use one mode at a time. It is cleaner and safer than bulk generation."
        >
          <select
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 outline-none transition focus:border-[color:var(--luna-200)]/60"
            value={value.mode ?? "Branding"}
            onChange={(e) => onChange({ ...value, mode: e.target.value as OptimizeMode })}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>

        <div className="md:col-span-2">
          <Field
            label="Target Job Text"
            hint="Optional. Paste only the most relevant part of the job description."
          >
            <textarea
              className="min-h-[140px] w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 outline-none transition focus:border-[color:var(--luna-200)]/60"
              value={value.targetJobText ?? ""}
              onChange={(e) => onChange({ ...value, targetJobText: e.target.value })}
              placeholder="Paste key requirements, tools, and responsibilities."
            />
          </Field>
        </div>
      </div>
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
      <div className="mb-1 text-sm font-medium text-white/82">{label}</div>
      {children}
      {hint ? <div className="mt-1 text-xs text-white/45">{hint}</div> : null}
    </div>
  );
}