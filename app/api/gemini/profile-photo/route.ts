import { NextResponse } from "next/server";
import { InferenceClient } from "@huggingface/inference";

export const runtime = "nodejs";

function getHFClient() {
  const token = process.env.HF_TOKEN?.trim();
  if (!token) {
    throw new Error("Missing HF_TOKEN");
  }

  return new InferenceClient(token);
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("image") || form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing image file." }, { status: 400 });
    }

    const maxBytes = 10 * 1024 * 1024;
    if (typeof file.size === "number" && file.size > maxBytes) {
      return NextResponse.json(
        { error: "Image too large. Please upload an image under 10MB." },
        { status: 400 }
      );
    }

    const mimeType = (file.type || "").toLowerCase();
    if (!mimeType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload an image." },
        { status: 400 }
      );
    }

    const inputBlob = new Blob([await file.arrayBuffer()], { type: mimeType });

    const prompt = `
Create a professional LinkedIn profile photo from this selfie.

Requirements:
- Preserve the same person's identity, face structure, skin tone, hairstyle, and natural expression
- Keep the result realistic and recognizable
- Improve only the presentation: clean professional outfit, polished lighting, refined framing, professional background
- Corporate headshot style
- No beauty filter look
- No over-smoothing
- No glamour retouching
- Clean premium studio-style background
- Head-and-shoulders composition
- Realistic, credible, professional output
`.trim();

    const hf = getHFClient();

    const outputBlob = await hf.imageToImage({
      model: "Qwen/Qwen-Image-Edit",
      provider: "fal-ai",
      inputs: inputBlob,
      parameters: {
        prompt,
      },
    });

    const outBuffer = Buffer.from(await outputBlob.arrayBuffer());
    const outMime = outputBlob.type || "image/png";
    const dataUrl = `data:${outMime};base64,${outBuffer.toString("base64")}`;

    return NextResponse.json({ image: dataUrl });
  } catch (e: unknown) {
    console.error("❌ /api/gemini/profile-photo failed:", e);

    const raw =
      e instanceof Error ? e.message : "Profile photo generation failed.";

    const msg =
      raw.includes("401") || raw.includes("403")
        ? "Hugging Face token is missing permission for Inference Providers."
        : raw.includes("429")
        ? "Hugging Face image-edit quota or rate limit was hit. Wait a bit and try again."
        : raw;

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}