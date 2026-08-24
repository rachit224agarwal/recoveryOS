import { z } from "zod";
import { env } from "../../config/env.js";
import type { RecoveryRecommendation } from "../../types/domain.js";
import { RecoveryRecommendationSchema } from "../../types/domain.js";

export interface LlmMeta {
  provider: "gemini" | "ollama" | "rules";
  model: string;
  latencyMs: number;
}

export interface LlmResult<T> {
  data: T;
  meta: LlmMeta;
}

/**
 * LLM Service — the only module that talks to a model provider.
 *
 * Contract:
 * - Input: a zod schema + prompt parts. Output: schema-validated data.
 * - Any provider failure (quota, network, invalid JSON) throws; callers must
 *   fall back to deterministic logic rather than trusting raw prose.
 */

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
}

async function callGemini(system: string, user: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.llmModel}:generateContent?key=${env.geminiApiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { candidates?: GeminiCandidate[] };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

async function callOllama(system: string, user: string): Promise<string> {
  const res = await fetch(`${env.ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.ollamaModel,
      stream: false,
      format: "json",
      options: { temperature: 0.2 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}`);
  }
  const json = (await res.json()) as { message?: { content?: string } };
  if (!json.message?.content) throw new Error("Ollama returned empty response");
  return json.message.content;
}

function parseStructured<T>(schema: z.ZodType<T>, raw: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Tolerate models that wrap JSON in code fences.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`LLM response is not valid JSON`);
    parsed = JSON.parse(match[0]);
  }
  return schema.parse(parsed);
}

export async function generateRecommendation(
  system: string,
  user: string
): Promise<LlmResult<RecoveryRecommendation>> {
  const startedAt = Date.now();

  if (env.llmProvider === "rules") {
    throw new Error("LLM disabled (provider=rules); use deterministic recommender");
  }

  let raw: string;
  if (env.llmProvider === "gemini") {
    if (!env.geminiApiKey) throw new Error("GEMINI_API_KEY not configured");
    raw = await callGemini(system, user);
  } else {
    raw = await callOllama(system, user);
  }

  const data = parseStructured(RecoveryRecommendationSchema, raw);
  return {
    data,
    meta: {
      provider: env.llmProvider,
      model: env.llmProvider === "gemini" ? env.llmModel : env.ollamaModel,
      latencyMs: Date.now() - startedAt,
    },
  };
}

export function llmConfigured(): boolean {
  if (env.llmProvider === "rules") return false;
  if (env.llmProvider === "gemini") return Boolean(env.geminiApiKey);
  return true;
}

export function activeLlmLabel(): { provider: string; model: string } {
  switch (env.llmProvider) {
    case "gemini":
      return env.geminiApiKey
        ? { provider: "gemini", model: env.llmModel || "gemini-2.5-flash" }
        : { provider: "none (key missing)", model: "-" };
    case "ollama":
      return { provider: "ollama", model: env.ollamaModel };
    default:
      return { provider: "deterministic rules", model: "-" };
  }
}
