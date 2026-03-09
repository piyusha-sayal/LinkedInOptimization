// lib/atsScorer.ts
import "server-only";

import type { StructuredResume, UserContext } from "./types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ATSCategory =
  | "keyword_match"
  | "formatting"
  | "completeness"
  | "impact"
  | "role_alignment";

export type ATSSeverity = "critical" | "warning" | "suggestion";

export interface ATSIssue {
  category: ATSCategory;
  severity: ATSSeverity;
  message: string;
  fix: string;
}

export interface ATSCategoryScore {
  category: ATSCategory;
  label: string;
  score: number; // 0–100
  maxScore: number;
  issues: ATSIssue[];
}

export interface ATSScoreResult {
  overallScore: number; // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  categories: ATSCategoryScore[];
  topKeywordsFound: string[];
  topKeywordsMissing: string[];
  summary: string; // 2–3 sentence plain text summary
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function grade(score: number): ATSScoreResult["grade"] {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function cleanText(input: unknown, maxLen = 1200): string {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

// ─── Core Scorer ─────────────────────────────────────────────────────────────

/**
 * Score a resume against a target role/JD without an AI call.
 * This is a fast, deterministic pass — use scoreWithAI() for deep keyword analysis.
 */
export function scoreResumeDeterministic(
  structured: StructuredResume,
  ctx: UserContext
): ATSScoreResult {
  const categories: ATSCategoryScore[] = [];

  // ── 1. Completeness (25 pts) ──────────────────────────────────────────────
  const completenessIssues: ATSIssue[] = [];
  let completenessScore = 25;

  const basics = structured.basics || {};
  if (!basics.name?.trim()) {
    completenessScore -= 5;
    completenessIssues.push({
      category: "completeness",
      severity: "critical",
      message: "Name not found in parsed resume",
      fix: "Ensure your name is on the first line of your resume in plain text (not in a header image or text box)",
    });
  }
  if (!basics.email?.trim()) {
    completenessScore -= 3;
    completenessIssues.push({
      category: "completeness",
      severity: "warning",
      message: "Email address not detected",
      fix: "Add a plaintext email address — ATS parsers often can't read contact info inside tables or sidebars",
    });
  }
  if (!basics.phone?.trim()) {
    completenessScore -= 2;
    completenessIssues.push({
      category: "completeness",
      severity: "suggestion",
      message: "Phone number not detected",
      fix: "Include a phone number in standard format (e.g. +1 555-123-4567)",
    });
  }
  if ((structured.experience || []).length === 0) {
    completenessScore -= 10;
    completenessIssues.push({
      category: "completeness",
      severity: "critical",
      message: "No experience entries parsed",
      fix: "Experience section may be in a format the parser couldn't read — avoid tables, columns, or text boxes",
    });
  }
  if ((structured.skills || []).length < 5) {
    completenessScore -= 5;
    completenessIssues.push({
      category: "completeness",
      severity: "warning",
      message: `Only ${(structured.skills || []).length} skills detected (want 10+)`,
      fix: "Add a dedicated Skills section with 10–20 relevant tools and technologies listed in plain text",
    });
  }
  if ((structured.education || []).length === 0) {
    completenessScore -= 3;
    completenessIssues.push({
      category: "completeness",
      severity: "suggestion",
      message: "No education entries detected",
      fix: "Add an Education section even if your degree isn't recent — many ATS systems filter on it",
    });
  }

  categories.push({
    category: "completeness",
    label: "Profile Completeness",
    score: Math.max(0, completenessScore),
    maxScore: 25,
    issues: completenessIssues,
  });

  // ── 2. Formatting & Parseability (20 pts) ─────────────────────────────────
  const formattingIssues: ATSIssue[] = [];
  let formattingScore = 20;

  const allBullets = (structured.experience || []).flatMap((r) => r.bullets || []);
  const avgBulletLen =
    allBullets.length > 0
      ? allBullets.reduce((sum, b) => sum + b.split(/\s+/).length, 0) / allBullets.length
      : 0;

  if (allBullets.length > 0 && avgBulletLen > 35) {
    formattingScore -= 5;
    formattingIssues.push({
      category: "formatting",
      severity: "warning",
      message: `Average bullet length is ${Math.round(avgBulletLen)} words (ideal: 15–25)`,
      fix: "Shorten bullets to one idea each. Lead with a strong action verb, add scope/metric, then impact.",
    });
  }
  if (allBullets.length > 0 && avgBulletLen < 8) {
    formattingScore -= 4;
    formattingIssues.push({
      category: "formatting",
      severity: "warning",
      message: "Bullets are too short — may not contain enough signal for ATS keyword matching",
      fix: "Expand bullets to include context: what you did, with what tool/approach, and what the outcome was",
    });
  }

  const rolesWithFewBullets = (structured.experience || []).filter(
    (r) => (r.bullets || []).length < 2
  );
  if (rolesWithFewBullets.length > 0) {
    formattingScore -= 4;
    formattingIssues.push({
      category: "formatting",
      severity: "warning",
      message: `${rolesWithFewBullets.length} role(s) have fewer than 2 bullets`,
      fix: "Each role should have 2–5 bullets. Roles with no bullets are largely invisible to ATS.",
    });
  }

  const rolesWithDates = (structured.experience || []).filter(
    (r) => r.startDate?.trim() || r.endDate?.trim()
  );
  if (
    (structured.experience || []).length > 0 &&
    rolesWithDates.length < (structured.experience || []).length * 0.6
  ) {
    formattingScore -= 4;
    formattingIssues.push({
      category: "formatting",
      severity: "warning",
      message: "Many roles are missing dates",
      fix: "Include start and end dates for every role. Use 'Mon YYYY – Mon YYYY' or 'YYYY – YYYY' format.",
    });
  }

  categories.push({
    category: "formatting",
    label: "Formatting & Parseability",
    score: Math.max(0, formattingScore),
    maxScore: 20,
    issues: formattingIssues,
  });

  // ── 3. Impact & Achievement Language (20 pts) ─────────────────────────────
  const impactIssues: ATSIssue[] = [];
  let impactScore = 20;

  const WEAK_OPENERS = [
    "responsible for",
    "helped",
    "assisted",
    "worked on",
    "involved in",
    "participated in",
    "supported",
    "contributed to",
  ];
  const weakBullets = allBullets.filter((b) =>
    WEAK_OPENERS.some((w) => b.toLowerCase().startsWith(w))
  );
  if (weakBullets.length > 0) {
    const penalty = Math.min(10, weakBullets.length * 3);
    impactScore -= penalty;
    impactIssues.push({
      category: "impact",
      severity: weakBullets.length >= 3 ? "critical" : "warning",
      message: `${weakBullets.length} bullet(s) start with weak phrases like "Responsible for" or "Helped"`,
      fix: `Replace with strong past-tense verbs: "Led", "Built", "Reduced", "Automated", "Delivered". These score better in ATS ranking algorithms.`,
    });
  }

  const metricPattern = /\d+[\s%xX]|[$£€]\d|\d+[km+]/i;
  const bulletsWithMetrics = allBullets.filter((b) => metricPattern.test(b));
  const metricRatio = allBullets.length > 0 ? bulletsWithMetrics.length / allBullets.length : 0;
  if (metricRatio < 0.25 && allBullets.length >= 4) {
    impactScore -= 6;
    impactIssues.push({
      category: "impact",
      severity: "warning",
      message: `Only ${Math.round(metricRatio * 100)}% of bullets contain measurable outcomes (target: 30%+)`,
      fix: "Add numbers, percentages, dollar amounts, or team sizes where possible. Even rough estimates help.",
    });
  }

  categories.push({
    category: "impact",
    label: "Impact & Achievement Language",
    score: Math.max(0, impactScore),
    maxScore: 20,
    issues: impactIssues,
  });

  // ── 4. Role Alignment (15 pts) ─────────────────────────────────────────────
  // (Keyword matching is handled by AI; this does a lightweight check)
  const alignmentIssues: ATSIssue[] = [];
  let alignmentScore = 15;

  const targetRole = cleanText(ctx.targetRole || "", 100).toLowerCase();
  const titleWords = targetRole.split(/\s+/).filter((w) => w.length > 3);
  const allTitles = (structured.experience || [])
    .map((r) => cleanText(r.title, 80).toLowerCase())
    .join(" ");

  const titleMatchCount = titleWords.filter((w) => allTitles.includes(w)).length;
  if (titleWords.length > 0 && titleMatchCount < Math.ceil(titleWords.length / 2)) {
    alignmentScore -= 6;
    alignmentIssues.push({
      category: "role_alignment",
      severity: "warning",
      message: `Job titles in your experience don't closely match "${ctx.targetRole}"`,
      fix: "If your title was equivalent (e.g. 'Data Engineer' applying to 'Analytics Engineer'), consider a brief parenthetical or rephrase in your About section to bridge the gap.",
    });
  }

  if (!ctx.targetJobText?.trim()) {
    alignmentScore -= 4;
    alignmentIssues.push({
      category: "role_alignment",
      severity: "suggestion",
      message: "No job description provided — keyword match analysis is limited",
      fix: "Paste a target job description into the Optimization Context panel for a more precise ATS keyword score.",
    });
  }

  categories.push({
    category: "role_alignment",
    label: "Role Alignment",
    score: Math.max(0, alignmentScore),
    maxScore: 15,
    issues: alignmentIssues,
  });

  // ── 5. Keyword Match placeholder (20 pts — filled by AI pass) ─────────────
  // This category gets replaced when scoreWithAI() is called
  categories.push({
    category: "keyword_match",
    label: "Keyword Match",
    score: 0, // placeholder — AI fills this
    maxScore: 20,
    issues: [
      {
        category: "keyword_match",
        severity: "suggestion",
        message: "Keyword analysis requires an AI pass",
        fix: "Run the full ATS score to get keyword gap analysis",
      },
    ],
  });

  const rawTotal = categories.reduce((sum, c) => sum + c.score, 0);
  const maxTotal = categories.reduce((sum, c) => sum + c.maxScore, 0);
  const overallScore = Math.round((rawTotal / maxTotal) * 100);

  return {
    overallScore,
    grade: grade(overallScore),
    categories,
    topKeywordsFound: [],
    topKeywordsMissing: [],
    summary: buildSummary(overallScore, categories),
  };
}

function buildSummary(score: number, categories: ATSCategoryScore[]): string {
  const criticalCount = categories
    .flatMap((c) => c.issues)
    .filter((i) => i.severity === "critical").length;

  if (score >= 80)
    return `Your resume scores well for ATS compatibility. ${criticalCount > 0 ? `Fix ${criticalCount} critical issue(s) to push into the top tier.` : "Focus on keyword alignment to maximize recruiter visibility."}`;
  if (score >= 60)
    return `Your resume has a solid foundation but has gaps that ATS systems will penalize. ${criticalCount > 0 ? `Address the ${criticalCount} critical issue(s) first.` : "Strengthen bullet language and keyword density to improve ranking."}`;
  return `Your resume has significant ATS compatibility issues that may prevent it from reaching human reviewers. ${criticalCount} critical issue(s) need immediate attention — start there.`;
}

// ─── AI Keyword Scoring Prompt ────────────────────────────────────────────────

/**
 * Generate the prompt for AI-powered keyword gap analysis.
 * Feed this into your AI client and merge the result back into the deterministic score.
 */
export function generateATSKeywordPrompt(
  structured: StructuredResume,
  ctx: UserContext
): string {
  const skills = (structured.skills || []).slice(0, 40).join(", ");
  const titles = (structured.experience || [])
    .slice(0, 5)
    .map((r) => `${r.title} at ${r.company}`)
    .join("; ");
  const allBulletsText = (structured.experience || [])
    .flatMap((r) => r.bullets || [])
    .slice(0, 20)
    .join(" | ");
  const jdSnippet = cleanText(ctx.targetJobText || "", 1400);
  const hasJD = !!jdSnippet;

  return `
You are an ATS (Applicant Tracking System) keyword analyzer.

CANDIDATE PROFILE:
- Target role: ${ctx.targetRole}
- Current titles: ${titles || "N/A"}
- Skills listed: ${skills || "N/A"}
- Experience bullets (sample): ${allBulletsText || "N/A"}

${hasJD ? `TARGET JOB DESCRIPTION:\n${jdSnippet}` : `No JD provided — use your knowledge of what ATS systems expect for "${ctx.targetRole}" roles.`}

TASK:
1. Identify the 10–15 most important ATS keywords for this role (tools, skills, methodologies, job title variations)
2. For each keyword: determine if it appears in the candidate's profile (found) or is missing (gap)
3. Score the keyword match from 0–20 based on coverage quality
4. Provide 3–5 missing keywords that would most improve ATS ranking

Return ONLY valid JSON in this exact shape, no markdown:
{
  "keywordScore": <number 0-20>,
  "found": [<string>, ...],
  "missing": [<string>, ...],
  "keywordNotes": "<1–2 sentences on keyword strategy>"
}
`.trim();
}

/**
 * Merge AI keyword result into a deterministic score result.
 */
export function mergeKeywordScore(
  base: ATSScoreResult,
  aiResult: {
    keywordScore: number;
    found: string[];
    missing: string[];
    keywordNotes: string;
  }
): ATSScoreResult {
  const categories = base.categories.map((c) => {
    if (c.category !== "keyword_match") return c;
    const issues: ATSIssue[] = aiResult.missing.slice(0, 5).map((kw) => ({
      category: "keyword_match" as ATSCategory,
      severity: "warning" as ATSSeverity,
      message: `Missing keyword: "${kw}"`,
      fix: `Add "${kw}" to your Skills section or work it naturally into an experience bullet`,
    }));
    return {
      ...c,
      score: Math.min(20, Math.max(0, aiResult.keywordScore)),
      issues,
    };
  });

  const rawTotal = categories.reduce((sum, c) => sum + c.score, 0);
  const maxTotal = categories.reduce((sum, c) => sum + c.maxScore, 0);
  const overallScore = Math.round((rawTotal / maxTotal) * 100);

  return {
    ...base,
    overallScore,
    grade: grade(overallScore),
    categories,
    topKeywordsFound: aiResult.found.slice(0, 8),
    topKeywordsMissing: aiResult.missing.slice(0, 6),
    summary: buildSummary(overallScore, categories),
  };
}
