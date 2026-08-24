import { Router } from "express";
import { Transaction } from "../models/transaction.js";
import { MerchantPolicy } from "../models/policy.js";
import { success } from "../utils/api.js";
import { isDatabaseReady } from "../config/db.js";
import { activeLlmLabel } from "../services/llm/llmService.js";

export const metaRouter = Router();

metaRouter.get("/health", async (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      database: isDatabaseReady() ? "connected" : "disconnected",
      llm: activeLlmLabel(),
      time: new Date().toISOString(),
    },
  });
});

metaRouter.get("/meta", async (_req, res, next) => {
  try {
    const [merchants, txnCount] = await Promise.all([
      MerchantPolicy.find({}, { merchantId: 1, merchantName: 1, policyId: 1 }).lean(),
      Transaction.countDocuments(),
    ]);
    success(res, {
      appName: "RecoveryOS",
      tagline: "Agentic revenue recovery for failed payments",
      disclaimer:
        "Synthetic simulation — no real money moves and all data is generated for demonstration.",
      merchants,
      transactionCount: txnCount,
    });
  } catch (err) {
    next(err);
  }
});
