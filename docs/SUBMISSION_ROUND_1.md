# Sentinel — Enterprise Governance Infrastructure for Autonomous Financial AI Agents

## Submission Description — Round 1

---

## The Problem We Are Solving

Financial institutions are entering an era where autonomous AI agents execute critical operations — processing payments, resolving disputes, adjusting credit limits, managing treasury, and servicing millions of customers — faster than any human team can supervise.

But speed without governance is catastrophic. A single misaligned agent can execute thousands of unauthorized transactions within seconds. Prompt injection attacks can corrupt reasoning mid-flight. Cascading multi-agent failures can amplify small errors into systemic failures. And static permission models — designed for human users — were simply never built to handle an agent that makes ten thousand decisions per minute.

**The governance gap between autonomous AI agents and the financial systems they control is the defining enterprise risk of this decade. Sentinel closes it.**

---

## What We Built — Not Just Proposed

> **Sentinel is a fully working, production-ready Zero Trust Governance Control Plane**, built and demonstrated live during this hackathon. Every capability described below has been implemented, tested, and is running right now.

We did not write a whitepaper. We built the system.

---

## How Sentinel Works

Every autonomous agent action is **intercepted before execution** and evaluated through seven independent governance layers in sequence. Only actions that pass all seven are permitted to reach the financial system. Everything else is blocked, escalated, or compensated.

```
Agent → [Prompt Safety] → [RAG Firewall] → [Risk Scoring] → [Policy Engine]
     → [Financial Guardrails] → [Idempotency Check] → [2PC Commit] → Financial System
                                           ↓
                              Immutable Audit Ledger → Splunk SIEM
```

---

## Seven Governance Modules — All Implemented

### Module 1 — AI Safety Layer (Prompt Injection + Context Poisoning)
Every incoming agent instruction is scanned by a multi-signal injection detector using regex fingerprinting, semantic anomaly detection, and LlamaGuard classification. A parallel RAG Memory Firewall verifies retrieved context documents against a cryptographic hash registry, blocking poisoned knowledge bases before they corrupt agent reasoning. Neither prompt injection nor context poisoning can reach the execution layer.

### Module 2 — Policy as Code Engine (OPA + Rego)
Per-agent, per-action permissions are evaluated using Open Policy Agent running embedded Rego policies. This is not a simple allow/deny flag — it is deterministic, auditable policy logic that evaluates the agent identity, action type, financial parameters, customer history, and time context together. Policy changes are versioned and take effect instantly across the entire fleet without a deployment.

### Module 3 — Dynamic Risk Intelligence
Every action is scored 0–100 using a multi-factor risk model: transaction amount, account history, velocity patterns, call graph depth, and behavioural anomalies. The score drives the decision in real time — low risk actions pass instantly, medium risk actions trigger human escalation, and high risk actions are blocked outright. No action is evaluated by a static rule alone.

### Module 4 — Financial Guardrails (Velocity + Rate Limits + Idempotency)
A dedicated guardrails engine enforces adaptive spending windows, transaction velocity controls, and concurrent execution limits per agent. A distributed idempotency engine backed by Redis prevents duplicate execution attacks — an increasingly critical vector where an attacker replays a legitimate request hundreds of times within the allowed time window.

### Module 5 — Human-in-the-Loop Escalation (HITL)
Actions above the risk threshold are held in a real-time escalation queue and presented to a human operator on the Sentinel dashboard before execution. Operators can approve or reject with full context — the agent's reasoning trace, the policy decision, the risk score, and the proposed parameters. No high-risk action executes without explicit human sign-off.

### Module 6 — Two-Phase Commit + SAGA Compensation
Multi-agent financial workflows use a two-phase commit protocol to guarantee atomicity across distributed operations. If any participant fails mid-transaction, the SAGA compensator automatically triggers rollback actions across all affected agents and ledgers. No partial financial state is ever committed.

### Module 7 — Immutable Audit Ledger + SIEM Integration
Every governance decision — allow, deny, escalate, compensate — is written to a tamper-proof, append-only audit ledger using SHA-256 forward-chaining. Each entry includes the entry hash and the previous entry's hash, making retrospective tampering cryptographically detectable. All events stream in real-time to Splunk via HTTP Event Collector (HEC) for enterprise SIEM integration, enabling SPL queries, automated alerting, and regulatory reporting directly within existing security infrastructure.

---

## Emergency Fleet Control

A fleet-wide kill switch allows an operator to quarantine individual agents, isolate specific agent classes, or halt the entire fleet in under one second. Quarantine triggers automatic SAGA compensation for any in-flight operations, ensuring no financial state is left partially committed. Time-to-revoke a compromised agent: **<1 second**.

---

## What Makes This Genuinely Innovative

| Capability | Industry Standard | Sentinel |
|---|---|---|
| Policy enforcement | Static RBAC rules | Deterministic, per-action OPA policy with real-time evaluation |
| Audit trail | Database logs | Cryptographically chained, tamper-proof immutable ledger |
| Duplicate prevention | Application-level checks | Distributed idempotency engine with TTL-based deduplication |
| Multi-agent safety | None | 2PC atomicity + SAGA compensation across agent graphs |
| Incident response | Manual investigation | <1s kill switch with automatic compensation |
| SIEM integration | Log forwarding | Structured HEC events with full financial context, queryable in SPL |
| Risk evaluation | Fixed thresholds | Context-aware, dynamic risk scoring per action per agent |

---

## The Live System — Right Now

The Sentinel platform is running as a fully integrated system with:

- **Sentinel Safety Service** — FastAPI backend on port 8001, handling all seven governance modules
- **Mock Banking API** — Realistic financial system simulation with multi-account data and transaction history
- **Sentinel Admin Dashboard** — React + TypeScript premium glassmorphism UI with live traffic monitoring, HITL queue, agent fleet control, policy editor, audit ledger, and compliance report generation
- **Customer Portal** — Role-based user portal for demo accounts (Adhi Kumar, Tara Williams) showing real account data with an embedded AI assistant governed by Sentinel in real time
- **Splunk SIEM Panel** — Configurable HEC endpoint with token management, live event format preview, and test connection validation

Every interaction in the customer portal — including natural language requests for fee waivers, balance queries, and dispute resolutions — flows through all seven governance layers in real time before any financial action is taken. The demo can be run live, end-to-end, during the presentation.

---

## Technical Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                     Sentinel Admin Dashboard                         │
│           React + TypeScript + TanStack Router + Vite               │
│    Live Traffic │ HITL Queue │ Fleet Control │ Audit │ Settings      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│              Sentinel Safety Service — FastAPI (Port 8001)           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │  Prompt  │ │   RAG    │ │   OPA    │ │   Risk   │ │  HITL    │ │
│  │  Safety  │ │Firewall  │ │ Policy   │ │  Scorer  │ │  Queue   │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────────────────────┐ │
│  │  2PC +   │ │  Fleet   │ │      Immutable Audit Ledger           │ │
│  │  SAGA    │ │Kill Sw.  │ │   SHA-256 Forward-Chained Events      │ │
│  └──────────┘ └──────────┘ └──────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
   ┌──────────▼────┐  ┌──────▼──────┐  ┌───▼──────────┐
   │  Banking API  │  │    Redis    │  │  Splunk HEC  │
   │  (Port 8000)  │  │  (Cache +   │  │  (SIEM Log   │
   │  FastAPI/Py   │  │  Idempotency│  │  Forwarder)  │
   └───────────────┘  └─────────────┘  └──────────────┘
```

**Stack:** React, TypeScript, FastAPI, LangGraph, LangChain, OPA (Rego), Redis, Prometheus, Docker, Splunk HEC

---

## Business Impact

| Metric | Sentinel Target | Industry Baseline |
|---|---|---|
| Policy Enforcement Accuracy | >99.9% | Not measured (static rules) |
| Governance Decision Latency | <15ms per action | N/A (no dedicated governance layer) |
| Time to Revoke Compromised Agent | <1 second | Hours (manual intervention) |
| Audit Trace Completeness | 100% cryptographically verified | 60–80% (gaps in log correlation) |
| Unauthorized Transaction Prevention | Real-time, pre-execution | Post-facto detection only |
| Regulatory Reporting | Automated (Splunk + PDF export) | Manual compilation |

Financial institutions that deploy Sentinel can move from *hoping their AI agents behave correctly* to *proving it in real time, to regulators, to auditors, and to themselves*.

---

*Sentinel — GitHub: https://github.com/Adhi0303/Sentinal-*
