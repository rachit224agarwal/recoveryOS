import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/db.js";

async function main(): Promise<void> {
  await connectDatabase();
  const app = createApp();

  const server = app.listen(env.port, () => {
    console.log(`[RecoveryOS] API listening on http://localhost:${env.port}`);
    console.log(`[RecoveryOS] LLM: ${env.llmProvider} (${env.llmModel || "default"})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[RecoveryOS] ${signal} received — shutting down`);
    server.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[RecoveryOS] Fatal startup error:", err);
  process.exit(1);
});
