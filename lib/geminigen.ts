import fs from "node:fs/promises";
import path from "node:path";

type PromptKey = "profile_photo" | "cover_image";

let PROMPTS_CACHE: Record<string, unknown> | null = null;

export async function resolvePromptsFile(): Promise<string> {
  const envPath = (process.env.PROMPTS_PATH || "").trim();

  if (envPath) {
    const abs = path.isAbsolute(envPath)
      ? envPath
      : path.join(process.cwd(), envPath);

    return abs;
  }

  const candidates = [
    path.join(process.cwd(), "prompts", "prompts.json"),
    path.join(process.cwd(), "prompt.json"),
    path.join(process.cwd(), "prompts.json"),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }

  throw new Error(
    `No prompts file found. Checked: ${candidates.join(" | ")}`
  );
}

export async function getPrompt(key: PromptKey): Promise<string> {
  if (!PROMPTS_CACHE) {
    const file = await resolvePromptsFile();
    const raw = await fs.readFile(file, "utf-8");
    PROMPTS_CACHE = JSON.parse(raw);
  }

  const value = PROMPTS_CACHE?.[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing prompt "${key}" in prompts file`);
  }

  return value.trim();
}

function looksLikeHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function looksLikeDataUrl(value: string) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value);
}

function looksLikeBase64(value: string) {
  return /^[A-Za-z0-9+/=\s]+$/.test(value) && value.replace(/\s/g, "").length > 128;
}

function toDataUrl(base64: string, mimeType = "image/png") {
  const cleaned = base64.replace(/\s/g, "");
  return `data:${mimeType};base64,${cleaned}`;
}

export function extractErrorMessage(payload: any): string {
  if (!payload) return "GeminiGen request failed.";

  if (typeof payload === "string") return payload;

  const candidates = [
    payload?.error?.message,
    payload?.error?.details?.[0]?.message,
    payload?.error?.details?.[0]?.reason,
    payload?.error,
    payload?.message,
    payload?.detail,
    payload?.details,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return "GeminiGen request failed.";
  }
}

export async function callGeminiGen(payload: Record<string, unknown>) {
  const apiKey =
    (process.env.GEMINIGEN_API_KEY || "").trim() ||
    (process.env.GEMINI_API_KEY || "").trim();

  if (!apiKey) {
    throw new Error("Missing GEMINIGEN_API_KEY in .env.local");
  }

  const endpoint =
    (process.env.GEMINIGEN_API_URL || "").trim() ||
    "https://api.geminigen.ai/uapi/v1/generate";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const raw = await res.text();

  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    if (!res.ok) {
      throw new Error(`GeminiGen ${res.status} at ${endpoint}: ${raw || "empty response"}`);
    }
    throw new Error("GeminiGen returned a non-JSON response.");
  }

  if (!res.ok) {
    const message = extractErrorMessage(data);
    throw new Error(`GeminiGen ${res.status} at ${endpoint}: ${message}`);
  }

  return data;
}

export function extractGeminiGenImage(payload: any): string | null {
  const directStringCandidates = [
    payload?.image,
    payload?.url,
    payload?.data?.image,
    payload?.data?.url,
    payload?.result?.image,
    payload?.result?.url,
    payload?.output?.image,
    payload?.output?.url,
    Array.isArray(payload?.images) ? payload.images[0]?.image : null,
    Array.isArray(payload?.images) ? payload.images[0]?.url : null,
    Array.isArray(payload?.data) ? payload.data[0]?.image : null,
    Array.isArray(payload?.data) ? payload.data[0]?.url : null,
  ];

  for (const value of directStringCandidates) {
    if (typeof value !== "string" || !value.trim()) continue;
    if (looksLikeDataUrl(value)) return value;
    if (looksLikeHttpUrl(value)) return value;
  }

  const base64Candidates: Array<{ value: unknown; mimeType?: string }> = [
    {
      value: payload?.base64,
      mimeType: payload?.mimeType || payload?.contentType,
    },
    {
      value: payload?.imageBase64,
      mimeType: payload?.mimeType || payload?.contentType,
    },
    {
      value: payload?.data?.base64,
      mimeType: payload?.data?.mimeType || payload?.data?.contentType,
    },
    {
      value: payload?.data?.imageBase64,
      mimeType: payload?.data?.mimeType || payload?.data?.contentType,
    },
    {
      value: Array.isArray(payload?.images) ? payload.images[0]?.base64 : null,
      mimeType: Array.isArray(payload?.images) ? payload.images[0]?.mimeType : undefined,
    },
    {
      value: Array.isArray(payload?.images) ? payload.images[0]?.imageBase64 : null,
      mimeType: Array.isArray(payload?.images) ? payload.images[0]?.mimeType : undefined,
    },
    {
      value: Array.isArray(payload?.data) ? payload.data[0]?.base64 : null,
      mimeType: Array.isArray(payload?.data) ? payload.data[0]?.mimeType : undefined,
    },
    {
      value: Array.isArray(payload?.data) ? payload.data[0]?.imageBase64 : null,
      mimeType: Array.isArray(payload?.data) ? payload.data[0]?.mimeType : undefined,
    },
  ];

  for (const candidate of base64Candidates) {
    if (typeof candidate.value !== "string" || !candidate.value.trim()) continue;
    if (!looksLikeBase64(candidate.value)) continue;

    return toDataUrl(candidate.value, candidate.mimeType || "image/png");
  }

  return null;
}

export async function normalizeImageOutput(image: string): Promise<string> {
  if (looksLikeDataUrl(image)) return image;
  if (!looksLikeHttpUrl(image)) return image;

  try {
    const res = await fetch(image, { cache: "no-store" });
    if (!res.ok) return image;

    const mimeType = res.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await res.arrayBuffer()).toString("base64");
    return toDataUrl(buffer, mimeType);
  } catch {
    return image;
  }
}