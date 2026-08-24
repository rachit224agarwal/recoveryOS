# RecoveryOS

**Every failed payment is money you already earned — this agent goes and gets it back.**

RecoveryOS watches payments fail, figures out *why*, decides whether the money is winnable,
checks the safety rules, tries to recover it in a sandbox, verifies what happened, and writes
everything down so you can audit every single decision.

> **Heads up:** everything here is a synthetic simulation. No real money moves, no real
> Razorpay account is touched. It's a faithful replica built for demonstration.

---

## The problem, in one paragraph

Roughly 1–2% of online payments fail. Merchants mostly respond by blindly retrying — same
payment, same delay, no thinking. That wastes retries on hopeless cases, spams customers who
just don't have the money today, and leaves perfectly recoverable payments dead in the water.
The fix isn't "retry harder". It's **look before you act** — and that's a job for an agent.

## What the agent actually does

Follow one failed payment through the system:

```
1. A payment fails            →  ₹5,000 UPI payment, bank timed out
2. The agent reads the scene  →  customer has a good track record, only 1 attempt so far
3. It makes a call            →  "68% likely to recover — retry now"
4. Safety checks run          →  retry limits? amount caps? merchant rules? all pass
5. It acts (in a simulator)   →  retry executes... payment succeeds
6. It verifies                →  money recovered, outcome recorded
7. It writes everything down  →  full audit trail, forever
```

If any safety check fails, nothing executes. If the case is too risky or too ambiguous,
it doesn't guess — it routes to a human.

## Does it work?

We replayed the **same 10,000 failed payments** two ways:

| | Old way (blind retry) | RecoveryOS |
| --- | --- | --- |
| Recovery rate | 35.7% | **41.9%** |
| Revenue recovered | ₹1.91 Cr | **₹2.20 Cr (+15%)** |
| Retry attempts | 10,000 | **3,074 (−69%)** |
| Wasted retries | 53% | **33%** |

Translation: **it earns more money by bothering customers less.**

*(Synthetic data, deterministic seed — reproducible via `npm run benchmark`.)*

## Run it yourself

You need Node 20+ and MongoDB running locally.

```bash
npm install                          # install everything

cp server/.env.example server/.env   # add GEMINI_API_KEY if you have one (optional)
npm run seed                         # creates 12k transactions + real agent runs + benchmark

npm run dev:server                   # API on http://localhost:5050
npm run dev:client                   # UI on http://localhost:5173
```

Open **http://localhost:5173**, go to the **Playground** page, break a fake payment,
and watch the agent think.

> No Gemini key? Everything still works — the system falls back to its deterministic
> decision core. The key just upgrades the brain from "rules" to "LLM".

## The UI is written for humans

Every page answers one question in plain English:

| Page | The question it answers |
| --- | --- |
| **Overview** | How much money is stuck, and what has the agent been doing about it? |
| **Failed payments** | What failed, why, and where does each case stand? |
| **Transaction detail** | The whole story of one payment — evidence, verdict, safety checks, outcome. |
| **What the agent did** | Every workflow run, live, with its reasoning exposed. |
| **Does it work?** | Head-to-head: old way vs RecoveryOS on identical data. |
| **Paper trail** | Every decision ever made, permanently recorded. |
| **Playground** | Break a fake payment yourself and watch recovery happen live. |

## The one rule that matters

> **The LLM recommends. Deterministic code authorizes.**

The model's output is parsed against a strict schema; anything malformed or missing falls back
to a deterministic recommender. The guardrail engine — retry budgets, amount thresholds,
idempotency, duplicate detection, confidence floors, high-value human approval — is ordinary
TypeScript the model can never touch. An LLM can suggest; it can never spend.

```text
Payment event
     ↓
LangGraph workflow
  load → diagnose → gather evidence → estimate recoverability
    → recommend ──→ GUARDRAILS ── BLOCK / needs-human → audit → end
                        │ ALLOW
                        ↓
              execute (simulator) → verify outcome → audit → end
```

Swap the LLM without touching anything else: `LLM_PROVIDER` accepts `gemini`, `ollama`,
or `rules`.

## Five-minute demo script

| Time | Show this |
| --- | --- |
| 0:00–0:30 | Overview — the headline sentence says it all |
| 0:30–1:30 | Playground: create a ₹5,000 failed UPI payment |
| 1:30–2:30 | Watch the timeline: diagnosis → odds → decision → safety checks → recovered |
| 2:30–3:15 | Do it again with an ambiguous failure — watch it refuse to act alone |
| 3:15–4:15 | Does it work? — +15% revenue, −69% retries on identical data |
| 4:15–5:00 | Paper trail + the architecture slide |

## Under the hood

| Layer | Tech |
| --- | --- |
| Frontend | React, Vite, TypeScript, Tailwind CSS, Recharts, Framer Motion |
| Backend | Node.js, Express, TypeScript |
| Agent | LangGraph state machine, Zod-validated structured outputs |
| Brain | Gemini (hosted) or Ollama (local) behind a provider adapter |
| Memory | MongoDB |
| Deploy targets | Vercel · Render · Atlas |

```bash
npm run seed        # regenerate the dataset, process 400 real runs, compute benchmark
npm run benchmark   # baseline-vs-agent evaluation, standalone
npm run test:server # 22 tests: guardrails, idempotency, schemas, simulator
npm run typecheck   # strict TypeScript across both workspaces
```

### How the benchmark is fair

- **Old way**: blindly retry every failed payment once after a fixed delay.
- **RecoveryOS**: read the situation, then climb a bounded ladder — primary action → nudge →
  self-serve link — and never touch hopeless cases.
- Each transaction carries hidden ground truth (its true recovery probability) that no
  decision logic can see. Afterward, we count how many retries were spent on payments that
  could never recover. Same seed every time, so anyone can reproduce the numbers.

---

Built for the Razorpay AI Buildathon. Synthetic data, simulated execution, real engineering.
