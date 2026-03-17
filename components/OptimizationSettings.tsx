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
  highlightTargetRole = false,
}: {
  value: UserContext;
  onChange: (v: UserContext) => void;
  highlightTargetRole?: boolean;
}) {
  const selectedMode = MODE_OPTIONS.find(
    (m) => m.value === (value.mode ?? "Branding")
  );

  const inputBase =
    "w-full rounded-2xl border bg-black/30 px-3.5 py-3 text-white placeholder-white/30 outline-none transition";
  const defaultBorder = "border-white/10";
  const focusBorder = "focus:border-[color:var(--luna-200)]/60";

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-2xl sm:rounded-[28px] sm:p-6">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--luna-200)]/20 bg-[color:var(--luna-400)]/20 text-[color:var(--luna-100)] sm:h-11 sm:w-11">
          ✦
        </div>
        <div>
          <div className="text-[17px] font-semibold text-white sm:text-lg">
            Optimization Context
          </div>
          <div className="mt-1 text-[13px] leading-6 text-white/68 sm:text-sm">
            This controls positioning, keyword focus, and tone. Keep it tight so
            each section call stays efficient.
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:mt-5 sm:gap-4 md:grid-cols-2">
        <Field
          label="Target Role"
          hint="Required — drives all keyword and tone decisions."
          required
          highlighted={highlightTargetRole}
        >
          <input
            className={[
              inputBase,
              highlightTargetRole
                ? "border-amber-400/60 bg-amber-400/[0.06] ring-1 ring-amber-400/30"
                : defaultBorder,
              focusBorder,
            ].join(" ")}
            value={value.targetRole}
            onChange={(e) => onChange({ ...value, targetRole: e.target.value })}
            placeholder="e.g. Senior Data Engineer"
          />
          {highlightTargetRole ? (
            <div className="mt-2 text-xs font-medium text-amber-300">
              Please add a target role before parsing.
            </div>
          ) : null}
        </Field>

        <Field
          label="Industry"
          hint="Optional. Helps with niche keyword alignment."
        >
          <input
            className={[inputBase, defaultBorder, focusBorder].join(" ")}
            value={value.industry ?? ""}
            onChange={(e) => onChange({ ...value, industry: e.target.value })}
            placeholder="e.g. FinTech, Healthcare, SaaS"
          />
        </Field>

        <Field label="Seniority">
          <select
            className={[inputBase, defaultBorder, focusBorder].join(" ")}
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

        <Field label="Optimization Mode">
          <select
            className={[inputBase, defaultBorder, focusBorder].join(" ")}
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
            <div className="mt-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-xs leading-5 text-white/50">
              {selectedMode.hint}
            </div>
          )}
        </Field>

        <div className="md:col-span-2">
          <Field
            label="Target Job Description"
            hint="Optional. Paste key requirements, tools, and responsibilities. The AI will align your profile to it."
          >
            <textarea
              className={[
                "min-h-[132px] sm:min-h-[160px]",
                inputBase,
                defaultBorder,
                focusBorder,
              ].join(" ")}
              value={value.targetJobText ?? ""}
              onChange={(e) =>
                onChange({ ...value, targetJobText: e.target.value })
              }
              placeholder="Paste key requirements, tools, and responsibilities from the job posting."
            />
            {value.targetJobText && value.targetJobText.length > 1800 && (
              <div className="mt-2 text-xs font-medium text-amber-300">
                Long JD detected — only the first ~2500 characters are used.
              </div>
            )}
          </Field>
        </div>
      </div>

      {value.targetRole && (
        <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-xs leading-5 text-white/60 sm:mt-5">
          <span className="font-medium text-white/80">Active context:</span>{" "}
          {value.seniority} {value.targetRole}
          {value.industry ? ` · ${value.industry}` : ""}
          {" · "}
          <span className="text-[color:var(--luna-200)]">
            {
              MODE_OPTIONS.find((m) => m.value === (value.mode ?? "Branding"))
                ?.label
            }
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
  required = false,
  highlighted = false,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <div
          className={[
            "text-sm font-medium",
            highlighted ? "text-amber-200" : "text-white/82",
          ].join(" ")}
        >
          {label}
        </div>
        {required ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
            Required
          </span>
        ) : null}
      </div>

      {children}

      {hint ? <div className="mt-2 text-xs text-white/45">{hint}</div> : null}
    </div>
  );
}