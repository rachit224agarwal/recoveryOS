import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  mongoUri: requireEnv("MONGODB_URI", "mongodb://127.0.0.1:27017/recoveryos"),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",

  llmProvider: (process.env.LLM_PROVIDER ?? "rules") as "gemini" | "ollama" | "rules",
  llmModel: process.env.LLM_MODEL ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "qwen3:8b",

  agentVersion: "1.0.0",
} as const;

export const isProd = env.nodeEnv === "production";
