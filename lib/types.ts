// lib/types.ts

export type OptimizeMode = "Branding" | "Recruiter" | "Executive";

export type Seniority =
  | "Junior"
  | "Mid"
  | "Senior"
  | "Lead"
  | "Director"
  | "VP";

export type SectionKey =
  | "headline"
  | "about"
  | "experience"
  | "skills"
  | "certifications"
  | "projects"
  | "banner_tagline"
  | "positioning_advice";
  
export type GeneratedImages = {
  profilePhotoUrl?: string;
  coverUrl?: string;
};

export type ResumeBasics = {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  summary?: string;
};

export type ResumeRole = {
  company: string;
  title: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  bullets: string[];
  skills?: string[];
};

export type ResumeEducation = {
  school: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
};

export type ResumeCertification = {
  name: string;
  issuer?: string;
  issueDate?: string;
  credentialId?: string;
  credentialUrl?: string;
};

export type ResumeProject = {
  name: string;
  description?: string;
  tech?: string[];
  link?: string;
};

export type StructuredResume = {
  basics: ResumeBasics;
  experience: ResumeRole[];
  education: ResumeEducation[];
  skills: string[];
  certifications: ResumeCertification[];
  projects: ResumeProject[];
};

export type BrandingVersion = {
  headline: string;
  about: string;
  experience: ResumeRole[];
  skills: string[];
  certifications: ResumeCertification[];
  projects: ResumeProject[];
  banner_tagline: string;
};

export type KeywordInsights = {
  matched: string[];
  missing: string[];
  weak: string[];
  suggestions: string[];
};

export type ScoreBreakdown = {
  headline: number;
  about: number;
  experience: number;
  skills: number;
};

export type OptimizationScore = {
  overall: number;
  breakdown: ScoreBreakdown;
};

export type UserContext = {
  targetRole: string;
  industry?: string;
  seniority: Seniority;
  mode?: OptimizeMode;
  targetJobText?: string;
};

export type ModeResult = {
  mode: OptimizeMode;
  profile: BrandingVersion;
  keywords: KeywordInsights;
  score: OptimizationScore;
  positioning_advice: string;
};

export type OptimizeResponse = {
  id: string;
  results: Partial<Record<OptimizeMode, ModeResult>>;

  branding_version?: BrandingVersion;
  recruiter_version?: BrandingVersion;
  executive_version?: BrandingVersion;
  images?: GeneratedImages;

  meta?: {
    model?: string;
    createdAt: string;
  };
};