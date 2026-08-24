import { Router } from "express";
import { z } from "zod";
import { success } from "../utils/api.js";
import { getDashboardMetrics } from "../analytics/dashboard.js";
import { getLatestBenchmark, runBenchmark } from "../analytics/benchmark.js";

export const analyticsRouter = Router();

analyticsRouter.get("/dashboard", async (_req, res, next) => {
  try {
    success(res, await getDashboardMetrics());
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/benchmark", async (_req, res, next) => {
  try {
    const latest = await getLatestBenchmark();
    if (!latest) {
      res.status(200).json({ success: true, data: null });
      return;
    }
    success(res, latest);
  } catch (err) {
    next(err);
  }
});

const BenchmarkSchema = z.object({
  size: z.coerce.number().int().min(100).max(20_000).default(10_000),
  seed: z.coerce.number().int().min(1).default(42),
});

analyticsRouter.post("/benchmark/run", async (req, res, next) => {
  try {
    const input = BenchmarkSchema.parse(req.body ?? {});
    const result = await runBenchmark(input);
    success(res, result);
  } catch (err) {
    next(err);
  }
});
