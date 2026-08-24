import type {
  AgentRun,
  AppMeta,
  AuditItem,
  DashboardMetrics,
  EvalRun,
  Pagination,
  TransactionListItem,
} from "@/types/api";

/**
 * API service layer — the ONLY place that talks to the backend.
 * Components never call fetch directly.
 */

const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export class ApiRequestError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiRequestError("NETWORK_ERROR", "Cannot reach the RecoveryOS API. Is the server running?");
  }

  const json = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; error: { code: string; message: string } }
    | null;

  if (!json) {
    throw new ApiRequestError("PARSE_ERROR", "Received an unreadable response from the server.");
  }
  if (!json.success) {
    throw new ApiRequestError(json.error.code, json.error.message);
  }
  return json.data;
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

// --- meta ------------------------------------------------------------------

export const api = {
  getMeta: () => request<AppMeta>("/meta/meta"),
  getHealth: () => request<{ status: string; database: string; llm: { provider: string; model: string } }>("/meta/health"),

  // dashboard + analytics
  getDashboard: () => request<DashboardMetrics>("/analytics/dashboard"),
  getBenchmark: () => request<EvalRun | null>("/analytics/benchmark"),
  runBenchmark: (size: number) =>
    request<EvalRun>("/analytics/benchmark/run", { method: "POST", body: JSON.stringify({ size }) }),

  // transactions
  listTransactions: (params: {
    page?: number;
    limit?: number;
    q?: string;
    status?: string;
    category?: string;
    method?: string;
  }) => {
    type ListResponse = { items: TransactionListItem[]; pagination: Pagination };
    return request<ListResponse>(`/transactions${qs(params)}`);
  },
  getTransaction: (id: string) => {
    type DetailResponse = { transaction: Record<string, unknown>; runs: AgentRun[]; audits: AuditItem[] };
    return request<DetailResponse>(`/transactions/${encodeURIComponent(id)}`);
  },
  analyzeTransaction: (id: string) =>
    request<{ run: AgentRun }>(`/transactions/${encodeURIComponent(id)}/analyze`, { method: "POST" }),

  // agent runs
  listRuns: (params: { page?: number; limit?: number; status?: string }) => {
    type RunsResponse = { items: AgentRun[]; pagination: Pagination };
    return request<RunsResponse>(`/runs${qs(params)}`);
  },
  getRun: (runId: string) => request<{ run: AgentRun }>(`/runs/${encodeURIComponent(runId)}`),

  // audit
  listAudit: (params: { page?: number; limit?: number; transactionId?: string; type?: string }) => {
    type AuditResponse = { items: AuditItem[]; pagination: Pagination };
    return request<AuditResponse>(`/audit${qs(params)}`);
  },

  // simulation
  simulateFailure: (body: {
    amount: number;
    paymentMethod: string;
    paymentType: string;
    failureCode: string;
    customerHistoryPreset: string;
    merchantId: string;
  }) => {
    type SimulateResponse = { transaction: { transactionId: string }; run: AgentRun };
    return request<SimulateResponse>("/simulations/failure", { method: "POST", body: JSON.stringify(body) });
  },
};
