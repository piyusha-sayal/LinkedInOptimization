import { NextResponse } from "next/server";
import { optimizeSectionFromSession, optimizeSectionFromStructured } from "@/lib/optimizer";
import type {
  OptimizeMode,
  Seniority,
  UserContext,
  SectionKey,
  StructuredResume,
} from "@/lib/types";

export const runtime = "nodejs";

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

async function getWorkerWorkspace(workspaceId: string): Promise<{
  workspace: {
    structured_json?: string | null;
    ctx_json?: string | null;
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
    };
  };
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

    // 1) First try normal session-based optimization
    if (id) {
      try {
        const result = await optimizeSectionFromSession(id, section, overrides);
        return NextResponse.json(result, { status: 200 });
      } catch (sessionError) {
        const sessionMessage =
          sessionError instanceof Error ? sessionError.message : "";

        const looksLikeMissingSession =
          sessionMessage.toLowerCase().includes("session not found") ||
          sessionMessage.toLowerCase().includes("expired");

        // If it failed for some other reason, don't silently fall through.
        if (!workspaceId || !looksLikeMissingSession) {
          throw sessionError;
        }
      }
    }

    // 2) Fallback to worker workspace-based optimization
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Session not found or expired. Please re-parse your resume." },
        { status: 404 }
      );
    }

    const data = await getWorkerWorkspace(workspaceId);
    const structuredJson = data.workspace?.structured_json;
    const ctxJson = data.workspace?.ctx_json;

    if (!structuredJson) {
      return NextResponse.json(
        { error: "Parsed resume data not found in workspace. Please re-parse your resume." },
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

    const mergedCtx: UserContext = {
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

    const result = await optimizeSectionFromStructured(
      structured,
      section,
      mergedCtx
    );

    return NextResponse.json(
      { section, data: result },
      { status: 200 }
    );
  } catch (e: unknown) {
    console.error("❌ /api/optimize-section failed:", e);
    const msg = e instanceof Error ? e.message : "Section optimization failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}