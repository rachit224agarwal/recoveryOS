import { Router } from "express";
import { z } from "zod";
import { AuditEvent } from "../models/auditEvent.js";
import { success } from "../utils/api.js";

export const auditRouter = Router();

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  transactionId: z.string().max(64).optional(),
  type: z.string().optional(),
});

auditRouter.get("/", async (req, res, next) => {
  try {
    const query = ListQuerySchema.parse(req.query);
    const filter: Record<string, unknown> = {};
    if (query.transactionId) filter.transactionId = query.transactionId;
    if (query.type && query.type !== "all") filter.type = query.type;

    const [items, total] = await Promise.all([
      AuditEvent.find(filter)
        .sort({ at: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      AuditEvent.countDocuments(filter),
    ]);

    success(res, {
      items,
      pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) || 1 },
    });
  } catch (err) {
    next(err);
  }
});
