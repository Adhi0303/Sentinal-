export interface PolicyRule {
  n: number;
  title: string;
  logic: string;
  reason: string;
  token: string;
  rego: string;
}

export interface PolicyVersion {
  version: number;
  ts: string;
  author: string;
  note: string;
  rules: PolicyRule[];
  /** rolled back FROM this version -> incident note */
  incident?: string;
}

export interface PolicyDoc {
  id: string;
  file: string;
  pkg: string;
  scope: string;
  activeVersion: number;
  versions: PolicyVersion[];
}

export const STORAGE_KEY = "sentinel.policies.v1";

export function activeRules(p: PolicyDoc): PolicyRule[] {
  return p.versions.find((v) => v.version === p.activeVersion)?.rules ?? [];
}

export function nextVersion(p: PolicyDoc) {
  return Math.max(...p.versions.map((v) => v.version)) + 1;
}

const now = () => new Date().toISOString();

export function makePolicy(input: {
  file: string;
  pkg: string;
  scope: string;
  rule: Omit<PolicyRule, "n">;
  note: string;
}): PolicyDoc {
  return {
    id: crypto.randomUUID(),
    file: input.file.endsWith(".rego") ? input.file : `${input.file}.rego`,
    pkg: input.pkg,
    scope: input.scope,
    activeVersion: 1,
    versions: [
      {
        version: 1,
        ts: now(),
        author: "you@amex.com",
        note: input.note || "Initial policy commit",
        rules: [{ n: 0, ...input.rule }],
      },
    ],
  };
}

/** Commit a new version (branch off the currently active version). */
export function commitVersion(
  p: PolicyDoc,
  rules: PolicyRule[],
  note: string,
): PolicyDoc {
  const version = nextVersion(p);
  return {
    ...p,
    activeVersion: version,
    versions: [
      ...p.versions,
      { version, ts: now(), author: "you@amex.com", note, rules },
    ],
  };
}

/** Roll production back to a previous version, flagging the bad one. */
export function rollbackTo(p: PolicyDoc, version: number, incident: string): PolicyDoc {
  return {
    ...p,
    activeVersion: version,
    versions: p.versions.map((v) =>
      v.version === p.activeVersion ? { ...v, incident: incident || "Rolled back after failure in production" } : v,
    ),
  };
}

export const SEED_POLICIES: PolicyDoc[] = [
  {
    id: "servicing_disputes",
    file: "servicing_disputes.rego",
    pkg: "sentinel.servicing_disputes",
    scope: "FEE_WAIVER actions",
    activeVersion: 2,
    versions: [
      {
        version: 1,
        ts: "2026-07-18T14:02:00.000Z",
        author: "risk-eng@amex.com",
        note: "Initial dispute waiver guardrails",
        rules: [
          {
            n: 0,
            title: "Hard Dollar Limit",
            logic: "DENY if amount > $500",
            reason: "Amount exceeds maximum hard limit of $500",
            token: "deny",
            rego: `deny[msg] {\n  input.parameters.amount > 500\n  msg := "Amount exceeds maximum hard limit of $500"\n}`,
          },
          {
            n: 1,
            title: "Auto-Approve",
            logic: "ALLOW if amount ≤ $50",
            reason: "Auto-approved by policy (Low value)",
            token: "allow",
            rego: `allow {\n  input.parameters.amount <= 50\n}`,
          },
        ],
      },
      {
        version: 2,
        ts: "2026-07-24T09:31:00.000Z",
        author: "risk-eng@amex.com",
        note: "Add risk-score gates + justification requirement",
        rules: [
          {
            n: 0,
            title: "Critical Risk Block",
            logic: "DENY if risk_score >= 70",
            reason: "Risk Score Critical: Automatic hard block",
            token: "deny",
            rego: `deny[msg] {\n  input.risk_score >= 70\n  msg := "Risk Score Critical: Automatic hard block"\n}`,
          },
          {
            n: 1,
            title: "Missing Justification",
            logic: "DENY if no reason provided",
            reason: "Missing business justification",
            token: "deny",
            rego: `deny[msg] {\n  not input.parameters.reason\n  msg := "Missing business justification"\n}`,
          },
          {
            n: 2,
            title: "Hard Dollar Limit",
            logic: "DENY if amount > $500",
            reason: "Amount exceeds maximum hard limit of $500",
            token: "deny",
            rego: `deny[msg] {\n  input.parameters.amount > 500\n  msg := "Amount exceeds maximum hard limit of $500"\n}`,
          },
          {
            n: 3,
            title: "High Risk → HITL",
            logic: "REQUIRE_HITL if risk_score 50–69",
            reason: "Manager approval required",
            token: "hitl",
            rego: `require_hitl[msg] {\n  input.risk_score >= 50\n  input.risk_score < 70\n  msg := "Manager approval required"\n}`,
          },
          {
            n: 4,
            title: "Amount Gate → HITL",
            logic: "REQUIRE_HITL if $50 < amount ≤ $500",
            reason: "Amount exceeds auto-approve limit",
            token: "hitl",
            rego: `require_hitl[msg] {\n  input.parameters.amount > 50\n  input.parameters.amount <= 500\n  msg := "Amount exceeds auto-approve limit"\n}`,
          },
          {
            n: 5,
            title: "Auto-Approve",
            logic: "ALLOW if risk_score < 50 AND amount ≤ $50",
            reason: "Auto-approved by policy (Low risk)",
            token: "allow",
            rego: `allow {\n  input.risk_score < 50\n  input.parameters.amount <= 50\n}`,
          },
        ],
      },
    ],
  },
  {
    id: "trading_limits",
    file: "trading_limits.rego",
    pkg: "sentinel.trading_limits",
    scope: "TRADE actions",
    activeVersion: 1,
    versions: [
      {
        version: 1,
        ts: "2026-07-20T11:10:00.000Z",
        author: "desk-risk@amex.com",
        note: "Desk mandate v1",
        rules: [
          {
            n: 0,
            title: "Notional Cap",
            logic: "DENY if notional > $250,000",
            reason: "Trade exceeds desk notional cap",
            token: "deny",
            rego: `deny[msg] {\n  input.parameters.notional > 250000\n  msg := "Trade exceeds desk notional cap"\n}`,
          },
          {
            n: 1,
            title: "Restricted Instrument",
            logic: "DENY if symbol in restricted_list",
            reason: "Instrument on restricted list",
            token: "deny",
            rego: `deny[msg] {\n  restricted[input.parameters.symbol]\n  msg := "Instrument on restricted list"\n}`,
          },
          {
            n: 2,
            title: "Off-Hours → HITL",
            logic: "REQUIRE_HITL outside 09:30–16:00 ET",
            reason: "Off-hours trade requires desk head sign-off",
            token: "hitl",
            rego: `require_hitl[msg] {\n  not market_open\n  msg := "Off-hours trade requires desk head sign-off"\n}`,
          },
          {
            n: 3,
            title: "Auto-Approve",
            logic: "ALLOW if notional ≤ $50,000 AND risk < 40",
            reason: "Within desk mandate",
            token: "allow",
            rego: `allow {\n  input.parameters.notional <= 50000\n  input.risk_score < 40\n}`,
          },
        ],
      },
    ],
  },
];

export function loadPolicies(): PolicyDoc[] {
  if (typeof window === "undefined") return SEED_POLICIES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_POLICIES;
    const parsed = JSON.parse(raw) as PolicyDoc[];
    return Array.isArray(parsed) && parsed.length ? parsed : SEED_POLICIES;
  } catch {
    return SEED_POLICIES;
  }
}

export function savePolicies(policies: PolicyDoc[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(policies));
  } catch {
    /* ignore */
  }
}
