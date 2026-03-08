// lib/aiClient.ts
import "server-only";
import OpenAI from "openai";

type GenerateArgs = {
  model: string;
  instructions: string;
  input: string;
  maxOutputTokens?: number;
  temperature?: number;
};

type GenerateJSONArgs = GenerateArgs & {
  schemaName?: string;
  schema?: unknown;
};

type AIResult<T> =
  | { ok: true; data: T; model: string }
  | { ok: false; error: string; model?: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonCandidate(text: string): string {
  const cleaned = stripCodeFences(text).trim();

  if (
    (cleaned.startsWith("{") && cleaned.endsWith("}")) ||
    (cleaned.startsWith("[") && cleaned.endsWith("]"))
  ) {
    return cleaned;
  }

  // Try to find a JSON object
  const firstObj = cleaned.indexOf("{");
  const lastObj = cleaned.lastIndexOf("}");
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
    return cleaned.slice(firstObj, lastObj + 1);
  }

  // Try to find a JSON array
  const firstArr = cleaned.indexOf("[");
  const lastArr = cleaned.lastIndexOf("]");
  if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr) {
    return cleaned.slice(firstArr, lastArr + 1);
  }

  return cleaned;
}

function parseJSON<T>(raw: string): T {
  const candidate = extractJsonCandidate(raw);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    throw new Error(
      `Model returned invalid JSON. Snippet: ${raw.slice(0, 400)}`
    );
  }
}

function getErrorMessage(err: unknown): string {
  const e = err as Record<string, unknown>;
  const status =
    (e?.status as number | undefined) ??
    ((e?.response as Record<string, unknown>)?.status as number | undefined);
  const providerMsg =
    ((e?.error as Record<string, unknown>)?.message as string | undefined) ||
    ((e?.response as Record<string, unknown>)?.data as Record<string, unknown>)
      ?.error as string | undefined ||
    (e?.message as string | undefined) ||
    "Unknown LLM error";

  if (status) return `LLM request failed (${status}): ${providerMsg}`;
  return `LLM request failed: ${providerMsg}`;
}

function shouldRetry(err: unknown, attempt: number): boolean {
  if (attempt >= 3) return false;
  const e = err as Record<string, unknown>;
  const status =
    (e?.status as number | undefined) ??
    ((e?.response as Record<string, unknown>)?.status as number | undefined);
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function retryDelay(err: unknown, attempt: number): number {
  const e = err as Record<string, unknown>;
  const headers = e?.headers as Record<string, string> | undefined;
  const ra = headers?.["retry-after"];
  const raSeconds = Number(ra);
  if (Number.isFinite(raSeconds) && raSeconds > 0) return raSeconds * 1000;

  const status =
    (e?.status as number | undefined) ??
    ((e?.response as Record<string, unknown>)?.status as number | undefined);
  if (status === 429) return [8000, 15000, 25000][attempt] ?? 30000;
  return [2000, 4000, 8000][attempt] ?? 10000;
}

// ─── Exported runAI helper (used by groq-test route) ────────────────────────

export async function runAI<T = unknown>(opts: {
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<AIResult<T>> {
  const llm = createLLMClient();
  try {
    const data = await llm.generateJSON<T>({
      model: process.env.NOVA_GENERATION_MODEL || "nova-2-lite-v1",
      instructions: opts.system,
      input: opts.prompt,
      temperature: opts.temperature ?? 0.1,
      maxOutputTokens: opts.maxTokens ?? 500,
    });
    return {
      ok: true,
      data,
      model: process.env.NOVA_GENERATION_MODEL || "nova-2-lite-v1",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

// ─── LLM Client Factory ─────────────────────────────────────────────────────

export function createLLMClient() {
  const apiKey = process.env.NOVA_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing NOVA_API_KEY");

  const baseURL =
    process.env.NOVA_BASE_URL?.trim() || "https://api.nova.amazon.com/v1";

  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: 90_000,
  });

  // ── generateText ────────────────────────────────────────────────────────

  async function generateText({
    model,
    instructions,
    input,
    maxOutputTokens = 300,
    temperature = 0,
  }: GenerateArgs): Promise<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: instructions },
            { role: "user", content: input },
          ],
          temperature,
          max_tokens: maxOutputTokens,
        });

        const choice = response.choices?.[0];
        const content = choice?.message?.content?.trim() || "";
        const finishReason = (choice as { finish_reason?: string })
          ?.finish_reason;

        if (!content) throw new Error("Model returned empty content.");

        if (finishReason === "length") {
          // Don't throw — return partial content with a warning log
          console.warn(
            `[LLM] Output truncated for model ${model}. Consider increasing maxOutputTokens.`
          );
        }

        return stripCodeFences(content);
      } catch (err) {
        lastError = err;
        if (shouldRetry(err, attempt)) {
          await sleep(retryDelay(err, attempt));
          continue;
        }
        throw new Error(getErrorMessage(err));
      }
    }
    throw new Error(getErrorMessage(lastError));
  }

  // ── generateJSON ────────────────────────────────────────────────────────

  async function generateJSON<T>({
    model,
    instructions,
    input,
    schemaName,
    schema,
    maxOutputTokens = 300,
    temperature = 0,
  }: GenerateJSONArgs): Promise<T> {
    const schemaBlock =
      schema && schemaName
        ? `\nSchema (${schemaName}): ${JSON.stringify(schema)}`
        : "";

    const systemPrompt = [
      instructions,
      "Return valid JSON only. No markdown. No code fences. No commentary.",
    ].join("\n");

    const userPrompt = `${input}${schemaBlock}`;
    let lastError: unknown;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature,
          max_tokens: maxOutputTokens,
        });

        const choice = response.choices?.[0];
        const content = choice?.message?.content?.trim() || "";
        const finishReason = (choice as { finish_reason?: string })
          ?.finish_reason;

        if (!content) throw new Error("Model returned empty content.");

        if (finishReason === "length") {
          console.warn(
            `[LLM] JSON output truncated for ${schemaName}. Attempting parse anyway.`
          );
        }

        return parseJSON<T>(content);
      } catch (err) {
        lastError = err;
        if (shouldRetry(err, attempt)) {
          await sleep(retryDelay(err, attempt));
          continue;
        }
        throw new Error(getErrorMessage(err));
      }
    }
    throw new Error(getErrorMessage(lastError));
  }

  return { generateText, generateJSON };
}