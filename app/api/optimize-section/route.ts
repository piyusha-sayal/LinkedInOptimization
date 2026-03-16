import { NextResponse } from "next/server";
import {
  optimizeSectionFromSession,
  optimizeSectionFromStructured,
} from "@/lib/optimizer";
import type {
  OptimizeMode,
  Seniority,
  UserContext,
  SectionKey,
  StructuredResume,
} from "@/lib/types";

export const runtime = "nodejs";

type SectionState<T = unknown> = {
  status: "idle" | "loading" | "success" | "error";
  data?: T;
  error?: string;
};

const VALID_SECTIONS: SectionKey[] = [
  "headline",
  "about",
  "experience",
  "skills",
  "certifications",
  "projects",
  "banner_tagline",
  "positioning_advice",
];

function isSectionKey(value: string): value is SectionKey {
  return VALID_SECTIONS.includes(value as SectionKey);
}

function makeInitialSections(): Record<SectionKey, SectionState> {
  return {
    headline: { status: "idle" },
    about: { status: "idle" },
    experience: { status: "idle" },
    skills: { status: "idle" },
    certifications: { status: "idle" },
    projects: { status: "idle" },
    banner_tagline: { status: "idle" },
    positioning_advice: { status: "idle" },
  };
}

async function getWorkerWorkspace(workspaceId: string): Promise<{
  workspace: {
    structured_json?: string | null;
    ctx_json?: string | null;
    section_results_json?: string | null;
  };
}> {
  const workerBase = process.env.NEXT_PUBLIC_LINKEDUP_WORKER_URL;

  if (!workerBase) {
    throw new Error("Missing NEXT_PUBLIC_LINKEDUP_WORKER_URL.");
  }

  const res = await fetch(
    `${workerBase}/workspace/get?id=${encodeURIComponent(workspaceId)}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const json = await res.json();

  if (!res.ok || !json?.ok || !json?.workspace) {
    throw new Error(json?.error || "Failed to load workspace.");
  }

  return json as {
    workspace: {
      structured_json?: string | null;
      ctx_json?: string | null;
      section_results_json?: string | null;
    };
  };
}

async function saveParsedWorkspaceToWorker(
  workspaceId: string,
  structured: StructuredResume,
  ctx: UserContext,
  sectionResults: Record<SectionKey, SectionState>
): Promise<void> {
  const workerBase = process.env.NEXT_PUBLIC_LINKEDUP_WORKER_URL;

  if (!workerBase) {
    throw new Error("Missing NEXT_PUBLIC_LINKEDUP_WORKER_URL.");
  }

  const res = await fetch(`${workerBase}/workspace/save-parsed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workspaceId,
      structured,
      ctx,
      sectionResults,
    }),
    cache: "no-store",
  });

  const json = await res.json();

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || "Failed to save generated section.");
  }
}

function mergeContext(
  savedCtx: Partial<UserContext>,
  overrides: Partial<UserContext>
): UserContext {
  return {
    targetRole: "",
    industry: "",
    seniority: "Mid",
    mode: "Branding",
    targetJobText: "",
    ...savedCtx,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined)
    ),
  };
}

async function persistGeneratedSection(params: {
  workspaceId: string;
  section: SectionKey;
  sectionData: unknown;
  overrides: Partial<UserContext>;
}) {
  const data = await getWorkerWorkspace(params.workspaceId);

  const structuredJson = data.workspace?.structured_json;
  const ctxJson = data.workspace?.ctx_json;
  const sectionResultsJson = data.workspace?.section_results_json;

  if (!structuredJson) {
    throw new Error("Workspace structured data not found while saving section.");
  }

  let structured: StructuredResume;
  let savedCtx: Partial<UserContext> = {};
  let savedSections: Record<SectionKey, SectionState> = makeInitialSections();

  try {
    structured = JSON.parse(structuredJson) as StructuredResume;
  } catch {
    throw new Error("Workspace structured data is invalid.");
  }

  if (ctxJson) {
    try {
      savedCtx = JSON.parse(ctxJson) as Partial<UserContext>;
    } catch {
      savedCtx = {};
    }
  }

  if (sectionResultsJson) {
    try {
      const parsed = JSON.parse(
        sectionResultsJson
      ) as Record<SectionKey, SectionState>;
      savedSections = {
        ...makeInitialSections(),
        ...parsed,
      };
    } catch {
      savedSections = makeInitialSections();
    }
  }

  const mergedCtx = mergeContext(savedCtx, params.overrides);

  const nextSections: Record<SectionKey, SectionState> = {
    ...savedSections,
    [params.section]: {
      status: "success",
      data: params.sectionData,
    },
  };

  await saveParsedWorkspaceToWorker(
    params.workspaceId,
    structured,
    mergedCtx,
    nextSections
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const id = String(body?.id || "").trim();
    const workspaceId = String(body?.workspaceId || "").trim();
    const section = String(body?.section || "").trim();

    if (!id && !workspaceId) {
      return NextResponse.json(
        { error: "Missing session id or workspaceId." },
        { status: 400 }
      );
    }

    if (!isSectionKey(section)) {
      return NextResponse.json({ error: "Invalid section." }, { status: 400 });
    }

    const overrides: Partial<UserContext> = {
      targetRole: body?.targetRole
        ? String(body.targetRole).trim()
        : undefined,
      industry: body?.industry
        ? String(body.industry).trim()
        : undefined,
      seniority: body?.seniority
        ? (String(body.seniority).trim() as Seniority)
        : undefined,
      mode: body?.mode
        ? (String(body.mode).trim() as OptimizeMode)
        : undefined,
      targetJobText: body?.targetJobText
        ? String(body.targetJobText).replace(/\s+/g, " ").trim().slice(0, 2500)
        : undefined,
    };

    let resultData: unknown = null;

    if (id) {
      try {
        const result = await optimizeSectionFromSession(id, section, overrides);
        resultData = result.data;
      } catch (sessionError) {
        const sessionMessage =
          sessionError instanceof Error ? sessionError.message : "";

        const looksLikeMissingSession =
          sessionMessage.toLowerCase().includes("session not found") ||
          sessionMessage.toLowerCase().includes("expired");

        if (!workspaceId || !looksLikeMissingSession) {
          throw sessionError;
        }
      }
    }

    if (resultData === null) {
      if (!workspaceId) {
        return NextResponse.json(
          {
            error: "Session not found or expired. Please re-parse your resume.",
          },
          { status: 404 }
        );
      }

      const data = await getWorkerWorkspace(workspaceId);
      const structuredJson = data.workspace?.structured_json;
      const ctxJson = data.workspace?.ctx_json;

      if (!structuredJson) {
        return NextResponse.json(
          {
            error:
              "Parsed resume data not found in workspace. Please re-parse your resume.",
          },
          { status: 404 }
        );
      }

      let structured: StructuredResume;
      let savedCtx: Partial<UserContext> = {};

      try {
        structured = JSON.parse(structuredJson) as StructuredResume;
      } catch {
        return NextResponse.json(
          { error: "Workspace structured data is invalid." },
          { status: 500 }
        );
      }

      if (ctxJson) {
        try {
          savedCtx = JSON.parse(ctxJson) as Partial<UserContext>;
        } catch {
          savedCtx = {};
        }
      }

      const mergedCtx = mergeContext(savedCtx, overrides);

      resultData = await optimizeSectionFromStructured(
        structured,
        section,
        mergedCtx
      );
    }

    if (workspaceId) {
      await persistGeneratedSection({
        workspaceId,
        section,
        sectionData: resultData,
        overrides,
      });
    }

    return NextResponse.json({ section, data: resultData }, { status: 200 });
  } catch (e: unknown) {
    console.error("❌ /api/optimize-section failed:", e);
    const msg = e instanceof Error ? e.message : "Section optimization failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}