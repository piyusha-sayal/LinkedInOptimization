import { NextResponse } from "next/server";
import { runOptimizationPipeline } from "@/lib/optimizer";
import type { Seniority, OptimizeMode, UserContext } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const file = form.get("resume") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Missing resume file." }, { status: 400 });
    }

    const maxBytes = 10 * 1024 * 1024;
    if (typeof file.size === "number" && file.size > maxBytes) {
      return NextResponse.json(
        { error: "Resume too large. Please upload a file under 10MB." },
        { status: 400 }
      );
    }

    const targetRole = String(form.get("targetRole") || "").trim();
    const industry = String(form.get("industry") || "").trim();
    const seniority = String(form.get("seniority") || "Mid") as Seniority;
    const mode = String(form.get("mode") || "Branding").trim() as OptimizeMode;

    const targetJobText = String(form.get("targetJobText") || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2500);

    if (!targetRole) {
      return NextResponse.json({ error: "targetRole is required." }, { status: 400 });
    }

    const ctx: UserContext = {
      targetRole,
      industry: industry || undefined,
      seniority,
      mode,
      targetJobText: targetJobText || undefined,
    };

    const result = await runOptimizationPipeline(file, ctx);
    return NextResponse.json(result, { status: 200 });
  } catch (e: unknown) {
    console.error("❌ /api/optimize failed:", e);
    const msg = e instanceof Error ? e.message : "Optimization failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}