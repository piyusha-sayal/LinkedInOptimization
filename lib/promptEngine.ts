// lib/promptEngine.ts
import "server-only";

import type {
  OptimizeMode,
  StructuredResume,
  UserContext,
  ResumeRole,
} from "./types";

export const SYSTEM_INSTRUCTIONS = `
You generate strictly factual LinkedIn optimization JSON.

Rules:
- Return valid JSON only
- No markdown
- No code fences
- No commentary
- No extra keys beyond the requested schema
- Do not invent employers, dates, metrics, projects, tools, links, industries, or certifications
- If something is unknown, omit it unless the schema requires an array
- Keep output concise and recruiter-readable
`.trim();

type PromptSpec = {
  schemaName: string;
  schema: unknown;
  userPrompt: string;
};

function cleanText(input: unknown, maxLen = 1200): string {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function cleanArray(input: unknown, maxItems = 12): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => cleanText(x, 120))
    .filter(Boolean)
    .slice(0, maxItems);
}

function compactJson(value: unknown): string {
  return JSON.stringify(value);
}

function industryOrDefault(ctx: UserContext): string {
  return cleanText(ctx.industry || "", 80) || "Not provided";
}

function jobTextOrDefault(ctx: UserContext, maxLen = 1400): string {
  const text = cleanText(ctx.targetJobText || "", maxLen);
  return text || "";
}

function modeGuidance(mode: OptimizeMode): string {
  switch (mode) {
    case "Branding":
      return "Write for strong professional positioning. Human-readable, differentiated, credible, not keyword spam.";
    case "Recruiter":
      return "Write for recruiter searchability and ATS alignment. Put high-signal keywords early. Be direct and skimmable.";
    case "Executive":
      return "Write with a leadership tone. Emphasize strategy, ownership, scale, cross-functional impact, and outcomes.";
    default:
      return "Write clearly and professionally.";
  }
}

function pickRoleHints(structured: StructuredResume) {
  const basics = structured.basics || {};
  const experience = Array.isArray(structured.experience) ? structured.experience : [];
  const education = Array.isArray(structured.education) ? structured.education : [];
  const projects = Array.isArray(structured.projects) ? structured.projects : [];
  const certifications = Array.isArray(structured.certifications)
    ? structured.certifications
    : [];
  const skills = cleanArray(structured.skills, 18);

  return {
    basics: {
      name: cleanText(basics.name, 120),
      location: cleanText(basics.location, 120),
      summary: cleanText(basics.summary, 400),
      linkedin: cleanText(basics.linkedin, 180),
      github: cleanText(basics.github, 180),
      portfolio: cleanText(basics.portfolio, 180),
    },
    recent_titles: experience
      .slice(0, 4)
      .map((r) => ({
        title: cleanText(r.title, 120),
        company: cleanText(r.company, 120),
      }))
      .filter((r) => r.title || r.company),
    top_skills: skills,
    project_names: projects
      .slice(0, 5)
      .map((p) => cleanText(p.name, 120))
      .filter(Boolean),
    certification_names: certifications
      .slice(0, 6)
      .map((c) => cleanText(c.name, 120))
      .filter(Boolean),
    education: education
      .slice(0, 3)
      .map((e) => ({
        school: cleanText(e.school, 120),
        degree: cleanText(e.degree, 120),
        field: cleanText(e.field, 120),
      }))
      .filter((e) => e.school || e.degree || e.field),
  };
}

function pickExperienceContext(structured: StructuredResume) {
  const experience = Array.isArray(structured.experience) ? structured.experience : [];

  return experience.slice(0, 5).map((r) => ({
    title: cleanText(r.title, 120),
    company: cleanText(r.company, 120),
    location: cleanText(r.location, 120),
    startDate: cleanText(r.startDate, 40),
    endDate: cleanText(r.endDate, 40),
    bullets: cleanArray(r.bullets, 4),
  }));
}

function pickProjectsContext(structured: StructuredResume) {
  const projects = Array.isArray(structured.projects) ? structured.projects : [];

  return projects.slice(0, 4).map((p) => ({
    name: cleanText(p.name, 120),
    description: cleanText(p.description, 260),
    tech: cleanArray(p.tech, 8),
    link: cleanText(p.link, 180),
  }));
}

function pickCertificationsContext(structured: StructuredResume) {
  const certifications = Array.isArray(structured.certifications)
    ? structured.certifications
    : [];

  return certifications.slice(0, 8).map((c) => ({
    name: cleanText(c.name, 120),
    issuer: cleanText(c.issuer, 120),
    issueDate: cleanText(c.issueDate, 40),
    credentialId: cleanText(c.credentialId, 80),
    credentialUrl: cleanText(c.credentialUrl, 180),
  }));
}

function baseTaskContext(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
) {
  return {
    targetRole: cleanText(ctx.targetRole, 120),
    industry: industryOrDefault(ctx),
    seniority: cleanText(ctx.seniority || "Mid", 40),
    mode,
    mode_guidance: modeGuidance(mode),
    targetJobText: jobTextOrDefault(ctx, 1200),
    profile: pickRoleHints(structured),
  };
}

const structuredResumeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    basics: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        location: { type: "string" },
        linkedin: { type: "string" },
        github: { type: "string" },
        portfolio: { type: "string" },
        summary: { type: "string" },
      },
    },
    experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          company: { type: "string" },
          title: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
          location: { type: "string" },
          bullets: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          school: { type: "string" },
          degree: { type: "string" },
          field: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
          location: { type: "string" },
        },
      },
    },
    skills: {
      type: "array",
      items: { type: "string" },
    },
    certifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          issuer: { type: "string" },
          issueDate: { type: "string" },
          credentialId: { type: "string" },
          credentialUrl: { type: "string" },
        },
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          tech: {
            type: "array",
            items: { type: "string" },
          },
          link: { type: "string" },
        },
      },
    },
  },
  required: ["basics", "experience", "education", "skills", "certifications", "projects"],
};

const headlineSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string" },
  },
  required: ["headline"],
};

const aboutSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    about: { type: "string" },
  },
  required: ["about"],
};

const experienceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          company: { type: "string" },
          title: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
          location: { type: "string" },
          bullets: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["company", "title", "bullets"],
      },
    },
  },
  required: ["experience"],
};

const singleExperienceRoleSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    company: { type: "string" },
    title: { type: "string" },
    startDate: { type: "string" },
    endDate: { type: "string" },
    location: { type: "string" },
    bullets: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["company", "title", "bullets"],
};

const skillsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    skills: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["skills"],
};

const certificationsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    certifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          issuer: { type: "string" },
          issueDate: { type: "string" },
          credentialId: { type: "string" },
          credentialUrl: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  required: ["certifications"],
};

const projectsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    projects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          tech: {
            type: "array",
            items: { type: "string" },
          },
          link: { type: "string" },
        },
        required: ["name", "description"],
      },
    },
  },
  required: ["projects"],
};

const bannerTaglineSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    banner_tagline: { type: "string" },
  },
  required: ["banner_tagline"],
};

const positioningAdviceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    positioning_advice: { type: "string" },
  },
  required: ["positioning_advice"],
};

export function generateResumeStructuringPrompt(rawText: string): PromptSpec {
  const cleanedResume = cleanText(rawText, 7000);

  return {
    schemaName: "StructuredResume",
    schema: structuredResumeSchema,
    userPrompt: `
Task:
Extract resume facts into structured JSON.

Return this shape:
{
  "basics": {},
  "experience": [],
  "education": [],
  "skills": [],
  "certifications": [],
  "projects": []
}

Requirements:
- Do not invent facts
- Do not guess dates, employers, links, metrics, tools, or certifications
- Omit unknown scalar fields
- Use empty arrays for missing lists
- Keep summary to max 2 short sentences
- Split experience into separate roles correctly
- Maximum 3 bullets per role
- Each bullet must be short and factual
- Maximum 12 skills
- Maximum 5 certifications
- Maximum 4 projects
- Return compact JSON only
- No markdown
- No code fences

Resume text:
${cleanedResume}
    `.trim(),
  };
}

export function generateHeadlinePrompt(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const payload = baseTaskContext(structured, ctx, mode);

  return {
    schemaName: "HeadlineResult",
    schema: headlineSchema,
    userPrompt: `
Task:
Generate one LinkedIn headline.

Requirements:
- Maximum 220 characters
- Include target role or a close equivalent
- Include 1 to 2 high-signal keywords if supported
- No emojis
- No hashtags
- No generic filler
- Must be consistent with the profile

Context:
${compactJson(payload)}
    `.trim(),
  };
}

export function generateAboutPrompt(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const payload = baseTaskContext(structured, ctx, mode);

  return {
    schemaName: "AboutResult",
    schema: aboutSchema,
    userPrompt: `
Task:
Generate one LinkedIn About section.

Requirements:
- 3 to 5 short paragraphs
- First lines should state role identity and value clearly
- Use tools, methods, projects, scope, or stakeholders only if supported
- No invented metrics
- End with an "Open to" line aligned to the target role
- Keep it skimmable and professional

Context:
${compactJson(payload)}
    `.trim(),
  };
}

export function generateExperiencePrompt(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const payload = {
    targetRole: cleanText(ctx.targetRole, 120),
    industry: industryOrDefault(ctx),
    seniority: cleanText(ctx.seniority || "Mid", 40),
    mode,
    mode_guidance: modeGuidance(mode),
    targetJobText: jobTextOrDefault(ctx, 900),
    experience: pickExperienceContext(structured),
  };

  return {
    schemaName: "ExperienceResult",
    schema: experienceSchema,
    userPrompt: `
Task:
Rewrite experience entries into LinkedIn-ready bullet-based roles.

Requirements:
- Preserve company, title, and dates exactly when present
- Do not invent dates or locations
- Do not merge separate roles
- Return maximum 2 bullets per role
- Each bullet must be short, factual, and high-signal
- Use numbers only if clearly supported
- Avoid "Responsible for"
- Keep JSON compact

Context:
${compactJson(payload)}
    `.trim(),
  };
}

export function generateSingleExperienceRolePrompt(
  role: ResumeRole,
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const payload = {
    targetRole: cleanText(ctx.targetRole, 120),
    industry: industryOrDefault(ctx),
    seniority: cleanText(ctx.seniority || "Mid", 40),
    mode,
    mode_guidance: modeGuidance(mode),
    targetJobText: jobTextOrDefault(ctx, 700),
    profile: {
      summary: cleanText(structured.basics?.summary, 240),
      top_skills: cleanArray(structured.skills, 12),
      recent_titles: (structured.experience || []).slice(0, 3).map((r) => ({
        title: cleanText(r.title, 120),
        company: cleanText(r.company, 120),
      })),
    },
    role: {
      company: cleanText(role.company, 120),
      title: cleanText(role.title, 120),
      location: cleanText(role.location, 120),
      startDate: cleanText(role.startDate, 40),
      endDate: cleanText(role.endDate, 40),
      bullets: cleanArray(role.bullets, 4),
    },
  };

  return {
    schemaName: "SingleExperienceRoleResult",
    schema: singleExperienceRoleSchema,
    userPrompt: `
Task:
Rewrite one experience role into a LinkedIn-ready role entry.

Requirements:
- Preserve company, title, and dates exactly when present
- Do not invent dates or location
- Do not change the employer
- Return maximum 2 bullets
- Each bullet must be short, factual, and high-signal
- Use numbers only if clearly supported
- Avoid "Responsible for"
- Keep JSON compact

Context:
${compactJson(payload)}
    `.trim(),
  };
}

export function generateSkillsPrompt(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const payload = baseTaskContext(structured, ctx, mode);

  return {
    schemaName: "SkillsResult",
    schema: skillsSchema,
    userPrompt: `
Task:
Generate an optimized LinkedIn skills list.

Requirements:
- Return 25 to 40 skills
- Prioritize target-role relevance
- Mix core skills, tools, methods, and only supported domain terms
- No duplicates
- Do not invent niche tools not supported or strongly implied

Context:
${compactJson(payload)}
    `.trim(),
  };
}

export function generateCertificationsPrompt(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const payload = {
    targetRole: cleanText(ctx.targetRole, 120),
    industry: industryOrDefault(ctx),
    seniority: cleanText(ctx.seniority || "Mid", 40),
    mode,
    mode_guidance: modeGuidance(mode),
    certifications: pickCertificationsContext(structured),
  };

  return {
    schemaName: "CertificationsResult",
    schema: certificationsSchema,
    userPrompt: `
Task:
Normalize and reorder certifications for LinkedIn.

Requirements:
- Keep only certifications already present
- Do not invent certifications
- Clean formatting
- Reorder by relevance to the target role and mode
- Include issuer or date only if available

Context:
${compactJson(payload)}
    `.trim(),
  };
}

export function generateProjectsPrompt(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const payload = {
    targetRole: cleanText(ctx.targetRole, 120),
    industry: industryOrDefault(ctx),
    seniority: cleanText(ctx.seniority || "Mid", 40),
    mode,
    mode_guidance: modeGuidance(mode),
    targetJobText: jobTextOrDefault(ctx, 900),
    projects: pickProjectsContext(structured),
  };

  return {
    schemaName: "ProjectsResult",
    schema: projectsSchema,
    userPrompt: `
Task:
Rewrite projects for clarity and recruiter impact.

Requirements:
- Keep only existing projects
- Do not invent metrics
- Use only supported tools or tech
- Keep descriptions concise and concrete
- Mention objective, method, and output when supported

Context:
${compactJson(payload)}
    `.trim(),
  };
}

export function generateBannerTaglinePrompt(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const payload = baseTaskContext(structured, ctx, mode);

  return {
    schemaName: "BannerTaglineResult",
    schema: bannerTaglineSchema,
    userPrompt: `
Task:
Generate one short LinkedIn banner tagline.

Requirements:
- Prefer 3 to 8 words
- No emojis
- No hashtags
- Be specific, not generic
- Must match the user's positioning

Context:
${compactJson(payload)}
    `.trim(),
  };
}

export function generatePositioningAdvicePrompt(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const payload = baseTaskContext(structured, ctx, mode);

  return {
    schemaName: "PositioningAdviceResult",
    schema: positioningAdviceSchema,
    userPrompt: `
Task:
Write concise LinkedIn positioning advice in plain text.

Use these labeled sections:
1) Positioning angle
2) Top proof points
3) Keyword strategy
4) What to de-emphasize
5) Next 3 improvements
6) Short outreach pitch

Requirements:
- Keep it concise and copy-paste ready
- Use short lines, not long paragraphs
- Top proof points: max 4 items
- What to de-emphasize: max 2 items
- Next improvements: max 3 items
- Outreach pitch: max 4 lines
- Use target job text only when provided
- Do not invent metrics or employers

Context:
${compactJson(payload)}
    `.trim(),
  };
}