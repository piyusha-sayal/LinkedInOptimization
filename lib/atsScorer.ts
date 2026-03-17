// lib/atsScorer.ts
import "server-only";

import type { StructuredResume, UserContext } from "./types";

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
  score: number;
  maxScore: number;
  issues: ATSIssue[];
}

export interface ATSScoreResult {
  overallScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  categories: ATSCategoryScore[];
  topKeywordsFound: string[];
  topKeywordsMissing: string[];
  summary: string;
}

function grade(score: number): ATSScoreResult["grade"] {
  if (score >= 85) return "A";
  if (score >= 72) return "B";
  if (score >= 58) return "C";
  if (score >= 42) return "D";
  return "F";
}

function cleanText(input: unknown, maxLen = 1200): string {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function buildCorpus(structured: StructuredResume): string {
  const basics = structured.basics || {};
  const parts = [
    basics.name,
    basics.email,
    basics.phone,
    basics.summary,
    ...(structured.skills || []),
    ...(structured.experience || []).flatMap((r) => [
      r.title,
      r.company,
      r.location,
      ...(r.bullets || []),
      ...(r.skills || []),
    ]),
    ...(structured.education || []).flatMap((e) => [
      e.school,
      e.degree,
      e.fieldOfStudy,
    ]),
    ...(structured.projects || []).flatMap((p) => [
      p.name,
      p.description,
      ...(p.skills || []),
    ]),
    ...(structured.certifications || []).flatMap((c) => [c.name, c.issuer]),
  ];

  return cleanText(parts.filter(Boolean).join(" "), 15000);
}

function buildSummary(
  score: number,
  categories: ATSCategoryScore[],
  hardPenalty: number
): string {
  const criticalCount = categories
    .flatMap((c) => c.issues)
    .filter((i) => i.severity === "critical").length;

  if (score >= 80) {
    return `Your resume is structurally strong for ATS review. ${
      criticalCount > 0
        ? `Fix ${criticalCount} critical issue(s) to push it into the top tier.`
        : "Focus on tighter keyword alignment to improve recruiter visibility."
    }`;
  }

  if (score >= 60) {
    return `Your resume has a workable base, but ATS systems will still penalize missing structure, weak bullets, or limited role alignment. ${
      criticalCount > 0
        ? `Address the ${criticalCount} critical issue(s) first.`
        : "Strengthen bullet quality and keyword coverage to improve ranking."
    }`;
  }

  return `Your resume has major ATS weaknesses that could prevent it from reaching a recruiter. ${
    criticalCount
      ? `${criticalCount} critical issue(s) need attention first.`
      : "The current structure is too weak for reliable ATS parsing."
  }${hardPenalty >= 12 ? " The document also looks low-signal or weakly parsed." : ""}`;
}

export function scoreResumeDeterministic(
  structured: StructuredResume,
  ctx: UserContext
): ATSScoreResult {
  const categories: ATSCategoryScore[] = [];

  const basics = structured.basics || {};
  const experience = structured.experience || [];
  const skills = structured.skills || [];
  const education = structured.education || [];
  const projects = structured.projects || [];
  const certifications = structured.certifications || [];

  const allBullets = experience.flatMap((r) => r.bullets || []);
  const corpus = buildCorpus(structured).toLowerCase();
  const totalSignalLength = corpus.length;

  const targetRole = cleanText(ctx.targetRole || "", 120).toLowerCase();
  const roleWords = Array.from(
    new Set(targetRole.split(/\s+/).filter((w) => w.length > 3))
  );

  let hardPenalty = 0;

  // 1) Completeness
  const completenessIssues: ATSIssue[] = [];
  let completenessScore = 25;

  if (!basics.name?.trim()) {
    completenessScore -= 5;
    completenessIssues.push({
      category: "completeness",
      severity: "critical",
      message: "Name not found in parsed resume",
      fix: "Ensure your name is in plain text near the top of the resume, not inside an image, sidebar, or text box",
    });
  }

  if (!basics.email?.trim()) {
    completenessScore -= 3;
    completenessIssues.push({
      category: "completeness",
      severity: "warning",
      message: "Email address not detected",
      fix: "Add a plain-text email address outside tables, columns, or header graphics",
    });
  }

  if (!basics.phone?.trim()) {
    completenessScore -= 2;
    completenessIssues.push({
      category: "completeness",
      severity: "suggestion",
      message: "Phone number not detected",
      fix: "Include a phone number in standard format such as +1 555-123-4567",
    });
  }

  if (experience.length === 0) {
    completenessScore -= 12;
    completenessIssues.push({
      category: "completeness",
      severity: "critical",
      message: "No experience entries were parsed",
      fix: "Use a single-column resume layout with a clear Experience section in plain text",
    });
    hardPenalty += 12;
  }

  if (skills.length < 5) {
    completenessScore -= 6;
    completenessIssues.push({
      category: "completeness",
      severity: skills.length === 0 ? "critical" : "warning",
      message: `Only ${skills.length} skills detected`,
      fix: "Add a dedicated Skills section with 10–20 relevant tools, platforms, and technologies",
    });
    if (skills.length === 0) hardPenalty += 8;
  }

  if (education.length === 0) {
    completenessScore -= 2;
    completenessIssues.push({
      category: "completeness",
      severity: "suggestion",
      message: "No education entries detected",
      fix: "Add an Education section in plain text so ATS systems can index it correctly",
    });
  }

  if (
    !basics.summary?.trim() &&
    projects.length === 0 &&
    certifications.length === 0 &&
    experience.length <= 1
  ) {
    completenessScore -= 3;
    completenessIssues.push({
      category: "completeness",
      severity: "warning",
      message: "Resume content looks thin for reliable ATS ranking",
      fix: "Add a short summary plus clearer experience bullets, projects, or certifications",
    });
  }

  if (totalSignalLength < 350) {
    completenessScore -= 6;
    completenessIssues.push({
      category: "completeness",
      severity: "critical",
      message: "Very little readable text was extracted from the document",
      fix: "Use a simpler resume layout and avoid scans, image-heavy headers, sidebars, and multi-column formatting",
    });
    hardPenalty += 10;
  }

  categories.push({
    category: "completeness",
    label: "Profile Completeness",
    score: Math.max(0, completenessScore),
    maxScore: 25,
    issues: completenessIssues,
  });

  // 2) Formatting
  const formattingIssues: ATSIssue[] = [];
  let formattingScore = 20;

  const avgBulletLen =
    allBullets.length > 0
      ? allBullets.reduce((sum, b) => sum + b.split(/\s+/).length, 0) /
        allBullets.length
      : 0;

  if (experience.length > 0 && allBullets.length === 0) {
    formattingScore = Math.min(formattingScore, 8);
    formattingIssues.push({
      category: "formatting",
      severity: "critical",
      message: "Experience roles were found, but no bullets were parsed",
      fix: "Use standard bullet points under each role and avoid placing bullet content inside columns, shapes, or tables",
    });
    hardPenalty += 10;
  }

  if (allBullets.length > 0 && avgBulletLen > 35) {
    formattingScore -= 5;
    formattingIssues.push({
      category: "formatting",
      severity: "warning",
      message: `Average bullet length is ${Math.round(avgBulletLen)} words (ideal: 15–25)`,
      fix: "Tighten each bullet to one clear idea: action, scope, and result",
    });
  }

  if (allBullets.length > 0 && avgBulletLen < 8) {
    formattingScore -= 5;
    formattingIssues.push({
      category: "formatting",
      severity: "warning",
      message: "Bullets are too short to provide enough ATS signal",
      fix: "Add context to each bullet: what you did, with what tool, and what changed",
    });
  }

  const rolesWithFewBullets = experience.filter((r) => (r.bullets || []).length < 2);
  if (rolesWithFewBullets.length > 0) {
    formattingScore -= 4;
    formattingIssues.push({
      category: "formatting",
      severity: "warning",
      message: `${rolesWithFewBullets.length} role(s) have fewer than 2 bullets`,
      fix: "Aim for 2–5 bullets per role so the ATS can capture enough skill and impact information",
    });
  }

  const rolesWithDates = experience.filter(
    (r) => r.startDate?.trim() || r.endDate?.trim()
  );
  if (experience.length > 0 && rolesWithDates.length < experience.length * 0.6) {
    formattingScore -= 4;
    formattingIssues.push({
      category: "formatting",
      severity: "warning",
      message: "Many roles are missing dates",
      fix: "Use a consistent date format such as Mon YYYY – Mon YYYY or YYYY – YYYY",
    });
  }

  categories.push({
    category: "formatting",
    label: "Formatting & Parseability",
    score: Math.max(0, formattingScore),
    maxScore: 20,
    issues: formattingIssues,
  });

  // 3) Impact
  const impactIssues: ATSIssue[] = [];
  let impactScore = 20;

  if (allBullets.length === 0) {
    impactScore = 3;
    impactIssues.push({
      category: "impact",
      severity: "critical",
      message: "No bullet-level achievement language was detected",
      fix: "Add achievement-oriented bullets under each role using action verbs and concrete outcomes",
    });
  } else {
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
        fix: `Rewrite them with strong verbs such as "Led", "Built", "Reduced", "Delivered", or "Automated"`,
      });
    }

    const metricPattern = /\d+[\s%xX]|[$£€]\d|\d+[km+]/i;
    const bulletsWithMetrics = allBullets.filter((b) => metricPattern.test(b));
    const metricRatio =
      allBullets.length > 0 ? bulletsWithMetrics.length / allBullets.length : 0;

    if (metricRatio < 0.25 && allBullets.length >= 4) {
      impactScore -= 6;
      impactIssues.push({
        category: "impact",
        severity: "warning",
        message: `Only ${Math.round(metricRatio * 100)}% of bullets contain measurable outcomes`,
        fix: "Add percentages, counts, revenue, time saved, team size, or other concrete results where accurate",
      });
    }
  }

  categories.push({
    category: "impact",
    label: "Impact & Achievement Language",
    score: Math.max(0, impactScore),
    maxScore: 20,
    issues: impactIssues,
  });

  // 4) Role alignment
  const alignmentIssues: ATSIssue[] = [];
  let alignmentScore = 15;

  const titleCorpus = experience
    .map((r) => cleanText(r.title, 100).toLowerCase())
    .join(" ");
  const skillsCorpus = skills.join(" ").toLowerCase();
  const roleMatchCount = roleWords.filter(
    (w) => titleCorpus.includes(w) || skillsCorpus.includes(w)
  ).length;

  if (!targetRole) {
    alignmentScore = 5;
    alignmentIssues.push({
      category: "role_alignment",
      severity: "suggestion",
      message: "No target role provided",
      fix: "Set a target role so ATS scoring can evaluate role-fit and relevant keyword alignment",
    });
    hardPenalty += 4;
  } else if (roleWords.length > 0 && roleMatchCount === 0) {
    alignmentScore -= 9;
    alignmentIssues.push({
      category: "role_alignment",
      severity: "critical",
      message: `The parsed resume shows almost no alignment to "${ctx.targetRole}"`,
      fix: "Rename or reframe your profile summary, skills, and bullets toward the exact target role you want",
    });
  } else if (
    roleWords.length > 0 &&
    roleMatchCount < Math.ceil(roleWords.length / 2)
  ) {
    alignmentScore -= 6;
    alignmentIssues.push({
      category: "role_alignment",
      severity: "warning",
      message: `Job titles and skills only weakly align with "${ctx.targetRole}"`,
      fix: "Use the target role wording in your summary and add matching tools and responsibilities where accurate",
    });
  }

  if (!ctx.targetJobText?.trim()) {
    alignmentScore -= 4;
    alignmentIssues.push({
      category: "role_alignment",
      severity: "suggestion",
      message: "No job description provided, so role-fit analysis is limited",
      fix: "Paste a target job description for stronger keyword and requirements matching",
    });
  }

  if (experience.length === 0) {
    alignmentScore = Math.min(alignmentScore, 5);
  }

  categories.push({
    category: "role_alignment",
    label: "Role Alignment",
    score: Math.max(0, alignmentScore),
    maxScore: 15,
    issues: alignmentIssues,
  });

  // 5) Keyword match
  const keywordIssues: ATSIssue[] = [];
  let keywordScore = 0;

  if (!targetRole) {
    keywordScore = 2;
    keywordIssues.push({
      category: "keyword_match",
      severity: "suggestion",
      message: "Keyword scoring is limited without a target role",
      fix: "Enter the exact role you are targeting so the scorer can measure keyword coverage accurately",
    });
  } else {
    const matchedRoleWords = roleWords.filter((w) => corpus.includes(w)).length;
    const roleCoverage =
      roleWords.length > 0 ? matchedRoleWords / roleWords.length : 0;

    keywordScore += Math.round(roleCoverage * 10);

    if (skills.length >= 5) keywordScore += 2;
    if (skills.length >= 10) keywordScore += 2;
    if (skills.length >= 15) keywordScore += 2;

    if (ctx.targetJobText?.trim()) keywordScore += 4;

    if (matchedRoleWords === 0) {
      keywordIssues.push({
        category: "keyword_match",
        severity: "critical",
        message: `Core role keywords for "${ctx.targetRole}" are barely visible in the resume`,
        fix: "Add the exact role wording plus relevant tools, methods, and responsibilities into your summary, skills, and bullets",
      });
      keywordScore = Math.min(keywordScore, 4);
    } else if (roleCoverage < 0.5) {
      keywordIssues.push({
        category: "keyword_match",
        severity: "warning",
        message: "Keyword coverage for the target role is still weak",
        fix: "Increase role-specific tools, methods, and title variations where they are genuinely accurate",
      });
    }

    if (skills.length < 5) {
      keywordScore = Math.min(keywordScore, 4);
      keywordIssues.push({
        category: "keyword_match",
        severity: "warning",
        message: "Low visible skill coverage reduces ATS keyword confidence",
        fix: "Expand the Skills section with the main platforms, tools, and methods relevant to your target role",
      });
    }

    if (experience.length === 0 || allBullets.length === 0) {
      keywordScore = Math.min(keywordScore, 3);
    }
  }

  keywordScore = Math.max(0, Math.min(20, keywordScore));

  categories.push({
    category: "keyword_match",
    label: "Keyword Match",
    score: keywordScore,
    maxScore: 20,
    issues: keywordIssues,
  });

  const rawTotal = categories.reduce((sum, c) => sum + c.score, 0);
  const maxTotal = categories.reduce((sum, c) => sum + c.maxScore, 0);
  const overallScore = Math.max(
    0,
    Math.round((rawTotal / maxTotal) * 100) - hardPenalty
  );

  return {
    overallScore,
    grade: grade(overallScore),
    categories,
    topKeywordsFound: skills.slice(0, 8),
    topKeywordsMissing: [],
    summary: buildSummary(overallScore, categories, hardPenalty),
  };
}

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
    summary: buildSummary(overallScore, categories, 0),
  };
}