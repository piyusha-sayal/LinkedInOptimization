// lib/llm/nova.ts
import OpenAI from "openai";

const region = process.env.AWS_BEDROCK_REGION || "us-east-1";
const apiKey = process.env.AWS_BEDROCK_API_KEY;

if (!apiKey) {
  throw new Error("Missing AWS_BEDROCK_API_KEY");
}

export const nova = new OpenAI({
  apiKey,
  baseURL: `https://bedrock-runtime.${region}.amazonaws.com/openai/v1`,
});

export const TASK_CONFIG = {
  resume_structuring: {
    model: process.env.NOVA_STRUCTURE_MODEL || "amazon.nova-lite-v1:0",
    max_completion_tokens: 850,
    temperature: 0.1,
  },
  headline: {
    model: "amazon.nova-micro-v1:0",
    max_completion_tokens: 120,
    temperature: 0.2,
  },
  about: {
    model: "amazon.nova-micro-v1:0",
    max_completion_tokens: 260,
    temperature: 0.25,
  },
  experience: {
    model: "amazon.nova-micro-v1:0",
    max_completion_tokens: 650,
    temperature: 0.2,
  },
  skills: {
    model: "amazon.nova-micro-v1:0",
    max_completion_tokens: 220,
    temperature: 0.1,
  },
  certifications: {
    model: "amazon.nova-micro-v1:0",
    max_completion_tokens: 120,
    temperature: 0.1,
  },
  projects: {
    model: "amazon.nova-micro-v1:0",
    max_completion_tokens: 320,
    temperature: 0.2,
  },
  banner_tagline: {
    model: "amazon.nova-micro-v1:0",
    max_completion_tokens: 60,
    temperature: 0.3,
  },
  positioning_advice: {
    model: "amazon.nova-micro-v1:0",
    max_completion_tokens: 420,
    temperature: 0.2,
  },
  profile_photo: {
    model: "amazon.nova-micro-v1:0",
    max_completion_tokens: 100,
    temperature: 0.35,
  },
  cover_image: {
    model: "amazon.nova-micro-v1:0",
    max_completion_tokens: 120,
    temperature: 0.35,
  },
  cover_copy: {
    model: "amazon.nova-micro-v1:0",
    max_completion_tokens: 160,
    temperature: 0.25,
  },
} as const;

export async function runNovaTask(
  task: keyof typeof TASK_CONFIG,
  systemPrompt: string,
  userPrompt: string
) {
  const cfg = TASK_CONFIG[task];

  const res = await nova.chat.completions.create({
    model: cfg.model,
    messages: [
      { role: "developer", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: cfg.temperature,
    max_completion_tokens: cfg.max_completion_tokens,
  });

  return res.choices[0]?.message?.content?.trim() ?? "";
}