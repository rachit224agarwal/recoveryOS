import { Router } from "express";
import { z } from "zod";
import { Transaction } from "../models/transaction.js";
import { AgentRun } from "../models/agentRun.js";
import { AuditEvent } from "../models/auditEvent.js";
import { success } from "../utils/api.js";
import { runRecoveryWorkflow } from "../agents/runService.js";

export const transactionsRouter = Router();

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(80).optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  method: z.string().optional(),
});

transactionsRouter.get("/", async (req, res, next) => {
  try {
    const query = ListQuerySchema.parse(req.query);
    const filter: Record<string, unknown> = {};
    if (query.q) {
      const rx = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ transactionId: rx }, { customerId: rx }, { merchantName: rx }];
    }
    if (query.status && query.status !== "all") filter.status = query.status;
    if (query.category && query.category !== "all") filter.failureCategory = query.category;
    if (query.method && query.method !== "all") filter.paymentMethod = query.method;

    const [items, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .select(
          "transactionId merchantName amount currency paymentMethod paymentType failureCategory failureCode status latestDecision createdAt"
        )
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    success(res, {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
});

transactionsRouter.get("/:transactionId", async (req, res, next) => {
  try {
    const transactionId = req.params.transactionId as string;
    const [txn, runs, audits] = await Promise.all([
      Transaction.findOne({ transactionId }).lean(),
      AgentRun.find({ transactionId }).sort({ startedAt: -1 }).limit(10).lean(),
      AuditEvent.find({ transactionId }).sort({ at: -1 }).limit(30).lean(),
    ]);
    if (!txn) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: `Transaction ${transactionId} not found` },
      });
      return;
    }
    success(res, { transaction: txn, runs, audits });
  } catch (err) {
    next(err);
  }
});

transactionsRouter.post("/:transactionId/analyze", async (req, res, next) => {
  try {
    const transactionId = req.params.transactionId as string;
    const txn = await Transaction.findOne({ transactionId }).lean();
    if (!txn) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: `Transaction ${transactionId} not found` },
      });
      return;
    }
    if (txn.status === "recovered" || txn.status === "terminal") {
      res.status(409).json({
        success: false,
        error: {
          code: "TERMINAL_STATE",
          message: `Transaction is already ${txn.status}; no further analysis permitted`,
        },
      });
      return;
    }
    const run = await runRecoveryWorkflow(transactionId);
    success(res, { run }, 201);
  } catch (err) {
    next(err);
  }
});
