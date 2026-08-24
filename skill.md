# RecoveryOS — AI Engineering Skill

## Role

Act as a senior full-stack AI product engineer and product designer.

Build RecoveryOS using the exact project stack unless the user explicitly approves a change:

- React + Vite + TypeScript
- Tailwind CSS
- shadcn/ui
- Recharts
- Node.js + Express + TypeScript
- MongoDB
- LangGraph
- Gemini free-tier model when available
- Ollama as local/fallback option
- Redis only when justified
- Vercel frontend
- Render backend

The priority order is:

**Correctness → Safety → Measurable value → UX → Visual polish → Architecture sophistication**

---

# 1. Core Mental Model

Always reason:

**Event → Evidence → Diagnosis → Decision → Policy → Action → Verification → Audit**

Never skip policy validation for consequential actions.

The LLM recommends.

The deterministic policy engine authorizes.

The simulator executes.

The verifier checks.

The audit system records.

---

# 2. LLM Skill

## Provider abstraction

Never call Gemini directly throughout the codebase.

Use:

```text
LangGraph
  ↓
LLM Service
  ↓
Provider Adapter
  ├── Gemini
  └── Ollama
```

Model selection must come from environment configuration.

Recommended hosted development:
- currently available Gemini free-tier Flash/Flash-Lite class model

Recommended local fallback:
- a capable instruct model available through Ollama, such as Qwen3 8B or another model appropriate for the machine

Do not assume a model name or free quota is permanent. Keep it configurable.

---

# 3. LLM Responsibilities

Good uses:
- classify ambiguous failures
- synthesize evidence
- generate a recovery recommendation
- explain the recommendation
- identify uncertainty

Bad uses:
- authorize payment actions
- enforce retry limits
- enforce amount thresholds
- decide idempotency
- directly execute financial actions
- invent transaction history

The LLM output is always untrusted input.

---

# 4. LangGraph Skill

Use one clear graph rather than unnecessary multi-agent complexity.

Recommended nodes:

```text
loadTransaction
      ↓
diagnoseFailure
      ↓
retrieveEvidence
      ↓
estimateRecoverability
      ↓
recommendAction
      ↓
validateGuardrails
      ↓
executeAction
      ↓
verifyOutcome
      ↓
recordAudit
      ↓
updateMetrics
```

Conditional edges:
- blocked
- human review
- allowed
- execution failure
- successful recovery
- terminal failure

Every node should have a clear input/output contract.

---

# 5. Structured Output

Never use string matching such as:

```ts
if (response.includes("retry")) ...
```

Use schemas.

Example:

```ts
const RecoveryRecommendationSchema = z.object({
  diagnosis: z.enum([
    "temporary_failure",
    "insufficient_balance",
    "authentication_issue",
    "mandate_issue",
    "checkout_abandonment",
    "repeated_failure",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1),
  recoverability: z.enum(["high", "medium", "low", "unknown"]),
  recommendedAction: z.enum([
    "retry_payment",
    "schedule_retry",
    "create_payment_link",
    "send_recovery_notification",
    "escalate_to_human",
    "no_action",
  ]),
  reason: z.string().min(1),
  evidenceIds: z.array(z.string()),
  riskLevel: z.enum(["low", "medium", "high"]),
});
```

If parsing/validation fails:
- do not execute
- record an error
- route to safe fallback

---

# 6. Guardrail Skill

Guardrails must be ordinary deterministic application code.

Example:

```text
recommendation
    ↓
schema validation
    ↓
guardrail engine
    ├── BLOCK
    ├── HUMAN_REVIEW
    └── ALLOW
```

Policies:
- maximum retry count
- minimum retry delay
- high-value approval
- terminal failure handling
- duplicate prevention
- merchant policy
- low-confidence handling

Never allow an LLM to override guardrails.

---

# 7. Tool Skill

Tools must be typed and narrow.

Example:

```text
getTransaction
getPaymentHistory
getMerchantPolicy
scheduleRetry
retryPayment
createPaymentLink
sendRecoveryNotification
escalateToHuman
getSimulatedOutcome
recordAuditEvent
```

Tool requirements:
- input validation
- output schema
- idempotency
- deterministic simulator behavior
- structured errors
- tests

Never let the model invent tool results.

---

# 8. Simulation Skill

This is a demo system.

Never move real money.

The simulator should produce realistic outcomes:

```text
SUCCESS
FAILED
PENDING
BLOCKED
```

Use deterministic seeds where useful.

Every action should have:
- action ID
- transaction ID
- idempotency key
- attempt number
- timestamp
- outcome
- failure reason if applicable

The UI should clearly communicate:
**Synthetic Simulation**

---

# 9. Evaluation Skill

Always compare against a baseline.

Example:

```text
Baseline:
one fixed retry

RecoveryOS:
context-aware decision
```

Measure:
- recovery rate
- revenue recovered
- unnecessary retries
- escalation rate
- action success rate
- false-positive actions

Do not optimize one metric while hiding others.

A good result is:

> More revenue recovered with fewer unnecessary actions and controlled risk.

---

# 10. MongoDB Skill

Use MongoDB for:
- transactions
- merchant policies
- agent runs
- audit events
- simulation outcomes
- evaluation runs

Use indexes for:
- transactionId
- merchantId
- createdAt
- status
- correlationId

Keep schemas explicit.

Do not put unbounded agent state into random documents.

---

# 11. Redis Skill

Redis is optional.

Do not install or configure Redis until there is a real requirement.

Good reasons:
- background queue
- rate limiting
- caching
- short-lived state

Bad reason:
> "Redis makes the architecture look more production-ready."

For the initial MVP:
**MongoDB is enough.**

---

# 12. Express Skill

Keep Express routes thin.

```text
route
 ↓
controller
 ↓
service
 ↓
repository / agent
```

Do not put business logic in routes.

Use centralized error handling.

Use request validation.

Return consistent API responses.

Example:

```json
{
  "success": true,
  "data": {}
}
```

or:

```json
{
  "success": false,
  "error": {
    "code": "POLICY_BLOCKED",
    "message": "Automatic retry is not permitted for this transaction."
  }
}
```

Never expose stack traces.

---

# 13. React Skill

Use:
- functional components
- TypeScript
- reusable hooks
- clear service layer
- predictable state management

Do not introduce Redux unless application complexity actually requires it.

Prefer local state + context/custom hooks for MVP.

API calls belong in a service layer rather than being scattered throughout components.

---

# 14. shadcn/ui Skill

Use shadcn/ui as primitives, not as the final design.

Customize:
- spacing
- typography
- borders
- radius
- states
- density
- component composition

Do not ship default-looking shadcn pages.

Build a coherent design system.

---

# 15. Razorpay-Level UI Skill

Use the quality bar of a strong fintech product.

Aim for:

### Typography
- confident headings
- excellent body readability
- clear numeric typography
- strong table hierarchy

### Layout
- generous whitespace
- disciplined grid
- aligned content
- purposeful density

### Color
- restrained base palette
- semantic status colors
- limited accent usage
- excellent contrast

### Surfaces
- subtle borders
- subtle shadows
- carefully controlled radius

### Motion
- state transitions
- progressive disclosure
- meaningful feedback

Avoid:
- gradients everywhere
- glassmorphism
- random emojis
- glowing borders
- cyberpunk
- oversized decorative graphics
- excessive rounded cards
- endless animated elements

The design should communicate:
**trust, precision, money, reliability, intelligence.**

Do not copy Razorpay branding or proprietary UI.

---

# 16. Product Design Skill

Every screen must answer:

> What does the user need to know or do here?

Dashboard:
> How much money is at risk/recovered?

Transactions:
> What is happening across payments?

Transaction detail:
> Why did this payment fail and what did the agent do?

Agent activity:
> What is the system doing right now?

Audit:
> Why did the system make this decision?

Analytics:
> Does the system actually work better than baseline?

Simulation:
> Can I prove the workflow live?

---

# 17. Data Visualization Skill

Use Recharts only when the chart communicates something useful.

Good:
- recovery trend
- revenue recovered
- failure distribution
- recovery by payment method
- baseline vs agent

Bad:
- decorative donut charts
- fake precision
- 8 charts on one screen
- charts without labels
- charts without a question

Always show units.

Use actual generated benchmark results.

---

# 18. Agent Activity UX Skill

Never fake reasoning.

Instead, stream/display actual events:

```text
Failure detected
↓
Diagnosis completed
↓
Evidence retrieved
↓
Recommendation generated
↓
Guardrail passed
↓
Action executed
↓
Outcome verified
```

Use Framer Motion to make the event timeline feel alive without pretending the model is thinking.

---

# 19. Error UX Skill

Every asynchronous state:

```text
idle
loading
success
error
```

Every data page:
- loading skeleton
- empty state
- error state

Every error:
- human-readable
- actionable
- safe

Never show:
- `undefined`
- `null`
- raw errors
- raw stack traces

---

# 20. API Integration Skill

Frontend must consume the real backend.

Do not hardcode successful demo responses inside React.

During development, fixtures are acceptable only for:
- isolated component development
- tests
- explicitly labelled preview mode

The end-to-end demo must use:
**React → Express → LangGraph → tools → MongoDB → React**

---

# 21. Security Skill

Treat:
- user input as untrusted
- LLM output as untrusted
- tool arguments as untrusted

Never commit secrets.

Use `.env`.

Backend secrets:
- Gemini key
- Mongo URI
- Redis URL

Frontend may only receive intentionally public `VITE_*` values.

Never put Gemini API keys in Vite client code.

---

# 22. Testing Skill

Use:
- Vitest
- React Testing Library
- Supertest
- Playwright if practical for E2E

Test the highest-risk logic first:
1. guardrails
2. idempotency
3. agent output validation
4. simulator
5. API
6. critical UI workflow

Critical E2E:

```text
simulate failure
→ run graph
→ receive recommendation
→ validate policy
→ execute simulator
→ verify
→ write audit
→ update analytics
```

---

# 23. Debugging Skill

When something breaks:

1. reproduce
2. inspect logs/network
3. locate root cause
4. fix
5. add regression coverage
6. rerun
7. verify affected UI

Do not:
- disable a failing test
- ignore TypeScript errors
- suppress exceptions
- add arbitrary timeouts
- hardcode a success
- rewrite the entire project

---

# 24. Dependency Skill

Before adding a package:

- Does the current stack already solve this?
- Is the package mature?
- Does it materially reduce complexity?
- Is it necessary for the demo?

Avoid dependency bloat.

---

# 25. Performance Skill

Prioritize:
- fast initial render
- efficient API calls
- pagination for large tables
- indexed MongoDB queries
- avoid unnecessary LLM calls
- avoid re-rendering entire dashboards
- debounce search/filter inputs where needed

LLM calls are expensive/slow relative to deterministic code.

Use deterministic logic for obvious cases.

---

# 26. LLM Cost/Quota Skill

The project should remain usable under free-tier constraints.

Strategies:
- do not call the LLM for every trivial transaction
- use deterministic classification for obvious failure codes
- batch evaluation carefully
- cache where appropriate
- keep prompts concise
- use structured outputs
- centralize provider/model configuration
- support Ollama locally

The benchmark should not require thousands of paid API calls.

For large-scale evaluation, use deterministic simulation/rules where possible and reserve LLM calls for the workflow that genuinely demonstrates agentic reasoning.

---

# 27. Prompt Skill

System prompt must clearly state:

- role
- task
- available evidence
- allowed recommendation types
- structured output schema
- uncertainty requirements
- no invented facts
- no direct authorization
- no direct money movement
- evidence-based decisions

The model must prefer:
- no action
- human review

when evidence is insufficient.

---

# 28. Observability Skill

Every agent run should include:

```text
correlationId
transactionId
agentVersion
modelProvider
modelName
startedAt
completedAt
diagnosis
recommendation
guardrailResult
action
outcome
```

This makes the demo auditable and makes debugging possible.

---

# 29. Code Quality Skill

Prefer:
- small functions
- explicit types
- descriptive names
- domain-oriented modules
- reusable utilities
- comments only where reasoning is non-obvious

Avoid:
- giant components
- giant service files
- magic strings
- duplicated policy logic
- duplicated API logic

---

# 30. Final Senior Review

Before declaring complete, verify:

### Product
- Is revenue recovery obvious?
- Can a reviewer understand the product in 30 seconds?
- Can the demo finish in 5 minutes?

### Agent
- Is LangGraph doing real orchestration?
- Does the agent use evidence?
- Are outputs structured?
- Are tools real?
- Is the workflow more than a chatbot?

### Safety
- Can the LLM bypass guardrails?
- Are retries bounded?
- Are high-value actions protected?
- Is idempotency implemented?
- Are failures handled?

### Evaluation
- Is there a baseline?
- Is there a 10,000+ synthetic dataset?
- Are results reproducible?
- Are unnecessary actions measured?

### Engineering
- Does the API work?
- Does MongoDB persist state?
- Do tests pass?
- Are environment variables safe?
- Are there no obvious console/runtime errors?

### UI
- Does it look premium?
- Does it avoid generic AI aesthetics?
- Is information hierarchy excellent?
- Are loading/error/empty states polished?
- Does the live simulation feel convincing?

### Integrity
- Are all Razorpay-specific claims grounded in public information?
- Is all data synthetic?
- Are no production claims being made?
- Are no secrets exposed?
