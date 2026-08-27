# RecoveryOS

**When an online payment fails, the money you earned doesn't disappear — it gets stuck.
RecoveryOS is an AI agent whose only job is to get that money back.**

---

## Never heard of this problem? Start here.

When you pay for something online, the payment sometimes fails — your bank is slow, the
network drops, you don't have balance that second, or an OTP expires. It happens on
1–2% of all online payments.

Here's the thing most people don't realize: **that sale isn't dead.** The customer usually
*wants* to pay. The merchant just never tries again in the right way — so the money sits
there, lost.

Today, merchants handle failures in the dumbest possible way: **retry every failure
automatically, exactly the same way, no matter what.** That means:

- Retrying people who will *never* be able to pay (wasted effort, annoyed customers)
- Giving up on people where one polite nudge would have worked
- No idea *why* each payment failed, because nobody looked

RecoveryOS replaces blind retrying with **an agent that looks before it acts.**

## What it does, step by step

Follow one failed ₹5,000 payment through the system:

| Step | What happens | In plain words |
| --- | --- | --- |
| 1 | A payment fails | Bank timed out. ₹5,000 is now stuck. |
| 2 | The agent investigates | Reads the payment details and the customer's history: "This person pays reliably. This is their first failure." |
| 3 | It estimates the odds | "About 68% chance we get this money back if we try again now." |
| 4 | It proposes an action | "Retry the charge right away." |
| 5 | Safety rules review it | Are we over the retry limit? Is the amount too big to automate? Does the merchant allow this action? |
| 6 | It acts — safely | Rules passed, so the action runs in a **simulator** (no real money). Payment succeeds. |
| 7 | It proves everything | Every thought, check and result is written to an audit log you can read forever. |

And when the situation looks risky or confusing, the agent does something rare for software:
**it refuses to act alone** and hands the case to a human instead.

## Proof: same data, two brains

We replayed the identical set of **10,000 failed payments** through both strategies:

| What we measured | Old way (retry everything) | RecoveryOS |
| --- | --- | --- |
| Share of stuck money recovered | 35.7% | **41.9%** |
| Total revenue recovered | ₹1.91 Cr | **₹2.20 Cr** (+15%) |
| Retry attempts made | 10,000 | **3,074** (−69%) |
| Retries wasted on hopeless cases | 53% | **33%** |

Read that last column again: **it recovers more money while contacting customers 69% less.**
That's the whole point — smarter targeting beats brute force.

*(Synthetic data with a fixed random seed, so anyone can reproduce these exact numbers. See
"How the comparison is fair" below.)*

## Try it in 60 seconds

You need [Node.js 20+](https://nodejs.org) and [MongoDB](https://www.mongodb.com/try/download/community) running on your machine.

```bash
npm install                          # download dependencies

cp server/.env.example server/.env   # create config (works as-is; Gemini key optional)
npm run seed                         # builds 12,000 realistic sample payments + results

npm run dev:server                   # start API   → http://localhost:5050
npm run dev:client                   # start UI    → http://localhost:5173
```

Then open **http://localhost:5173** and do this:

1. Click **Playground** in the left sidebar.
2. Leave everything at the defaults and press **"Break it and watch"**.
3. A fake payment fails. On the right, watch the agent's actual decision appear line by
   line: what it diagnosed, the odds it calculated, the action it chose, the safety checks
   that ran, and whether the money came back.
4. Now change **"Why did it fail?"** to *"Unknown / mysterious decline"* and run it again.
   Watch it **refuse to act alone** and route the case to a human — that's the safety
   design working.
5. Click **Does it work?** to see the old-way-vs-agent scoreboard explained in plain English.

> No AI API key? Everything still runs — the agent just uses its built-in rule-based brain
> instead of Google's Gemini. The app never depends on an external service to stay safe.

## What's on each page

Every screen answers exactly one question, in plain language:

- **Overview** — How much money is stuck right now, and what has the agent done lately?
- **Failed payments** — A searchable list: what failed, why, and where each case stands.
- **Transaction detail** — The complete story of one payment: evidence → verdict → safety
  checks → outcome, written so a non-engineer can follow it.
- **What the agent did** — Every automated decision it ever made, with its reasoning shown.
- **Does it work?** — The head-to-head benchmark against the naive strategy.
- **Paper trail** — The permanent audit log. If anyone ever asks "why did it do that?",
  the answer is here.
- **Playground** — Break payments on purpose and watch recovery happen live.

## Optional: real Razorpay integration (test mode)

Want the execution step to hit Razorpay's **actual API** instead of the local simulator?
Test mode gives you a real hosted checkout and real webhooks with **zero real money**:

1. Sign up free at [razorpay.com](https://razorpay.com) → Dashboard → Settings → API Keys →
   generate **Test keys**.
2. In `server/.env` set:
   ```env
   EXECUTION_PROVIDER=razorpay_test
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxx
   ```
3. Add a webhook (Dashboard → Settings → Webhooks) pointing to
   `https://your-public-url/api/webhooks/razorpay` with the *Payment link paid* event, and
   paste its secret into `RAZORPAY_WEBHOOK_SECRET`.
4. Restart, break a payment on the Playground page, open the real Razorpay link it creates,
   pay with Razorpay's test instruments (`4111 1111 1111 1111` / `success@razorpay`) — the
   signed webhook flips the transaction to recovered automatically.

Safety properties: webhook payloads are verified with HMAC-SHA256 signatures (forged or
unsigned requests are rejected), only actions the guardrails already approved can be
confirmed, and if Razorpay is unreachable the workflow degrades to the simulator instead of
failing.

## The design rule that makes it trustworthy

> **The AI recommends. Ordinary code decides.**

This app uses a large language model (Gemini), but the model is never trusted with anything
dangerous:

- Its suggestion must match a strict format or it's thrown away and replaced by a simple,
  predictable rules engine.
- Hard limits — max retries, amount ceilings, no duplicate charges, mandatory human approval
  above a value threshold — live in plain TypeScript that the model cannot influence.
- Nothing executes unless every check passes, and nothing happens without an audit record.

An LLM can *suggest*. It can never *spend*.

```text
A payment fails
     ↓
LangGraph workflow (a fixed pipeline the AI works inside)
  load case → diagnose cause → gather evidence → estimate odds
    → recommend action ──→ SAFETY CHECKS ── fail / risky → record & stop (or ask a human)
                                │ pass
                                ↓
                  execute in simulator → verify result → write audit trail
```

The AI brain is swappable via one environment variable (`gemini`, `ollama`, or `rules`) —
the rest of the system never changes.

## How the comparison is fair

- **Old way**: blindly retry every failed payment once after a fixed delay. This mirrors
  what most real-world recovery systems do.
- **RecoveryOS**: reads the situation first, then escalates gently — smart primary action,
  then a reminder nudge, then a self-serve payment link — and never wastes actions on
  hopeless cases.
- Every synthetic transaction secretly carries its true recovery probability (hidden ground
  truth) that **no decision logic is allowed to see**. Afterward, we count how many retries
  were spent on payments that could never recover anyway. Fixed random seed → identical,
  reproducible numbers every run.

## Built with

| Layer | Technology |
| --- | --- |
| Interface | React, TypeScript, Tailwind CSS, Recharts |
| Server | Node.js, Express, TypeScript |
| Agent pipeline | LangGraph with schema-validated outputs |
| AI brain | Google Gemini (free tier) or Ollama, behind a swappable adapter |
| Database | MongoDB |
| Testing | 22 backend tests covering safety rules, duplicate protection and the simulator |

```bash
npm run test:server    # run the test suite
npm run benchmark      # recompute the old-way-vs-agent numbers
npm run typecheck      # strict types across frontend + backend
```

---

*Built for the Razorpay AI Buildathon. All data is synthetic, all money is simulated,
and no real payment system is connected. The engineering is real.*
