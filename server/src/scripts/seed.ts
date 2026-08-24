import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Transaction } from "../models/transaction.js";
import { MerchantPolicy } from "../models/policy.js";
import { AgentRun } from "../models/agentRun.js";
import { AuditEvent } from "../models/auditEvent.js";
import { EvalRun } from "../models/evalRun.js";
import { runRecoveryWorkflow } from "../agents/runService.js";
import { generateDataset, SEED_MERCHANTS } from "./generator.js";
import { runBenchmark } from "../analytics/benchmark.js";

/**
 * Seed script — populates the database with:
 *   1. Three demo merchants + deterministic guardrail policies.
 *   2. 12,000 synthetic failed payments (seed 42).
 *   3. A subset processed through the REAL LangGraph workflow so the app
 *      opens with genuine agent runs, audit events and recovered revenue.
 *   4. One baseline-vs-agent benchmark over the full dataset.
 *
 * Usage: npm run seed [-- --skip-agent | --skip-benchmark]
 */

const DATASET_SIZE = Number(process.env.DATASET_SIZE ?? 12_000);
const PROCESSED_SUBSET = Number(process.env.AGENT_SEED_COUNT ?? 400);
const args = new Set(process.argv.slice(2));
const SKIP_AGENT = args.has("--skip-agent");
const SKIP_BENCHMARK = args.has("--skip-benchmark");

async function main(): Promise<void> {
  await connectDatabase();
  console.log("[seed] clearing existing collections…");
  await Promise.all([
    Transaction.deleteMany({}),
    MerchantPolicy.deleteMany({}),
    AgentRun.deleteMany({}),
    AuditEvent.deleteMany({}),
    EvalRun.deleteMany({}),
  ]);

  console.log("[seed] inserting merchant policies…");
  await MerchantPolicy.insertMany(
    SEED_MERCHANTS.map((m) => ({ ...m, createdAt: new Date() }))
  );

  console.log(`[seed] generating ${DATASET_SIZE.toLocaleString()} synthetic transactions (deterministic seed)…`);
  const txns = generateDataset(DATASET_SIZE, 42);
  await Transaction.insertMany(txns, { ordered: false });
  console.log("[seed] dataset inserted");

  if (!SKIP_AGENT) {
    // Spread processed subset across time so dashboards show a realistic mix.
    const step = Math.max(1, Math.floor(txns.length / PROCESSED_SUBSET));
    const targets = txns.filter((_, i) => i % step === 0).slice(0, PROCESSED_SUBSET);
    console.log(`[seed] running real recovery workflow on ${targets.length} transactions…`);
    let done = 0;
    let recovered = 0;
    for (const t of targets) {
      try {
        const run = await runRecoveryWorkflow(t.transactionId);
        done++;
        if (run.executedAction?.outcome === "SUCCESS") recovered++;
        if (done % 50 === 0) {
          console.log(`[seed]   progress ${done}/${targets.length} (recovered so far: ${recovered})`);
        }
      } catch (err) {
        console.warn(`[seed]   workflow error on ${t.transactionId}:`, err instanceof Error ? err.message : err);
      }
    }
    console.log(`[seed] agent processing complete: ${done} runs, ${recovered} recoveries`);
  }

  if (!SKIP_BENCHMARK) {
    console.log("[seed] running baseline-vs-agent benchmark over dataset…");
    const evalRun = await runBenchmark({ size: Math.min(10_000, DATASET_SIZE), seed: 42 });
    console.log(
      `[seed] benchmark complete in ${(evalRun.durationMs / 1000).toFixed(1)}s — ` +
        `baseline recovery ${(evalRun.baseline.recoveryRate * 100).toFixed(1)}% vs agent ${(evalRun.agent.recoveryRate * 100).toFixed(1)}%`
    );
  }

  await disconnectDatabase();
  console.log("[seed] done");
}

main().catch((err) => {
  console.error("[seed] fatal:", err);
  process.exit(1);
});
