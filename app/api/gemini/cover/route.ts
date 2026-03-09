import { NextResponse } from "next/server";
import {
  callGeminiGen,
  extractGeminiGenImage,
  getPrompt,
  normalizeImageOutput,
} from "@/lib/geminigen";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, route: "cover" });
}

export async function POST() {
  try {
    const promptText = await getPrompt("cover_image");

    const payload = await callGeminiGen({
      type: "image",
      prompt: promptText,
    });

    const extracted = extractGeminiGenImage(payload);
    if (!extracted) {
      return NextResponse.json(
        { error: "GeminiGen did not return an image.", raw: payload },
        { status: 502 }
      );
    }

    const image = await normalizeImageOutput(extracted);

    return NextResponse.json({ image });
  } catch (e: any) {
    console.error("COVER ERROR:", e);
    return NextResponse.json(
      { error: e?.message || "GeminiGen cover generation failed" },
      { status: 500 }
    );
  }  // ← closes try/catch
}    // ← closes POST function