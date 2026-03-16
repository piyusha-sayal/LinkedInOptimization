// lib/optimizer.ts
import "server-only";

import crypto from "crypto";
import type {
  BrandingVersion,
  ModeResult,
  OptimizeMode,
  OptimizeResponse,
  ResumeRole,
  SectionKey,
  StructuredResume,
  UserContext,
} from "./types";

import { parseResumeToStructuredJSON, type UploadedFile } from "./resumeParser";
import {
  SYSTEM_INSTRUCTIONS,
  generateAboutPrompt,
  generateBannerTaglinePrompt,
  generateCertificationsPrompt,
  generateHeadlinePrompt,
  generatePositioningAdvicePrompt,
  generateProjectsPrompt,
  generateResumeStructuringPrompt,
  generateSingleExperienceRolePrompt,
  generateSkillsPrompt,
} from "./promptEngine";
import { analyzeKeywords } from "./keywordEngine";
import { scoreOptimization } from "./scoringEngine";
import {
  getParseSession,
  putParseSession,
  putResult,
  putSectionResult,
  updateParseSession,
} from "./sessionStore";
import { createLLMClient } from "./aiClient";
import {
  normalizeCertificationItems,
  recoverCertificationIssuers,
  type CertificationLike,
  type NormalizedCertification,
} from "./certifications";

const DEFAULT_MODE: OptimizeMode = "Branding";
const REQUEST_DELAY_MS = Number(process.env.LLM_REQUEST_DELAY_MS ?? 2000);

const MODEL_STRUCTURE = process.env.NOVA_STRUCTURE_MODEL ?? "nova-2-lite-v1";
const MODEL_CHEAP = process.env.NOVA_GENERATION_MODEL ?? "nova-2-lite-v1";
const MODEL_RICH = process.env.NOVA_RICH_MODEL ?? "nova-2-lite-v1";

const TOKEN_BUDGETS: Record<SectionKey | "structuring", number> = {
  structuring: 3200,
  headline: 120,
  about: 600,
  experience: 350,
  skills: 300,
  certifications: 600,
  projects: 700,
  banner_tagline: 60,
  positioning_advice: 700,
};

type CertificationItem = CertificationLike;

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function pace() {
  if (REQUEST_DELAY_MS > 0) await sleep(REQUEST_DELAY_MS);
}

function resolveMode(mode?: string): OptimizeMode {
  if (mode === "Branding" || mode === "Recruiter" || mode === "Executive") {
    return mode;
  }
  return DEFAULT_MODE;
}

function clean(value: unknown, maxLen = 4000): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function cleanArr(value: unknown, maxItems = 20, maxLen = 300): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clean(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function certKey(name?: string): string {
  return clean(name, 200)
    .replace(/\s*[\(\[]\s*[^\)\]]{2,80}\s*[\)\]]\s*$/, "")
    .toLowerCase()
    .trim();
}

function mergeCertificationItems(
  source: CertificationItem[],
  generated: CertificationItem[]
): CertificationItem[] {
  const normalizedSource = normalizeCertificationItems(source || []);
  const normalizedGenerated = normalizeCertificationItems(generated || []);

  if (!normalizedGenerated.length) {
    return normalizedSource;
  }

  const sourceByKey = new Map(
    normalizedSource.map((item) => [certKey(item.name), item])
  );

  const usedKeys = new Set<string>();

  const mergedInGeneratedOrder = normalizedGenerated.map((item) => {
    const key = certKey(item.name);
    const sourceMatch = sourceByKey.get(key);

    if (key) usedKeys.add(key);

    return {
      ...sourceMatch,
      ...item,
      name: item.name || sourceMatch?.name || undefined,
      issuer: item.issuer || sourceMatch?.issuer || undefined,
      credentialId: item.credentialId || sourceMatch?.credentialId || undefined,
      credentialUrl: item.credentialUrl || sourceMatch?.credentialUrl || undefined,
      issueMonth: item.issueMonth || sourceMatch?.issueMonth || undefined,
      issueYear: item.issueYear || sourceMatch?.issueYear || undefined,
      expiryMonth: item.expiryMonth || sourceMatch?.expiryMonth || undefined,
      expiryYear: item.expiryYear || sourceMatch?.expiryYear || undefined,
    };
  });

  const remainingSource = normalizedSource.filter(
    (item) => !usedKeys.has(certKey(item.name))
  );

  return normalizeCertificationItems([
    ...mergedInGeneratedOrder,
    ...remainingSource,
  ]);
}

type MultiOptionText = {
  primary: string;
  options: string[];
};

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of items) {
    const value = clean(item, 300);
    if (!value) continue;

    const key = value.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(value);
  }

  return out;
}

function sanitizeMultiOptionText(
  input: unknown,
  maxLenPerOption: number,
  fallback = ""
): MultiOptionText {
  const src =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  const rawPrimary = clean(src.primary, maxLenPerOption);
  const rawOptions = Array.isArray(src.options)
    ? src.options.map((x) => clean(x, maxLenPerOption))
    : [];

  const options = uniqueStrings(rawOptions.filter(Boolean)).slice(0, 5);

  const primary = rawPrimary || options[0] || clean(fallback, maxLenPerOption);

  const finalOptions = uniqueStrings([primary, ...options].filter(Boolean)).slice(
    0,
    5
  );

  return {
    primary,
    options: finalOptions,
  };
}

function coerceMultiOptionTextFromLines(
  raw: string,
  maxLenPerOption: number,
  fallback = ""
): MultiOptionText {
  const lines = String(raw ?? "")
    .split(/\r?\n/)
    .map((line) =>
      clean(
        line
          .replace(/^[\-\*\d\.\)\s]+/, "")
          .replace(/^["']|["']$/g, ""),
        maxLenPerOption
      )
    )
    .filter(Boolean);

  return sanitizeMultiOptionText(
    {
      primary: lines[0] || fallback,
      options: lines,
    },
    maxLenPerOption,
    fallback
  );
}

function sanitizeStructuredResume(input: unknown): StructuredResume {
  const src =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  const rawBasics =
    src.basics && typeof src.basics === "object"
      ? (src.basics as Record<string, unknown>)
      : {};

  const basics = {
    name: clean(rawBasics.name, 200),
    email: clean(rawBasics.email, 200),
    phone: clean(rawBasics.phone, 80),
    location: clean(rawBasics.location, 200),
    linkedin: clean(rawBasics.linkedin, 300),
    github: clean(rawBasics.github, 300),
    portfolio: clean(rawBasics.portfolio, 300),
    summary: clean(rawBasics.summary, 1200),
  };

  const experience = Array.isArray(src.experience)
    ? src.experience.slice(0, 10).map((item: unknown) => {
        const r = (item ?? {}) as Record<string, unknown>;
        return {
          company: clean(r.company, 200),
          title: clean(r.title, 200),
          startDate: clean(r.startDate, 50) || undefined,
          endDate: clean(r.endDate, 50) || undefined,
          location: clean(r.location, 200) || undefined,
          bullets: cleanArr(r.bullets, 5, 280),
        };
      })
    : [];

  const education = Array.isArray(src.education)
    ? src.education.slice(0, 6).map((item: unknown) => {
        const e = (item ?? {}) as Record<string, unknown>;
        return {
          school: clean(e.school, 200),
          degree: clean(e.degree, 200) || undefined,
          field: clean(e.field, 200) || undefined,
          startDate: clean(e.startDate, 50) || undefined,
          endDate: clean(e.endDate, 50) || undefined,
          location: clean(e.location, 200) || undefined,
        };
      })
    : [];

  const skills = cleanArr(src.skills, 50, 120);

  const certificationsRaw = Array.isArray(src.certifications)
    ? src.certifications.slice(0, 15).map((item: unknown) => {
        const c = (item ?? {}) as Record<string, unknown>;
        return {
          name: clean(c.name ?? c, 200),
          issuer: clean(c.issuer, 200) || undefined,
          issueDate: clean(c.issueDate, 50) || undefined,
          issueMonth: clean(c.issueMonth, 20) || undefined,
          issueYear: clean(c.issueYear, 10) || undefined,
          expiryMonth: clean(c.expiryMonth, 20) || undefined,
          expiryYear: clean(c.expiryYear, 10) || undefined,
          credentialId: clean(c.credentialId, 100) || undefined,
          credentialUrl: clean(c.credentialUrl, 300) || undefined,
        };
      })
    : [];

  const certifications = normalizeCertificationItems(certificationsRaw);

  const projects = Array.isArray(src.projects)
    ? src.projects.slice(0, 8).map((item: unknown) => {
        const p = (item ?? {}) as Record<string, unknown>;
        return {
          name: clean(p.name, 200),
          description: clean(p.description, 1500) || undefined,
          tech: cleanArr(p.tech, 15, 100),
          link: clean(p.link, 300) || undefined,
        };
      })
    : [];

  return { basics, experience, education, skills, certifications, projects };
}

function sanitizeRole(
  generated: Partial<ResumeRole> | undefined,
  fallback: ResumeRole
): ResumeRole {
  const bullets =
    Array.isArray(generated?.bullets) && generated.bullets.length
      ? generated.bullets
      : fallback.bullets;

  const generatedSkills =
    Array.isArray(generated?.skills) && generated.skills.length
      ? (generated.skills as string[]).slice(0, 8)
      : Array.isArray(fallback.skills)
        ? fallback.skills.slice(0, 8)
        : [];

  return {
    company: clean(fallback.company, 200),
    title: clean(fallback.title, 200),
    location: clean(generated?.location || fallback.location, 200) || undefined,
    startDate: clean(fallback.startDate, 50) || undefined,
    endDate: clean(fallback.endDate, 50) || undefined,
    bullets: cleanArr(bullets, 3, 280),
    skills: generatedSkills.length ? generatedSkills : undefined,
  };
}

function mergeContext(
  existing: UserContext,
  overrides?: Partial<UserContext>
): UserContext {
  const next = overrides ?? {};
  return {
    targetRole: clean(next.targetRole ?? existing.targetRole, 160),
    industry: clean(next.industry ?? existing.industry, 120) || undefined,
    seniority: (next.seniority || existing.seniority) as UserContext["seniority"],
    mode: resolveMode(next.mode || existing.mode),
    targetJobText:
      clean(next.targetJobText ?? existing.targetJobText, 2500) || undefined,
  };
}

async function rewriteExperienceSeparately(
  llm: ReturnType<typeof createLLMClient>,
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): Promise<ResumeRole[]> {
  const sourceRoles = (structured.experience || []).slice(0, 5);
  const rewritten: ResumeRole[] = [];

  for (const role of sourceRoles) {
    try {
      const spec = generateSingleExperienceRolePrompt(role, structured, ctx, mode);
      const roleOut = await llm.generateJSON<Partial<ResumeRole>>({
        model: MODEL_RICH,
        instructions: SYSTEM_INSTRUCTIONS,
        input: spec.userPrompt,
        maxOutputTokens: TOKEN_BUDGETS.experience,
        temperature: 0.1,
      });
      rewritten.push(sanitizeRole(roleOut, role));
    } catch (err) {
      console.warn(
        `[optimizer] Experience role rewrite failed for "${role.title}", keeping original. Error: ${err}`
      );
      rewritten.push(role);
    }
    await pace();
  }

  return rewritten;
}

export async function generateSectionData(
  llm: ReturnType<typeof createLLMClient>,
  structured: StructuredResume,
  ctx: UserContext,
  section: SectionKey
): Promise<unknown> {
  const mode = resolveMode(ctx.mode);

  switch (section) {
    case "headline": {
      const spec = generateHeadlinePrompt(structured, ctx, mode);

      try {
        const out = await llm.generateJSON<{
          primary?: string;
          options?: string[];
        }>({
          model: MODEL_CHEAP,
          instructions: `${SYSTEM_INSTRUCTIONS}
Return valid JSON only.
Shape:
{
  "primary": "best headline option",
  "options": ["option 1", "option 2", "option 3", "option 4", "option 5"]
}
Rules:
- Write 5 distinct LinkedIn headline options.
- Each must be under 220 characters.
- No markdown.
- No explanation.
- Use only accurate information from the resume and context.
- "primary" must also appear in "options".`,
          input: spec.userPrompt,
          maxOutputTokens: TOKEN_BUDGETS.headline * 5,
          temperature: 0.25,
        });

        return sanitizeMultiOptionText(out, 220);
      } catch {
        const fallbackText = await llm.generateText({
          model: MODEL_CHEAP,
          instructions: `${SYSTEM_INSTRUCTIONS}
Return plain text only.
Write exactly 5 headline options.
One option per line.
No numbering.
No markdown.
Each must be under 220 characters.`,
          input: spec.userPrompt,
          maxOutputTokens: TOKEN_BUDGETS.headline * 5,
          temperature: 0.25,
        });

        return coerceMultiOptionTextFromLines(fallbackText, 220);
      }
    }

    case "about": {
      const spec = generateAboutPrompt(structured, ctx, mode);
      const out = await llm.generateText({
        model: MODEL_RICH,
        instructions: `${SYSTEM_INSTRUCTIONS}
Return plain text only. No JSON. No section headers.`,
        input: spec.userPrompt,
        maxOutputTokens: TOKEN_BUDGETS.about,
        temperature: 0.2,
      });
      return clean(out, 5000);
    }

    case "experience": {
      return await rewriteExperienceSeparately(llm, structured, ctx, mode);
    }

    case "skills": {
      const spec = generateSkillsPrompt(structured, ctx, mode);
      const out = await llm.generateJSON<{ skills?: unknown[] }>({
        model: MODEL_CHEAP,
        instructions: SYSTEM_INSTRUCTIONS,
        input: spec.userPrompt,
        maxOutputTokens: TOKEN_BUDGETS.skills,
        temperature: 0,
      });
      return Array.isArray(out?.skills) ? out.skills : [];
    }

    case "certifications": {
      const spec = generateCertificationsPrompt(structured, ctx, mode);
      const out = await llm.generateJSON<{ certifications?: unknown[] }>({
        model: MODEL_CHEAP,
        instructions: SYSTEM_INSTRUCTIONS,
        input: spec.userPrompt,
        maxOutputTokens: TOKEN_BUDGETS.certifications,
        temperature: 0,
      });

      const items = Array.isArray(out?.certifications)
        ? (out.certifications as CertificationItem[])
        : [];

      return mergeCertificationItems(
        (structured.certifications || []) as CertificationItem[],
        items
      );
    }

    case "projects": {
      const spec = generateProjectsPrompt(structured, ctx, mode);
      const out = await llm.generateJSON<{ projects?: unknown[] }>({
        model: MODEL_RICH,
        instructions: SYSTEM_INSTRUCTIONS,
        input: spec.userPrompt,
        maxOutputTokens: TOKEN_BUDGETS.projects,
        temperature: 0.1,
      });
      return Array.isArray(out?.projects) ? out.projects : [];
    }

    case "banner_tagline": {
      const spec = generateBannerTaglinePrompt(structured, ctx, mode);

      try {
        const out = await llm.generateJSON<{
          primary?: string;
          options?: string[];
        }>({
          model: MODEL_CHEAP,
          instructions: `${SYSTEM_INSTRUCTIONS}
Return valid JSON only.
Shape:
{
  "primary": "best banner tagline",
  "options": ["option 1", "option 2", "option 3", "option 4", "option 5"]
}
Rules:
- Write 5 distinct LinkedIn banner tagline options.
- Each must be 3 to 8 words.
- No emojis.
- No quotes.
- No markdown.
- Keep them premium, concise, and accurate.
- "primary" must also appear in "options".`,
          input: spec.userPrompt,
          maxOutputTokens: TOKEN_BUDGETS.banner_tagline * 5,
          temperature: 0.35,
        });

        return sanitizeMultiOptionText(out, 80);
      } catch {
        const fallbackText = await llm.generateText({
          model: MODEL_CHEAP,
          instructions: `${SYSTEM_INSTRUCTIONS}
Return plain text only.
Write exactly 5 banner tagline options.
One option per line.
No numbering.
No markdown.
Each must be 3 to 8 words.`,
          input: spec.userPrompt,
          maxOutputTokens: TOKEN_BUDGETS.banner_tagline * 5,
          temperature: 0.35,
        });

        return coerceMultiOptionTextFromLines(fallbackText, 80);
      }
    }

    case "positioning_advice": {
      const spec = generatePositioningAdvicePrompt(structured, ctx, mode);
      const out = await llm.generateText({
        model: MODEL_RICH,
        instructions: `${SYSTEM_INSTRUCTIONS}
Return plain text. Use the labeled sections specified. No JSON. No markdown fences.`,
        input: spec.userPrompt,
        maxOutputTokens: TOKEN_BUDGETS.positioning_advice,
        temperature: 0.15,
      });
      return clean(out, 8000);
    }

    default:
      throw new Error(`Unsupported section: ${section}`);
  }
}

async function generateOneMode(
  llm: ReturnType<typeof createLLMClient>,
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): Promise<ModeResult> {
  const modeCtx = { ...ctx, mode };

  const headline = (await generateSectionData(
    llm,
    structured,
    modeCtx,
    "headline"
  )) as unknown as BrandingVersion["headline"];
  await pace();

  const about = (await generateSectionData(
    llm,
    structured,
    modeCtx,
    "about"
  )) as string;
  await pace();

  const experience = (await generateSectionData(
    llm,
    structured,
    modeCtx,
    "experience"
  )) as ResumeRole[];

  const skills = (await generateSectionData(
    llm,
    structured,
    modeCtx,
    "skills"
  )) as string[];
  await pace();

  const certifications = (await generateSectionData(
    llm,
    structured,
    modeCtx,
    "certifications"
  )) as BrandingVersion["certifications"];
  await pace();

  const projects = (await generateSectionData(
    llm,
    structured,
    modeCtx,
    "projects"
  )) as BrandingVersion["projects"];
  await pace();

  const banner_tagline = (await generateSectionData(
    llm,
    structured,
    modeCtx,
    "banner_tagline"
  )) as unknown as BrandingVersion["banner_tagline"];
  await pace();

  const positioning_advice = (await generateSectionData(
    llm,
    structured,
    modeCtx,
    "positioning_advice"
  )) as string;

  const profile: BrandingVersion = {
    headline,
    about,
    experience,
    skills,
    certifications,
    projects,
    banner_tagline,
  };

  const keywords = analyzeKeywords(structured, profile, modeCtx);
  const score = scoreOptimization(profile, keywords);

  return { mode, profile, keywords, score, positioning_advice };
}

export async function parseResumeSession(file: UploadedFile, ctx: UserContext) {
  const llm = createLLMClient();

  const parsed = await parseResumeToStructuredJSON(file);
  const structuringSpec = generateResumeStructuringPrompt(parsed.cleanedText);

  const structuredRaw = await llm.generateJSON<StructuredResume>({
    model: MODEL_STRUCTURE,
    instructions: SYSTEM_INSTRUCTIONS,
    input: structuringSpec.userPrompt,
    maxOutputTokens: TOKEN_BUDGETS.structuring,
    temperature: 0,
  });

  const structured = sanitizeStructuredResume(structuredRaw);

  structured.certifications = recoverCertificationIssuers(
    structured.certifications || [],
    parsed.cleanedText
  );

  const sessionId = crypto.randomUUID();
  const mergedCtx = mergeContext(ctx, {});

  putParseSession({
    id: sessionId,
    structured,
    ctx: mergedCtx,
    sectionResults: {},
    createdAt: new Date().toISOString(),
  });

  return {
    id: sessionId,
    structured,
    preview: {
      name: structured.basics?.name,
      currentTitle: structured.experience?.[0]?.title,
      topSkills: (structured.skills || []).slice(0, 8),
    },
  };
}

export async function optimizeSectionFromStructured(
  structuredInput: StructuredResume,
  section: SectionKey,
  ctxInput: UserContext
) {
  const llm = createLLMClient();
  const structured = sanitizeStructuredResume(structuredInput);
  const mergedCtx = mergeContext(
    {
      targetRole: "",
      industry: "",
      seniority: "Mid",
      mode: DEFAULT_MODE,
      targetJobText: "",
    },
    ctxInput
  );

  const data = await generateSectionData(llm, structured, mergedCtx, section);
  return data;
}

export async function optimizeSectionFromSession(
  id: string,
  section: SectionKey,
  overrides?: Partial<UserContext>
) {
  const session = getParseSession(id);
  if (!session) {
    throw new Error("Session not found or expired. Please re-parse your resume.");
  }

  const llm = createLLMClient();
  const mergedCtx = mergeContext(session.ctx, overrides);

  updateParseSession(id, { ctx: mergedCtx });

  const data = await generateSectionData(llm, session.structured, mergedCtx, section);
  putSectionResult(id, section, data);

  return { section, data };
}

export async function runOptimizationPipeline(
  file: UploadedFile,
  ctx: UserContext
): Promise<OptimizeResponse> {
  const llm = createLLMClient();

  const parsed = await parseResumeToStructuredJSON(file);
  const structuringSpec = generateResumeStructuringPrompt(parsed.cleanedText);

  const structuredRaw = await llm.generateJSON<StructuredResume>({
    model: MODEL_STRUCTURE,
    instructions: SYSTEM_INSTRUCTIONS,
    input: structuringSpec.userPrompt,
    maxOutputTokens: TOKEN_BUDGETS.structuring,
    temperature: 0,
  });

  const structured = sanitizeStructuredResume(structuredRaw);

  structured.certifications = recoverCertificationIssuers(
    structured.certifications || [],
    parsed.cleanedText
  );

  await pace();

  const mode = resolveMode(ctx.mode);
  const modeResult = await generateOneMode(llm, structured, { ...ctx, mode }, mode);

  const results: OptimizeResponse["results"] = {
    [mode]: modeResult,
  };

  const resp: OptimizeResponse = {
    id: crypto.randomUUID(),
    results,
    branding_version: results.Branding?.profile,
    recruiter_version: results.Recruiter?.profile,
    executive_version: results.Executive?.profile,
    meta: {
      model: `${MODEL_STRUCTURE} | ${MODEL_CHEAP} | ${MODEL_RICH}`,
      createdAt: new Date().toISOString(),
    },
  };

  putResult(resp);
  return resp;
}