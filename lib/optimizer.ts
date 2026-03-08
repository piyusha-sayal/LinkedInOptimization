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

// ─── Config ─────────────────────────────────────────────────────────────────

const DEFAULT_MODE: OptimizeMode = "Branding";
const REQUEST_DELAY_MS = Number(process.env.LLM_REQUEST_DELAY_MS ?? 2000);

// Model tiers — override via env
const MODEL_STRUCTURE =
  process.env.NOVA_STRUCTURE_MODEL ?? "nova-2-lite-v1";
const MODEL_CHEAP =
  process.env.NOVA_GENERATION_MODEL ?? "nova-2-lite-v1";
const MODEL_RICH =
  process.env.NOVA_RICH_MODEL ?? "nova-2-lite-v1";

// Token budgets — tuned per section
const TOKEN_BUDGETS: Record<SectionKey | "structuring", number> = {
  structuring:      3200, // raised — resumes with 5+ roles + skills need 2500–3200 tokens
  headline:          120,
  about:             600,
  experience:        350, // per role
  skills:            300,
  certifications:    600, // raised from 200 — 3-5 cert objects with all fields needs ~500 tokens
  projects:          700, // raised — LinkedIn project fields: name, description, skills, dates, association
  banner_tagline:     60,
  positioning_advice: 700,
};

// ─── Utilities ───────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function pace() {
  if (REQUEST_DELAY_MS > 0) await sleep(REQUEST_DELAY_MS);
}

function resolveMode(mode?: string): OptimizeMode {
  if (mode === "Branding" || mode === "Recruiter" || mode === "Executive")
    return mode;
  return DEFAULT_MODE;
}

// ─── Sanitizers ──────────────────────────────────────────────────────────────

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

  const certifications = Array.isArray(src.certifications)
    ? src.certifications.slice(0, 15).map((item: unknown) => {
        const c = (item ?? {}) as Record<string, unknown>;
        return {
          name: clean(c.name ?? c, 200),
          issuer: clean(c.issuer, 200) || undefined,
          issueDate: clean(c.issueDate, 50) || undefined,
          credentialId: clean(c.credentialId, 100) || undefined,
          credentialUrl: clean(c.credentialUrl, 300) || undefined,
        };
      })
    : [];

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
  const bullets = Array.isArray(generated?.bullets) && generated!.bullets.length
    ? generated!.bullets
    : fallback.bullets;

  const generatedSkills = Array.isArray(generated?.skills) && generated!.skills.length
    ? (generated!.skills as string[]).slice(0, 8)
    : Array.isArray(fallback.skills) ? fallback.skills.slice(0, 8) : [];

  return {
    company:   clean(fallback.company, 200), // Always preserve original
    title:     clean(fallback.title, 200),   // Always preserve original
    location:  clean(generated?.location || fallback.location, 200) || undefined,
    startDate: clean(fallback.startDate, 50) || undefined,
    endDate:   clean(fallback.endDate, 50) || undefined,
    bullets:   cleanArr(bullets, 3, 280),
    skills:    generatedSkills.length ? generatedSkills : undefined,
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

// ─── Section Generators ───────────────────────────────────────────────────────

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
      // Graceful degradation: keep original role on failure
      console.warn(`[optimizer] Experience role rewrite failed for "${role.title}", keeping original. Error: ${err}`);
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
      const out = await llm.generateText({
        model: MODEL_CHEAP,
        instructions: `${SYSTEM_INSTRUCTIONS}\nReturn plain text only. No JSON. No quotes.`,
        input: spec.userPrompt,
        maxOutputTokens: TOKEN_BUDGETS.headline,
        temperature: 0.15,
      });
      // Strip quotes if model wraps output
      return clean(out.replace(/^["']|["']$/g, ""), 220);
    }

    case "about": {
      const spec = generateAboutPrompt(structured, ctx, mode);
      const out = await llm.generateText({
        model: MODEL_RICH,
        instructions: `${SYSTEM_INSTRUCTIONS}\nReturn plain text only. No JSON. No section headers.`,
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
      return Array.isArray(out?.certifications) ? out.certifications : [];
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
      const out = await llm.generateText({
        model: MODEL_CHEAP,
        instructions: `${SYSTEM_INSTRUCTIONS}\nReturn plain text only. No JSON. No quotes.`,
        input: spec.userPrompt,
        maxOutputTokens: TOKEN_BUDGETS.banner_tagline,
        temperature: 0.25,
      });
      return clean(out.replace(/^["']|["']$/g, ""), 120);
    }

    case "positioning_advice": {
      const spec = generatePositioningAdvicePrompt(structured, ctx, mode);
      const out = await llm.generateText({
        model: MODEL_RICH,
        instructions: `${SYSTEM_INSTRUCTIONS}\nReturn plain text. Use the labeled sections specified. No JSON. No markdown fences.`,
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

// ─── Full Mode Generation ─────────────────────────────────────────────────────

async function generateOneMode(
  llm: ReturnType<typeof createLLMClient>,
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): Promise<ModeResult> {
  const modeCtx = { ...ctx, mode };

  const headline = (await generateSectionData(llm, structured, modeCtx, "headline")) as string;
  await pace();

  const about = (await generateSectionData(llm, structured, modeCtx, "about")) as string;
  await pace();

  const experience = (await generateSectionData(llm, structured, modeCtx, "experience")) as ResumeRole[];
  // pace() already called inside rewriteExperienceSeparately

  const skills = (await generateSectionData(llm, structured, modeCtx, "skills")) as string[];
  await pace();

  const certifications = (await generateSectionData(
    llm, structured, modeCtx, "certifications"
  )) as BrandingVersion["certifications"];
  await pace();

  const projects = (await generateSectionData(
    llm, structured, modeCtx, "projects"
  )) as BrandingVersion["projects"];
  await pace();

  const banner_tagline = (await generateSectionData(
    llm, structured, modeCtx, "banner_tagline"
  )) as string;
  await pace();

  const positioning_advice = (await generateSectionData(
    llm, structured, modeCtx, "positioning_advice"
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Step 1: Parse resume and create session.
 * Returns session id + structured profile preview.
 */
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

/**
 * Step 2: Generate a single section using the parsed session.
 * Context overrides are merged so the user can change mode/role between calls.
 */
export async function optimizeSectionFromSession(
  id: string,
  section: SectionKey,
  overrides?: Partial<UserContext>
) {
  const session = getParseSession(id);
  if (!session) throw new Error("Session not found or expired. Please re-parse your resume.");

  const llm = createLLMClient();
  const mergedCtx = mergeContext(session.ctx, overrides);

  // Persist context updates to session
  updateParseSession(id, { ctx: mergedCtx });

  const data = await generateSectionData(llm, session.structured, mergedCtx, section);
  putSectionResult(id, section, data);

  return { section, data };
}

/**
 * Legacy bulk pipeline (kept for /api/optimize compatibility).
 * Prefer the parse+section-by-section flow for new UI.
 */
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