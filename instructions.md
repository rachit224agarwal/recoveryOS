# RecoveryOS — LLM Development Instructions

## 0. Project Identity

**Product:** RecoveryOS  
**Buildathon:** Razorpay AI Buildathon — AI Revenue Recovery track  
**Goal:** Build a polished, working, measurable prototype that turns failed merchant payment events into bounded, explainable recovery workflows.

### One-line product definition

> RecoveryOS is an agentic revenue recovery system that detects failed payment events, diagnoses the likely cause, evaluates recoverability, recommends a bounded recovery action, executes it through a safe simulator, verifies the outcome, and records an auditable decision trail.

This is a **synthetic/demo system**. It must never claim access to Razorpay production systems, internal APIs, merchant data, bank systems, or real customer data.

---

# 1. User's Required Technology Stack

Do not replace the stack without explicit approval.

### Frontend
- React
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui
- Recharts
- Framer Motion only for purposeful transitions

### Backend
- Node.js
- Express
- TypeScript

### AI / Agent
- LangGraph
- Gemini free-tier model as the preferred hosted LLM
- Ollama as a local/fallback option when practical

### Data
- MongoDB
- Redis only if there is a demonstrated need

### Deployment
- Vercel → frontend
- Render → backend
- MongoDB Atlas → database
- Redis → optional managed Redis if actually required

### Important model rule

Do not hardcode a fragile model name throughout the application.

Use environment configuration:

```env
LLM_PROVIDER=gemini
LLM_MODEL=<configured-free-tier-gemini-model>
```

Keep model selection centralized in an LLM adapter.

Because provider names, model availability, quotas, and free-tier limits can change, verify the currently available free-tier Gemini model before deployment rather than assuming a specific model will always remain free.

For local fallback:

```env
LLM_PROVIDER=ollama
LLM_MODEL=<local-model-name>
```

The application must not require a paid LLM for normal local development.

---

# 2. Product Principles

1. Business value before AI novelty.
2. Agent ≠ chatbot.
3. LLM output is untrusted input.
4. Deterministic business rules outrank LLM recommendations.
5. No real money movement.
6. Synthetic data only.
7. Every consequential decision must be explainable.
8. Every action must be bounded and auditable.
9. Graceful failure is a first-class feature.
10. Do not overengineer.
11. Do not fabricate Razorpay internal information.
12. Do not claim synthetic results are real-world Razorpay results.

---

# 3. What We Are Actually Building

A merchant has failed payments.

RecoveryOS should answer:

> Can this payment reasonably be recovered, why did it fail, what should happen next, is that action allowed, what happened after the action, and how much revenue was recovered?

The system follows:

```text
Payment Event
     ↓
Observe
     ↓
Diagnose
     ↓
Investigate Evidence
     ↓
Agent Recommendation
     ↓
Deterministic Guardrails
     ↓
Approved Action
     ↓
Payment Simulator
     ↓
Verify Result
     ↓
Audit Event
     ↓
Analytics
```

---

# 4. Agent ≠ Chatbot

Do not build a generic "Ask AI" interface as the core product.

The agent must perform an actual workflow.

Example:

```text
₹2,499 payment fails
        ↓
Failure: temporary bank timeout
        ↓
Agent checks customer history
        ↓
6/7 previous payments succeeded
        ↓
Recovery probability: high
        ↓
Recommendation: retry after 15 minutes
        ↓
Guardrail: PASS
        ↓
Simulator executes retry
        ↓
SUCCESS
        ↓
₹2,499 recovered
```

The UI should expose this process clearly.

---

# 5. Target User

Primary user:
- Merchant payments/finance/operations team.

Their questions:

- How much revenue is at risk?
- How much was recovered?
- Why are payments failing?
- What is the agent doing?
- Why did it choose this action?
- Was the action permitted?
- Did the action work?
- What happens if it fails again?
- Can I audit the decision?

---

# 6. Core Product Pages

Build these pages:

### 1. Dashboard
Shows:
- Revenue at risk
- Revenue recovered
- Recovery rate
- Automated actions
- Escalations
- Recovery trend
- Failure category distribution
- Recent recovery activity

### 2. Transactions
A high-quality searchable/filterable table:
- transaction ID
- amount
- payment method
- payment type
- failure category
- status
- AI decision
- timestamp

### 3. Transaction Detail
Show:
- payment information
- failure diagnosis
- customer/payment history
- recoverability
- recommendation
- evidence
- policy checks
- action
- outcome
- decision timeline

### 4. Agent Activity
Show real agent events:
- diagnosis
- evidence retrieval
- recommendation
- guardrail result
- action
- verification

Never fake a "thinking" animation.

### 5. Analytics
Show:
- baseline vs agent
- recovery rate
- revenue recovered
- unnecessary actions
- escalation rate
- recovery by failure type
- recovery by payment method

### 6. Audit Log
Show:
- transaction
- agent version
- decision
- evidence
- policy result
- action
- result
- timestamps
- correlation ID

### 7. Simulation
Allow the reviewer to create a synthetic payment failure and run the full workflow live.

---

# 7. Five-Minute Demo

The entire project must support a strong five-minute demo.

### 0:00–0:30 — Problem
Explain failed payments as revenue at risk.

### 0:30–1:30 — Live simulation
Create a failed ₹5,000 transaction.

### 1:30–2:15 — Agent
Show:
- diagnosis
- evidence
- recovery recommendation
- confidence

### 2:15–2:45 — Guardrails
Show:
- policy check
- retry limits
- amount threshold
- approval requirement

### 2:45–3:30 — Execution
Run simulated recovery and show:
- action
- payment result
- recovered revenue

### 3:30–4:15 — Batch evaluation
Run/show the 10,000+ synthetic transaction benchmark.

### 4:15–5:00 — Architecture
Explain:
- React/Vite
- Express
- MongoDB
- LangGraph
- Gemini
- guardrail engine
- payment simulator
- analytics

---

# 8. AI Architecture

Use LangGraph as the workflow orchestrator.

Prefer one strong graph over many unnecessary agents.

Recommended graph:

```text
START
  ↓
load_transaction
  ↓
diagnose_failure
  ↓
retrieve_evidence
  ↓
estimate_recoverability
  ↓
recommend_action
  ↓
validate_guardrails
  ├── BLOCK → audit → END
  ├── HUMAN_REVIEW → audit → END
  └── ALLOW
        ↓
execute_simulated_action
        ↓
verify_outcome
        ↓
record_audit
        ↓
update_metrics
        ↓
END
```

Do not create multiple agents just to make the architecture sound "agentic."

---

# 9. LLM Architecture

Use an adapter so the rest of the application does not depend directly on Gemini.

```text
LangGraph
   ↓
LLM Service
   ↓
Provider Adapter
   ├── Gemini
   └── Ollama
```

Recommended behavior:
- Gemini free tier for hosted development/demo when available.
- Ollama for local development or quota fallback.
- Model configured through environment variables.
- Never scatter provider/model names across the codebase.

The LLM should primarily handle:
- nuanced failure interpretation
- evidence synthesis
- recommendation generation
- explanation generation

The LLM should NOT handle:
- authorization
- retry limits
- monetary thresholds
- idempotency
- policy enforcement
- final permission to execute

Those belong to deterministic code.

---

# 10. Structured Agent Output

Never parse free-form prose to decide whether an action should execute.

Use a strict schema such as:

```ts
type RecoveryRecommendation = {
  diagnosis:
    | "temporary_failure"
    | "insufficient_balance"
    | "authentication_issue"
    | "mandate_issue"
    | "checkout_abandonment"
    | "repeated_failure"
    | "unknown";

  confidence: number;

  recoverability: "high" | "medium" | "low" | "unknown";

  recommendedAction:
    | "retry_payment"
    | "schedule_retry"
    | "create_payment_link"
    | "send_recovery_notification"
    | "escalate_to_human"
    | "no_action";

  reason: string;

  evidenceIds: string[];

  riskLevel: "low" | "medium" | "high";
};
```

Validate the result before it reaches the policy engine.

If validation fails:
- do not execute anything
- record the failure
- route to safe fallback/human review

---

# 11. Tool Contracts

Tools should have strict schemas.

Initial simulator tools:

```text
get_transaction()
get_payment_history()
get_merchant_policy()
calculate_recoverability()
schedule_retry()
retry_payment()
create_payment_link()
send_recovery_notification()
escalate_to_human()
get_simulated_outcome()
record_audit_event()
```

The LLM must never invent tool results.

Every tool must:
- validate input
- return structured output
- have deterministic error behavior
- protect against duplicate execution
- expose useful errors
- be independently testable

---

# 12. Guardrails

The guardrail engine is deterministic TypeScript code.

### Retry
- configurable maximum retry count
- configurable minimum delay
- no retry after terminal failure
- no retry after success
- no duplicate action

### High-value transaction
Above configured threshold:
- agent can recommend
- human approval required before execution

### Repeated failure
After retry limit:
- stop automatic recovery
- escalate

### Low confidence
Below configured threshold:
- no autonomous action
- human review or no action

### Duplicate prevention
Use idempotency keys.

### Policy violation
Block action and record the reason.

### Audit
Every consequential decision/action gets an audit event.

---

# 13. Synthetic Data

Generate at least 10,000 failed payment records.

Suggested fields:

```text
transactionId
merchantId
customerId
amount
currency
paymentMethod
paymentType
failureCode
failureCategory
createdAt
previousAttemptCount
previousSuccessCount
previousFailureCount
historicalRecoveryRate
merchantPolicyId
expectedRecoveryLabel
simulatedOutcome
```

Use deterministic seeds where possible so benchmark runs are reproducible.

Never cherry-pick only successful examples.

---

# 14. Evaluation

Build a baseline.

Example:

```text
Baseline:
retry every eligible payment once after fixed delay

Agent:
context-aware recovery workflow
```

Measure:

- recovery rate
- revenue recovered
- unnecessary retries
- escalation rate
- action success rate
- false-positive actions
- decision latency if available

Example presentation:

```text
                 Baseline      RecoveryOS

Recovery Rate       21.4%         38.7%
Revenue Recovered   ₹4.2L         ₹7.8L
Unnecessary Retry   12.1%          4.3%
Escalations         1,284           387
```

These are illustrative values only. The application must display actual benchmark results from the generated dataset.

Always label:
**Synthetic benchmark / Demo data**

---

# 15. Backend Architecture

Use Node.js + Express + TypeScript.

Recommended structure:

```text
server/
  src/
    config/
    routes/
    controllers/
    services/
    agents/
      graph/
      nodes/
      prompts/
      tools/
    guardrails/
    models/
    repositories/
    simulator/
    analytics/
    audit/
    middleware/
    utils/
    app.ts
    server.ts
```

Keep:
- routes thin
- controllers thin
- business logic in services
- agent logic in agent modules
- policy logic in guardrails
- persistence in repositories

Do not put business logic directly into Express route handlers.

---

# 16. Frontend Architecture

Use React + Vite + TypeScript.

Recommended:

```text
client/
  src/
    components/
      ui/
      dashboard/
      transactions/
      agent/
      audit/
      analytics/
      simulation/
    pages/
    hooks/
    lib/
    services/
    types/
    data/
    layouts/
    styles/
    App.tsx
    main.tsx
```

Use shadcn/ui for reusable primitives, but customize them into a coherent product system.

Do not make every component look like default shadcn.

---

# 17. UI / UX Direction

Razorpay is known for a very high frontend/product quality bar. Use that as a **benchmark for craft**, not as a visual template.

Target:

- premium
- minimal
- confident
- technical
- precise
- highly readable
- strong typography
- excellent spacing
- restrained color
- meaningful data density
- purposeful motion
- polished states

Avoid:
- generic purple/blue gradient backgrounds
- random emojis
- excessive glassmorphism
- neon cyberpunk
- decorative blobs
- huge glowing text
- excessive rounded cards
- "AI magic" visual clichés
- unnecessary 3D
- excessive animations

Do not copy Razorpay's exact branding, proprietary illustrations, or website components.

---

# 18. UI Design System

Create design tokens for:
- typography
- spacing
- radius
- shadows
- borders
- surface colors
- status colors

Use color primarily for:
- status
- warnings
- success/failure
- interactive states
- chart differentiation

Do not use color alone to communicate meaning.

Use:
- icon + text
- status label
- visual hierarchy

Typography should do most of the design work.

---

# 19. Important UI Components

Build reusable components:

```text
MetricCard
DataTable
StatusBadge
DecisionCard
PolicyCheck
AgentEvent
Timeline
EvidenceList
RecoveryOutcome
SimulationForm
ConfirmationDialog
EmptyState
ErrorState
Skeleton
ChartCard
FilterBar
```

Each component must support real data and states.

---

# 20. Agent Activity UI

Do not fake AI reasoning.

Show actual backend events:

```text
14:02:11
Payment failure detected

14:02:11
Failure classified: temporary_failure

14:02:12
Customer history retrieved

14:02:12
Recovery probability calculated: 87%

14:02:12
Recommendation: retry_payment

14:02:12
Guardrail: PASS

14:02:13
Retry executed

14:02:14
Payment recovered
```

Use purposeful motion to reveal events, not an artificial "AI is thinking..." loop.

---

# 21. Transaction Detail UI

Example structure:

```text
TX-1023

₹2,499
FAILED → RECOVERED

Payment
UPI · Recurring
Merchant
Demo Store

AI Diagnosis
Temporary bank/network failure

Recovery Probability
87%

Evidence
6/7 previous payments succeeded

Recommendation
Retry after 15 minutes

Policy
✓ Retry limit
✓ Amount threshold
✓ Idempotency
✓ Merchant policy

Timeline
Failure → Analysis → Decision → Retry → Success
```

This page should be one of the strongest screens in the product.

---

# 22. Simulation Page

Provide:

```text
Amount
Payment Method
Payment Type
Failure Type
Customer History
Merchant Policy
```

Button:

**Simulate Failure**

Then run the actual LangGraph workflow.

Do not fake frontend-only results.

The result should come from:
- backend
- LangGraph
- guardrails
- simulator
- database

---

# 23. Error Handling

Every async operation must have:
- loading
- success
- error
- recovery action where applicable

Never expose:
- raw stack traces
- `undefined`
- `null`
- unhandled promise errors
- raw database errors

Server errors should be logged with correlation IDs.

Frontend should receive safe, useful messages.

---

# 24. Redis

Redis is optional.

Do NOT add Redis just because it appears in the stack.

Introduce Redis only if it solves a real requirement such as:
- job queue
- rate limiting
- caching
- short-lived agent state
- distributed coordination

For the first MVP, MongoDB is enough unless a clear requirement emerges.

---

# 25. Deployment

### Frontend
Vercel

### Backend
Render

### Database
MongoDB Atlas

### Redis
Only if required, using a compatible managed Redis service.

Configure CORS correctly between Vercel and Render.

Never put server-side secrets into Vite client variables.

Only `VITE_*` variables intended for public browser use may reach the frontend.

---

# 26. Environment Variables

Backend examples:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=
GEMINI_API_KEY=
LLM_PROVIDER=gemini
LLM_MODEL=
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=
CLIENT_URL=http://localhost:5173
REDIS_URL=
```

Frontend:

```env
VITE_API_BASE_URL=http://localhost:5000
```

Never commit real values.

Provide `.env.example`.

---

# 27. Development Workflow

Before writing code:

1. Inspect repository.
2. Read existing code and configuration.
3. Read `instructions.md` and `skill.md`.
4. Identify the smallest coherent feature.
5. Define data contract.
6. Define API contract.
7. Define failure cases.
8. Implement backend.
9. Test backend.
10. Implement frontend.
11. Connect to real API.
12. Test loading/error/empty states.
13. Run lint/type checks.
14. Run relevant tests.
15. Review the UI at realistic data volumes.

Do not rewrite unrelated code.

---

# 28. Bug Prevention

When a bug occurs:

1. Reproduce it.
2. Identify the root cause.
3. Fix the root cause.
4. Add/adjust a regression test.
5. Rerun affected tests.
6. Verify the UI flow.

Do not:
- disable tests
- swallow errors
- hardcode a successful result
- add arbitrary delays
- patch symptoms without understanding the cause

---

# 29. Testing

Backend:
- Vitest or Jest
- Supertest for API tests where useful

Test:
- diagnosis
- structured output validation
- guardrails
- retry limits
- high-value approval
- idempotency
- simulator outcomes
- audit events
- API validation

Frontend:
- Vitest
- React Testing Library

Critical E2E:
```text
simulate
→ agent
→ recommendation
→ guardrail
→ action
→ outcome
→ audit
→ analytics
```

---

# 30. Security

Never commit:
- API keys
- passwords
- tokens
- production credentials
- real customer data

Treat:
- frontend input as untrusted
- LLM output as untrusted
- tool arguments as untrusted

Validate all of them.

Mask customer identifiers.

Do not expose secrets through frontend environment variables.

---

# 31. Anti-Pattern List

Do NOT build:

- generic chatbot
- generic RAG demo
- uncontrolled LLM tool calling
- fake agent animations
- fake benchmark results
- fake Razorpay production data
- copied Razorpay website
- random emojis
- gradient-heavy SaaS template
- excessive glassmorphism
- meaningless charts
- 20-agent architecture
- microservices without need
- Redis without a real requirement
- Kubernetes for the sake of architecture
- unnecessary dependencies
- hardcoded "SUCCESS" responses

---

# 32. Definition of Done

### Product
- Core revenue recovery story obvious.
- Five-minute demo works.
- Synthetic/demo data clearly labelled.

### Agent
- LangGraph workflow works.
- Agent has real tools.
- Structured outputs validated.
- Evidence captured.
- Agent cannot bypass guardrails.

### Safety
- Retry limits exist.
- High-value approval exists.
- Duplicate actions prevented.
- Low-confidence cases can escalate.
- Audit trail exists.

### Evaluation
- 10,000+ synthetic failures.
- Baseline exists.
- Actual metrics generated.
- Unnecessary actions measured.

### Backend
- Express APIs work.
- MongoDB persistence works.
- Validation works.
- Errors handled.
- Tests pass.

### Frontend
- Dashboard works.
- Transactions works.
- Transaction detail works.
- Agent activity works.
- Simulation works.
- Audit works.
- Analytics works.
- Loading/error/empty states work.
- Responsive behavior works.
- No console errors.

### Design
- No generic gradient-heavy design.
- No random emojis.
- Strong typography.
- Consistent spacing.
- Excellent hierarchy.
- Purposeful motion.
- Premium fintech feel.

### Integrity
- No invented Razorpay internal information.
- No real payment processing.
- No real customer data.
- No fake production claims.
- No secrets committed.
