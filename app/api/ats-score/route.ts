// app/api/ats-score/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getParseSession } from "@/lib/sessionStore";
import { runAI } from "@/lib/aiClient";
import {
  scoreResumeDeterministic,
  generateATSKeywordPrompt,
  mergeKeywordScore,
  type ATSScoreResult,
} from "@/lib/atsScorer";


export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, targetRole, targetJobText, skipAI } = body as {
      sessionId: string;
      targetRole?: string;
      targetJobText?: string;
      skipAI?: boolean;
    };

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    // Load the parsed resume from session
    const session = getParseSession(sessionId);
    if (!session?.structured) {
      return NextResponse.json(
        { error: "Session not found or resume not parsed" },
        { status: 404 }
      );
    }

    const ctx = {
      targetRole:    targetRole    || session.ctx?.targetRole    || "",
      targetJobText: targetJobText || session.ctx?.targetJobText || "",
      industry:      session.ctx?.industry  || "",
      seniority:     session.ctx?.seniority || "Mid",
    };

    // Step 1: Fast deterministic pass
    const deterministicResult = scoreResumeDeterministic(session.structured, ctx);

    // Step 2 (optional): AI keyword analysis
    if (skipAI) {
      return NextResponse.json({ score: deterministicResult });
    }

    const keywordPrompt = generateATSKeywordPrompt(session.structured, ctx);

    let finalResult: ATSScoreResult = deterministicResult;

    try {
      const aiResult = await runAI<{
        keywordScore?: number;
        found?: string[];
        missing?: string[];
        keywordNotes?: string;
      }>({
        system:
          "You are an ATS keyword analysis engine. Return only valid compact JSON. No markdown, no code fences.",
        prompt: keywordPrompt,
        maxTokens: 600,
      });

      if (
        aiResult.ok &&
        typeof aiResult.data?.keywordScore === "number" &&
        Array.isArray(aiResult.data?.found) &&
        Array.isArray(aiResult.data?.missing)
      ) {
        finalResult = mergeKeywordScore(deterministicResult, {
          keywordScore:  aiResult.data.keywordScore,
          found:         aiResult.data.found,
          missing:       aiResult.data.missing,
          keywordNotes:  aiResult.data.keywordNotes || "",
        });
      }
    } catch (aiErr) {
      // AI keyword pass failed — return deterministic result only
      console.warn(
        "[ats-score] AI keyword pass failed, returning deterministic score:",
        aiErr
      );
    }

    return NextResponse.json({ score: finalResult });
  } catch (err) {
    console.error("[ats-score] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}