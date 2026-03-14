"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth, useClerk } from "@clerk/nextjs";

import { ResumeUpload } from "@/components/ResumeUpload";
import { OptimizationSettings } from "@/components/OptimizationSettings";

import type {
  OptimizeMode,
  SectionKey,
  Seniority,
  StructuredResume,
  UserContext,
} from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type SectionState<T = unknown> = {
  status: "idle" | "loading" | "success" | "error";
  data?: T;
  error?: string;
};

type ParseResponse = {
  id: string;
  structured: StructuredResume;
  preview?: { name?: string; currentTitle?: string; topSkills?: string[] };
};

type SectionResponse = { section: SectionKey; data: unknown };
type Tab = "sections" | "ats" | "keywords";

interface ATSCategory {
  label: string;
  score: number;
  max: number;
}

interface ATSIssue {
  severity: "critical" | "warning" | "suggestion";
  message: string;
  fix: string;
}

interface ATSResult {
  overallScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  categories: ATSCategory[];
  issues: ATSIssue[];
  keywordsFound: string[];
  keywordsMissing: string[];
  summary: string;
}

type CertificationItem = {
  name?: string;
  issuer?: string;
  issueMonth?: string;
  issueYear?: string;
  expiryMonth?: string;
  expiryYear?: string;
  credentialId?: string;
  credentialUrl?: string;
};

type ProjectItem = {
  name?: string;
  url?: string;
  description?: string;
  skills?: string[];
  startMonth?: string;
  startYear?: string;
  endMonth?: string;
  endYear?: string;
  currentlyWorking?: boolean;
  associatedWith?: string;
};

type ExperienceItem = {
  title?: string;
  company?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  bullets?: string[];
  skills?: string[];
};

type RazorpayCheckoutResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutInstance = {
  open: () => void;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayCheckoutResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
};

type CreateOrderResponse = {
  ok: boolean;
  orderId: string;
  amount: number;
  currency: string;
  keyId?: string;
  error?: string;
};

type VerifyPaymentResponse = {
  ok: boolean;
  error?: string;
};

type WorkspaceSummary = {
  id: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_ORDER: Array<{ key: SectionKey; title: string; desc: string; icon: string }> = [
  { key: "headline", title: "Headline", desc: "220-character LinkedIn headline optimized for your target role.", icon: "✦" },
  { key: "about", title: "About", desc: "200-400 word summary that hooks and converts.", icon: "◎" },
  { key: "experience", title: "Experience", desc: "Rewrite role bullets with impact and strong action verbs.", icon: "◈" },
  { key: "skills", title: "Skills", desc: "25-40 keywords tuned to recruiter searches.", icon: "⬡" },
  { key: "certifications", title: "Certifications", desc: "Normalize and reorder certifications by relevance.", icon: "✪" },
  { key: "projects", title: "Projects", desc: "Clarify tech stack, scope, and measurable outcome.", icon: "◧" },
  { key: "banner_tagline", title: "Banner Tagline", desc: "3-8 word tagline for your LinkedIn banner image.", icon: "▣" },
  { key: "positioning_advice", title: "Strategy", desc: "Full positioning angle, keyword plan, and outreach pitch.", icon: "⚡" },
];

const LI_BLUE = "#0a66c2";
const LI_LIGHT = "#378fe9";
const LI_SUBTLE = "rgba(10,102,194,0.15)";
const LI_BORDER = "rgba(10,102,194,0.3)";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function normalizeSections(
  input?: Partial<Record<SectionKey, SectionState>> | null
): Record<SectionKey, SectionState> {
  return {
    ...makeInitialSections(),
    ...(input || {}),
  };
}

function countSuccessfulSections(
  input?: Record<SectionKey, SectionState> | null
): number {
  if (!input) return 0;
  return Object.values(input).filter((section) => section?.status === "success").length;
}

function prettyPrint(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function stripEmDash(text: string): string {
  return text.replace(/\u2014/g, " - ").replace(/  +/g, " ").trim();
}

function formatSectionOutput(section: SectionKey, data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return stripEmDash(data);

  switch (section) {
    case "headline":
    case "about":
    case "banner_tagline":
    case "positioning_advice":
      return typeof data === "string" ? stripEmDash(data) : prettyPrint(data);

    case "skills": {
      if (!Array.isArray(data)) return prettyPrint(data);
      const skills = data as string[];
      const CATS: [string, RegExp][] = [
        ["Programming Languages", /\b(python|scala|java|go|rust|c\+\+|r\b|sql|bash|shell|typescript|javascript|node)\b/i],
        ["Data & ETL Frameworks", /\b(spark|pyspark|hadoop|hive|kafka|flink|airflow|dbt|beam|nifi|ssis|matillion|talend|informatica|sqoop|flume)\b/i],
        ["Cloud & Infrastructure", /\b(aws|azure|gcp|google cloud|snowflake|databricks|redshift|bigquery|s3|ec2|lambda|terraform|kubernetes|docker|ci\/cd)\b/i],
        ["Databases", /\b(postgresql|mysql|mongodb|redis|cassandra|elasticsearch|oracle|sql server|dynamodb|cosmos|neo4j|hbase|sqlite)\b/i],
        ["BI & Visualisation", /\b(tableau|power bi|looker|quicksight|grafana|superset|metabase|d3|plotly|matplotlib|seaborn)\b/i],
        ["Data Science & ML", /\b(machine learning|deep learning|nlp|pytorch|tensorflow|scikit|keras|feature engineering|statistics|pandas|numpy|jupyter)\b/i],
        ["Methodologies", /\b(agile|scrum|kanban|data governance|data modeling|erd|data quality|etl|elt|data mesh|data lakehouse|dimensional modeling|devops|restful|api)\b/i],
      ];
      const assigned = new Set<string>();
      const buckets: Record<string, string[]> = {};

      for (const [cat, re] of CATS) {
        const matched = skills.filter((s) => !assigned.has(s) && re.test(s));
        if (matched.length) {
          buckets[cat] = matched;
          matched.forEach((s) => assigned.add(s));
        }
      }

      const leftover = skills.filter((s) => !assigned.has(s));
      if (leftover.length) buckets["Other Skills"] = leftover;

      const lines: string[] = [];
      for (const [cat, items] of Object.entries(buckets)) {
        lines.push(cat + ":");
        lines.push(items.join("  •  "));
        lines.push("");
      }

      return lines.join("\n").trim();
    }

    case "certifications": {
      if (!Array.isArray(data)) return prettyPrint(data);
      const certifications = data as CertificationItem[];

      return certifications
        .map((c, i) => {
          const certName = c.name?.trim() || "Certificate not provided";
          const issuer = c.issuer?.trim() || "Issuer not provided";
          const parts: string[] = [
            "Certification " + (i + 1),
            "Name: " + certName,
            "Issued by: " + issuer,
          ];

          const issued = [c.issueMonth, c.issueYear].filter(Boolean).join(" ");
          if (issued) parts.push("Issue date: " + issued);

          const expiry = [c.expiryMonth, c.expiryYear].filter(Boolean).join(" ");
          if (expiry) parts.push("Expiration: " + expiry);

          if (c.credentialId) parts.push("Credential ID: " + c.credentialId);
          if (c.credentialUrl) parts.push("Credential URL: " + c.credentialUrl);

          return parts.join("\n");
        })
        .join("\n\n");
    }

    case "projects": {
      if (!Array.isArray(data)) return prettyPrint(data);
      const projects = data as ProjectItem[];

      return projects
        .map((p, i) => {
          const projectName =
            p.name?.trim() ||
            p.associatedWith?.trim() ||
            (p.description?.trim()
              ? p.description.trim().split(".")[0].slice(0, 60)
              : `Project ${i + 1}`);

          const parts: string[] = ["Project " + (i + 1) + ": " + projectName];

          if (p.url) parts.push("URL: " + p.url);
          if (p.description) parts.push("Description:\n" + p.description);

          if (Array.isArray(p.skills) && p.skills.length) {
            parts.push("Skills (top 5): " + p.skills.slice(0, 5).join(", "));
          }

          const start = [p.startMonth, p.startYear].filter(Boolean).join(" ");
          if (start) parts.push("Start date: " + start);

          if (p.currentlyWorking) {
            parts.push("Currently working: Yes");
          } else {
            const end = [p.endMonth, p.endYear].filter(Boolean).join(" ");
            if (end) parts.push("End date: " + end);
          }

          if (p.associatedWith) parts.push("Associated with: " + p.associatedWith);

          return parts.join("\n");
        })
        .join("\n\n");
    }

    case "experience": {
      if (!Array.isArray(data)) return prettyPrint(data);
      const roles = data as ExperienceItem[];

      return roles
        .map((r) => {
          const header = [r.title, r.company].filter(Boolean).join(" at ");
          const dates = [r.startDate, r.endDate].filter(Boolean).join(" - ");
          const meta = [dates, r.location].filter(Boolean).join("  |  ");
          const bullets = Array.isArray(r.bullets)
            ? r.bullets.map((b) => "  • " + stripEmDash(b)).join("\n")
            : "";
          const skills =
            Array.isArray(r.skills) && r.skills.length
              ? "\nSkills: " + r.skills.slice(0, 8).join(", ")
              : "";

          return [header, meta, bullets, skills].filter(Boolean).join("\n");
        })
        .join("\n\n");
    }

    default:
      return prettyPrint(data);
  }
}

async function copySectionOutput(section: SectionKey, data: unknown) {
  const text = formatSectionOutput(section, data);
  if (text) await navigator.clipboard.writeText(text);
}

let razorpayScriptPromise: Promise<boolean> | null = null;

function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    ) as HTMLScriptElement | null;

    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
}

// ─── ATS scorer ───────────────────────────────────────────────────────────────

function scoreResumeDeterministic(structured: StructuredResume, targetRole: string): ATSResult {
  const issues: ATSIssue[] = [];
  const categories: ATSCategory[] = [];

  let comp = 25;
  if (!structured.basics?.name?.trim()) {
    comp -= 5;
    issues.push({
      severity: "critical",
      message: "Name not detected in parsed resume",
      fix: "Ensure your name is plain text on the first line — not inside a text box, table, or image.",
    });
  }
  if (!structured.basics?.email?.trim()) {
    comp -= 3;
    issues.push({
      severity: "warning",
      message: "Email address not detected",
      fix: "Add a plaintext email outside of tables or header images.",
    });
  }
  if (!(structured.experience || []).length) {
    comp -= 10;
    issues.push({
      severity: "critical",
      message: "No experience entries parsed",
      fix: "Experience section may be in a layout the parser can't read. Use single-column plain text.",
    });
  }
  if ((structured.skills || []).length < 5) {
    comp -= 5;
    issues.push({
      severity: "warning",
      message: `Only ${(structured.skills || []).length} skills detected`,
      fix: "Add a dedicated Skills section with 10-20 tools and technologies in plain text.",
    });
  }
  if (!(structured.education || []).length) {
    comp -= 2;
    issues.push({
      severity: "suggestion",
      message: "No education entries detected",
      fix: "Add an Education section — many ATS systems filter on degree.",
    });
  }
  categories.push({ label: "Completeness", score: Math.max(0, comp), max: 25 });

  let fmt = 20;
  const allBullets = (structured.experience || []).flatMap((r) => r.bullets || []);
  const avgLen = allBullets.length
    ? allBullets.reduce((s, b) => s + b.split(/\s+/).length, 0) / allBullets.length
    : 0;

  if (avgLen > 35) {
    fmt -= 5;
    issues.push({
      severity: "warning",
      message: `Average bullet length ${Math.round(avgLen)} words (ideal: 15-25)`,
      fix: "Tighten bullets to one idea each. Action verb > scope > impact.",
    });
  }
  if (avgLen > 0 && avgLen < 8) {
    fmt -= 4;
    issues.push({
      severity: "warning",
      message: "Bullets are too short for ATS keyword matching",
      fix: "Expand bullets: what you did, with which tool, and what the outcome was.",
    });
  }
  const sparseRoles = (structured.experience || []).filter((r) => (r.bullets || []).length < 2);
  if (sparseRoles.length) {
    fmt -= 4;
    issues.push({
      severity: "warning",
      message: `${sparseRoles.length} role(s) have fewer than 2 bullets`,
      fix: "Each role needs 2-5 bullets to be visible to ATS scanners.",
    });
  }
  categories.push({ label: "Formatting", score: Math.max(0, fmt), max: 20 });

  let impact = 20;
  const WEAK = [
    "responsible for",
    "helped",
    "assisted",
    "worked on",
    "involved in",
    "participated in",
    "supported",
    "contributed to",
  ];
  const weakCount = allBullets.filter((b) =>
    WEAK.some((w) => b.toLowerCase().startsWith(w))
  ).length;

  if (weakCount) {
    impact -= Math.min(10, weakCount * 3);
    issues.push({
      severity: weakCount >= 3 ? "critical" : "warning",
      message: `${weakCount} bullet(s) start with weak phrases like "Responsible for"`,
      fix: `Replace with strong past-tense verbs: "Automated", "Reduced", "Delivered", "Led", "Built".`,
    });
  }

  const metricRatio = allBullets.length
    ? allBullets.filter((b) => /\d+[\s%xX]|[$£€]\d|\d+[km+]/i.test(b)).length / allBullets.length
    : 0;

  if (metricRatio < 0.25 && allBullets.length >= 4) {
    impact -= 6;
    issues.push({
      severity: "warning",
      message: `Only ${Math.round(metricRatio * 100)}% of bullets have measurable outcomes (target: 30%+)`,
      fix: "Add numbers, percentages, dollar amounts, or team sizes wherever plausible.",
    });
  }
  categories.push({ label: "Impact Language", score: Math.max(0, impact), max: 20 });

  let align = 15;
  const roleWords = targetRole.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const titlesText = (structured.experience || []).map((r) => r.title?.toLowerCase() || "").join(" ");
  const matches = roleWords.filter((w) => titlesText.includes(w)).length;

  if (roleWords.length && matches < Math.ceil(roleWords.length / 2)) {
    align -= 6;
    issues.push({
      severity: "warning",
      message: `Job titles don't closely match "${targetRole}"`,
      fix: "Bridge the gap in your About section by naming the target role and framing your history toward it.",
    });
  }
  categories.push({ label: "Role Alignment", score: Math.max(0, align), max: 15 });

  categories.push({ label: "Keyword Match", score: 10, max: 20 });
  issues.push({
    severity: "suggestion",
    message: "Paste a job description for deeper keyword analysis",
    fix: "Adding a JD to the Optimization Context panel enables per-keyword gap scoring.",
  });

  const rawTotal = categories.reduce((s, c) => s + c.score, 0);
  const maxTotal = categories.reduce((s, c) => s + c.max, 0);
  const overallScore = Math.round((rawTotal / maxTotal) * 100);
  const grade =
    overallScore >= 85 ? "A" : overallScore >= 70 ? "B" : overallScore >= 55 ? "C" : overallScore >= 40 ? "D" : "F";

  const keywordsFound = (structured.skills || []).slice(0, 8);
  const COMMON_GAPS: Record<string, string[]> = {
    "data analyst": ["SQL", "Tableau", "Power BI", "Excel", "Statistics", "DAX"],
    "data engineer": ["SQL", "dbt", "Kafka", "Spark", "Airflow", "Databricks"],
    "software engineer": ["TypeScript", "Docker", "Kubernetes", "CI/CD", "REST API", "GraphQL"],
    "product manager": ["Roadmapping", "A/B Testing", "SQL", "Figma", "OKRs", "Stakeholder Management"],
  };
  const roleKey = Object.keys(COMMON_GAPS).find((k) => targetRole.toLowerCase().includes(k));
  const allSkillsLower = (structured.skills || []).map((s) => s.toLowerCase());
  const keywordsMissing = roleKey
    ? (COMMON_GAPS[roleKey] || [])
        .filter((k) => !allSkillsLower.some((s) => s.includes(k.toLowerCase())))
        .slice(0, 6)
    : [];

  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const summary =
    overallScore >= 80
      ? `Strong ATS profile.${
          criticalCount ? ` Fix ${criticalCount} critical issue(s) to reach tier A.` : " Focus on keyword density to maximise recruiter ranking."
        }`
      : overallScore >= 60
        ? `Solid foundation with gaps. ${criticalCount} critical issue(s) need fixing before applying.`
        : `Significant ATS issues detected. ${criticalCount} critical — start there before applying to roles.`;

  return { overallScore, grade, categories, issues, keywordsFound, keywordsMissing, summary };
}

// ─── Animated counter ─────────────────────────────────────────────────────────

function AnimatedNumber({ to, duration = 900 }: { to: number; duration?: number }) {
  const [val, setVal] = useState(0);

  useEffect(() => {
    let cur = 0;
    const step = Math.max(1, Math.ceil(to / (duration / 16)));
    const id = setInterval(() => {
      cur = Math.min(cur + step, to);
      setVal(cur);
      if (cur >= to) clearInterval(id);
    }, 16);

    return () => clearInterval(id);
  }, [to, duration]);

  return <>{val}</>;
}

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const [drawn, setDrawn] = useState(0);
  const r = 52;
  const circ = 2 * Math.PI * r;
  const ringColor = score >= 80 ? LI_BLUE : score >= 60 ? "#f59e0b" : "#ef4444";

  useEffect(() => {
    const t = setTimeout(() => setDrawn(score), 250);
    return () => clearTimeout(t);
  }, [score]);

  return (
    <div style={{ position: "relative", width: 128, height: 128, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: ringColor, opacity: 0.08, filter: "blur(18px)" }} />
      <svg width="128" height="128" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth="9"
          strokeDasharray={circ}
          strokeDashoffset={circ - (drawn / 100) * circ}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.3s cubic-bezier(0.34,1.4,0.64,1)" }}
        />
      </svg>
      <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1 }}>
        <span style={{ fontSize: 34, fontWeight: 800, color: ringColor }}>{grade}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace", marginTop: 3 }}>{score}/100</span>
      </div>
    </div>
  );
}

// ─── Category bar ─────────────────────────────────────────────────────────────

function CatBar({ cat, delay }: { cat: ATSCategory; delay: number }) {
  const [w, setW] = useState(0);
  const pct = Math.round((cat.score / cat.max) * 100);
  const color = pct >= 80 ? LI_BLUE : pct >= 55 ? "#f59e0b" : "#ef4444";

  useEffect(() => {
    const t = setTimeout(() => setW(pct), delay);
    return () => clearTimeout(t);
  }, [pct, delay]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
        <span>{cat.label}</span>
        <span style={{ fontFamily: "monospace" }}>
          {cat.score}/{cat.max}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            borderRadius: 99,
            width: w + "%",
            background: color,
            boxShadow: "0 0 8px " + color + "66",
            transition: "width 1s cubic-bezier(0.34,1.2,0.64,1)",
          }}
        />
      </div>
    </div>
  );
}

// ─── Issue row ────────────────────────────────────────────────────────────────

function IssueRow({ issue, delay }: { issue: ATSIssue; delay: number }) {
  const [vis, setVis] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVis(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const SEV = {
    critical: { dot: "#ef4444", text: "#fca5a5", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)" },
    warning: { dot: "#f59e0b", text: "#fcd34d", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)" },
    suggestion: { dot: LI_BLUE, text: "#93c5fd", bg: "rgba(10,102,194,0.08)", border: LI_BORDER },
  }[issue.severity];

  return (
    <div
      onClick={() => setOpen((x) => !x)}
      style={{
        borderRadius: 10,
        cursor: "pointer",
        overflow: "hidden",
        opacity: vis ? 1 : 0,
        transform: vis ? "none" : "translateX(-10px)",
        transition: `opacity 0.4s ease ${delay}ms, transform 0.4s ease ${delay}ms, background 0.2s`,
        background: open ? SEV.bg : "transparent",
        border: "1px solid " + (open ? SEV.border : "rgba(255,255,255,0.07)"),
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px" }}>
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: SEV.dot,
            boxShadow: "0 0 6px " + SEV.dot + "88",
            marginTop: 4,
            flexShrink: 0,
          }}
        />
        <p style={{ fontSize: 12, flex: 1, lineHeight: 1.5, color: SEV.text }}>{issue.message}</p>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ padding: "0 12px 10px 29px" }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{issue.fix}</p>
        </div>
      )}
    </div>
  );
}

// ─── Keyword chip ─────────────────────────────────────────────────────────────

function KwChip({ word, found, delay }: { word: string; found: boolean; delay: number }) {
  const [vis, setVis] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVis(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 10px",
        borderRadius: 99,
        fontSize: 11,
        fontFamily: "monospace",
        fontWeight: 500,
        opacity: vis ? 1 : 0,
        transform: vis ? "none" : "translateY(6px) scale(0.9)",
        transition: "all 0.35s ease",
        background: found ? "rgba(10,102,194,0.12)" : "rgba(239,68,68,0.1)",
        border: "1px solid " + (found ? LI_BORDER : "rgba(239,68,68,0.3)"),
        color: found ? "#93c5fd" : "#fca5a5",
      }}
    >
      {found ? "✓" : "✗"} {word}
    </span>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({
  item,
  state,
  busy,
  copiedSection,
  queuePosition,
  genAllRunning,
  onCopy,
}: {
  item: typeof SECTION_ORDER[0];
  state: SectionState;
  busy: boolean;
  copiedSection: SectionKey | null;
  queuePosition?: number | null;
  genAllRunning?: boolean;
  onCopy: (k: SectionKey) => void;
}) {
  const isDone = state.status === "success";
  const isLoading = state.status === "loading";
  const isError = state.status === "error";
  const hasData = state.data !== undefined && state.data !== null;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (isDone) setExpanded(true);
  }, [isDone]);

  const statusColors = {
    idle: { bg: "rgba(255,255,255,0.04)", text: "rgba(255,255,255,0.3)", border: "rgba(255,255,255,0.08)" },
    loading: { bg: "rgba(10,102,194,0.12)", text: "#93c5fd", border: LI_BORDER },
    success: { bg: "rgba(34,197,94,0.08)", text: "#86efac", border: "rgba(34,197,94,0.25)" },
    error: { bg: "rgba(239,68,68,0.08)", text: "#fca5a5", border: "rgba(239,68,68,0.2)" },
  }[state.status];

  const primaryLabel = busy
    ? "Generating..."
    : isDone
      ? "Generated"
      : genAllRunning
        ? queuePosition && queuePosition > 0
          ? `Queued #${queuePosition}`
          : "Queued"
        : "Included in Generate All";

  return (
    <div
      style={{
        borderRadius: 20,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: isDone ? "rgba(10,102,194,0.07)" : "rgba(255,255,255,0.03)",
        border: "1px solid " + (isDone ? LI_BORDER : isError ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)"),
        transition: "border-color 0.3s, background 0.3s",
        backdropFilter: "blur(12px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "18px 20px 14px", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              background: isDone ? LI_SUBTLE : "rgba(255,255,255,0.05)",
              border: "1px solid " + (isDone ? LI_BORDER : "rgba(255,255,255,0.08)"),
              color: isDone ? LI_LIGHT : "rgba(255,255,255,0.3)",
              transition: "all 0.3s",
            }}
          >
            {item.icon}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "white", lineHeight: 1.2 }}>{item.title}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 3, lineHeight: 1.4 }}>{item.desc}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {genAllRunning &&
            !busy &&
            state.status !== "success" &&
            queuePosition !== null &&
            queuePosition !== undefined &&
            queuePosition > 0 && (
              <div
                style={{
                  padding: "3px 9px",
                  borderRadius: 99,
                  fontSize: 10,
                  fontWeight: 600,
                  background: "rgba(245,158,11,0.1)",
                  border: "1px solid rgba(245,158,11,0.25)",
                  color: "#fcd34d",
                }}
              >
                #{queuePosition}
              </div>
            )}
          <div
            style={{
              padding: "3px 10px",
              borderRadius: 99,
              fontSize: 11,
              fontWeight: 500,
              background: statusColors.bg,
              border: "1px solid " + statusColors.border,
              color: statusColors.text,
            }}
          >
            {isLoading ? (
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: LI_LIGHT, animation: "liDot 1.2s ease-in-out 0s infinite" }} />
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: LI_LIGHT, animation: "liDot 1.2s ease-in-out 0.2s infinite" }} />
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: LI_LIGHT, animation: "liDot 1.2s ease-in-out 0.4s infinite" }} />
              </span>
            ) : (
              state.status
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, padding: "0 20px 16px", flexWrap: "wrap" }}>
        <button
          disabled
          style={{
            padding: "8px 18px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: "default",
            background: busy ? "rgba(255,255,255,0.07)" : isDone ? "rgba(10,102,194,0.15)" : "rgba(255,255,255,0.05)",
            border: "1px solid " + (isDone ? LI_BORDER : "rgba(255,255,255,0.1)"),
            color: busy ? "rgba(255,255,255,0.5)" : isDone ? "#93c5fd" : "rgba(255,255,255,0.45)",
            boxShadow: "none",
            transition: "all 0.2s",
          }}
        >
          {primaryLabel}
        </button>

        {hasData && (
          <button
            onClick={() => onCopy(item.key)}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              background: copiedSection === item.key ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)",
              border: "1px solid " + (copiedSection === item.key ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.1)"),
              color: copiedSection === item.key ? "#86efac" : "rgba(255,255,255,0.7)",
              transition: "all 0.2s",
            }}
          >
            {copiedSection === item.key ? "✓ Copied" : "Copy"}
          </button>
        )}

        {isDone && hasData && (
          <button
            onClick={() => setExpanded((x) => !x)}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              fontSize: 13,
              cursor: "pointer",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.4)",
              transition: "all 0.2s",
              marginLeft: "auto",
            }}
          >
            {expanded ? "▲ Hide" : "▼ View"}
          </button>
        )}
      </div>

      {state.error && (
        <div
          style={{
            margin: "0 20px 16px",
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 12,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            color: "#fca5a5",
          }}
        >
          {state.error}
        </div>
      )}

      {hasData && (
        <div style={{ maxHeight: expanded ? 320 : 0, overflow: "hidden", transition: "max-height 0.4s cubic-bezier(0.4,0,0.2,1)" }}>
          <pre
            style={{
              margin: "0 20px 20px",
              padding: "14px 16px",
              borderRadius: 12,
              fontSize: 12,
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.8)",
              overflowY: "auto",
              maxHeight: 280,
            }}
          >
            {formatSectionOutput(item.key, state.data)}
          </pre>
        </div>
      )}

      {!hasData && state.status === "idle" && <div style={{ height: 4 }} />}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OptimizePage() {
  const searchParams = useSearchParams();
  const requestedWorkspaceId = (searchParams.get("workspaceId") || "").trim();

  const { isLoaded, isSignedIn, userId } = useAuth();
  const { openSignIn } = useClerk();

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
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [structured, setStructured] = useState<StructuredResume | null>(null);
  const [sections, setSections] = useState<Record<SectionKey, SectionState>>(makeInitialSections());
  const [activeSection, setActiveSection] = useState<SectionKey | null>(null);
  const [copiedSection, setCopiedSection] = useState<SectionKey | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>("sections");
  const [atsResult, setAtsResult] = useState<ATSResult | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsRan, setAtsRan] = useState(false);
  const [pageLoaded, setPageLoaded] = useState(false);
  const [isGenerateAllUnlocked, setIsGenerateAllUnlocked] = useState(false);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [genAllRunning, setGenAllRunning] = useState(false);
  const [genAllIndex, setGenAllIndex] = useState<number>(-1);

  const resultsRef = useRef<HTMLDivElement>(null);
  const genAllAbort = useRef<boolean>(false);
  const sectionsRef = useRef<Record<SectionKey, SectionState>>(sections);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("linkedup_sections_json", JSON.stringify(sections));
  }, [sections]);

  useEffect(() => {
    const t = setTimeout(() => setPageLoaded(true), 60);
    return () => clearTimeout(t);
  }, []);

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

  useEffect(() => {
    if (structured && ctx.targetRole) {
      setAtsResult(scoreResumeDeterministic(structured, ctx.targetRole));
      setAtsRan(true);
    }
  }, [structured, ctx.targetRole]);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const topPreview = useMemo(() => (structured?.skills || []).slice(0, 10), [structured]);
  const doneCount = Object.values(sections).filter((s) => s.status === "success").length;
  const PARSE_STEPS = ["Uploading resume", "Extracting text", "Structuring profile"];

  function validateBeforeParse(): string | null {
    if (!file) return "Please upload a PDF or DOCX resume.";
    if (!ctx.targetRole.trim()) return "Target role is required.";
    return null;
  }
  function canGenerateFromCurrentState(): boolean {
    return Boolean(parsedId || getCurrentWorkspaceId());
  }
  function getCurrentWorkspaceId(): string {
    return (
      requestedWorkspaceId ||
      workspaceId ||
      localStorage.getItem("linkedup_workspace_id") ||
      ""
    );
  }

  async function parseJsonOrThrow<T>(res: Response): Promise<T> {
    const json = await res.json();

    if (res.status === 401) {
      openSignIn?.();
      throw new Error("Please sign in to continue.");
    }

    if (!res.ok) {
      throw new Error((json as { error?: string }).error || "Request failed.");
    }

    return json as T;
  }

  function savePendingGenerateAllIntent() {
    if (typeof window === "undefined") return;

    localStorage.setItem("linkedup_pending_generate_all", "1");

    if (parsedId) {
      localStorage.setItem("linkedup_pending_parsed_id", parsedId);
    }

    if (structured) {
      localStorage.setItem("linkedup_pending_structured_json", JSON.stringify(structured));
    }

    if (workspaceId) {
      localStorage.setItem("linkedup_workspace_id", workspaceId);
    }

    localStorage.setItem("linkedup_pending_ctx_json", JSON.stringify(ctx));
  }

  async function getLatestWorkspaceIdForUser(clerkUserId: string): Promise<string> {
    const workerBase = process.env.NEXT_PUBLIC_LINKEDUP_WORKER_URL;
    if (!workerBase) throw new Error("Missing NEXT_PUBLIC_LINKEDUP_WORKER_URL.");

    const res = await fetch(`${workerBase}/workspaces?userId=${encodeURIComponent(clerkUserId)}`, {
      method: "GET",
      cache: "no-store",
    });

    const json = await res.json();

    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || "Failed to load workspaces.");
    }

    const workspaces = (json.workspaces || []) as WorkspaceSummary[];
    return workspaces[0]?.id || "";
  }

  async function getWorkerWorkspace(currentWorkspaceId: string): Promise<{
    workspace: {
      structured_json?: string | null;
      ctx_json?: string | null;
      section_results_json?: string | null;
      is_paid?: number | boolean | null;
    };
  }> {
    const workerBase = process.env.NEXT_PUBLIC_LINKEDUP_WORKER_URL;
    if (!workerBase) throw new Error("Missing NEXT_PUBLIC_LINKEDUP_WORKER_URL.");

    const res = await fetch(`${workerBase}/workspace/get?id=${encodeURIComponent(currentWorkspaceId)}`, {
      method: "GET",
      cache: "no-store",
    });

    const json = await res.json();

    if (!res.ok || !json?.ok || !json?.workspace) {
      throw new Error(json?.error || "Failed to load workspace.");
    }

    return json as {
      workspace: {
        structured_json?: string | null;
        ctx_json?: string | null;
        section_results_json?: string | null;
        is_paid?: number | boolean | null;
      };
    };
  }

  async function saveParsedWorkspaceToWorker(
    currentWorkspaceId: string,
    structuredData: StructuredResume,
    contextData: UserContext,
    sectionResults: Record<SectionKey, SectionState>
  ): Promise<void> {
    const workerBase = process.env.NEXT_PUBLIC_LINKEDUP_WORKER_URL;
    if (!workerBase) throw new Error("Missing NEXT_PUBLIC_LINKEDUP_WORKER_URL.");

    const res = await fetch(`${workerBase}/workspace/save-parsed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: currentWorkspaceId,
        userId: userId || "",
        structured: structuredData,
        ctx: contextData,
        sectionResults,
      }),
    });

    const json = await res.json();

    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || "Failed to save parsed workspace.");
    }
  }

  async function createWorkerWorkspace(uploadFile: File): Promise<string> {
    const workerBase = process.env.NEXT_PUBLIC_LINKEDUP_WORKER_URL;
    if (!workerBase) throw new Error("Missing NEXT_PUBLIC_LINKEDUP_WORKER_URL.");

    const form = new FormData();
    form.set("file", uploadFile);

    if (userId) {
      form.set("userId", userId);
    }

    const res = await fetch(`${workerBase}/resume/upload`, {
      method: "POST",
      body: form,
    });

    const json = await res.json();

    if (!res.ok || !json?.ok || !json?.workspaceId) {
      throw new Error(json?.error || "Failed to create workspace.");
    }

    return json.workspaceId as string;
  }

  // ─── Restore workspace ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return;
  
    if (!isSignedIn) {
      setWorkspaceId("");
      setParsedId("");
      setStructured(null);
      setSections(makeInitialSections());
      setIsGenerateAllUnlocked(false);
  
      localStorage.removeItem("linkedup_workspace_id");
      localStorage.removeItem("linkedup_parsed_id");
      localStorage.removeItem("linkedup_structured_json");
      localStorage.removeItem("linkedup_ctx_json");
      localStorage.removeItem("linkedup_sections_json");
      return;
    }
  
    let cancelled = false;
  
    const restore = async () => {
      try {
        const storedWorkspaceId = localStorage.getItem("linkedup_workspace_id") || "";
        const isWorkspaceSwitch =
          !!requestedWorkspaceId &&
          !!storedWorkspaceId &&
          requestedWorkspaceId !== storedWorkspaceId;
  
        let localParsedId = "";
        let localStructured: StructuredResume | null = null;
        let localCtx: UserContext | null = null;
        let localSections = makeInitialSections();
  
        if (!isWorkspaceSwitch) {
          const savedParsedId = localStorage.getItem("linkedup_parsed_id") || "";
          const savedStructuredJson = localStorage.getItem("linkedup_structured_json");
          const savedCtxJson = localStorage.getItem("linkedup_ctx_json");
          const savedSectionsJson = localStorage.getItem("linkedup_sections_json");
  
          localParsedId = savedParsedId;
  
          if (savedStructuredJson) {
            try {
              localStructured = JSON.parse(savedStructuredJson) as StructuredResume;
            } catch {
              localStructured = null;
            }
          }
  
          if (savedCtxJson) {
            try {
              localCtx = JSON.parse(savedCtxJson) as UserContext;
            } catch {
              localCtx = null;
            }
          }
  
          if (savedSectionsJson) {
            try {
              localSections = normalizeSections(
                JSON.parse(savedSectionsJson) as Partial<Record<SectionKey, SectionState>>
              );
            } catch {
              localSections = makeInitialSections();
            }
          }
        }
  
        let resolvedWorkspaceId =
          requestedWorkspaceId ||
          workspaceId ||
          storedWorkspaceId ||
          "";
  
        if (!resolvedWorkspaceId && userId) {
          resolvedWorkspaceId = await getLatestWorkspaceIdForUser(userId);
        }
  
        if (!resolvedWorkspaceId || cancelled) return;
  
        setWorkspaceId(resolvedWorkspaceId);
        localStorage.setItem("linkedup_workspace_id", resolvedWorkspaceId);
  
        if (localParsedId) {
          setParsedId(localParsedId);
        } else {
          setParsedId("");
        }
  
        if (localStructured) {
          setStructured(localStructured);
        } else if (isWorkspaceSwitch) {
          setStructured(null);
        }
  
        if (localCtx) {
          setCtx(localCtx);
        }
  
        setSections(localSections);
  
        const data = await getWorkerWorkspace(resolvedWorkspaceId);
        if (cancelled) return;
  
        const structuredJson = data.workspace?.structured_json;
        const ctxJson = data.workspace?.ctx_json;
        const sectionResultsJson = data.workspace?.section_results_json;
        const isPaid = data.workspace?.is_paid;
  
        let effectiveStructured = localStructured;
        let effectiveCtx: UserContext =
          localCtx || {
            targetRole: "",
            industry: "",
            seniority: "Mid",
            mode: "Branding",
            targetJobText: "",
          };
  
        if (structuredJson) {
          try {
            effectiveStructured = JSON.parse(structuredJson) as StructuredResume;
          } catch {
            // keep local
          }
        }
  
        if (ctxJson) {
          try {
            effectiveCtx = JSON.parse(ctxJson) as UserContext;
          } catch {
            // keep local
          }
        }
  
        let remoteSections: Record<SectionKey, SectionState> | null = null;
  
        if (sectionResultsJson) {
          try {
            remoteSections = normalizeSections(
              JSON.parse(sectionResultsJson) as Partial<Record<SectionKey, SectionState>>
            );
          } catch {
            remoteSections = null;
          }
        }
  
        const localSuccess = countSuccessfulSections(localSections);
        const remoteSuccess = countSuccessfulSections(remoteSections);
  
        const bestSections =
          remoteSections && remoteSuccess >= localSuccess
            ? remoteSections
            : localSuccess > 0
              ? localSections
              : remoteSections || makeInitialSections();
  
        if (effectiveStructured) {
          setStructured(effectiveStructured);
          localStorage.setItem(
            "linkedup_structured_json",
            JSON.stringify(effectiveStructured)
          );
        }
  
        setCtx(effectiveCtx);
        localStorage.setItem("linkedup_ctx_json", JSON.stringify(effectiveCtx));
  
        setSections(bestSections);
        localStorage.setItem("linkedup_sections_json", JSON.stringify(bestSections));
  
        setIsGenerateAllUnlocked(Boolean(isPaid));
  
        if (
          localSuccess > remoteSuccess &&
          effectiveStructured &&
          resolvedWorkspaceId
        ) {
          try {
            await saveParsedWorkspaceToWorker(
              resolvedWorkspaceId,
              effectiveStructured,
              effectiveCtx,
              localSections
            );
          } catch (syncError) {
            console.error(
              "Failed to backfill richer local section results to worker:",
              syncError
            );
          }
        }
      } catch (restoreError) {
        console.error("Workspace restore failed:", restoreError);
      }
    };
  
    restore();
  
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId, requestedWorkspaceId]);

  // ─── Pending generate-all intent after sign-in ─────────────────────────────

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (!structured) return;
    if (isPaymentLoading || isGenerateAllUnlocked || genAllRunning) return;

    const pending = localStorage.getItem("linkedup_pending_generate_all");
    if (pending !== "1") return;

    const pendingParsedId = localStorage.getItem("linkedup_pending_parsed_id");
    const pendingStructuredJson = localStorage.getItem("linkedup_pending_structured_json");
    const pendingCtxJson = localStorage.getItem("linkedup_pending_ctx_json");
    const savedWorkspaceId = localStorage.getItem("linkedup_workspace_id");

    if (!parsedId && pendingParsedId) {
      setParsedId(pendingParsedId);
      localStorage.setItem("linkedup_parsed_id", pendingParsedId);
    }

    if (!structured && pendingStructuredJson) {
      try {
        const parsedStructured = JSON.parse(pendingStructuredJson) as StructuredResume;
        setStructured(parsedStructured);
        localStorage.setItem("linkedup_structured_json", pendingStructuredJson);
      } catch {
        // ignore bad cache
      }
    }

    if (pendingCtxJson) {
      try {
        const parsedCtx = JSON.parse(pendingCtxJson) as UserContext;
        setCtx(parsedCtx);
        localStorage.setItem("linkedup_ctx_json", pendingCtxJson);
      } catch {
        // ignore bad cache
      }
    }

    if (savedWorkspaceId && !workspaceId) {
      setWorkspaceId(savedWorkspaceId);
    }

    const run = async () => {
      try {
        setApiErr(null);
        setIsPaymentLoading(true);

        const paid = await startGenerateAllPayment();
        if (!paid) return;

        localStorage.removeItem("linkedup_pending_generate_all");
        localStorage.removeItem("linkedup_pending_parsed_id");
        localStorage.removeItem("linkedup_pending_structured_json");
        localStorage.removeItem("linkedup_pending_ctx_json");

        setIsGenerateAllUnlocked(true);
        await generateAll();
      } catch (error: unknown) {
        setApiErr(error instanceof Error ? error.message : "Payment failed. Please try again.");
      } finally {
        setIsPaymentLoading(false);
      }
    };

    run();
  }, [isLoaded, isSignedIn, parsedId, structured, workspaceId, isPaymentLoading, isGenerateAllUnlocked, genAllRunning]);

  // ─── Actions ───────────────────────────────────────────────────────────────

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
    setWorkspaceId("");
    setStructured(null);
    setAtsResult(null);
    setAtsRan(false);
    setIsGenerateAllUnlocked(false);
    setGenAllRunning(false);
    setGenAllIndex(-1);
    setActiveSection(null);

    localStorage.removeItem("linkedup_workspace_id");
    localStorage.removeItem("linkedup_sections_json");

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

      const out = await parseJsonOrThrow<ParseResponse>(res);

      setParsedId(out.id);
      setStructured(out.structured);

      localStorage.setItem("linkedup_parsed_id", out.id);
      localStorage.setItem("linkedup_structured_json", JSON.stringify(out.structured));
      localStorage.setItem("linkedup_ctx_json", JSON.stringify(ctx));

      const newWorkspaceId = await createWorkerWorkspace(file as File);
      setWorkspaceId(newWorkspaceId);
      localStorage.setItem("linkedup_workspace_id", newWorkspaceId);

      await saveParsedWorkspaceToWorker(
        newWorkspaceId,
        out.structured,
        ctx,
        makeInitialSections()
      );

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 200);
    } catch (e: unknown) {
      setApiErr(e instanceof Error ? e.message : "Resume parsing failed.");
    } finally {
      setParseLoading(false);
    }
  }

  async function handleCopy(key: SectionKey) {
    await copySectionOutput(key, sections[key].data);
    setCopiedSection(key);
  }

  async function startGenerateAllPayment(): Promise<boolean> {
    if (!parsedId && !getCurrentWorkspaceId()) {
      throw new Error("Workspace not ready. Please parse again.");
    }

    const currentWorkspaceId = getCurrentWorkspaceId();

if (!currentWorkspaceId) {
  throw new Error("Workspace not ready. Please parse your resume again.");
}

if (!workspaceId) {
  setWorkspaceId(currentWorkspaceId);
}

    const checkoutLoaded = await loadRazorpayScript();
    if (!checkoutLoaded || !window.Razorpay) {
      throw new Error("Razorpay Checkout failed to load.");
    }

    const keyId =
      process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
      process.env.NEXT_PUBLIC_RAZORPAY_KEY ||
      "";

    if (!keyId) {
      throw new Error("Missing NEXT_PUBLIC_RAZORPAY_KEY_ID.");
    }

    const createRes = await fetch("/api/payments/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        resultId: parsedId,
        workspaceId: currentWorkspaceId,
        feature: "generate_all",
      }),
    });

    const createJson = (await createRes.json()) as CreateOrderResponse;

    if (!createRes.ok || !createJson.ok || !createJson.orderId) {
      throw new Error(createJson.error || "Failed to create payment order.");
    }

    return await new Promise<boolean>((resolve, reject) => {
      let settled = false;

      const safeResolve = (value: boolean) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };

      const safeReject = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      const checkout = new window.Razorpay!({
        key: createJson.keyId || keyId,
        amount: createJson.amount,
        currency: createJson.currency || "INR",
        name: "LinkedIn Optimizer",
        description: "Unlock Generate All",
        order_id: createJson.orderId,
        prefill: {
          name: structured?.basics?.name || "",
          email: structured?.basics?.email || "",
          contact: structured?.basics?.phone || "",
        },
        theme: {
          color: LI_BLUE,
        },
        modal: {
          ondismiss: () => safeResolve(false),
        },
        handler: async (response: RazorpayCheckoutResponse) => {
          try {
            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                resultId: parsedId,
                workspaceId: currentWorkspaceId,
                feature: "generate_all",
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyJson = (await verifyRes.json()) as VerifyPaymentResponse;

            if (!verifyRes.ok || !verifyJson.ok) {
              throw new Error(verifyJson.error || "Payment verification failed.");
            }

            safeResolve(true);
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : "Payment verification failed.";
            safeReject(new Error(message));
          }
        },
      });

      checkout.open();
    });
  }

  async function generateAll() {
    const currentWorkspaceId = getCurrentWorkspaceId();

    if (!currentWorkspaceId || genAllRunning) return;

if (!workspaceId) {
  setWorkspaceId(currentWorkspaceId);
}

    genAllAbort.current = false;
    setGenAllRunning(true);
    setApiErr(null);

    const queue = SECTION_ORDER.map((s) => s.key);

    for (let i = 0; i < queue.length; i++) {
      if (genAllAbort.current) break;

      const section = queue[i];
      if (sectionsRef.current[section]?.status === "success") continue;

      setGenAllIndex(i);
      setActiveSection(section);

      setSections((prev) => {
        const next = {
          ...prev,
          [section]: { ...prev[section], status: "loading", error: undefined },
        };
        sectionsRef.current = next;
        return next;
      });

      try {
        const res = await fetch("/api/optimize-section", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            id: parsedId,
            workspaceId: currentWorkspaceId,
            section,
            targetRole: ctx.targetRole,
            industry: ctx.industry,
            seniority: ctx.seniority,
            mode: ctx.mode || "Branding",
            targetJobText: ctx.targetJobText || "",
          }),
        });

        const out = await parseJsonOrThrow<SectionResponse>(res);

        let nextSections!: Record<SectionKey, SectionState>;
        setSections((prev) => {
          nextSections = {
            ...prev,
            [section]: { status: "success", data: out.data },
          };
          sectionsRef.current = nextSections;
          return nextSections;
        });

        if (structured && nextSections) {
          try {
            await saveParsedWorkspaceToWorker(currentWorkspaceId, structured, ctx, nextSections);
          } catch (workspaceError) {
            console.error("Failed to persist section results:", workspaceError);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : `Failed: ${section}`;

        setSections((prev) => {
          const next = {
            ...prev,
            [section]: { ...prev[section], status: "error", error: msg },
          };
          sectionsRef.current = next;
          return next;
        });

        setApiErr(msg);
      }

      setActiveSection(null);

      if (i < queue.length - 1 && !genAllAbort.current) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    setGenAllRunning(false);
    setGenAllIndex(-1);
    setActiveSection(null);
  }

  async function handleGenerateAllClick() {
    if (doneCount === SECTION_ORDER.length || genAllRunning || isPaymentLoading) {
      return;
    }

    if (!isLoaded) return;

    if (!isSignedIn) {
      savePendingGenerateAllIntent();
      openSignIn?.();
      return;
    }

    if (!canGenerateFromCurrentState()) {
      setApiErr("Workspace not ready. Please parse your resume again.");
      return;
    }

    const currentWorkspaceId = getCurrentWorkspaceId();

if (!currentWorkspaceId) {
  setApiErr("Workspace not ready. Please parse your resume again.");
  return;
}

if (!workspaceId) {
  setWorkspaceId(currentWorkspaceId);
}

    if (isGenerateAllUnlocked) {
      await generateAll();
      return;
    }

    setApiErr(null);
    setIsPaymentLoading(true);

    try {
      const paid = await startGenerateAllPayment();
      if (!paid) return;

      setIsGenerateAllUnlocked(true);
      await generateAll();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Payment failed. Please try again.";
      setApiErr(message);
    } finally {
      setIsPaymentLoading(false);
    }
  }

  function stopGenAll() {
    genAllAbort.current = true;
    setGenAllRunning(false);
    setGenAllIndex(-1);
    setActiveSection(null);
  }

  function refreshATS() {
    if (!structured) return;

    setAtsLoading(true);
    setTimeout(() => {
      setAtsResult(scoreResumeDeterministic(structured, ctx.targetRole));
      setAtsRan(true);
      setAtsLoading(false);
    }, 1200);
  }

  async function handleStartOver() {
    setClearing(true);

    try {
      if (parsedId) {
        await fetch("/api/clear-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: parsedId }),
        });
      }
    } catch {
      // best-effort
    }

    setFile(null);
    setFileErr(null);
    setApiErr(null);
    setCtx({
      targetRole: "",
      industry: "",
      seniority: "Mid",
      mode: "Branding",
      targetJobText: "",
    });
    setParsedId("");
    setWorkspaceId("");
    setStructured(null);
    setSections(makeInitialSections());
    setActiveSection(null);
    setCopiedSection(null);
    setAtsResult(null);
    setAtsRan(false);
    setActiveTab("sections");
    setGenAllRunning(false);
    setGenAllIndex(-1);
    setIsGenerateAllUnlocked(false);
    setIsPaymentLoading(false);
    genAllAbort.current = true;
    setShowClearConfirm(false);
    setClearing(false);

    localStorage.removeItem("linkedup_workspace_id");
    localStorage.removeItem("linkedup_parsed_id");
    localStorage.removeItem("linkedup_pending_generate_all");
    localStorage.removeItem("linkedup_structured_json");
    localStorage.removeItem("linkedup_ctx_json");
    localStorage.removeItem("linkedup_sections_json");
    localStorage.removeItem("linkedup_pending_parsed_id");
    localStorage.removeItem("linkedup_pending_structured_json");
    localStorage.removeItem("linkedup_pending_ctx_json");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <style>{`
        @keyframes liDot     { 0%,100%{opacity:.25;transform:scale(.75)} 50%{opacity:1;transform:scale(1.1)} }
        @keyframes liSpin    { to{transform:rotate(360deg)} }
        @keyframes liFadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        @keyframes liBreathe { 0%,100%{opacity:.6} 50%{opacity:1} }
        .li-fade-up { animation: liFadeUp 0.5s ease both; }
        input,select,textarea { caret-color: ${LI_LIGHT}; }
        input:focus,select:focus,textarea:focus { border-color: ${LI_BORDER} !important; outline: none; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-thumb { background:${LI_SUBTLE}; border-radius:4px; }
      `}</style>

      <main style={{ display: "flex", flexDirection: "column", gap: 28, opacity: pageLoaded ? 1 : 0, transition: "opacity 0.5s ease" }}>
        <section
          className="li-fade-up"
          style={{
            borderRadius: 24,
            padding: "32px 32px 28px",
            background: "rgba(10,102,194,0.07)",
            border: "1px solid " + LI_BORDER,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -40,
              right: -40,
              width: 220,
              height: 220,
              borderRadius: "50%",
              background: LI_BLUE,
              opacity: 0.06,
              filter: "blur(60px)",
              pointerEvents: "none",
            }}
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap", position: "relative" }}>
            <div style={{ maxWidth: 600 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e", animation: "liBreathe 2.5s ease-in-out infinite" }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "#22c55e", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Optimization Workspace
                </span>
              </div>
              <h1 style={{ fontSize: "clamp(26px,3.5vw,38px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0 }}>
                Parse first. Then unlock
                <br />
                <span style={{ color: LI_LIGHT }}>all sections at once.</span>
              </h1>
              <p style={{ marginTop: 12, fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                Pay once, then watch each section generate live and copy each finished output from the cards below.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexShrink: 0, alignItems: "center" }}>
              <Link
                href="/"
                style={{
                  padding: "10px 20px",
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: "none",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.65)",
                  transition: "all 0.2s",
                }}
              >
                Back to overview
              </Link>

              {parsedId && !showClearConfirm && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    color: "#fca5a5",
                    transition: "all 0.2s",
                  }}
                >
                  🗑 Start Over
                </button>
              )}

              {showClearConfirm && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 14px",
                    borderRadius: 12,
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.3)",
                  }}
                >
                  <span style={{ fontSize: 12, color: "#fca5a5" }}>Clear everything?</span>
                  <button
                    onClick={handleStartOver}
                    disabled={clearing}
                    style={{
                      padding: "5px 14px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      background: "#ef4444",
                      border: "none",
                      color: "white",
                    }}
                  >
                    {clearing ? "Clearing..." : "Yes, clear"}
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      cursor: "pointer",
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              <button
                onClick={parseResume}
                disabled={parseLoading}
                style={{
                  padding: "10px 26px",
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: parseLoading ? "not-allowed" : "pointer",
                  background: parseLoading ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg," + LI_BLUE + ",#0077b5)",
                  border: "none",
                  color: parseLoading ? "rgba(255,255,255,0.4)" : "white",
                  boxShadow: parseLoading ? "none" : "0 4px 20px rgba(10,102,194,0.4)",
                  transition: "all 0.2s",
                }}
              >
                {parseLoading ? "Parsing..." : "Parse resume"}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 24, flexWrap: "wrap" }}>
            {[
              "Step 1: Upload & parse once.",
              "Step 2: Unlock Generate All.",
              "Step 3: Copy each completed section.",
            ].map((note, i) => (
              <div
                key={note}
                style={{
                  padding: "6px 14px",
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 500,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.5)",
                  animation: "liFadeUp 0.5s ease " + i * 0.08 + "s both",
                }}
              >
                {note}
              </div>
            ))}
          </div>
        </section>

        {apiErr && (
          <div style={{ padding: "12px 18px", borderRadius: 12, fontSize: 13, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
            {apiErr}
          </div>
        )}

        {parseLoading && (
          <div style={{ borderRadius: 20, padding: "28px 28px", background: "rgba(255,255,255,0.03)", border: "1px solid " + LI_BORDER, animation: "liFadeUp 0.4s ease both" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid transparent", borderTopColor: LI_LIGHT, animation: "liSpin 0.8s linear infinite", flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: LI_LIGHT }}>Parsing resume...</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PARSE_STEPS.map((step, i) => {
                const done = parseStep > i;
                const active = parseStep === i;
                return (
                  <div key={step} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        background: done ? LI_BLUE : active ? LI_SUBTLE : "rgba(255,255,255,0.05)",
                        border: "1px solid " + (done ? LI_BLUE : active ? LI_BORDER : "rgba(255,255,255,0.1)"),
                        color: done ? "white" : active ? LI_LIGHT : "rgba(255,255,255,0.25)",
                        transition: "all 0.4s",
                      }}
                    >
                      {done ? "✓" : i + 1}
                    </div>
                    <span style={{ fontSize: 13, color: done ? "rgba(255,255,255,0.7)" : active ? "white" : "rgba(255,255,255,0.3)", transition: "color 0.4s" }}>
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <section style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr", gap: 20, alignItems: "stretch" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <ResumeUpload
              onFile={(f) => {
                setFile(f);
                setFileErr(null);
              }}
              fileName={file?.name}
              error={fileErr ?? undefined}
            />
            <div style={{ borderRadius: 20, padding: "20px 22px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", flexGrow: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: "white" }}>Workflow tips</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { tip: "Parse once, then use Generate All to unlock the full LinkedIn profile pack in one run.", cat: "Flow" },
                  { tip: "Paste a real job description to improve role alignment and keyword relevance.", cat: "Quality" },
                  { tip: "Use Branding mode for discoverability; switch to Recruiter mode when targeting a specific role.", cat: "Mode" },
                  { tip: "Each section card will open automatically as soon as its result is ready.", cat: "Live" },
                  { tip: "Copy directly from each finished card into LinkedIn — formatting is optimized for pasting.", cat: "Workflow" },
                  { tip: "When signed in, every generated result should persist to your saved workspace.", cat: "Persistence" },
                  { tip: "Uploading a new resume creates a new workspace and keeps your earlier ones in dashboard history.", cat: "History" },
                ].map(({ tip, cat }) => (
                  <div key={cat} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ flexShrink: 0, marginTop: 1, padding: "1px 7px", borderRadius: 99, fontSize: 10, fontWeight: 600, background: LI_SUBTLE, border: "1px solid " + LI_BORDER, color: LI_LIGHT, letterSpacing: "0.04em" }}>
                      {cat}
                    </span>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <OptimizationSettings value={ctx} onChange={setCtx} />
        </section>

        {structured && (
          <section
            ref={resultsRef}
            style={{
              borderRadius: 20,
              padding: "22px 24px",
              background: "rgba(10,102,194,0.06)",
              border: "1px solid " + LI_BORDER,
              animation: "liFadeUp 0.5s ease both",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#22c55e" }}>
                    Parsed profile preview
                  </span>
                </div>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
                  Resume successfully parsed. Unlock Generate All below to fill every section.
                </p>
              </div>
              <div style={{ padding: "4px 14px", borderRadius: 99, fontSize: 11, fontFamily: "monospace", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}>
                Draft ID: {parsedId || "workspace restore"}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }}>
              {[
                { label: "NAME", value: structured.basics?.name || "Not found", warn: !structured.basics?.name },
                { label: "TARGET ROLE", value: ctx.targetRole || "Not set" },
                { label: "EXPERIENCE ENTRIES", value: String(structured.experience?.length || 0) },
              ].map(({ label, value, warn }) => (
                <div key={label} style={{ borderRadius: 12, padding: "14px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.3)", marginBottom: 7 }}>{label}</p>
                  <p style={{ fontSize: 17, fontWeight: 700, color: warn ? "#f87171" : "white" }}>{value}</p>
                </div>
              ))}
            </div>

            {topPreview.length > 0 && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.35)", marginBottom: 9 }}>
                  Top parsed skills
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {topPreview.map((skill, i) => (
                    <span
                      key={skill}
                      style={{
                        padding: "5px 13px",
                        borderRadius: 99,
                        fontSize: 12,
                        fontWeight: 500,
                        background: LI_SUBTLE,
                        border: "1px solid " + LI_BORDER,
                        color: "#93c5fd",
                        opacity: 0,
                        animation: "liFadeUp 0.35s ease " + (i * 45 + 100) + "ms both",
                      }}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {structured && (
          <section style={{ animation: "liFadeUp 0.5s ease 0.1s both" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
              {[
                {
                  label: "Sections",
                  value: doneCount + "/" + SECTION_ORDER.length,
                  sub: "optimized",
                  color: "#93c5fd",
                  locked: false,
                },
                {
                  label: "ATS Score",
                  value: atsResult ? String(atsResult.overallScore) : "—",
                  sub: atsResult ? "Grade " + atsResult.grade : "run below",
                  color: atsResult
                    ? atsResult.overallScore >= 80
                      ? "#22c55e"
                      : atsResult.overallScore >= 60
                        ? "#fbbf24"
                        : "#f87171"
                    : "rgba(255,255,255,0.2)",
                  locked: false,
                },
                {
                  label: "Keywords",
                  value: atsResult ? String(atsResult.keywordsFound.length) : "—",
                  sub: "matched",
                  color: "#22c55e",
                  locked: false,
                },
                {
                  label: "Gaps",
                  value: atsResult ? String(atsResult.keywordsMissing.length) : "—",
                  sub: "to fill",
                  color: "#fbbf24",
                  locked: !isGenerateAllUnlocked,
                },
              ].map((s, i) => (
                <div
                  key={s.label}
                  style={{
                    borderRadius: 14,
                    padding: "15px 18px",
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    animation: "liFadeUp 0.4s ease " + i * 0.06 + "s both",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>
                    {s.label}
                  </p>

                  <div style={{ position: "relative" }}>
                    <p
                      style={{
                        fontSize: 28,
                        fontWeight: 800,
                        color: s.color,
                        lineHeight: 1,
                        filter: s.locked ? "blur(8px)" : "none",
                        transition: "filter 0.2s ease",
                        userSelect: s.locked ? "none" : "auto",
                      }}
                    >
                      {atsResult && s.label === "ATS Score" ? <AnimatedNumber to={atsResult.overallScore} /> : s.value}
                    </p>

                    {s.locked && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          pointerEvents: "none",
                          fontSize: 13,
                          color: "rgba(255,255,255,0.55)",
                        }}
                      >
                        🔒
                      </div>
                    )}
                  </div>

                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>{s.locked ? "unlock after payment" : s.sub}</p>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 16, padding: 4, borderRadius: 14, width: "fit-content", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              {([
                { key: "sections", label: "Sections" },
                { key: "ats", label: "ATS Score" },
                { key: "keywords", label: "Keywords" },
              ] as { key: Tab; label: string }[]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    background: activeTab === tab.key ? LI_SUBTLE : "transparent",
                    border: "1px solid " + (activeTab === tab.key ? LI_BORDER : "transparent"),
                    color: activeTab === tab.key ? "#93c5fd" : "rgba(255,255,255,0.4)",
                  }}
                >
                  {tab.label}
                </button>
              ))}

              {activeTab === "sections" && structured && (
                <div style={{ marginLeft: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  {!genAllRunning ? (
                    <button
                      onClick={handleGenerateAllClick}
                      disabled={doneCount === SECTION_ORDER.length || isPaymentLoading}
                      style={{
                        padding: "8px 18px",
                        borderRadius: 10,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: doneCount === SECTION_ORDER.length || isPaymentLoading ? "not-allowed" : "pointer",
                        background:
                          doneCount === SECTION_ORDER.length || isPaymentLoading
                            ? "rgba(255,255,255,0.06)"
                            : "linear-gradient(135deg," + LI_BLUE + ",#0077b5)",
                        border: "none",
                        color: doneCount === SECTION_ORDER.length || isPaymentLoading ? "rgba(255,255,255,0.25)" : "white",
                        boxShadow:
                          doneCount === SECTION_ORDER.length || isPaymentLoading
                            ? "none"
                            : "0 3px 14px rgba(10,102,194,0.45)",
                        transition: "all 0.2s",
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                      }}
                    >
                      <span style={{ fontSize: 15 }}>{isGenerateAllUnlocked ? "⚡" : "🔒"}</span>
                      {doneCount === SECTION_ORDER.length
                        ? "All done"
                        : isPaymentLoading
                          ? "Opening checkout..."
                          : !isLoaded
                            ? "Loading..."
                            : !isSignedIn
                              ? "Sign in to Unlock Generate All"
                              : isGenerateAllUnlocked
                                ? "Generate All"
                                : "Unlock Generate All"}
                    </button>
                  ) : (
                    <button
                      onClick={stopGenAll}
                      style={{
                        padding: "8px 18px",
                        borderRadius: 10,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                        background: "rgba(239,68,68,0.12)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        color: "#fca5a5",
                        transition: "all 0.2s",
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                      }}
                    >
                      <span style={{ fontSize: 13 }}>■</span> Stop
                    </button>
                  )}

                  {genAllRunning && genAllIndex >= 0 && (
                    <div
                      style={{
                        padding: "6px 12px",
                        borderRadius: 99,
                        fontSize: 11,
                        fontWeight: 600,
                        background: LI_SUBTLE,
                        border: "1px solid " + LI_BORDER,
                        color: "#93c5fd",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: "50%", border: "1.5px solid transparent", borderTopColor: LI_LIGHT, animation: "liSpin 0.7s linear infinite" }} />
                      {genAllIndex + 1} / {SECTION_ORDER.length}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "ats" && (
                <button
                  onClick={refreshATS}
                  disabled={atsLoading}
                  style={{
                    marginLeft: 8,
                    padding: "8px 18px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: atsLoading ? "not-allowed" : "pointer",
                    background: LI_SUBTLE,
                    border: "1px solid " + LI_BORDER,
                    color: "#93c5fd",
                    opacity: atsLoading ? 0.6 : 1,
                  }}
                >
                  {atsLoading ? "Scoring..." : atsRan ? "Re-score" : "Run ATS Score"}
                </button>
              )}
            </div>

            {activeTab === "sections" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, alignItems: "stretch" }}>
                {SECTION_ORDER.map((item, i) => (
                  <div key={item.key} style={{ animation: "liFadeUp 0.4s ease " + i * 0.05 + "s both", height: "100%", display: "flex", flexDirection: "column" }}>
                    <SectionCard
                      item={item}
                      state={sections[item.key]}
                      busy={activeSection === item.key}
                      copiedSection={copiedSection}
                      queuePosition={
                        genAllRunning && sections[item.key]?.status !== "success"
                          ? SECTION_ORDER.findIndex((s) => s.key === item.key) - genAllIndex
                          : null
                      }
                      genAllRunning={genAllRunning}
                      onCopy={handleCopy}
                    />
                  </div>
                ))}
              </div>
            )}

            {activeTab === "ats" && (
              <div>
                {atsLoading && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 16, textAlign: "center" }}>
                    <div style={{ position: "relative", width: 52, height: 52 }}>
                      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid " + LI_BORDER, animation: "liBreathe 1.5s ease-in-out infinite" }} />
                      <div style={{ position: "absolute", inset: 5, borderRadius: "50%", border: "2px solid transparent", borderTopColor: LI_LIGHT, animation: "liSpin 0.85s linear infinite" }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 600 }}>Analyzing for ATS compatibility...</p>
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 5 }}>
                        Scanning keyword density · Checking formatting · Scoring impact language
                      </p>
                    </div>
                  </div>
                )}

                {!atsLoading && !atsResult && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 42, color: "rgba(10,102,194,0.35)" }}>◎</div>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>No ATS score yet</p>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Click &quot;Run ATS Score&quot; above</p>
                  </div>
                )}

                {!atsLoading && atsResult && (
                  <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
                    <div style={{ borderRadius: 18, padding: "24px 20px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", gap: 20 }}>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <ScoreRing score={atsResult.overallScore} grade={atsResult.grade} />
                      </div>
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textAlign: "center", lineHeight: 1.5 }}>{atsResult.summary}</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        {atsResult.categories.map((cat, i) => (
                          <CatBar key={cat.label} cat={cat} delay={300 + i * 100} />
                        ))}
                      </div>
                    </div>

                    <div style={{ borderRadius: 18, padding: "22px 20px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                        <p style={{ fontSize: 14, fontWeight: 700 }}>Issues &amp; Fixes</p>
                        <div style={{ display: "flex", gap: 10, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                          {(["critical", "warning", "suggestion"] as const).map((sev) => (
                            <span key={sev} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: sev === "critical" ? "#ef4444" : sev === "warning" ? "#f59e0b" : LI_BLUE, display: "inline-block" }} />
                              {sev}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {atsResult.issues.map((issue, i) => (
                          <IssueRow key={i} issue={issue} delay={i * 55} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "keywords" && (
              <div>
                {!atsResult ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 42, color: "rgba(10,102,194,0.35)" }}>◈</div>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>Switch to ATS Score tab first</p>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Keyword analysis runs as part of the ATS scan</p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div style={{ borderRadius: 18, padding: 20, background: "rgba(10,102,194,0.06)", border: "1px solid " + LI_BORDER }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 7px #22c55e" }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#4ade80" }}>Keywords Found</span>
                        <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
                          {atsResult.keywordsFound.length} matched
                        </span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                        {atsResult.keywordsFound.map((kw, i) => (
                          <KwChip key={kw} word={kw} found delay={i * 60} />
                        ))}
                      </div>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
                        These appear in your resume and match common {ctx.targetRole} requirements.
                      </p>
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 20,
                        background: "rgba(239,68,68,0.05)",
                        border: "1px solid rgba(239,68,68,0.2)",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          filter: !isGenerateAllUnlocked ? "blur(10px)" : "none",
                          transition: "filter 0.2s ease",
                          pointerEvents: !isGenerateAllUnlocked ? "none" : "auto",
                          userSelect: !isGenerateAllUnlocked ? "none" : "auto",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 7px #ef444466" }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#fca5a5" }}>Keyword Gaps</span>
                          <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>
                            {atsResult.keywordsMissing.length} missing
                          </span>
                        </div>

                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                          {atsResult.keywordsMissing.map((kw, i) => (
                            <KwChip key={kw} word={kw} found={false} delay={i * 60} />
                          ))}
                          {atsResult.keywordsMissing.length === 0 && (
                            <span style={{ fontSize: 13, color: "#4ade80" }}>✓ No major gaps detected</span>
                          )}
                        </div>

                        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
                          Add these to your Skills section and work them into bullets where accurate.
                        </p>
                      </div>

                      {!isGenerateAllUnlocked && (
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 20,
                            background: "rgba(3,8,20,0.12)",
                          }}
                        >
                          <div
                            style={{
                              textAlign: "center",
                              borderRadius: 14,
                              padding: "14px 18px",
                              background: "rgba(0,0,0,0.35)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              backdropFilter: "blur(6px)",
                            }}
                          >
                            <div style={{ fontSize: 18, marginBottom: 6 }}>🔒</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>Keyword gaps unlock after payment</div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4, lineHeight: 1.5 }}>
                              Pay through Generate All to reveal missing keywords.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ gridColumn: "span 2", borderRadius: 18, padding: 20, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>All Parsed Skills</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {(structured.skills || []).map((skill, i) => (
                          <span
                            key={skill}
                            style={{
                              padding: "5px 13px",
                              borderRadius: 99,
                              fontSize: 12,
                              fontWeight: 500,
                              background: LI_SUBTLE,
                              border: "1px solid " + LI_BORDER,
                              color: "#93c5fd",
                              opacity: 0,
                              animation: "liFadeUp 0.35s ease " + i * 35 + "ms both",
                            }}
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <section style={{ borderRadius: 16, padding: "14px 20px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚠</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#fcd34d", marginBottom: 3 }}>
              Disclaimer — please review all AI-generated content before use
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
              This tool uses AI to suggest LinkedIn profile content based on your resume. Outputs may contain inaccuracies, embellishments, or misrepresentations.
              Always verify facts, dates, titles, and metrics before publishing. Never claim skills or experience you do not have.
              The author accepts no liability for how this content is used.
            </p>
          </div>
        </section>

        <section style={{ borderRadius: 20, padding: "22px 28px", background: "rgba(10,102,194,0.06)", border: "1px solid " + LI_BORDER, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "white", marginBottom: 4 }}>Need help optimizing your LinkedIn or resume?</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>Reach out directly and I can help you craft a standout profile.</p>
          </div>
          <a
            href="mailto:piyusha.2510@gmail.com"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 22px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              background: "linear-gradient(135deg," + LI_BLUE + ",#0077b5)",
              color: "white",
              textDecoration: "none",
              boxShadow: "0 4px 18px rgba(10,102,194,0.35)",
              transition: "opacity 0.2s",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 15 }}>✉</span> Email me
          </a>
        </section>
      </main>

      <footer
        style={{
          marginTop: 48,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          padding: "20px 0 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          fontSize: 13,
        }}
      >
        <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 12 }}>
          © {new Date().getFullYear()} Piyusha Sayal. All rights reserved.
        </p>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <a
            href="https://piyushasayal.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "rgba(255,255,255,0.45)",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 500,
              transition: "color 0.2s",
            }}
          >
            <span style={{ fontSize: 14 }}>◈</span> Portfolio
          </a>
          <a
            href="https://linkedin.com/in/piyusha-sayal"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "rgba(255,255,255,0.45)",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 500,
              transition: "color 0.2s",
            }}
          >
            <span style={{ fontSize: 14, color: LI_LIGHT }}>in</span> LinkedIn
          </a>
          <a
            href="mailto:piyusha.2510@gmail.com"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "rgba(255,255,255,0.45)",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 500,
              transition: "color 0.2s",
            }}
          >
            <span style={{ fontSize: 14 }}>✉</span> Email me
          </a>
        </div>
      </footer>
    </>
  );
}