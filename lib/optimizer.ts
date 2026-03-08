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

const DEFAULT_MODE: OptimizeMode = "Branding";

const REQUEST_DELAY_MS = Number(process.env.LLM_REQUEST_DELAY_MS || 3200);

const NOVA_STRUCTURE_MODEL =
  process.env.NOVA_STRUCTURE_MODEL || "nova-2-lite-v1";

const NOVA_GENERATION_MODEL =
  process.env.NOVA_GENERATION_MODEL || "nova-2-lite-v1";

const NOVA_RICH_MODEL =
  process.env.NOVA_RICH_MODEL || "nova-2-lite-v1";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pace() {
  if (REQUEST_DELAY_MS > 0) {
    await sleep(REQUEST_DELAY_MS);
  }
}

function resolveMode(mode?: string): OptimizeMode {
  if (mode === "Branding" || mode === "Recruiter" || mode === "Executive") {
    return mode;
  }
  return DEFAULT_MODE;
}

function modesToGenerate(ctx: UserContext): OptimizeMode[] {
  return [resolveMode(ctx.mode)];
}

function cleanString(value: unknown, maxLen = 4000): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function cleanStringArray(
  value: unknown,
  maxItems = 20,
  maxLen = 300
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function sanitizeStructuredResume(input: unknown): StructuredResume {
  const src =
    input && typeof input === "object" ? (input as Record<string, any>) : {};

  const basics =
    src.basics && typeof src.basics === "object"
      ? {
          name: cleanString(src.basics.name, 200),
          email: cleanString(src.basics.email, 200),
          phone: cleanString(src.basics.phone, 80),
          location: cleanString(src.basics.location, 200),
          linkedin: cleanString(src.basics.linkedin, 300),
          github: cleanString(src.basics.github, 300),
          portfolio: cleanString(src.basics.portfolio, 300),
          summary: cleanString(src.basics.summary, 1200),
        }
      : {};

  const experience = Array.isArray(src.experience)
    ? src.experience.slice(0, 10).map((item: any) => ({
        company: cleanString(item?.company, 200),
        title: cleanString(item?.title, 200),
        startDate: cleanString(item?.startDate, 50) || undefined,
        endDate: cleanString(item?.endDate, 50) || undefined,
        location: cleanString(item?.location, 200) || undefined,
        bullets: cleanStringArray(item?.bullets, 4, 240),
      }))
    : [];

  const education = Array.isArray(src.education)
    ? src.education.slice(0, 8).map((item: any) => ({
        school: cleanString(item?.school, 200),
        degree: cleanString(item?.degree, 200) || undefined,
        field: cleanString(item?.field, 200) || undefined,
        startDate: cleanString(item?.startDate, 50) || undefined,
        endDate: cleanString(item?.endDate, 50) || undefined,
        location: cleanString(item?.location, 200) || undefined,
      }))
    : [];

  const skills = cleanStringArray(src.skills, 40, 120);

  const certifications = Array.isArray(src.certifications)
    ? src.certifications.slice(0, 12).map((item: any) => ({
        name: cleanString(item?.name ?? item, 200),
        issuer: cleanString(item?.issuer, 200) || undefined,
        issueDate: cleanString(item?.issueDate, 50) || undefined,
        credentialId: cleanString(item?.credentialId, 100) || undefined,
        credentialUrl: cleanString(item?.credentialUrl, 300) || undefined,
      }))
    : [];

  const projects = Array.isArray(src.projects)
    ? src.projects.slice(0, 8).map((item: any) => ({
        name: cleanString(item?.name, 200),
        description: cleanString(item?.description, 1200) || undefined,
        tech: cleanStringArray(item?.tech, 12, 100),
        link: cleanString(item?.link, 300) || undefined,
      }))
    : [];

  return {
    basics,
    experience,
    education,
    skills,
    certifications,
    projects,
  };
}

function sanitizeRole(
  generated: Partial<ResumeRole> | undefined,
  fallback: ResumeRole
): ResumeRole {
  return {
    company: cleanString(generated?.company || fallback.company, 200),
    title: cleanString(generated?.title || fallback.title, 200),
    location:
      cleanString(generated?.location || fallback.location, 200) || undefined,
    startDate:
      cleanString(generated?.startDate || fallback.startDate, 50) || undefined,
    endDate:
      cleanString(generated?.endDate || fallback.endDate, 50) || undefined,
    bullets: cleanStringArray(
      Array.isArray(generated?.bullets) && generated.bullets.length
        ? generated.bullets
        : fallback.bullets,
      2,
      220
    ),
  };
}

function mergeContext(
  existing: UserContext,
  overrides?: Partial<UserContext>
): UserContext {
  const next = overrides || {};

  return {
    targetRole: cleanString(next.targetRole ?? existing.targetRole, 160),
    industry: cleanString(next.industry ?? existing.industry, 120) || undefined,
    seniority: (next.seniority || existing.seniority) as UserContext["seniority"],
    mode: resolveMode(next.mode || existing.mode),
    targetJobText:
      cleanString(next.targetJobText ?? existing.targetJobText, 2500) ||
      undefined,
  };
}

async function rewriteExperienceSeparately(
  llm: ReturnType<typeof createLLMClient>,
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): Promise<ResumeRole[]> {
  const richModel = NOVA_RICH_MODEL;
  const sourceRoles = (structured.experience || []).slice(0, 4);
  const rewritten: ResumeRole[] = [];

  for (const role of sourceRoles) {
    const rolePrompt = generateSingleExperienceRolePrompt(
      role,
      structured,
      ctx,
      mode
    );

    const roleOut = await llm.generateJSON<ResumeRole>({
      model: richModel,
      instructions: SYSTEM_INSTRUCTIONS,
      input: rolePrompt.userPrompt,
      maxOutputTokens: 220,
      temperature: 0,
    });

    rewritten.push(sanitizeRole(roleOut, role));
    await pace();
  }

  return rewritten;
}

async function generateSectionData(
  llm: ReturnType<typeof createLLMClient>,
  structured: StructuredResume,
  ctx: UserContext,
  section: SectionKey
): Promise<unknown> {
  const mode = resolveMode(ctx.mode);
  const cheapModel = NOVA_GENERATION_MODEL;
  const richModel = NOVA_RICH_MODEL;

  switch (section) {
    case "headline": {
      const prompt = generateHeadlinePrompt(structured, ctx, mode);
      const out = await llm.generateText({
        model: cheapModel,
        instructions: `${SYSTEM_INSTRUCTIONS}\nReturn plain text only. No JSON.`,
        input: prompt.userPrompt,
        maxOutputTokens: 90,
        temperature: 0,
      });
      return cleanString(out, 220);
    }

    case "about": {
      const prompt = generateAboutPrompt(structured, ctx, mode);
      const out = await llm.generateText({
        model: richModel,
        instructions: `${SYSTEM_INSTRUCTIONS}\nReturn plain text only. No JSON.`,
        input: prompt.userPrompt,
        maxOutputTokens: 320,
        temperature: 0,
      });
      return cleanString(out, 4000);
    }

    case "experience": {
      const experience = await rewriteExperienceSeparately(
        llm,
        structured,
        ctx,
        mode
      );
      return experience;
    }

    case "skills": {
      const prompt = generateSkillsPrompt(structured, ctx, mode);
      const out = await llm.generateJSON<{ skills: string[] }>({
        model: cheapModel,
        instructions: SYSTEM_INSTRUCTIONS,
        input: prompt.userPrompt,
        schemaName: prompt.schemaName,
        schema: prompt.schema,
        maxOutputTokens: 170,
        temperature: 0,
      });
      return Array.isArray(out.skills) ? out.skills : [];
    }

    case "certifications": {
      const prompt = generateCertificationsPrompt(structured, ctx, mode);
      const out = await llm.generateJSON<{
        certifications: BrandingVersion["certifications"];
      }>({
        model: cheapModel,
        instructions: SYSTEM_INSTRUCTIONS,
        input: prompt.userPrompt,
        schemaName: prompt.schemaName,
        schema: prompt.schema,
        maxOutputTokens: 120,
        temperature: 0,
      });
      return Array.isArray(out.certifications) ? out.certifications : [];
    }

    case "projects": {
      const prompt = generateProjectsPrompt(structured, ctx, mode);
      const out = await llm.generateJSON<{
        projects: BrandingVersion["projects"];
      }>({
        model: richModel,
        instructions: SYSTEM_INSTRUCTIONS,
        input: prompt.userPrompt,
        schemaName: prompt.schemaName,
        schema: prompt.schema,
        maxOutputTokens: 320,
        temperature: 0,
      });
      return Array.isArray(out.projects) ? out.projects : [];
    }

    case "banner_tagline": {
      const prompt = generateBannerTaglinePrompt(structured, ctx, mode);
      const out = await llm.generateText({
        model: cheapModel,
        instructions: `${SYSTEM_INSTRUCTIONS}\nReturn plain text only. No JSON.`,
        input: prompt.userPrompt,
        maxOutputTokens: 40,
        temperature: 0,
      });
      return cleanString(out, 120);
    }

    case "positioning_advice": {
      const prompt = generatePositioningAdvicePrompt(structured, ctx, mode);
      const out = await llm.generateText({
        model: richModel,
        instructions: `${SYSTEM_INSTRUCTIONS}
Return plain text only. No JSON.
Keep the response concise but useful.
Use short labeled sections.
Do not use markdown code fences.`,
        input: prompt.userPrompt,
        maxOutputTokens: 420,
        temperature: 0,
      });
      return cleanString(out, 7000);
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
  const headline = (await generateSectionData(llm, structured, { ...ctx, mode }, "headline")) as string;
  await pace();

  const about = (await generateSectionData(llm, structured, { ...ctx, mode }, "about")) as string;
  await pace();

  const experience = (await generateSectionData(
    llm,
    structured,
    { ...ctx, mode },
    "experience"
  )) as ResumeRole[];
  await pace();

  const skills = (await generateSectionData(llm, structured, { ...ctx, mode }, "skills")) as string[];
  await pace();

  const certifications = (await generateSectionData(
    llm,
    structured,
    { ...ctx, mode },
    "certifications"
  )) as BrandingVersion["certifications"];
  await pace();

  const projects = (await generateSectionData(
    llm,
    structured,
    { ...ctx, mode },
    "projects"
  )) as BrandingVersion["projects"];
  await pace();

  const bannerTagline = (await generateSectionData(
    llm,
    structured,
    { ...ctx, mode },
    "banner_tagline"
  )) as string;
  await pace();

  const positioningAdvice = (await generateSectionData(
    llm,
    structured,
    { ...ctx, mode },
    "positioning_advice"
  )) as string;

  const profile: BrandingVersion = {
    headline,
    about,
    experience,
    skills,
    certifications,
    projects,
    banner_tagline: bannerTagline,
  };

  const keywords = analyzeKeywords(structured, profile, { ...ctx, mode });
  const score = scoreOptimization(profile, keywords);

  return {
    mode,
    profile,
    keywords,
    score,
    positioning_advice: positioningAdvice,
  };
}

export async function parseResumeSession(
  file: UploadedFile,
  ctx: UserContext
) {
  const llm = createLLMClient();

  const parsed = await parseResumeToStructuredJSON(file);
  const structuringPrompt = generateResumeStructuringPrompt(parsed.cleanedText);

  const structuredRaw = await llm.generateJSON<StructuredResume>({
    model: NOVA_STRUCTURE_MODEL,
    instructions: SYSTEM_INSTRUCTIONS,
    input: structuringPrompt.userPrompt,
    maxOutputTokens: 1400,
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

export async function optimizeSectionFromSession(
  id: string,
  section: SectionKey,
  overrides?: Partial<UserContext>
) {
  const session = getParseSession(id);
  if (!session) {
    throw new Error("Session not found or expired.");
  }

  const llm = createLLMClient();
  const mergedCtx = mergeContext(session.ctx, overrides);

  updateParseSession(id, { ctx: mergedCtx });

  const data = await generateSectionData(llm, session.structured, mergedCtx, section);
  putSectionResult(id, section, data);

  return {
    section,
    data,
  };
}

/**
 * Legacy bulk pipeline kept for compatibility.
 * The new UI should prefer parseResumeSession + optimizeSectionFromSession.
 */
export async function runOptimizationPipeline(
  file: UploadedFile,
  ctx: UserContext
): Promise<OptimizeResponse> {
  const llm = createLLMClient();

  const parsed = await parseResumeToStructuredJSON(file);
  const structuringPrompt = generateResumeStructuringPrompt(parsed.cleanedText);

  const structuredRaw = await llm.generateJSON<StructuredResume>({
    model: NOVA_STRUCTURE_MODEL,
    instructions: SYSTEM_INSTRUCTIONS,
    input: structuringPrompt.userPrompt,
    maxOutputTokens: 1400,
    temperature: 0,
  });

  const structured = sanitizeStructuredResume(structuredRaw);
  await pace();

  const modes = modesToGenerate(ctx);

  const perMode: ModeResult[] = [];
  for (const m of modes) {
    const result = await generateOneMode(llm, structured, { ...ctx, mode: m }, m);
    perMode.push(result);
    await pace();
  }

  const results: OptimizeResponse["results"] = {};
  for (const item of perMode) {
    results[item.mode] = item;
  }

  const resp: OptimizeResponse = {
    id: crypto.randomUUID(),
    results,
    branding_version: results.Branding?.profile,
    recruiter_version: results.Recruiter?.profile,
    executive_version: results.Executive?.profile,
    meta: {
      model: `${NOVA_STRUCTURE_MODEL} | ${NOVA_GENERATION_MODEL} | ${NOVA_RICH_MODEL}`,
      createdAt: new Date().toISOString(),
    },
  };

  putResult(resp);
  return resp;
}