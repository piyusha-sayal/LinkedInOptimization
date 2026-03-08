// lib/scoringEngine.ts
import type { OptimizationScore, BrandingVersion, KeywordInsights } from "./types";

const ACTION_VERBS = new Set([
  "led",
  "built",
  "created",
  "developed",
  "designed",
  "implemented",
  "optimized",
  "improved",
  "automated",
  "delivered",
  "launched",
  "owned",
  "scaled",
  "reduced",
  "increased",
  "analyzed",
  "architected",
  "deployed",
  "migrated",
  "integrated",
  "streamlined",
  "executed",
  "managed",
  "drove",
  "enhanced",
  "collaborated",
  "produced",
  "supported",
  "transformed",
]);

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function pct(n: number): number {
  return clamp(Math.round(n * 100));
}

function countQuantified(bullets: string[]): number {
  const re = /(\d+%|\$\d+|\d+\s*(k|m|b)\b|\b\d+\b)/i;
  return bullets.filter((b) => re.test(b)).length;
}

function actionVerbRatio(bullets: string[]): number {
  if (!bullets.length) return 0;

  const hits = bullets.filter((b) => {
    const firstWord = (b.trim().toLowerCase().split(/\s+/)[0] || "").replace(/[^a-z]/g, "");
    return ACTION_VERBS.has(firstWord);
  }).length;

  return hits / bullets.length;
}

function readabilityScore(text: string): number {
  const clean = String(text || "").trim();
  if (!clean) return 0;

  const sentences = clean
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const words = clean.split(/\s+/).filter(Boolean);
  const avgSentenceLength = sentences.length ? words.length / sentences.length : words.length;
  const punctuationCount = (clean.match(/[,:;()]/g) || []).length;

  let score = 100;

  if (avgSentenceLength > 22) {
    score -= (avgSentenceLength - 22) * 2.2;
  }

  if (punctuationCount > 30) {
    score -= (punctuationCount - 30) * 0.8;
  }

  return clamp(Math.round(score));
}

function headlineQuality(headline: string, keywordAlignmentPct: number): number {
  const len = (headline || "").trim().length;
  if (!len) return 0;

  let score = 55;

  if (len >= 80 && len <= 220) score += 18;
  else if (len >= 50 && len < 80) score += 10;
  else if (len > 220) score -= 12;

  score += keywordAlignmentPct * 0.22;

  return clamp(Math.round(score));
}

function aboutQuality(about: string, completenessPct: number, clarity: number): number {
  const len = (about || "").trim().length;
  if (!len) return 0;

  let score = 50;

  if (len >= 250 && len <= 1800) score += 18;
  else if (len >= 120) score += 10;
  else score -= 8;

  score += completenessPct * 0.12;
  score += clarity * 0.2;

  return clamp(Math.round(score));
}

function experienceQuality(
  experienceCount: number,
  quantifiedPct: number,
  actionVerbPct: number
): number {
  if (!experienceCount) return 0;

  let score = 52;

  if (experienceCount >= 2) score += 8;

  score += quantifiedPct * 0.2;
  score += actionVerbPct * 0.2;

  return clamp(Math.round(score));
}

function skillsQuality(skillCount: number, seoStrength: number, keywordAlignmentPct: number): number {
  if (!skillCount) return 0;

  let score = 50;

  if (skillCount >= 10 && skillCount <= 40) score += 12;
  else if (skillCount > 40) score += 6;
  else if (skillCount < 8) score -= 8;

  score += seoStrength * 0.18;
  score += keywordAlignmentPct * 0.18;

  return clamp(Math.round(score));
}

export function scoreOptimization(
  optimized: BrandingVersion,
  keywords: KeywordInsights
): OptimizationScore {
  const headline = optimized.headline || "";
  const about = optimized.about || "";
  const experience = Array.isArray(optimized.experience) ? optimized.experience : [];
  const skills = Array.isArray(optimized.skills) ? optimized.skills : [];

  const headlineOk = headline.trim().length > 0 ? 1 : 0;
  const aboutOk = about.trim().length > 0 ? 1 : 0;
  const expOk = experience.length > 0 ? 1 : 0;
  const skillsOk = skills.length > 0 ? 1 : 0;

  const completeness = (headlineOk + aboutOk + expOk + skillsOk) / 4;

  const allBullets = experience.flatMap((role) => role.bullets || []);
  const quantified =
    allBullets.length > 0 ? countQuantified(allBullets) / allBullets.length : 0;

  const actionVerb = actionVerbRatio(allBullets);

  const keywordAlignment =
    keywords.matched.length + keywords.missing.length > 0
      ? keywords.matched.length / (keywords.matched.length + keywords.missing.length)
      : 0.8;

  const seoStrength = clamp(
    60 + (keywords.matched.length - keywords.missing.length) * 2 - keywords.weak.length
  );

  const clarity = readabilityScore(
    [headline, about, allBullets.join(". ")].filter(Boolean).join(". ")
  );

  const keywordAlignmentPct = pct(keywordAlignment);
  const quantifiedPct = pct(quantified);
  const actionVerbPct = pct(actionVerb);
  const completenessPct = pct(completeness);

  const headlineScore = headlineQuality(headline, keywordAlignmentPct);
  const aboutScore = aboutQuality(about, completenessPct, clarity);
  const experienceScore = experienceQuality(
    experience.length,
    quantifiedPct,
    actionVerbPct
  );
  const skillsScore = skillsQuality(skills.length, seoStrength, keywordAlignmentPct);

  const overall =
    headlineScore * 0.24 +
    aboutScore * 0.24 +
    experienceScore * 0.3 +
    skillsScore * 0.22;

  return {
    overall: clamp(Math.round(overall)),
    breakdown: {
      headline: headlineScore,
      about: aboutScore,
      experience: experienceScore,
      skills: skillsScore,
    },
  };
}