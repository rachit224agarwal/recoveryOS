import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { runBenchmark } from "../analytics/benchmark.js";

/**
 * Standalone benchmark CLI.
 * Usage: npm run benchmark [-- --size 10000 --seed 42]
 */

const argValue = (flag: string, fallback: number): number => {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? Number(process.argv[idx + 1]) || fallback : fallback;
};

async function main(): Promise<void> {
  await connectDatabase();
  const size = argValue("--size", 10_000);
  const seed = argValue("--seed", 42);

  console.log(`[benchmark] running baseline vs agent over ${size.toLocaleString()} transactions (seed ${seed})…`);
  const result = await runBenchmark({ size, seed });

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const inr = (x: number) => `₹${x.toLocaleString("en-IN")}`;

  console.log("\n                     Baseline      RecoveryOS");
  console.log(`Recovery Rate        ${pct(result.baseline.recoveryRate).padEnd(12)}  ${pct(result.agent.recoveryRate)}`);
  console.log(`Revenue Recovered    ${inr(result.baseline.revenueRecovered).padEnd(12)}  ${inr(result.agent.revenueRecovered)}`);
  console.log(`Unnecessary Retry    ${pct(result.baseline.unnecessaryRetryRate).padEnd(12)}  ${pct(result.agent.unnecessaryRetryRate)}`);
  console.log(`Escalations          ${String(result.baseline.escalations).padEnd(12)}  ${result.agent.escalations}`);
  console.log(`Action Success       ${pct(result.baseline.actionSuccessRate).padEnd(12)}  ${pct(result.agent.actionSuccessRate)}`);
  console.log(`\n[benchmark] dataset=${result.datasetSize} duration=${(result.durationMs / 1000).toFixed(2)}s evalId=${result.evalId}`);

  await disconnectDatabase();
}

main().catch((err) => {
  console.error("[benchmark] fatal:", err);
  process.exit(1);
});
