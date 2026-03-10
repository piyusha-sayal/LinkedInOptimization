import fs from "node:fs/promises";
import path from "node:path";

type PromptKey = "profile_photo" | "cover_image";
type JsonRecord = Record<string, unknown>;

let PROMPTS_CACHE: Record<string, unknown> | null = null;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function getPath(value: unknown, pathParts: Array<string | number>): unknown {
  let current: unknown = value;

  for (const part of pathParts) {
    if (typeof part === "number") {
      if (!Array.isArray(current) || part >= current.length) return undefined;
      current = current[part];
      continue;
    }

    if (!isRecord(current) || !(part in current)) return undefined;
    current = current[part];
  }

  return current;
}

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

export function extractErrorMessage(payload: unknown): string {
  if (!payload) return "GeminiGen request failed.";

  if (typeof payload === "string") return payload;

  const candidates = [
    getPath(payload, ["error", "message"]),
    getPath(payload, ["error", "details", 0, "message"]),
    getPath(payload, ["error", "details", 0, "reason"]),
    getPath(payload, ["error"]),
    getPath(payload, ["message"]),
    getPath(payload, ["detail"]),
    getPath(payload, ["details"]),
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

export async function callGeminiGen(
  payload: Record<string, unknown>
): Promise<unknown> {
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

  let data: unknown = null;
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

export function extractGeminiGenImage(payload: unknown): string | null {
  const directStringCandidates = [
    getPath(payload, ["image"]),
    getPath(payload, ["url"]),
    getPath(payload, ["data", "image"]),
    getPath(payload, ["data", "url"]),
    getPath(payload, ["result", "image"]),
    getPath(payload, ["result", "url"]),
    getPath(payload, ["output", "image"]),
    getPath(payload, ["output", "url"]),
    getPath(payload, ["images", 0, "image"]),
    getPath(payload, ["images", 0, "url"]),
    getPath(payload, ["data", 0, "image"]),
    getPath(payload, ["data", 0, "url"]),
  ];

  for (const value of directStringCandidates) {
    if (typeof value !== "string" || !value.trim()) continue;
    if (looksLikeDataUrl(value)) return value;
    if (looksLikeHttpUrl(value)) return value;
  }

  const base64Candidates: Array<{ value: unknown; mimeType?: string }> = [
    {
      value: getPath(payload, ["base64"]),
      mimeType:
        typeof getPath(payload, ["mimeType"]) === "string"
          ? (getPath(payload, ["mimeType"]) as string)
          : typeof getPath(payload, ["contentType"]) === "string"
          ? (getPath(payload, ["contentType"]) as string)
          : undefined,
    },
    {
      value: getPath(payload, ["imageBase64"]),
      mimeType:
        typeof getPath(payload, ["mimeType"]) === "string"
          ? (getPath(payload, ["mimeType"]) as string)
          : typeof getPath(payload, ["contentType"]) === "string"
          ? (getPath(payload, ["contentType"]) as string)
          : undefined,
    },
    {
      value: getPath(payload, ["data", "base64"]),
      mimeType:
        typeof getPath(payload, ["data", "mimeType"]) === "string"
          ? (getPath(payload, ["data", "mimeType"]) as string)
          : typeof getPath(payload, ["data", "contentType"]) === "string"
          ? (getPath(payload, ["data", "contentType"]) as string)
          : undefined,
    },
    {
      value: getPath(payload, ["data", "imageBase64"]),
      mimeType:
        typeof getPath(payload, ["data", "mimeType"]) === "string"
          ? (getPath(payload, ["data", "mimeType"]) as string)
          : typeof getPath(payload, ["data", "contentType"]) === "string"
          ? (getPath(payload, ["data", "contentType"]) as string)
          : undefined,
    },
    {
      value: getPath(payload, ["images", 0, "base64"]),
      mimeType:
        typeof getPath(payload, ["images", 0, "mimeType"]) === "string"
          ? (getPath(payload, ["images", 0, "mimeType"]) as string)
          : undefined,
    },
    {
      value: getPath(payload, ["images", 0, "imageBase64"]),
      mimeType:
        typeof getPath(payload, ["images", 0, "mimeType"]) === "string"
          ? (getPath(payload, ["images", 0, "mimeType"]) as string)
          : undefined,
    },
    {
      value: getPath(payload, ["data", 0, "base64"]),
      mimeType:
        typeof getPath(payload, ["data", 0, "mimeType"]) === "string"
          ? (getPath(payload, ["data", 0, "mimeType"]) as string)
          : undefined,
    },
    {
      value: getPath(payload, ["data", 0, "imageBase64"]),
      mimeType:
        typeof getPath(payload, ["data", 0, "mimeType"]) === "string"
          ? (getPath(payload, ["data", 0, "mimeType"]) as string)
          : undefined,
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