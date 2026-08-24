import { Router } from "express";
import { z } from "zod";
import { AgentRun } from "../models/agentRun.js";
import { success } from "../utils/api.js";

export const runsRouter = Router();

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(15),
  status: z.string().optional(),
});

runsRouter.get("/", async (req, res, next) => {
  try {
    const query = ListQuerySchema.parse(req.query);
    const filter: Record<string, unknown> = {};
    if (query.status && query.status !== "all") filter.status = query.status;

    const [items, total] = await Promise.all([
      AgentRun.find(filter)
        .sort({ startedAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .select(
          "runId transactionId status diagnosis recoverabilityScore recommendation executedAction llmUsed modelProvider modelName startedAt completedAt latencyMs"
        )
        .lean(),
      AgentRun.countDocuments(filter),
    ]);

    success(res, {
      items,
      pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) || 1 },
    });
  } catch (err) {
    next(err);
  }
});

runsRouter.get("/:runId", async (req, res, next) => {
  try {
    const run = await AgentRun.findOne({ runId: req.params.runId }).lean();
    if (!run) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: `Agent run ${String(req.params.runId)} not found` },
      });
      return;
    }
    success(res, { run });
  } catch (err) {
    next(err);
  }
});
