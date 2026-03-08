// app/api/optimize-section/route.ts
import { NextResponse } from "next/server";
import { optimizeSectionFromSession } from "@/lib/optimizer";
import type { OptimizeMode, Seniority, UserContext } from "@/lib/types";
import type { SectionKey } from "@/lib/types";

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

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const id = String(body?.id || "").trim();
    const section = String(body?.section || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Missing session id." }, { status: 400 });
    }

    if (!isSectionKey(section)) {
      return NextResponse.json({ error: "Invalid section." }, { status: 400 });
    }

    const overrides: Partial<UserContext> = {
      targetRole: body?.targetRole ? String(body.targetRole).trim() : undefined,
      industry: body?.industry ? String(body.industry).trim() : undefined,
      seniority: body?.seniority ? (String(body.seniority).trim() as Seniority) : undefined,
      mode: body?.mode ? (String(body.mode).trim() as OptimizeMode) : undefined,
      targetJobText: body?.targetJobText
        ? String(body.targetJobText).replace(/\s+/g, " ").trim().slice(0, 2500)
        : undefined,
    };

    const result = await optimizeSectionFromSession(id, section, overrides);
    return NextResponse.json(result, { status: 200 });
  } catch (e: unknown) {
    console.error("❌ /api/optimize-section failed:", e);
    const msg = e instanceof Error ? e.message : "Section optimization failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}