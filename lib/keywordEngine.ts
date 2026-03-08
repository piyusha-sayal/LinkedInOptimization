// lib/keywordEngine.ts
import type {
  KeywordInsights,
  StructuredResume,
  BrandingVersion,
  UserContext,
} from "./types";

const STOP = new Set([
  "the",
  "and",
  "a",
  "an",
  "to",
  "of",
  "in",
  "for",
  "with",
  "on",
  "at",
  "by",
  "from",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "this",
  "that",
  "it",
  "or",
  "we",
  "i",
  "you",
  "they",
  "them",
  "our",
  "your",
  "their",
  "my",
  "me",
  "he",
  "she",
  "his",
  "her",
  "than",
  "then",
  "into",
  "over",
  "under",
  "about",
  "across",
  "through",
  "using",
  "used",
  "built",
  "worked",
  "work",
  "responsible",
  "including",
  "support",
  "supported",
]);

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function tokenize(s: string): string[] {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.\-/\s]/g, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2 && !STOP.has(x));
}

function topTerms(text: string, limit = 40): string[] {
  const freq = new Map<string, number>();

  for (const t of tokenize(text)) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

function resumeToKeywordText(resume: StructuredResume): string {
  const basics = resume.basics || {};

  const basicParts = [
    basics.name,
    basics.summary,
    basics.location,
    basics.linkedin,
    basics.github,
    basics.portfolio,
  ];

  const expParts = (resume.experience || []).flatMap((role) => [
    role.title,
    role.company,
    role.location,
    role.startDate,
    role.endDate,
    ...(role.bullets || []),
  ]);

  const eduParts = (resume.education || []).flatMap((edu) => [
    edu.school,
    edu.degree,
    edu.field,
    edu.location,
  ]);

  const certParts = (resume.certifications || []).flatMap((cert) => [
    cert.name,
    cert.issuer,
    cert.issueDate,
  ]);

  const projectParts = (resume.projects || []).flatMap((project) => [
    project.name,
    project.description,
    ...(project.tech || []),
    project.link,
  ]);

  const skillParts = resume.skills || [];

  return [
    ...basicParts,
    ...expParts,
    ...eduParts,
    ...skillParts,
    ...certParts,
    ...projectParts,
  ]
    .filter(Boolean)
    .join(" ");
}

function optimizedToKeywordText(profile: BrandingVersion): string {
  const expParts = (profile.experience || []).flatMap((role) => [
    role.title,
    role.company,
    ...(role.bullets || []),
  ]);

  const certParts = (profile.certifications || []).flatMap((cert) => [
    cert.name,
    cert.issuer,
    cert.issueDate,
  ]);

  const projectParts = (profile.projects || []).flatMap((project) => [
    project.name,
    project.description,
    ...(project.tech || []),
  ]);

  return [
    profile.headline,
    profile.about,
    profile.banner_tagline,
    ...(profile.skills || []),
    ...expParts,
    ...certParts,
    ...projectParts,
  ]
    .filter(Boolean)
    .join(" ");
}

export function analyzeKeywords(
  resume: StructuredResume,
  optimized: BrandingVersion,
  ctx: UserContext
): KeywordInsights {
  const resumeText = resumeToKeywordText(resume);
  const optimizedText = optimizedToKeywordText(optimized);
  const jdText = String(ctx.targetJobText || "").trim();

  const resumeTop = new Set(topTerms(resumeText, 70));
  const optimizedTop = new Set(topTerms(optimizedText, 80));
  const jdTop = jdText ? new Set(topTerms(jdText, 60)) : new Set<string>();

  const matched: string[] = [];
  const missing: string[] = [];
  const weak: string[] = [];

  const targetTerms = jdText ? [...jdTop] : [...resumeTop].slice(0, 40);

  for (const term of targetTerms) {
    if (optimizedTop.has(term)) matched.push(term);
    else missing.push(term);
  }

  for (const term of optimizedTop) {
    const groundedInResume = resumeTop.has(term);
    const relevantToJD = jdTop.size === 0 || jdTop.has(term);

    if (!groundedInResume && relevantToJD) {
      weak.push(term);
    }
  }

  const matchedFinal = unique(matched).slice(0, 40);
  const missingFinal = unique(missing).slice(0, 40);
  const weakFinal = unique(weak).slice(0, 30);

  const suggestions: string[] = [];

  if (missingFinal.length > 0) {
    suggestions.push(
      `Add ${Math.min(8, missingFinal.length)} missing target keywords naturally into the headline, about section, and experience bullets.`
    );
  } else {
    suggestions.push("Keyword coverage looks strong.");
  }

  suggestions.push(
    "Repeat the strongest role keywords across the headline, about section, and at least two experience bullets."
  );
  suggestions.push(
    "Keep skills and tool keywords tied to actual projects, certifications, or experience for credibility."
  );

  if (weakFinal.length > 0) {
    suggestions.push(
      "Remove or replace weak keywords that are not clearly supported by the resume."
    );
  }

  return {
    matched: matchedFinal,
    missing: missingFinal,
    weak: weakFinal,
    suggestions,
  };
}