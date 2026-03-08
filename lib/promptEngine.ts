// lib/promptEngine.ts
import "server-only";

import type {
  OptimizeMode,
  StructuredResume,
  UserContext,
  ResumeRole,
} from "./types";

export const SYSTEM_INSTRUCTIONS = `
You are a senior LinkedIn profile strategist and copywriter.
You produce strictly factual, high-signal LinkedIn content.
NEVER use em-dashes (the long dash —). Use a plain hyphen-minus (-) instead.

Core rules:
- Return valid JSON only (unless instructed otherwise)
- No markdown, no code fences, no commentary
- Never invent employers, dates, metrics, tools, links, or certifications
- Never add roles, companies, or projects not in the source data
- Omit unknown scalar fields; use empty arrays for missing lists
- Write in active voice, recruiter-readable, results-oriented language
- Adapt tone and keyword density based on the optimization mode
`.trim();

type PromptSpec = {
  schemaName: string;
  schema: unknown;
  userPrompt: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function industryLine(ctx: UserContext): string {
  const ind = cleanText(ctx.industry || "", 80);
  return ind || "Not specified";
}

function jobTextBlock(ctx: UserContext, maxLen = 1400): string {
  return cleanText(ctx.targetJobText || "", maxLen);
}

/** Mode-specific writing guidance injected into every prompt */
function modeGuidance(mode: OptimizeMode): string {
  switch (mode) {
    case "Branding":
      return `
Mode: Branding
- Write for human readers first, algorithms second
- Differentiated, authentic voice — avoid clichés like "passionate" or "results-driven"
- Lead with unique value proposition and concrete proof points
- Keyword integration should feel natural, not stuffed
- Tone: confident, credible, specific
`.trim();

    case "Recruiter":
      return `
Mode: Recruiter / ATS
- Optimize for applicant tracking systems and keyword scanners
- Put the highest-signal keywords in the first sentence
- Use exact job title variations and industry-standard tool names
- Bullets: start with strong action verbs, include scope/scale when supported
- Tone: direct, skimmable, metric-forward
`.trim();

    case "Executive":
      return `
Mode: Executive / Leadership
- Emphasize strategy, ownership, cross-functional impact, and organizational outcomes
- Frame contributions at the business level, not the task level
- Use boardroom vocabulary: P&L, transformation, stakeholders, vision, scale
- Minimize tactical/technical detail; maximize strategic narrative
- Tone: authoritative, strategic, gravitas
`.trim();

    default:
      return "Write clearly and professionally.";
  }
}

/** Condensed profile snapshot used across all prompts */
function profileSnapshot(structured: StructuredResume) {
  const basics = structured.basics || {};
  const exp = (structured.experience || []).slice(0, 5);
  const skills = cleanArray(structured.skills, 20);
  const certs = (structured.certifications || []).slice(0, 6).map((c) => cleanText(c.name, 100));
  const projects = (structured.projects || []).slice(0, 4).map((p) => ({
    name: cleanText(p.name, 100),
    tech: cleanArray(p.tech, 8),
  }));
  const edu = (structured.education || []).slice(0, 3).map((e) => ({
    school: cleanText(e.school, 100),
    degree: cleanText(e.degree, 100),
    field: cleanText(e.field, 100),
  }));

  return {
    name: cleanText(basics.name, 80),
    location: cleanText(basics.location, 80),
    summary: cleanText(basics.summary, 400),
    linkedin: cleanText(basics.linkedin, 200),
    github: cleanText(basics.github, 200),
    portfolio: cleanText(basics.portfolio, 200),
    recent_roles: exp.slice(0, 4).map((r) => ({
      title: cleanText(r.title, 100),
      company: cleanText(r.company, 100),
      start: cleanText(r.startDate, 30),
      end: cleanText(r.endDate, 30),
      bullets: cleanArray(r.bullets, 3),
    })),
    skills,
    certifications: certs,
    projects,
    education: edu,
  };
}

/** Base task context injected into most prompts */
function baseCtx(structured: StructuredResume, ctx: UserContext, mode: OptimizeMode) {
  return {
    target_role: cleanText(ctx.targetRole, 120),
    industry: industryLine(ctx),
    seniority: cleanText(ctx.seniority || "Mid", 40),
    mode_guidance: modeGuidance(mode),
    target_job_description: jobTextBlock(ctx, 1200),
    profile: profileSnapshot(structured),
  };
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const RESUME_SCHEMA = {
  type: "object",
  properties: {
    basics: {
      type: "object",
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
        properties: {
          company: { type: "string" },
          title: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
          location: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
        },
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
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
    skills: { type: "array", items: { type: "string" } },
    certifications: {
      type: "array",
      items: {
        type: "object",
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
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          tech: { type: "array", items: { type: "string" } },
          link: { type: "string" },
        },
      },
    },
  },
  required: ["basics", "experience", "education", "skills", "certifications", "projects"],
};

const SKILLS_SCHEMA = {
  type: "object",
  properties: { skills: { type: "array", items: { type: "string" } } },
  required: ["skills"],
};

const CERTS_SCHEMA = {
  type: "object",
  properties: {
    certifications: {
      type: "array",
      items: {
        type: "object",
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

const PROJECTS_SCHEMA = {
  type: "object",
  properties: {
    projects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name:            { type: "string",  description: "Project name (required by LinkedIn)" },
          description:     { type: "string",  description: "Up to 2000 chars. LinkedIn's actual limit." },
          skills:          { type: "array", items: { type: "string" }, description: "Top 5 skills used — LinkedIn recommends adding these" },
          startMonth:      { type: "string",  description: "Month name e.g. January" },
          startYear:       { type: "string",  description: "4-digit year e.g. 2022" },
          endMonth:        { type: "string",  description: "Month name or empty if ongoing" },
          endYear:         { type: "string",  description: "4-digit year or empty if ongoing" },
          currentlyWorking:{ type: "boolean", description: "true if still working on it" },
          associatedWith:  { type: "string",  description: "Company/role name this project was part of, if applicable" },
          url:             { type: "string",  description: "Project URL if available" },
        },
        required: ["name", "description"],
      },
    },
  },
  required: ["projects"],
};

const SINGLE_ROLE_SCHEMA = {
  type: "object",
  properties: {
    company:   { type: "string" },
    title:     { type: "string" },
    startDate: { type: "string" },
    endDate:   { type: "string" },
    location:  { type: "string" },
    bullets:   { type: "array", items: { type: "string" } },
    skills:    { type: "array", items: { type: "string" }, description: "Top 5-8 tools and technologies used in this specific role" },
  },
  required: ["company", "title", "bullets"],
};

// ─── Prompt Generators ──────────────────────────────────────────────────────

export function generateResumeStructuringPrompt(rawText: string): PromptSpec {
  const cleaned = cleanText(rawText, 12000); // raised from 7000 — rich resumes can be 8k–12k chars
  return {
    schemaName: "StructuredResume",
    schema: RESUME_SCHEMA,
    userPrompt: `
Extract all resume information into structured JSON. Follow these rules precisely:

NAME EXTRACTION (critical — do not skip):
- The candidate's name is almost always the FIRST line or the largest text at the top of the resume
- It is typically 2–4 words: first name + optional middle + last name
- It will NOT be labeled "Name:" — just look for the first prominent standalone proper noun(s)
- Do NOT confuse it with a company name or job title
- If you can identify a plausible human name at or near the top, use it — even if unlabeled
- Only leave basics.name empty if the text provides absolutely no identifiable person name

EXPERIENCE EXTRACTION (critical — do not skip):
- Extract ALL jobs, roles, and positions — do not stop at 2 or 3
- A role entry starts when you see a company name + job title + date range together
- Dates appear in many formats: "Jan 2021 – Mar 2023", "2021-2023", "Jan'21 – Present", "01/2021 to 03/2023" — extract them all
- If dates are not clearly present, still extract the role with empty date fields
- If bullet points are not clearly listed, still extract the role with an empty bullets array
- Do NOT skip a role just because its formatting is unusual
- Extract up to 10 experience entries

GENERAL EXTRACTION RULES:
- Preserve exact company names, job titles, and dates as written
- Split compound roles into separate entries if dates differ
- For bullets: extract meaningful accomplishments; up to 6 per role
- For skills: extract all explicitly mentioned tools, technologies, and methodologies (no cap)
- For certifications: include if explicitly named; issuer can be inferred from cert name if obvious
- For projects: include if described with any meaningful detail
- Keep the summary field empty if no summary exists — do NOT generate one
- Extract email, phone, location, LinkedIn URL, GitHub URL if present

OUTPUT: Compact JSON only. No markdown. No code fences. Return the FULL JSON — do not truncate.

RESUME TEXT:
${cleaned}
    `.trim(),
  };
}

export function generateHeadlinePrompt(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const payload = baseCtx(structured, ctx, mode);
  const hasJD = !!ctx.targetJobText?.trim();

  return {
    schemaName: "HeadlineResult",
    schema: {},
    userPrompt: `
Generate ONE LinkedIn headline for this professional.

${compactJson(payload)}

HEADLINE RULES:
- Maximum 220 characters (LinkedIn hard limit)
- Must include the target role or a close variation: "${ctx.targetRole}"
- Seniority level: ${ctx.seniority}
- ${hasJD ? "Mirror 1–2 exact keyword phrases from the job description" : "Use 1–2 high-signal keywords from their actual skill set"}
- No emojis, no hashtags, no generic filler ("passionate about", "results-driven")
- Structure options (pick the best fit):
  a) [Role] | [Key Skill] | [Value Prop]
  b) [Role] specializing in [Domain] — [Achievement/Context]  
  c) [Role] @ [Company type/size] | [Top 2 skills]
- The headline must be grounded in their actual background — no invented claims

RETURN: Plain text only. One headline. No quotes. No JSON.
    `.trim(),
  };
}

export function generateAboutPrompt(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const payload = baseCtx(structured, ctx, mode);
  const hasJD = !!ctx.targetJobText?.trim();

  return {
    schemaName: "AboutResult",
    schema: {},
    userPrompt: `
Write ONE LinkedIn About section for this professional.

${compactJson(payload)}

ABOUT SECTION RULES:
- Length: 200–400 words (ideal LinkedIn range)
- Structure:
  1. Hook (1–2 sentences): Who they are + primary value — avoid "I am a [job title]" openers
  2. Core expertise paragraph: What they do best, grounded in their actual experience
  3. Impact/proof paragraph: Specific accomplishments, projects, or scope (only what's supported by the data)
  4. ${hasJD ? "Alignment paragraph: How their background maps to the target role requirements" : "What they bring: Unique combination of skills or cross-domain value"}
  5. Closing line: Open to opportunities / what kind of role/team they're seeking
- First-person voice ("I", not third-person)
- No invented metrics, companies, or tools not present in the profile
- No buzzword padding: "passionate", "driven", "guru", "ninja", "rockstar"
- Keywords should appear naturally, not be keyword-stuffed
- End with one clear "open to" statement relevant to: ${ctx.targetRole}

RETURN: Plain text only. No JSON. No section headers.
    `.trim(),
  };
}

export function generateSingleExperienceRolePrompt(
  role: ResumeRole,
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const modeGuide = modeGuidance(mode);
  const hasJD = !!ctx.targetJobText?.trim();

  const roleCtx = {
    target_role: cleanText(ctx.targetRole, 120),
    seniority: ctx.seniority,
    mode_guidance: modeGuide,
    target_job_description: hasJD ? jobTextBlock(ctx, 600) : "",
    profile_skills: cleanArray(structured.skills, 15),
    role: {
      company: cleanText(role.company, 120),
      title: cleanText(role.title, 120),
      location: cleanText(role.location, 100),
      startDate: cleanText(role.startDate, 40),
      endDate: cleanText(role.endDate, 40),
      original_bullets: cleanArray(role.bullets, 5),
    },
  };

  return {
    schemaName: "SingleExperienceRole",
    schema: SINGLE_ROLE_SCHEMA,
    userPrompt: `
Rewrite one experience role entry for LinkedIn optimization.

${compactJson(roleCtx)}

REWRITE RULES:
- Preserve: company name, job title, location, startDate, endDate exactly as provided
- Do NOT change the employer name or fabricate a new one
- Generate 2-3 impactful bullets (2 minimum, 3 only if strongly supported)
- Each bullet must:
  * Start with a strong past-tense action verb (Led, Built, Reduced, Launched, etc.)
  * Be grounded in the original bullets or skills listed - no invention
  * Include scope/scale/impact only when clearly supported by source data
  * Be 15-25 words long (concise but complete)
  * NOT start with "Responsible for", "Helped", "Assisted", or "Worked on"
- skills: list 5-8 specific tools and technologies demonstrably used in this role (from profile_skills + bullets)
- ${hasJD ? "Prioritize language that aligns with the job description keywords" : `Optimize for the target role: ${ctx.targetRole}`}
- IMPORTANT: Do NOT use em-dashes (the long dash character). Use a hyphen-minus (-) instead.

RETURN: JSON object matching the schema. Company/title/dates preserved exactly. Include skills array.
    `.trim(),
  };
}

export function generateSkillsPrompt(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const payload = baseCtx(structured, ctx, mode);
  const hasJD = !!ctx.targetJobText?.trim();

  return {
    schemaName: "SkillsResult",
    schema: SKILLS_SCHEMA,
    userPrompt: `
Generate an optimized LinkedIn skills list for this professional.

${compactJson(payload)}

SKILLS RULES:
- Return 25–40 skills total
- Priority order:
  1. Skills explicitly listed in their profile (always include these)
  2. Skills clearly demonstrated in their experience bullets
  3. ${hasJD ? "Skills mentioned in the job description that are plausibly supported by their background" : `Skills strongly expected for "${ctx.targetRole}" at ${ctx.seniority} level`}
- Skill format: Use industry-standard names (e.g., "Python" not "python programming")
- Mix categories proportionally:
  • Hard/technical skills (tools, languages, platforms): ~60%
  • Domain/methodology skills (Agile, Data Modeling, etc.): ~25%
  • Soft/leadership skills (only if supported by seniority/bullets): ~15%
- No duplicates, no vague skills ("Communication", "Teamwork" unless strongly relevant)
- Do NOT invent niche tools not referenced or strongly implied in the profile

RETURN: JSON with "skills" array only.
    `.trim(),
  };
}

export function generateCertificationsPrompt(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const certs = (structured.certifications || []).slice(0, 10).map((c) => ({
    name:          cleanText(c.name, 150),
    issuer:        cleanText(c.issuer, 100),
    issueDate:     cleanText(c.issueDate, 40),
    credentialId:  cleanText(c.credentialId, 80),
    credentialUrl: cleanText(c.credentialUrl, 200),
  }));

  // LinkedIn "Add license or certification" fields:
  // Name (required), Issuing organization, Issue date (Month + Year),
  // Expiration date, Credential ID, Credential URL
  return {
    schemaName: "CertificationsResult",
    schema: {
      type: "object",
      properties: {
        certifications: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name:          { type: "string", description: "Certification name — required on LinkedIn" },
              issuer:        { type: "string", description: "Issuing organization name" },
              issueMonth:    { type: "string", description: "Month name e.g. January — LinkedIn asks for month separately" },
              issueYear:     { type: "string", description: "4-digit year e.g. 2023" },
              expiryMonth:   { type: "string", description: "Expiry month if applicable, else omit" },
              expiryYear:    { type: "string", description: "Expiry year if applicable, else omit" },
              credentialId:  { type: "string", description: "Credential ID — paste directly into LinkedIn" },
              credentialUrl: { type: "string", description: "Credential URL — paste directly into LinkedIn" },
            },
            required: ["name"],
          },
        },
      },
      required: ["certifications"],
    },
    userPrompt: `
Normalize certifications for direct entry into LinkedIn's "Add license or certification" form.

LinkedIn's form has these fields:
1. Name (required)
2. Issuing organization
3. Issue date: Month + Year (separate fields)
4. Expiration date: Month + Year (optional)
5. Credential ID
6. Credential URL

Target role: ${ctx.targetRole}
Certifications from resume: ${compactJson(certs)}

RULES:
- Output ONLY certifications present in the input data — never invent new ones
- Infer the issuer from the cert name when obvious (e.g. "AWS Certified" → issuer: "Amazon Web Services", "Google Cloud" → issuer: "Google", "IBM" → issuer: "IBM")
- Split issueDate into issueMonth + issueYear (e.g. "Jan 2023" → month: "January", year: "2023")
- If only a year is present, leave issueMonth empty
- Reorder by relevance to: ${ctx.targetRole} (most relevant first)
- Preserve credentialId and credentialUrl exactly as given
- Return compact JSON, no markdown, no code fences

RETURN: JSON object with "certifications" array only.
    `.trim(),
  };
}

export function generateProjectsPrompt(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const projects = (structured.projects || []).slice(0, 5).map((p) => ({
    name:        cleanText(p.name, 120),
    description: cleanText(p.description, 600),
    tech:        cleanArray(p.tech, 10),
    link:        cleanText(p.link, 200),
  }));

  // Derive company names from experience so model can suggest "associatedWith"
  const companies = (structured.experience || []).slice(0, 6).map((r) =>
    cleanText(r.company, 80)
  ).filter(Boolean);

  // LinkedIn "Add project" form fields:
  // Project name (required), Description (2000 char limit),
  // Skills (top 5 recommended), Media, Currently working (checkbox),
  // Start date (Month + Year), End date (Month + Year), Associated with (company)
  return {
    schemaName: "ProjectsResult",
    schema: PROJECTS_SCHEMA,
    userPrompt: `
Rewrite project entries for direct entry into LinkedIn's "Add project" form.

LinkedIn's "Add project" form has exactly these fields:
1. Project name (required)
2. Description (max 2000 characters — this is LinkedIn's hard limit)
3. Skills: top 5 skills used in the project
4. Media: (we will skip this)
5. Currently working on this project: true/false
6. Start date: Month + Year
7. End date: Month + Year (leave empty if currently working)
8. Associated with: which company/role from their experience this project was done under

Target role: ${ctx.targetRole}
Mode: ${mode}
Projects source data: ${compactJson(projects)}
Candidate's companies (for associatedWith): ${companies.join(", ") || "N/A"}

REWRITE RULES:
- Rewrite ONLY projects present in the source data — do not invent new ones
- description: 3–5 sentences. Structure: [what was built] → [technologies/approach used] → [outcome or impact]. Max 2000 chars.
- skills: list up to 5 skills/technologies actually used in this project (from the tech array or description)
- startMonth / startYear / endMonth / endYear: extract from project data if dates are present, otherwise leave empty strings
- currentlyWorking: true only if description implies ongoing work
- associatedWith: if the project was clearly done at one of the candidate's companies, name that company — otherwise leave empty
- url: preserve any link from the source data exactly
- Reorder projects by relevance to: ${ctx.targetRole}

RETURN: JSON object with "projects" array only. No markdown. No code fences.
    `.trim(),
  };
}

export function generateBannerTaglinePrompt(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const snap = profileSnapshot(structured);

  return {
    schemaName: "BannerTaglineResult",
    schema: {},
    userPrompt: `
Generate ONE short LinkedIn banner tagline for this professional.

Target role: ${ctx.targetRole}
Seniority: ${ctx.seniority}
Mode: ${mode}
Top skills: ${snap.skills.slice(0, 8).join(", ")}
Recent title: ${snap.recent_roles[0]?.title || "N/A"} at ${snap.recent_roles[0]?.company || "N/A"}

TAGLINE RULES:
- 3–8 words maximum
- Specific to their domain — no generic phrases ("Making an Impact", "Building the Future")
- No emojis, no hashtags
- Should complement the headline, not repeat it
- Examples of good taglines:
  • "Data Engineering at Scale"
  • "Cloud Infrastructure for Fast-Growing Teams"
  • "Product Strategy | B2B SaaS | 0→1"
  • "Full-Stack Engineer. ML Curious."

RETURN: Plain text only. One tagline. No quotes.
    `.trim(),
  };
}

export function generatePositioningAdvicePrompt(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const payload = baseCtx(structured, ctx, mode);

  return {
    schemaName: "PositioningAdviceResult",
    schema: {},
    userPrompt: `
Provide concise, actionable LinkedIn positioning advice for this professional.

${compactJson(payload)}

Write in plain text using these exact labeled sections:

POSITIONING ANGLE:
[2–3 sentences on how to position this person for ${ctx.targetRole}. Be specific — reference their actual background.]

STRONGEST PROOF POINTS:
• [Most credible accomplishment or signal]
• [Second strongest]
• [Third strongest]
(max 4 points, grounded in their actual profile)

KEYWORD STRATEGY:
[2–3 sentences on which keywords to prioritize, where to place them, and why — based on their target role and actual background]

DE-EMPHASIZE:
• [One thing that doesn't serve the ${ctx.targetRole} target]
• [Second if applicable]

TOP 3 PROFILE IMPROVEMENTS:
1. [Most impactful change to make right now]
2. [Second priority]
3. [Third priority]

OUTREACH PITCH (for DMs or cover letters):
[3–4 lines they could use when reaching out to recruiters or hiring managers for ${ctx.targetRole} roles. Authentic, specific, not generic.]

RULES:
- Every point must reference their actual profile data
- No invented metrics or fabricated claims
- Keep each section tight — this is a tactical brief, not an essay
- If job description was provided, align advice to it

RETURN: Plain text only. Use the section labels above exactly.
    `.trim(),
  };
}

// ─── Legacy export kept for compatibility ───────────────────────────────────

export function generateExperiencePrompt(
  structured: StructuredResume,
  ctx: UserContext,
  mode: OptimizeMode
): PromptSpec {
  const exp = (structured.experience || []).slice(0, 5).map((r) => ({
    title: cleanText(r.title, 120),
    company: cleanText(r.company, 120),
    location: cleanText(r.location, 100),
    startDate: cleanText(r.startDate, 40),
    endDate: cleanText(r.endDate, 40),
    bullets: cleanArray(r.bullets, 4),
  }));

  return {
    schemaName: "ExperienceResult",
    schema: {},
    userPrompt: `
Rewrite experience entries for LinkedIn. Target role: ${ctx.targetRole}. Mode: ${mode}.
Experience: ${compactJson(exp)}
Return 2 bullets per role, strong action verbs, no fabricated data.
    `.trim(),
  };
}