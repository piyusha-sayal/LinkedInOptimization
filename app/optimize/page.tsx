"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { ResumeUpload } from "@/components/ResumeUpload";
import { OptimizationSettings } from "@/components/OptimizationSettings";
import { LoadingState } from "@/components/LoadingState";

import type {
  OptimizeMode,
  SectionKey,
  Seniority,
  StructuredResume,
  UserContext,
} from "@/lib/types";

type SectionState<T = unknown> = {
  status: "idle" | "loading" | "success" | "error";
  data?: T;
  error?: string;
};

type ParseResponse = {
  id: string;
  structured: StructuredResume;
  preview?: {
    name?: string;
    currentTitle?: string;
    topSkills?: string[];
  };
};

type SectionResponse = {
  section: SectionKey;
  data: unknown;
};

const SECTION_ORDER: Array<{
  key: SectionKey;
  title: string;
  desc: string;
}> = [
  {
    key: "headline",
    title: "Headline",
    desc: "Generate a concise LinkedIn headline first.",
  },
  {
    key: "about",
    title: "About",
    desc: "Create a stronger narrative summary next.",
  },
  {
    key: "experience",
    title: "Experience",
    desc: "Rewrite roles one at a time behind the scenes.",
  },
  {
    key: "skills",
    title: "Skills",
    desc: "Tighten your keyword coverage.",
  },
  {
    key: "certifications",
    title: "Certifications",
    desc: "Clean and reorder relevant certifications.",
  },
  {
    key: "projects",
    title: "Projects",
    desc: "Clarify project impact and tools.",
  },
  {
    key: "banner_tagline",
    title: "Banner Tagline",
    desc: "Create a short profile-supporting banner line.",
  },
  {
    key: "positioning_advice",
    title: "Positioning Advice",
    desc: "Get tactical profile direction.",
  },
];

function makeInitialSections(): Record<SectionKey, SectionState> {
  return {
    headline: { status: "idle" },
    about: { status: "idle" },
    experience: { status: "idle" },
    skills: { status: "idle" },
    certifications: { status: "idle" },
    projects: { status: "idle" },
    banner_tagline: { status: "idle" },
    positioning_advice: { status: "idle" },
  };
}

function prettyPrint(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function formatSectionOutput(section: SectionKey, data: unknown): string {
  if (data == null) return "";

  if (typeof data === "string") return data;

  switch (section) {
    case "headline":
    case "about":
    case "banner_tagline":
    case "positioning_advice":
      return typeof data === "string" ? data : prettyPrint(data);

    case "skills":
      return Array.isArray(data) ? data.join("\n") : prettyPrint(data);

    case "certifications":
      if (!Array.isArray(data)) return prettyPrint(data);
      return data
        .map((c: any) => {
          const bits = [c?.name, c?.issuer, c?.issueDate].filter(Boolean);
          return `• ${bits.join(" — ")}`;
        })
        .join("\n");

    case "projects":
      if (!Array.isArray(data)) return prettyPrint(data);
      return data
        .map((p: any) => {
          const tech =
            Array.isArray(p?.tech) && p.tech.length
              ? `Tech: ${p.tech.join(", ")}`
              : "";
          return [p?.name || "", p?.description || "", tech, p?.link || ""]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n");

    case "experience":
      if (!Array.isArray(data)) return prettyPrint(data);
      return data
        .map((r: any) => {
          const header = [r?.title, r?.company].filter(Boolean).join(" — ");
          const meta = [r?.location, r?.startDate, r?.endDate]
            .filter(Boolean)
            .join(" | ");
          const bullets = Array.isArray(r?.bullets)
            ? r.bullets.map((b: string) => `• ${b}`).join("\n")
            : "";
          return [header, meta, bullets].filter(Boolean).join("\n");
        })
        .join("\n\n");

    default:
      return prettyPrint(data);
  }
}

async function copySectionOutput(section: SectionKey, data: unknown) {
  const text = formatSectionOutput(section, data);
  if (!text) return;
  await navigator.clipboard.writeText(text);
}

export default function OptimizePage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [apiErr, setApiErr] = useState<string | null>(null);

  const [ctx, setCtx] = useState<UserContext>({
    targetRole: "",
    industry: "",
    seniority: "Mid",
    mode: "Branding",
    targetJobText: "",
  });

  const [parseLoading, setParseLoading] = useState(false);
  const [parseStep, setParseStep] = useState(0);
  const [parsedId, setParsedId] = useState<string>("");
  const [structured, setStructured] = useState<StructuredResume | null>(null);
  const [sections, setSections] = useState<Record<SectionKey, SectionState>>(
    makeInitialSections()
  );
  const [activeSection, setActiveSection] = useState<SectionKey | null>(null);
  const [copiedSection, setCopiedSection] = useState<SectionKey | null>(null);

  useEffect(() => {
    if (!parseLoading) return;
    setParseStep(0);
    const t = setInterval(() => setParseStep((s) => Math.min(s + 1, 2)), 900);
    return () => clearInterval(t);
  }, [parseLoading]);

  useEffect(() => {
    if (!copiedSection) return;
    const t = setTimeout(() => setCopiedSection(null), 1400);
    return () => clearTimeout(t);
  }, [copiedSection]);

  const topPreview = useMemo(() => {
    if (!structured) return [];
    return (structured.skills || []).slice(0, 8);
  }, [structured]);

  function validateBeforeParse(): string | null {
    if (!file) return "Please upload a PDF or DOCX resume.";
    if (!ctx.targetRole.trim()) return "Target role is required.";
    return null;
  }

  async function parseResume() {
    setApiErr(null);
    setFileErr(null);

    const v = validateBeforeParse();
    if (v) {
      if (!file) setFileErr(v);
      else setApiErr(v);
      return;
    }

    setParseLoading(true);
    setSections(makeInitialSections());
    setParsedId("");
    setStructured(null);

    try {
      const form = new FormData();
      form.set("resume", file as File);
      form.set("targetRole", ctx.targetRole.trim());
      form.set("industry", (ctx.industry || "").trim());
      form.set("seniority", String(ctx.seniority as Seniority));
      form.set("mode", String((ctx.mode || "Branding") as OptimizeMode));

      if (ctx.targetJobText?.trim()) {
        form.set("targetJobText", ctx.targetJobText.trim());
      }

      const res = await fetch("/api/parse-resume", {
        method: "POST",
        body: form,
      });

      const json = (await res.json()) as ParseResponse | { error?: string };

      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error || "Resume parsing failed."
        );
      }

      const out = json as ParseResponse;
      setParsedId(out.id);
      setStructured(out.structured);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Resume parsing failed.";
      setApiErr(msg);
    } finally {
      setParseLoading(false);
    }
  }

  async function generateSection(section: SectionKey) {
    if (!parsedId) return;

    setApiErr(null);
    setActiveSection(section);

    setSections((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        status: "loading",
        error: undefined,
      },
    }));

    try {
      const res = await fetch("/api/optimize-section", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          id: parsedId,
          section,
          targetRole: ctx.targetRole,
          industry: ctx.industry,
          seniority: ctx.seniority,
          mode: ctx.mode || "Branding",
          targetJobText: ctx.targetJobText || "",
        }),
      });

      const json = (await res.json()) as SectionResponse | { error?: string };

      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error ||
            `Failed to generate ${section}.`
        );
      }

      const out = json as SectionResponse;

      setSections((prev) => ({
        ...prev,
        [section]: {
          status: "success",
          data: out.data,
        },
      }));
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : `Failed to generate ${section}.`;
      setSections((prev) => ({
        ...prev,
        [section]: {
          ...prev[section],
          status: "error",
          error: msg,
        },
      }));
      setApiErr(msg);
    } finally {
      setActiveSection(null);
    }
  }

  return (
    <main className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">
              Optimization workspace
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Parse first. Then optimize one section at a time.
            </h1>
            <p className="mt-4 text-white/68">
              This workflow reduces request bursts, lowers failure risk, and
              makes each output easier to review and copy.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-xl border border-white/10 bg-black/25 px-4 py-2.5 text-sm text-white/80 transition hover:border-white/20 hover:text-white"
            >
              Back to overview
            </Link>

            <button
              onClick={parseResume}
              disabled={parseLoading}
              className={[
                "rounded-xl px-5 py-2.5 text-sm font-semibold transition",
                parseLoading
                  ? "bg-white/10 text-white/45"
                  : "bg-[color:var(--luna-200)] text-[#001018] hover:bg-[color:var(--luna-100)]",
              ].join(" ")}
            >
              {parseLoading ? "Parsing..." : "Parse resume"}
            </button>
          </div>
        </div>
      </section>

      {parseLoading ? (
        <LoadingState
          title="Parsing resume"
          stepIndex={parseStep}
          steps={["Uploading resume", "Extracting text", "Structuring profile"]}
        />
      ) : null}

      {apiErr ? (
        <div className="rounded-2xl border border-[color:var(--luna-200)]/30 bg-[color:var(--luna-400)]/20 p-4 text-white">
          {apiErr}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-4">
          <ResumeUpload
            onFile={(f) => {
              setFile(f);
              setFileErr(null);
            }}
            fileName={file?.name}
            error={fileErr ?? undefined}
          />

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <div className="text-base font-semibold text-white">
              Workflow notes
            </div>
            <div className="mt-1 text-sm leading-6 text-white/62">
              This workspace is designed to keep the process lighter and more
              stable. Instead of sending one heavy request, you parse once and
              then generate only the section you need.
            </div>

            <div className="mt-4 grid gap-2">
              {[
                "Step 1: parse the resume once.",
                "Step 2: generate only the section you need.",
                "Step 3: copy, refine, and iterate section by section.",
                "Start with Headline and About first for the fastest progress.",
              ].map((note) => (
                <div
                  key={note}
                  className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white/64"
                >
                  {note}
                </div>
              ))}
            </div>
          </div>
        </div>

        <OptimizationSettings value={ctx} onChange={setCtx} />
      </section>

      {structured ? (
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-lg font-semibold text-white">
                Parsed profile preview
              </div>
              <div className="mt-1 text-sm text-white/62">
                Resume successfully parsed. You can now generate sections
                individually.
              </div>
            </div>

            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/55">
              Session: {parsedId}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/42">
                Name
              </div>
              <div className="mt-2 text-white/90">
                {structured.basics?.name || "Not found"}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/42">
                Target role
              </div>
              <div className="mt-2 text-white/90">
                {ctx.targetRole || "Not set"}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-white/42">
                Experience entries
              </div>
              <div className="mt-2 text-white/90">
                {structured.experience?.length || 0}
              </div>
            </div>
          </div>

          {topPreview.length ? (
            <div className="mt-5">
              <div className="mb-2 text-sm font-medium text-white/80">
                Top parsed skills
              </div>
              <div className="flex flex-wrap gap-2">
                {topPreview.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/72"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {structured ? (
        <section className="space-y-4">
          <div>
            <div className="text-xl font-semibold text-white">
              Section generation
            </div>
            <div className="mt-1 text-sm text-white/60">
              Generate one section at a time and copy the result directly into
              LinkedIn.
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {SECTION_ORDER.map((item) => {
              const state = sections[item.key];
              const busy = activeSection === item.key;

              return (
                <div
                  key={item.key}
                  className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">
                        {item.title}
                      </div>
                      <div className="mt-1 text-sm leading-6 text-white/62">
                        {item.desc}
                      </div>
                    </div>

                    <div
                      className={[
                        "rounded-full px-2.5 py-1 text-[11px]",
                        state.status === "success"
                          ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                          : state.status === "error"
                          ? "border border-[color:var(--luna-200)]/20 bg-[color:var(--luna-400)]/20 text-white"
                          : state.status === "loading"
                          ? "border border-white/10 bg-white/10 text-white/70"
                          : "border border-white/10 bg-black/20 text-white/45",
                      ].join(" ")}
                    >
                      {state.status}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => generateSection(item.key)}
                      disabled={!!activeSection}
                      className={[
                        "rounded-xl px-4 py-2 text-sm font-semibold transition",
                        busy
                          ? "bg-white/10 text-white/45"
                          : "bg-[color:var(--luna-200)] text-[#001018] hover:bg-[color:var(--luna-100)]",
                      ].join(" ")}
                    >
                      {busy
                        ? "Generating..."
                        : state.status === "success"
                        ? "Regenerate"
                        : "Generate"}
                    </button>

                    {state.data ? (
                      <button
                        onClick={async () => {
                          await copySectionOutput(item.key, state.data);
                          setCopiedSection(item.key);
                        }}
                        className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/80 transition hover:border-white/20"
                      >
                        {copiedSection === item.key ? "Copied" : "Copy"}
                      </button>
                    ) : null}
                  </div>

                  {state.error ? (
                    <div className="mt-4 rounded-xl border border-[color:var(--luna-200)]/25 bg-[color:var(--luna-400)]/15 px-3 py-2 text-sm text-white">
                      {state.error}
                    </div>
                  ) : null}

                  {state.data ? (
                    <pre className="mt-4 max-h-80 overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-7 text-white/84 whitespace-pre-wrap">
                      {formatSectionOutput(item.key, state.data)}
                    </pre>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/42">
                      No output yet.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <div className="text-lg font-semibold text-white">
          Profile photo generation
        </div>
        <div className="mt-2 text-sm leading-6 text-white/66">
          This feature is temporarily unavailable in the current version.
        </div>
        <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/68">
          If you need help generating a professional LinkedIn profile photo or
          cover banner, reach out for assistance. For now, this workspace is
          focused on resume parsing and LinkedIn profile optimization.
        </div>
      </section>
    </main>
  );
}