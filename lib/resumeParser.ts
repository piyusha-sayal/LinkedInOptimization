// lib/resumeParser.ts
import "server-only";

import pdf from "pdf-parse";
import mammoth from "mammoth";

export type UploadedFile = File;

export type ParsedResume = {
  rawText: string;
  cleanedText: string;
  fileName: string;
  mimeType: string;
  extension: string;
};

function getExt(name?: string) {
  const n = (name ?? "").trim();
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i + 1).toLowerCase() : "";
}

async function fileToBuffer(file: File): Promise<Buffer> {
  const ab = await file.arrayBuffer();
  return Buffer.from(ab);
}

function normalizeResumeText(text: string): string {
  return String(text || "")
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

function prepareResumeTextForLLM(text: string, maxChars = 7000): string {
  return normalizeResumeText(text).slice(0, maxChars);
}

async function extractText(file: File): Promise<string> {
  if (!file) throw new Error("Missing file");

  const ext = getExt(file.name);
  const mime = (file.type || "").toLowerCase();
  const buf = await fileToBuffer(file);

  if (mime.includes("pdf") || ext === "pdf") {
    const out = await pdf(buf);
    return (out.text || "").trim();
  }

  if (mime.includes("wordprocessingml") || ext === "docx") {
    const out = await mammoth.extractRawText({ buffer: buf });
    return (out.value || "").trim();
  }

  if (mime.startsWith("text/") || ext === "txt") {
    return buf.toString("utf-8").trim();
  }

  throw new Error(
    `Unsupported file type: name=${file.name || "unknown"}, mime=${file.type || "unknown"}`
  );
}

/**
 * This function only extracts + cleans resume text.
 * The actual LLM structuring happens later in optimizer.ts.
 */
export async function parseResumeToStructuredJSON(
  file: UploadedFile
): Promise<ParsedResume> {
  if (!file) throw new Error("Missing file");

  const maxBytes = 10 * 1024 * 1024;
  if (typeof file.size === "number" && file.size > maxBytes) {
    throw new Error("File too large. Please upload a resume under 10MB.");
  }

  const rawText = await extractText(file);

  if (!rawText) {
    throw new Error(
      "Could not extract text from this file. If it's a scanned PDF, convert it to a text-based PDF first."
    );
  }

  const cleanedText = prepareResumeTextForLLM(rawText, 7000);

  if (!cleanedText) {
    throw new Error("Extracted text is empty after cleanup.");
  }

  return {
    rawText,
    cleanedText,
    fileName: file.name || "unknown",
    mimeType: file.type || "unknown",
    extension: getExt(file.name),
  };
}