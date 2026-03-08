import { NextResponse } from "next/server";
import { updateResultImages } from "@/lib/sessionStore";
import type { GeneratedImages } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const body = (await req.json()) as GeneratedImages;

    const updated = updateResultImages(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Result not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, images: updated.images });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to save images" },
      { status: 500 }
    );
  }
}