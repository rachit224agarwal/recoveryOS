import { StateGraph, END } from "@langchain/langgraph";
import { RecoveryState, type RecoveryStateType } from "./state.js";
import {
  loadTransaction,
  diagnoseFailure,
  retrieveEvidence,
  estimateRecoverability,
  recommendAction,
  validateGuardrailsNode,
  executeAction,
  verifyOutcome,
  recordAudit,
} from "./nodes.js";

/**
 * RecoveryOS workflow graph.
 *
 *   load → diagnose → evidence → recoverability → recommend
 *        → guardrails ── BLOCK / HUMAN_REVIEW → audit → END
 *                     └─ ALLOW → execute → verify → audit → END
 */

export function buildRecoveryGraph() {
  const workflow = new StateGraph(RecoveryState)
    .addNode("load_transaction", loadTransaction)
    .addNode("diagnose_failure", diagnoseFailure)
    .addNode("retrieve_evidence", retrieveEvidence)
    .addNode("estimate_recoverability", estimateRecoverability)
    .addNode("recommend_action", recommendAction)
    .addNode("validate_guardrails", validateGuardrailsNode)
    .addNode("execute_action", executeAction)
    .addNode("verify_outcome", verifyOutcome)
    .addNode("record_audit", recordAudit)

    .addEdge("__start__", "load_transaction")
    .addEdge("load_transaction", "diagnose_failure")
    .addEdge("diagnose_failure", "retrieve_evidence")
    .addEdge("retrieve_evidence", "estimate_recoverability")
    .addEdge("estimate_recoverability", "recommend_action")
    .addEdge("recommend_action", "validate_guardrails")

    .addConditionalEdges("validate_guardrails", (state: RecoveryStateType) => {
      const decision = state.guardrailResult?.decision ?? "BLOCK";
      return decision === "ALLOW" ? "execute_action" : "record_audit";
    })

    .addEdge("execute_action", "verify_outcome")
    .addEdge("verify_outcome", "record_audit")
    .addEdge("record_audit", END);

  return workflow.compile();
}

let cached: ReturnType<typeof buildRecoveryGraph> | null = null;

export function recoveryGraph() {
  if (!cached) cached = buildRecoveryGraph();
  return cached;
}
