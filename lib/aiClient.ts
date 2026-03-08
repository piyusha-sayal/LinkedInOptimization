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

  const firstObj = cleaned.indexOf("{");
  const lastObj = cleaned.lastIndexOf("}");
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
    return cleaned.slice(firstObj, lastObj + 1);
  }

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
    throw new Error(`Model returned invalid JSON. Raw output: ${raw.slice(0, 1000)}`);
  }
}

function getErrorMessage(err: unknown): string {
  const e = err as any;
  const status = e?.status ?? e?.response?.status;
  const providerMessage =
    e?.error?.message ||
    e?.response?.data?.error?.message ||
    e?.message ||
    "Unknown LLM error";

  if (status) return `LLM request failed (${status}): ${providerMessage}`;
  return `LLM request failed: ${providerMessage}`;
}

function shouldRetry(err: unknown): boolean {
  const e = err as any;
  const status = e?.status ?? e?.response?.status;
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function getRetryDelayMs(err: unknown, attempt: number): number {
  const e = err as any;

  const retryAfterHeader =
    e?.headers?.["retry-after"] ||
    e?.response?.headers?.["retry-after"];

  const retryAfterSeconds = Number(retryAfterHeader);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  const status = e?.status ?? e?.response?.status;
  if (status === 429) {
    return [8000, 15000, 25000][attempt] ?? 30000;
  }

  return [2000, 4000, 8000][attempt] ?? 10000;
}

export function createLLMClient() {
  const apiKey = process.env.NOVA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing NOVA_API_KEY");
  }

  const baseURL =
    process.env.NOVA_BASE_URL?.trim() || "https://api.nova.amazon.com/v1";

  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: 90_000,
  });

  return {
    async generateText({
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
          const finishReason = (choice as any)?.finish_reason;

          if (!content) {
            throw new Error("Nova returned empty content.");
          }

          if (finishReason === "length") {
            throw new Error(
              `LLM output was truncated. Increase maxOutputTokens or shrink the prompt. Partial output: ${content.slice(0, 800)}`
            );
          }

          return stripCodeFences(content);
        } catch (err) {
          lastError = err;

          if (shouldRetry(err) && attempt < 3) {
            const delay = getRetryDelayMs(err, attempt);
            await sleep(delay);
            continue;
          }

          throw new Error(getErrorMessage(err));
        }
      }

      throw new Error(getErrorMessage(lastError));
    },

    async generateJSON<T>({
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
          ? [
              "",
              "Return JSON that matches this schema exactly.",
              `Schema name: ${schemaName}`,
              `Schema: ${JSON.stringify(schema)}`,
            ].join("\n")
          : "";

      const systemPrompt = [
        instructions,
        "Return valid JSON only.",
        "No markdown.",
        "No code fences.",
        "No commentary.",
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
          const finishReason = (choice as any)?.finish_reason;

          if (!content) {
            throw new Error("Nova returned empty content.");
          }

          if (finishReason === "length") {
            throw new Error(
              `LLM output was truncated. Increase maxOutputTokens or shrink the prompt. Partial output: ${content.slice(0, 800)}`
            );
          }

          return parseJSON<T>(content);
        } catch (err) {
          lastError = err;

          if (shouldRetry(err) && attempt < 3) {
            const delay = getRetryDelayMs(err, attempt);
            await sleep(delay);
            continue;
          }

          throw new Error(getErrorMessage(err));
        }
      }

      throw new Error(getErrorMessage(lastError));
    },
  };
}