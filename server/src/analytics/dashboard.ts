import { Transaction } from "../models/transaction.js";
import { AgentRun } from "../models/agentRun.js";

export interface DashboardMetrics {
  revenueAtRisk: number;
  revenueRecovered: number;
  recoveryRate: number;
  automatedActions: number;
  escalations: number;
  pendingReview: number;
  trend: Array<{ date: string; failed: number; recovered: number; recoveredAmount: number }>;
  failureCategories: Array<{ category: string; count: number; amount: number }>;
  recentRuns: Array<{
    runId: string;
    transactionId: string;
    status: string;
    action?: string;
    outcome?: string;
    at: Date;
  }>;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const [riskAgg] = await Transaction.aggregate<{
    failedCount: number;
    failedAmount: number;
    recoveredCount: number;
    recoveredAmount: number;
  }>([
    {
      $group: {
        _id: null,
        failedCount: { $sum: { $cond: [{ $in: ["$status", ["failed", "escalated", "terminal", "in_review"]] }, 1, 0] } },
        failedAmount: { $sum: { $cond: [{ $in: ["$status", ["failed", "escalated", "terminal", "in_review"]] }, "$amount", 0] } },
        recoveredCount: { $sum: { $cond: [{ $eq: ["$status", "recovered"] }, 1, 0] } },
        recoveredAmount: { $sum: { $cond: [{ $eq: ["$status", "recovered"] }, "$recoveredAmount", 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        failedCount: { $ifNull: ["$failedCount", 0] },
        failedAmount: { $ifNull: ["$failedAmount", 0] },
        recoveredCount: { $ifNull: ["$recoveredCount", 0] },
        recoveredAmount: { $ifNull: ["$recoveredAmount", 0] },
      },
    },
  ]);

  const trendDocs = await Transaction.aggregate<{
    _id: string;
    failed: number;
    recovered: number;
    recoveredAmount: number;
  }>([
    { $match: { createdAt: { $gte: new Date(Date.now() - 14 * 24 * 3600 * 1000) } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        failed: { $sum: 1 },
        recovered: { $sum: { $cond: [{ $eq: ["$status", "recovered"] }, 1, 0] } },
        recoveredAmount: { $sum: { $cond: [{ $eq: ["$status", "recovered"] }, "$recoveredAmount", 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const trend = trendDocs.map((d) => ({
    date: d._id,
    failed: d.failed,
    recovered: d.recovered,
    recoveredAmount: d.recoveredAmount,
  }));

  const categoryDocs = await Transaction.aggregate<{
    _id: string;
    count: number;
    amount: number;
  }>([
    {
      $group: {
        _id: "$failureCategory",
        count: { $sum: 1 },
        amount: { $sum: "$amount" },
      },
    },
    { $sort: { count: -1 } },
  ]);
  const failureCategories = categoryDocs.map((d) => ({
    category: d._id,
    count: d.count,
    amount: Math.round(d.amount),
  }));

  const [actionStats] = await AgentRun.aggregate<{ automated: number; escalations: number; review: number }>([
    {
      $group: {
        _id: null,
        automated: { $sum: { $cond: [{ $ne: ["$executedAction.outcome", null] }, 1, 0] } },
        escalations: { $sum: { $cond: [{ $eq: ["$recommendation.recommendedAction", "escalate_to_human"] }, 1, 0] } },
        review: { $sum: { $cond: [{ $eq: ["$guardrailResult.decision", "HUMAN_REVIEW"] }, 1, 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        automated: { $ifNull: ["$automated", 0] },
        escalations: { $ifNull: ["$escalations", 0] },
        review: { $ifNull: ["$review", 0] },
      },
    },
  ]);

  const recentRuns = await AgentRun.find({}, { runId: 1, transactionId: 1, status: 1, executedAction: 1, completedAt: 1 })
    .sort({ startedAt: -1 })
    .limit(8)
    .lean();

  const failedCount = riskAgg?.failedCount ?? 0;
  const recoveredCount = riskAgg?.recoveredCount ?? 0;

  return {
    revenueAtRisk: Math.round(riskAgg?.failedAmount ?? 0),
    revenueRecovered: Math.round(riskAgg?.recoveredAmount ?? 0),
    recoveryRate:
      riskAgg && failedCount > 0 ? riskAgg.recoveredCount / (failedCount + riskAgg.recoveredCount) : 0,
    automatedActions: actionStats?.automated ?? 0,
    escalations: actionStats?.escalations ?? 0,
    pendingReview: actionStats?.review ?? 0,
    trend,
    failureCategories,
    recentRuns: recentRuns.map((r) => ({
      runId: r.runId,
      transactionId: r.transactionId,
      status: r.status,
      action: r.executedAction?.actionType ?? r.recommendation?.recommendedAction,
      outcome: r.executedAction?.outcome,
      at: r.completedAt ?? r.startedAt,
    })),
  };
}
