// app/api/clear-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/sessionStore";

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (id) clearSession(id);
    return NextResponse.json({ cleared: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}