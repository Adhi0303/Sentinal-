import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, FileCode2, GitBranch, History, Plus, RotateCcw } from "lucide-react";

import { SectionLabel, StatusPill } from "@/components/sentinel/primitives";
import { Modal, GhostBtn } from "@/components/sentinel/modal";
import { evaluatePolicy, DECISION_META, type PolicyResult } from "@/lib/sentinel";
import {
  activeRules,
  commitVersion,
  loadPolicies,
  makePolicy,
  rollbackTo,
  savePolicies,
  SEED_POLICIES,
  type PolicyDoc,
  type PolicyRule,
} from "@/lib/policy-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/policy")({
  head: () => ({
    meta: [
      { title: "Policy Engine — Active Rego Rules & Simulator" },
      {
        name: "description",
        content:
          "Inspect the active OPA Rego policies enforcing AI agent limits, add new policies, roll back bad versions and simulate decisions live.",
      },
      { property: "og:title", content: "Policy Engine — Sentinel Gateway" },
      {
        property: "og:description",
        content: "Version-controlled AI guardrails: commit, deploy and roll back Rego policies.",
      },
    ],
  }),
  component: PolicyPage,
});

const TOKENS = ["deny", "hitl", "allow"] as const;

function PolicyPage() {
  const [policies, setPolicies] = useState<PolicyDoc[]>(SEED_POLICIES);
  const [activeId, setActiveId] = useState(SEED_POLICIES[0].id);
  const [open, setOpen] = useState<number | null>(null);
  const [modal, setModal] = useState<"policy" | "rule" | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);

  useEffect(() => {
    const stored = loadPolicies();
    setPolicies(stored);
    setActiveId(stored[0].id);
  }, []);

  const policy = policies.find((p) => p.id === activeId) ?? policies[0];
  const rules = activeRules(policy);

  function update(next: PolicyDoc[]) {
    setPolicies(next);
    savePolicies(next);
  }

  function replace(p: PolicyDoc) {
    update(policies.map((x) => (x.id === p.id ? p : x)));
  }

  const [form, setForm] = useState({
    action_type: "FEE_WAIVER",
    amount: 75,
    risk_score: 62,
    reason: "Goodwill waiver",
  });
  const [result, setResult] = useState<PolicyResult | null>(null);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-normal tracking-[-0.01em]">Policy Engine</h1>
          <p className="text-[13px] text-muted-foreground">
            Version-controlled Rego policies — commit new versions, deploy, and roll production back
            when a release misbehaves.
          </p>
        </div>
        <button
          onClick={() => setModal("policy")}
          className="btn-pill btn-primary text-[13px]"
        >
          <Plus className="size-4" /> New Policy
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <SectionLabel>Active Policies</SectionLabel>
          {policies.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setActiveId(p.id);
                setOpen(null);
              }}
              className={cn(
                "panel hover-lift block w-full border-l-3 p-3.5 text-left",
                p.id === policy.id ? "border-l-link" : "border-l-allow",
              )}
            >
              <p className="mono flex items-center gap-2 text-[13px] font-bold text-brand">
                <span className="text-allow"></span> {p.file}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">{p.scope}</p>
              <p className="mono mt-0.5 text-[11px] text-muted-foreground">
                v{p.activeVersion} live | {activeRules(p).length} rules | {p.versions.length} versions
              </p>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <section className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold">Policy: {policy.file}</h2>
                <p className="mono text-[12px] text-muted-foreground">Package: {policy.pkg}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill token="allow">
                  <GitBranch className="size-3" /> v{policy.activeVersion} deployed
                </StatusPill>
                <GhostBtn onClick={() => setModal("rule")}>+ Add Rule (new version)</GhostBtn>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {rules.map((r) => (
                <div key={r.n} className="rounded-lg border border-border bg-surface-elevated p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="mono text-[11px] tracking-wide text-muted-foreground uppercase">
                      Rule {r.n}
                    </span>
                    <span className="text-[13px] font-bold text-brand uppercase">{r.title}</span>
                    <StatusPill token={r.token} className="ml-auto">
                      {r.token === "deny" ? "Deny" : r.token === "hitl" ? "Require HITL" : "Allow"}
                    </StatusPill>
                  </div>
                  <p className="mono mt-2 text-[12.5px]">{r.logic}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">Reason: "{r.reason}"</p>
                  <button
                    onClick={() => setOpen(open === r.n ? null : r.n)}
                    className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-link"
                  >
                    <FileCode2 className="size-3.5" /> Show Rego Code
                    <ChevronDown
                      className={cn("size-3.5 transition-transform", open === r.n && "rotate-180")}
                    />
                  </button>
                  {open === r.n && (
                    <pre className="mono mt-2 overflow-x-auto rounded-md glass-chip p-3 text-[11.5px] leading-relaxed">
                      {r.rego}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="panel p-5">
            <SectionLabel>
              <span className="inline-flex items-center gap-1.5">
                <History className="size-3.5" /> Version History — {policy.file}
              </span>
            </SectionLabel>
            <div className="space-y-2">
              {[...policy.versions].reverse().map((v) => {
                const live = v.version === policy.activeVersion;
                return (
                  <div
                    key={v.version}
                    className={cn(
                      "rounded-lg border p-3.5",
                      live ? "border-allow/40 bg-allow/6" : "border-border bg-surface-elevated",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mono text-[12px] font-bold">v{v.version}</span>
                      {live ? (
                        <StatusPill token="allow">Production</StatusPill>
                      ) : v.incident ? (
                        <StatusPill token="deny">Rolled back</StatusPill>
                      ) : (
                        <StatusPill token="info">Archived</StatusPill>
                      )}
                      <span className="mono text-[11px] text-muted-foreground">
                        {new Date(v.ts).toLocaleString()} · {v.author} · {v.rules.length} rules
                      </span>
                      {!live && (
                        <button
                          onClick={() => setRollbackTarget(v.version)}
                          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] font-semibold hover:bg-accent"
                        >
                          <RotateCcw className="size-3.5" /> Roll back to v{v.version}
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 text-[12.5px]">{v.note}</p>
                    {v.incident && (
                      <p className="mono mt-1 text-[11.5px] text-deny">
                        Incident: {v.incident} — debug this version before re-deploying.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel p-5">
            <SectionLabel>Policy Simulator</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Action Type">
                <select
                  value={form.action_type}
                  onChange={(e) => setForm({ ...form, action_type: e.target.value })}
                  className="w-full rounded-md border border-border bg-surface-elevated px-2.5 py-2 text-[13px] outline-none"
                >
                  {["FEE_WAIVER", "TRADE", "REFUND"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="Amount ($)">
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                  className="mono w-full rounded-md border border-border bg-surface-elevated px-2.5 py-2 text-[13px] outline-none focus:border-link"
                />
              </Field>
              <Field label="Risk Score (0–100)">
                <input
                  type="number"
                  value={form.risk_score}
                  onChange={(e) => setForm({ ...form, risk_score: Number(e.target.value) })}
                  className="mono w-full rounded-md border border-border bg-surface-elevated px-2.5 py-2 text-[13px] outline-none focus:border-link"
                />
              </Field>
              <Field label="Reason">
                <input
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="w-full rounded-md border border-border bg-surface-elevated px-2.5 py-2 text-[13px] outline-none focus:border-link"
                />
              </Field>
            </div>
            <button
              onClick={async () => setResult(await evaluatePolicy(form))}
              className="btn-pill btn-primary text-[13px] mt-4"
            >
              ▶ Simulate
            </button>

            {result && (
              <div className="mt-4 rounded-lg border border-border bg-surface-elevated p-3.5">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-muted-foreground">Result:</span>
                  <StatusPill token={DECISION_META[result.decision].token}>
                    {DECISION_META[result.decision].icon} {result.decision.replace(/_/g, " ")}
                  </StatusPill>
                </div>
                <p className="mt-2 text-[12.5px]">
                  <span className="text-muted-foreground">Rule triggered: </span>
                  {result.rule} — {result.reason}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {modal === "policy" && (
        <NewPolicyModal
          onClose={() => setModal(null)}
          onCreate={(p) => {
            update([...policies, p]);
            setActiveId(p.id);
            setModal(null);
          }}
        />
      )}

      {modal === "rule" && (
        <NewRuleModal
          nextIndex={rules.length}
          onClose={() => setModal(null)}
          onCommit={(rule, note) => {
            replace(commitVersion(policy, [...rules, rule], note));
            setModal(null);
          }}
        />
      )}

      {rollbackTarget !== null && (
        <RollbackModal
          from={policy.activeVersion}
          to={rollbackTarget}
          onClose={() => setRollbackTarget(null)}
          onConfirm={(incident) => {
            replace(rollbackTo(policy, rollbackTarget, incident));
            setRollbackTarget(null);
          }}
        />
      )}
    </div>
  );
}

function NewPolicyModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (p: PolicyDoc) => void;
}) {
  const [f, setF] = useState({
    file: "",
    pkg: "",
    scope: "",
    note: "Initial policy commit",
    title: "",
    logic: "",
    reason: "",
    token: "deny" as string,
    rego: `deny[msg] {\n  input.parameters.amount > 100\n  msg := "Amount exceeds limit"\n}`,
  });
  const valid = f.file.trim() && f.pkg.trim() && f.title.trim();

  return (
    <Modal title="New Policy" onClose={onClose}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        <Field label="File name">
          <Input value={f.file} onChange={(v) => setF({ ...f, file: v })} placeholder="refunds.rego" mono />
        </Field>
        <Field label="Package">
          <Input value={f.pkg} onChange={(v) => setF({ ...f, pkg: v })} placeholder="sentinel.refunds" mono />
        </Field>
        <Field label="Scope">
          <Input value={f.scope} onChange={(v) => setF({ ...f, scope: v })} placeholder="REFUND actions" />
        </Field>
        <Field label="Commit note">
          <Input value={f.note} onChange={(v) => setF({ ...f, note: v })} />
        </Field>

        <SectionLabel>First rule</SectionLabel>
        <Field label="Rule title">
          <Input value={f.title} onChange={(v) => setF({ ...f, title: v })} placeholder="Hard Dollar Limit" />
        </Field>
        <Field label="Logic summary">
          <Input value={f.logic} onChange={(v) => setF({ ...f, logic: v })} placeholder="DENY if amount > $100" />
        </Field>
        <Field label="Reason">
          <Input value={f.reason} onChange={(v) => setF({ ...f, reason: v })} />
        </Field>
        <Field label="Decision">
          <TokenSelect value={f.token} onChange={(v) => setF({ ...f, token: v })} />
        </Field>
        <Field label="Rego code">
          <textarea
            value={f.rego}
            onChange={(e) => setF({ ...f, rego: e.target.value })}
            rows={6}
            className="mono w-full rounded-md border border-border bg-surface-elevated px-2.5 py-2 text-[12px] outline-none focus:border-link"
          />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <GhostBtn onClick={onClose}>Cancel</GhostBtn>
        <button
          disabled={!valid}
          onClick={() =>
            onCreate(
              makePolicy({
                file: f.file.trim(),
                pkg: f.pkg.trim(),
                scope: f.scope.trim() || "Custom actions",
                note: f.note,
                rule: {
                  title: f.title.trim(),
                  logic: f.logic.trim() || "—",
                  reason: f.reason.trim() || "Policy violation",
                  token: f.token,
                  rego: f.rego,
                },
              }),
            )
          }
          className="btn-pill btn-primary text-[13px]"
        >
          Commit v1 & Deploy
        </button>
      </div>
    </Modal>
  );
}

function NewRuleModal({
  nextIndex,
  onClose,
  onCommit,
}: {
  nextIndex: number;
  onClose: () => void;
  onCommit: (rule: PolicyRule, note: string) => void;
}) {
  const [f, setF] = useState({
    title: "",
    logic: "",
    reason: "",
    token: "hitl" as string,
    rego: `require_hitl[msg] {\n  input.risk_score >= 50\n  msg := "Manager approval required"\n}`,
    note: "",
  });

  return (
    <Modal title={`Add Rule — commits a new version`} onClose={onClose}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        <Field label="Rule title">
          <Input value={f.title} onChange={(v) => setF({ ...f, title: v })} />
        </Field>
        <Field label="Logic summary">
          <Input value={f.logic} onChange={(v) => setF({ ...f, logic: v })} />
        </Field>
        <Field label="Reason">
          <Input value={f.reason} onChange={(v) => setF({ ...f, reason: v })} />
        </Field>
        <Field label="Decision">
          <TokenSelect value={f.token} onChange={(v) => setF({ ...f, token: v })} />
        </Field>
        <Field label="Rego code">
          <textarea
            value={f.rego}
            onChange={(e) => setF({ ...f, rego: e.target.value })}
            rows={6}
            className="mono w-full rounded-md border border-border bg-surface-elevated px-2.5 py-2 text-[12px] outline-none focus:border-link"
          />
        </Field>
        <Field label="Commit note">
          <Input value={f.note} onChange={(v) => setF({ ...f, note: v })} placeholder="Tighten waiver gate" />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <GhostBtn onClick={onClose}>Cancel</GhostBtn>
        <button
          disabled={!f.title.trim()}
          onClick={() =>
            onCommit(
              {
                n: nextIndex,
                title: f.title.trim(),
                logic: f.logic.trim() || "—",
                reason: f.reason.trim() || "Policy violation",
                token: f.token,
                rego: f.rego,
              },
              f.note.trim() || `Add rule "${f.title.trim()}"`,
            )
          }
          className="btn-pill btn-primary text-[13px]"
        >
          Commit & Deploy
        </button>
      </div>
    </Modal>
  );
}

function RollbackModal({
  from,
  to,
  onClose,
  onConfirm,
}: {
  from: number;
  to: number;
  onClose: () => void;
  onConfirm: (incident: string) => void;
}) {
  const [incident, setIncident] = useState("");
  return (
    <Modal title={`Roll back production: v${from} → v${to}`} onClose={onClose}>
      <p className="text-[13px] text-muted-foreground">
        v{to} becomes the live policy immediately. v{from} stays in history, flagged for manual debugging.
      </p>
      <div className="mt-3">
        <Field label="Incident note (what broke?)">
          <Input
            value={incident}
            onChange={setIncident}
            placeholder="v{from} denied all valid waivers under $50"
          />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <GhostBtn onClick={onClose}>Cancel</GhostBtn>
        <button
          onClick={() => onConfirm(incident.trim())}
          className="btn-pill btn-destructive text-[12px] disabled:opacity-40"
        >
          Roll back now
        </button>
      </div>
    </Modal>
  );
}

function TokenSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-surface-elevated px-2.5 py-2 text-[13px] outline-none"
    >
      {TOKENS.map((t) => (
        <option key={t} value={t}>
          {t === "deny" ? "Deny" : t === "hitl" ? "Require HITL" : "Allow"}
        </option>
      ))}
    </select>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full rounded-md border border-border bg-surface-elevated px-2.5 py-2 text-[13px] outline-none focus:border-link",
        mono && "mono",
      )}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
