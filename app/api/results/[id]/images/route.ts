import { NextResponse } from "next/server";
import { updateResultImages } from "@/lib/sessionStore";
import type { GeneratedImages } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as GeneratedImages;

    const updated = updateResultImages(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Result not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, images: updated.images });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to save images";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}