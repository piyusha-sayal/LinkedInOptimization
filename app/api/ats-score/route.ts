// app/api/ats-score/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/sessionStore"; // adjust to your actual session store import
import { runAI } from "@/lib/aiClient";
import {
  scoreResumeDeterministic,
  generateATSKeywordPrompt,
  mergeKeywordScore,
  type ATSScoreResult,
} from "@/lib/atsScorer";

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
    const session = await getSession(sessionId);
    if (!session?.structured) {
      return NextResponse.json({ error: "Session not found or resume not parsed" }, { status: 404 });
    }

    const ctx = {
      targetRole: targetRole || session.context?.targetRole || "",
      targetJobText: targetJobText || session.context?.targetJobText || "",
      industry: session.context?.industry || "",
      seniority: session.context?.seniority || "Mid",
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
      const aiRaw = await runAI({
        systemPrompt:
          "You are an ATS keyword analysis engine. Return only valid compact JSON. No markdown, no code fences.",
        userPrompt: keywordPrompt,
        maxTokens: 600,
        model: process.env.MODEL_CHEAP || "llama-3.1-8b-instant",
      });

      // Parse AI response
      const jsonMatch = aiRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (
          typeof parsed.keywordScore === "number" &&
          Array.isArray(parsed.found) &&
          Array.isArray(parsed.missing)
        ) {
          finalResult = mergeKeywordScore(deterministicResult, {
            keywordScore: parsed.keywordScore,
            found: parsed.found,
            missing: parsed.missing,
            keywordNotes: parsed.keywordNotes || "",
          });
        }
      }
    } catch (aiErr) {
      // AI keyword pass failed — return deterministic result only, don't error out
      console.warn("[ats-score] AI keyword pass failed, returning deterministic score:", aiErr);
    }

    return NextResponse.json({ score: finalResult });
  } catch (err) {
    console.error("[ats-score] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}