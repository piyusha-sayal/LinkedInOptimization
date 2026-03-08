// app/api/results/[id]/route.ts
import { NextResponse } from "next/server";
import { getResult } from "@/lib/sessionStore";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const found = getResult(id);

  if (!found) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(found, { status: 200 });
}