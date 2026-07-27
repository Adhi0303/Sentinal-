/**
 * Sentinel Gateway — Real Backend Data Layer
 *
 * Connects to Safety Service (port 8001) and Banking API (port 8000).
 * All response shapes are mapped from the actual backend API.
 * Falls back to local simulation if the backend is unreachable.
 */

// ─── Decision types ────────────────────────────────────────────────────────

export type Decision =
  | "ALLOWED"
  | "DENIED"
  | "REQUIRE_HITL"
  | "BLOCKED_KILLSWITCH"
  | "DUPLICATE_REJECTED"
  | "APPROVED_BY_HUMAN"
  | "REJECTED_BY_HUMAN"
  | "AGENT_RELEASED"
  | "AGENT_QUARANTINED"
  | "FLEET_QUARANTINED"
  | "ERROR"
  | "2PC_COMMITTED"
  | "2PC_ABORTED";

// ─── Frontend-normalised AuditEntry ────────────────────────────────────────
// Backend returns: entry_id, timestamp, agent_id, action_type, decision,
//   reason, parameters{from_account,to_account,amount,account_id,...},
//   risk_score, prev_hash, entry_hash
// We flatten parameters for convenience.

export interface AuditEntry {
  entry_id: number;
  timestamp: string;
  agent_id: string;
  action_type: string;
  decision: Decision;
  reason: string;
  risk_score: number | null;
  // Flattened from parameters
  amount: number | null;
  account_id: string;
  gate_failed: string | null;
  // Hashes — backend calls it entry_hash; we expose as hash
  hash: string;
  prev_hash: string;
  parameters: Record<string, unknown>;
  policy_rule?: string;
}

// ─── Agent fleet ────────────────────────────────────────────────────────────
// Backend fleet: { agent_id: { state: "ACTIVE"|"QUARANTINED", kill_time } }
// We map to a flat array for the UI.

export interface AgentStatus {
  agent_id: string;
  name: string;
  status: "ACTIVE" | "QUARANTINED" | "OFFLINE";
  requests_today: number;
  blocked: number;
  avg_risk: number;
  last_active: string;
}

// Map backend agent_id to a human-readable name
const AGENT_NAMES: Record<string, string> = {
  agent_cust_srv_01:     "Customer Service Agent",
  agent_trading_01:      "Treasury & Trading Agent",
  agent_fraud_monitor_01:"Fraud Monitor Agent",
  agent_credit_ops_01:   "Credit Operations Agent",
  agent_treasury_001:    "Treasury Agent",
  agent_procurement_001: "Procurement Agent",
  agent_underwriting_001:"Underwriting Agent",
};

// ─── API configuration ──────────────────────────────────────────────────────

export const API_BASE_KEY = "sentinel.apiBase";
export const DEFAULT_API_BASE = "http://localhost:8001";
export const DEFAULT_BANKING_API_BASE = "http://localhost:8000";

export function getApiBase(): string {
  if (typeof window === "undefined") return DEFAULT_API_BASE;
  return window.localStorage.getItem(API_BASE_KEY) ?? DEFAULT_API_BASE;
}

export function setApiBase(base: string) {
  if (typeof window !== "undefined")
    window.localStorage.setItem(API_BASE_KEY, base);
}

/** Returns the URL base for the Mock Banking API (port 8000). */
export function getBankingApiBase(): string {
  // Safety API lives on 8001, Banking API on 8000
  return getApiBase().replace(":8001", ":8000");
}

// Generic fetch helper — returns null on any failure (timeout, non-200, etc.)
async function tryApi<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (typeof window === "undefined") return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${getApiBase()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ─── Response-shape adapters ────────────────────────────────────────────────

/** Normalise a raw backend entry into our flat AuditEntry shape. */
function normaliseEntry(raw: Record<string, unknown>): AuditEntry {
  const params = (raw.parameters ?? {}) as Record<string, unknown>;

  // amount: prefer top-level, then parameters.amount
  const amount =
    typeof raw.amount === "number"
      ? raw.amount
      : typeof params.amount === "number"
        ? params.amount
        : null;

  // account_id: prefer parameters.account_id, then parameters.from_account
  const account_id =
    (params.account_id as string) ||
    (params.from_account as string) ||
    "—";

  // gate_failed: derive from decision when backend doesn't supply it directly
  let gate_failed: string | null = (raw.gate_failed as string) ?? null;
  if (!gate_failed) {
    const dec = raw.decision as string;
    if (dec === "BLOCKED_KILLSWITCH") gate_failed = "Gate 0 — Quarantine";
    else if (dec === "DUPLICATE_REJECTED") gate_failed = "Gate 0.5 — Idempotency";
  }

  // hash: backend field is entry_hash; fallback to hash (dashboard summary uses short hash)
  const hash =
    (raw.entry_hash as string) ||
    (raw.hash as string) ||
    "0".repeat(64);

  return {
    entry_id:    raw.entry_id as number,
    timestamp:   raw.timestamp as string,
    agent_id:    raw.agent_id as string,
    action_type: raw.action_type as string,
    decision:    raw.decision as Decision,
    reason:      (raw.reason as string) ?? "",
    risk_score:  typeof raw.risk_score === "number" ? raw.risk_score : null,
    amount,
    account_id,
    gate_failed,
    hash,
    prev_hash: (raw.prev_hash as string) ?? "0".repeat(64),
    parameters: params,
    policy_rule: (raw.policy_rule as string) ?? undefined,
  };
}

/**
 * Map the backend fleet dict to a flat array of AgentStatus.
 * We compute requests_today / blocked / avg_risk from the audit entries
 * if available; otherwise use sensible defaults.
 */
function normaliseFleet(
  raw: Record<string, unknown>,
  entries: AuditEntry[] = [],
): AgentStatus[] {
  const fleet = (raw.fleet ?? raw) as Record<
    string,
    { state: string; kill_time: string | null }
  >;

  return Object.entries(fleet).map(([agent_id, info]) => {
    const agentEntries = entries.filter((e) => e.agent_id === agent_id);
    const blocked = agentEntries.filter(
      (e) =>
        e.decision === "DENIED" ||
        e.decision === "BLOCKED_KILLSWITCH" ||
        e.decision === "DUPLICATE_REJECTED",
    ).length;
    const scores = agentEntries
      .map((e) => e.risk_score)
      .filter((s): s is number => s !== null);
    const avg_risk =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
    const last = agentEntries.at(-1);

    return {
      agent_id,
      name: AGENT_NAMES[agent_id] ?? agent_id,
      status:
        info.state === "QUARANTINED"
          ? "QUARANTINED"
          : info.state === "ACTIVE"
            ? "ACTIVE"
            : "OFFLINE",
      requests_today: agentEntries.length,
      blocked,
      avg_risk,
      last_active: last?.timestamp ?? new Date().toISOString(),
    };
  });
}

// ─── Local simulation fallback ──────────────────────────────────────────────

const SIM_AGENT_IDS = [
  "agent_cust_srv_01",
  "agent_trading_01",
  "agent_fraud_monitor_01",
  "agent_credit_ops_01",
];

const SCENARIOS: Array<Partial<AuditEntry> & { decision: Decision }> = [
  { decision: "ALLOWED",            amount: 10,      risk_score: 12, reason: "Auto-approved by policy (Low risk, Amount ≤ $50)", policy_rule: "Rule 5 — Auto-Approve" },
  { decision: "ALLOWED",            amount: 25,      risk_score: 18, reason: "Auto-approved by policy (Low risk, Amount ≤ $50)", policy_rule: "Rule 5 — Auto-Approve" },
  { decision: "DENIED",             amount: 999999,  risk_score: null, gate_failed: "Gate 2 — Schema Check", reason: "SQL Injection detected in account_id parameter" },
  { decision: "REQUIRE_HITL",       amount: 75,      risk_score: 62, reason: "Amount exceeds auto-approve limit — Manager approval required", policy_rule: "Rule 4 — Amount Gate → HITL" },
  { decision: "DENIED",             amount: 1200,    risk_score: 88, reason: "Amount exceeds maximum hard limit of $500" },
  { decision: "REQUIRE_HITL",       amount: 50,      risk_score: 82, reason: "Risk Score 82/100 (CRITICAL) — manager approval required" },
  { decision: "DUPLICATE_REJECTED", amount: 10,      risk_score: 12, gate_failed: "Gate 0.5 — Idempotency", reason: "Duplicate request — cached result returned from Redis" },
  { decision: "BLOCKED_KILLSWITCH", amount: 40,      risk_score: null, gate_failed: "Gate 0 — Quarantine", reason: "Agent is quarantined by kill-switch" },
  { decision: "DENIED",             amount: 90,      risk_score: 30, reason: "Missing business justification" },
];

const ACCOUNTS = ["acc_123", "acc_456", "acc_781", "corp_treasury_001", "corp_vendor_aws"];
const ACTIONS  = ["FEE_WAIVER", "FEE_WAIVER", "WIRE_TRANSFER", "CREDIT_LIMIT_INCREASE", "WIRE_TRANSFER"];

function simHash(seed: number): string {
  let h = 0x811c9dc5 ^ seed;
  let out = "";
  for (let i = 0; i < 8; i++) {
    h = (h * 16777619) ^ (seed + i * 2654435761);
    out += (h >>> 0).toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}

function makeEntry(id: number, at: number): AuditEntry {
  const s = SCENARIOS[id % SCENARIOS.length];
  const agent = SIM_AGENT_IDS[id % SIM_AGENT_IDS.length];
  return {
    entry_id:    id,
    timestamp:   new Date(at).toISOString(),
    agent_id:    agent,
    action_type: ACTIONS[id % ACTIONS.length],
    decision:    s.decision,
    reason:      s.reason ?? "",
    risk_score:  s.risk_score ?? null,
    amount:      s.amount ?? 0,
    account_id:  ACCOUNTS[id % ACCOUNTS.length],
    gate_failed: s.gate_failed ?? null,
    hash:        simHash(id * 7919),
    prev_hash:   id > 1 ? simHash((id - 1) * 7919) : "0".repeat(64),
    parameters:  { account_id: ACCOUNTS[id % ACCOUNTS.length], amount: s.amount ?? 0 },
    policy_rule: s.policy_rule,
  };
}

const SEED_COUNT = 20;
const startedAt  = Date.now();

const simState = {
  entries: Array.from({ length: SEED_COUNT }, (_, i) =>
    makeEntry(i + 1, startedAt - (SEED_COUNT - i) * 47_000),
  ),
  agents: SIM_AGENT_IDS.map((id, i) => ({
    agent_id:       id,
    name:           AGENT_NAMES[id] ?? id,
    status:         "ACTIVE" as const,
    requests_today: 10 + i * 5,
    blocked:        i + 1,
    avg_risk:       20 + i * 8,
    last_active:    new Date().toISOString(),
  })),
  chainTampered: false,
  lastGrow:      Date.now(),
};

function grow() {
  const now = Date.now();
  if (now - simState.lastGrow < 4000) return;
  simState.lastGrow = now;
  const nextId = simState.entries.length + 1;
  simState.entries.push(makeEntry(nextId, now));
  const agent = simState.agents.find(
    (a) => a.agent_id === SIM_AGENT_IDS[nextId % SIM_AGENT_IDS.length],
  );
  if (agent && agent.status === "ACTIVE") {
    agent.requests_today += 1;
    agent.last_active = new Date(now).toISOString();
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Fetch recent audit entries (real backend first, then simulation). */
export async function fetchRecent(limit = 20): Promise<AuditEntry[]> {
  const live = await tryApi<{ entries: Record<string, unknown>[]; count: number }>(
    `/api/v1/audit/recent?limit=${limit}`,
  );
  if (live?.entries) {
    return live.entries.map(normaliseEntry);
  }
  grow();
  return [...simState.entries].reverse().slice(0, limit);
}

// ─── Chain verification ─────────────────────────────────────────────────────

export interface ChainVerification {
  intact: boolean;
  total_entries: number;
  break_at: number | null;
  verified_at: string;
}

export async function verifyChain(): Promise<ChainVerification> {
  // Backend: { status, total_entries, message, chain_tip_hash }
  const live = await tryApi<{
    status: string;
    total_entries: number;
    message: string;
    chain_tip_hash?: string;
  }>(`/api/v1/audit/verify`);
  if (live) {
    return {
      intact:        live.status === "INTACT",
      total_entries: live.total_entries,
      break_at:      live.status !== "INTACT" ? 1 : null,
      verified_at:   new Date().toISOString(),
    };
  }
  return {
    intact:        !simState.chainTampered,
    total_entries: simState.entries.length,
    break_at:      simState.chainTampered ? 5 : null,
    verified_at:   new Date().toISOString(),
  };
}

// ─── Compliance report ──────────────────────────────────────────────────────

export interface ComplianceReport {
  report_id: string;
  generated_at: string;
  totals: Record<string, number>;
  total_decisions: number;
  spend_evaluated: number;
  chain_intact: boolean;
  log: AuditEntry[];
}

export async function fetchReport(): Promise<ComplianceReport> {
  // Backend: { report_id, generated_at, regulatory_standard, audit_chain_status,
  //            chain_tip_hash, summary{total_decisions,allowed,denied,...,total_spend_evaluated},
  //            decisions[{...entry-like objects}] }
  const live = await tryApi<{
    report_id: string;
    generated_at: string;
    audit_chain_status: string;
    summary: Record<string, number>;
    decisions: Record<string, unknown>[];
  }>(`/api/v1/audit/report`);

  if (live) {
    const s = live.summary;
    const totals: Record<string, number> = {
      ALLOWED:            s.allowed ?? 0,
      DENIED:             s.denied ?? 0,
      REQUIRE_HITL:       s.hitl_escalations ?? 0,
      BLOCKED_KILLSWITCH: s.blocked_by_killswitch ?? 0,
      DUPLICATE_REJECTED: s.duplicate_rejections ?? 0,
    };
    return {
      report_id:        live.report_id,
      generated_at:     live.generated_at,
      totals,
      total_decisions:  s.total_decisions ?? 0,
      spend_evaluated:  s.total_spend_evaluated ?? 0,
      chain_intact:     live.audit_chain_status === "INTACT",
      log:              (live.decisions ?? []).map(normaliseEntry),
    };
  }

  grow();
  const entries = simState.entries;
  const totals: Record<string, number> = {};
  for (const e of entries) totals[e.decision] = (totals[e.decision] ?? 0) + 1;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    report_id:       `RPT-${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`,
    generated_at:    d.toISOString(),
    totals,
    total_decisions: entries.length,
    spend_evaluated: entries.reduce((s, e) => s + (e.amount ?? 0), 0),
    chain_intact:    !simState.chainTampered,
    log:             [...entries].reverse(),
  };
}

// ─── Fleet ──────────────────────────────────────────────────────────────────

/** Fetch fleet status — maps backend dict format to flat array. */
export async function fetchFleet(): Promise<AgentStatus[]> {
  // First get entries to compute per-agent stats
  const entries = await fetchRecent(200);

  // Backend: { fleet: {agent_id: {state, kill_time}}, total_agents, ... }
  const live = await tryApi<Record<string, unknown>>(`/api/v1/killswitch/status`);
  if (live && live.fleet) {
    return normaliseFleet(live, entries);
  }
  grow();
  return simState.agents.map((a) => ({ ...a }));
}

export async function isolateAgent(agentId: string): Promise<AgentStatus[]> {
  await tryApi(`/api/v1/killswitch/isolate`, {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId, triggered_by: "admin" }),
  });
  const a = simState.agents.find((x) => x.agent_id === agentId);
  if (a) (a as { status: AgentStatus["status"] }).status = "QUARANTINED";
  return fetchFleet();
}

export async function releaseAgent(agentId: string): Promise<AgentStatus[]> {
  await tryApi(`/api/v1/killswitch/release`, {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId, triggered_by: "admin" }),
  });
  const a = simState.agents.find((x) => x.agent_id === agentId);
  if (a) (a as { status: AgentStatus["status"] }).status = "ACTIVE";
  return fetchFleet();
}

export async function fleetKill(): Promise<AgentStatus[]> {
  await tryApi(`/api/v1/killswitch/fleet-kill`, {
    method: "POST",
    body: JSON.stringify({ triggered_by: "admin" }),
  });
  simState.agents.forEach((a) => {
    (a as { status: AgentStatus["status"] }).status = "QUARANTINED";
  });
  return fetchFleet();
}

// ─── Policy evaluation ──────────────────────────────────────────────────────

export interface PolicyResult {
  decision: Decision;
  rule: string;
  reason: string;
}

export async function evaluatePolicy(input: {
  action_type: string;
  amount: number;
  risk_score: number;
  reason: string;
}): Promise<PolicyResult> {
  // Backend: POST { action_type, parameters: { amount, risk_score, reason, ... } }
  // Returns: { decision, reason, rule? }
  const live = await tryApi<{ decision: string; reason: string; rule?: string }>(
    `/api/v1/policy/evaluate`,
    {
      method: "POST",
      body: JSON.stringify({
        action_type: input.action_type,
        parameters:  input,
        risk_score:  input.risk_score,
        risk_level:  input.risk_score >= 70 ? "CRITICAL" : input.risk_score >= 50 ? "HIGH" : "LOW",
        agent_id:    "hitl_console",
        trade_value: input.amount,
      }),
    },
  );

  if (live) {
    return {
      decision: live.decision as Decision,
      rule:     live.rule ?? "OPA Policy Engine",
      reason:   live.reason,
    };
  }

  // Simulation fallback
  if (input.risk_score >= 70)
    return { decision: "DENIED",       rule: "Rule 0 — Critical Risk Block", reason: "Risk Score Critical: Automatic hard block" };
  if (!input.reason.trim())
    return { decision: "DENIED",       rule: "Rule 1 — Missing Justification", reason: "Missing business justification" };
  if (input.amount > 500)
    return { decision: "DENIED",       rule: "Rule 2 — Hard Dollar Limit", reason: "Amount exceeds maximum hard limit of $500" };
  if (input.risk_score >= 50)
    return { decision: "REQUIRE_HITL", rule: "Rule 3 — High Risk → HITL", reason: "Manager approval required" };
  if (input.amount > 50)
    return { decision: "REQUIRE_HITL", rule: "Rule 4 — Amount Gate → HITL", reason: "Amount exceeds auto-approve limit" };
  return   { decision: "ALLOWED",      rule: "Rule 5 — Auto-Approve", reason: "Auto-approved by policy (Low risk)" };
}

// ─── HITL resolution (local only — backend has no dedicated HITL endpoint) ──

export function resolveHitl(entryId: number, approved: boolean, note: string) {
  const e = simState.entries.find((x) => x.entry_id === entryId);
  if (!e) return;
  e.decision = approved ? "APPROVED_BY_HUMAN" : "REJECTED_BY_HUMAN";
  e.reason   = approved
    ? `Approved by human reviewer. ${note}`.trim()
    : `Rejected by human: ${note}`;
}

// ─── Presentation helpers ────────────────────────────────────────────────────

export const DECISION_META: Record<string, { label: string; icon: string; token: string }> = {
  ALLOWED:            { label: "ALLOWED",    icon: "", token: "allow" },
  DENIED:             { label: "DENIED",     icon: "", token: "deny"  },
  REQUIRE_HITL:       { label: "HITL",       icon: "", token: "hitl"  },
  BLOCKED_KILLSWITCH: { label: "BLOCKED",    icon: "", token: "kill"  },
  DUPLICATE_REJECTED: { label: "DUPLICATE",  icon: "", token: "duplicate" },
  APPROVED_BY_HUMAN:  { label: "HUMAN OK",   icon: "", token: "allow" },
  REJECTED_BY_HUMAN:  { label: "HUMAN NO",   icon: "", token: "deny"  },
  AGENT_RELEASED:     { label: "RELEASED",   icon: "", token: "allow" },
  AGENT_QUARANTINED:  { label: "QUARANTINED",icon: "", token: "kill"  },
  FLEET_QUARANTINED:  { label: "FLEET KILL", icon: "", token: "kill"  },
  ERROR:              { label: "ERROR",      icon: "", token: "deny"  },
  "2PC_COMMITTED":    { label: "2PC OK",     icon: "", token: "allow" },
  "2PC_ABORTED":      { label: "2PC ABORT",  icon: "", token: "deny"  },
};

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  });
}

export function fmtMoney(n: number | null) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function shortHash(h: string, n = 8) {
  if (!h || h.length < n) return h ?? "—";
  return `${h.slice(0, n)}…`;
}

export function riskBand(score: number | null) {
  if (score === null) return { label: "N/A",      token: "info" };
  if (score >= 70)   return { label: "CRITICAL",  token: "deny" };
  if (score >= 50)   return { label: "HIGH",      token: "hitl" };
  if (score >= 25)   return { label: "MEDIUM",    token: "info" };
  return               { label: "LOW",       token: "allow" };
}
