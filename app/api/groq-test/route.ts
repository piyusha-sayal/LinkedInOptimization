import { NextResponse } from "next/server";
import { runAI } from "@/lib/aiClient";

export const runtime = "nodejs";

export async function GET() {
  const r = await runAI<{ ok: boolean; note: string }>({
    system: "You are a strict JSON generator.",
    prompt: 'Return {"ok":true,"note":"groq works"} as JSON only.',
    temperature: 0.1,
    maxTokens: 200,
  });

  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ ...r.data, model: r.model }, { status: 200 });
}