import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SectionLabel, StatusPill } from "@/components/sentinel/primitives";
import { GhostBtn, Modal } from "@/components/sentinel/modal";
import {
  fetchRecent,
  fmtMoney,
  fmtTime,
  resolveHitl,
  riskBand,
  shortHash,
  type AuditEntry,
} from "@/lib/sentinel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/hitl")({
  head: () => ({
    meta: [
      { title: "HITL Queue — Human Review of AI Actions" },
      {
        name: "description",
        content:
          "Manager review desk: approve or reject AI agent actions escalated by Sentinel policy gates.",
      },
      { property: "og:title", content: "HITL Queue — Sentinel Gateway" },
      {
        property: "og:description",
        content: "Approve or reject escalated AI agent actions with full decision context.",
      },
    ],
  }),
  component: HitlPage,
});

function HitlPage() {
  const qc = useQueryClient();
  const { data: entries = [] } = useQuery({
    queryKey: ["recent", 100],
    queryFn: () => fetchRecent(100),
    refetchInterval: 5000,
  });
  const queue = entries.filter((e) => e.decision === "REQUIRE_HITL");
  const [activeId, setActiveId] = useState<number | null>(null);
  const active = queue.find((e) => e.entry_id === activeId) ?? queue[0] ?? null;

  useEffect(() => {
    if (active && activeId !== active.entry_id) setActiveId(active.entry_id);
  }, [active, activeId]);

  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const resolve = (approved: boolean, note: string) => {
    if (!active) return;
    resolveHitl(active.entry_id, approved, note);
    qc.invalidateQueries({ queryKey: ["recent"] });
    toast[approved ? "success" : "error"](
      approved
        ? `Approved & executed — ${fmtMoney(active.amount)} ${active.action_type}`
        : "Rejected & agent notified",
      { description: `Audited as ${approved ? "APPROVED_BY_HUMAN" : "REJECTED_BY_HUMAN"}` },
    );
    setConfirming(false);
    setRejecting(false);
    setRejectReason("");
    setActiveId(null);
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-normal tracking-[-0.01em]">HITL Queue</h1>
        <p className="text-[13px] text-muted-foreground">
          {queue.length} action{queue.length === 1 ? "" : "s"} awaiting manager review
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-3">
          {queue.map((e) => {
            const band = riskBand(e.risk_score);
            const isActive = active?.entry_id === e.entry_id;
            return (
              <button
                key={e.entry_id}
                onClick={() => setActiveId(e.entry_id)}
                className={cn(
                  "panel hover-lift block w-full border-l-3 p-4 text-left",
                  isActive ? "border-l-link" : "border-l-hitl/60",
                )}
              >
                <StatusPill token="hitl"> Awaiting Review</StatusPill>
                <p className="mt-2 text-[15px] font-bold text-brand">
                  {(e.action_type || "UNKNOWN_ACTION").replace(/_/g, " ")} — {fmtMoney(e.amount)}
                </p>
                <p className="mono mt-0.5 text-[11px] text-muted-foreground">
                  {e.account_id} • {e.agent_id}
                </p>
                <div className="mt-2 flex items-center gap-2 text-[12px]">
                  <span className="mono">Risk: {e.risk_score}</span>
                  <StatusPill token={band.token}>{band.label}</StatusPill>
                  <span className="ml-auto text-muted-foreground">{fmtTime(e.timestamp)} UTC</span>
                </div>
                <p className="mt-1.5 truncate text-[11.5px] text-muted-foreground">{e.reason}</p>
              </button>
            );
          })}
          {queue.length === 0 && (
            <div className="panel p-8 text-center text-sm text-muted-foreground">
              Queue clear — no escalations pending.
            </div>
          )}
        </div>

        {active && (
          <section className="panel h-fit p-5">
            <h2 className="text-[16px] font-normal">
              {(active.action_type || "UNKNOWN_ACTION").replace(/_/g, " ")} Request — {fmtMoney(active.amount)}
            </h2>
            <p className="mono mt-1 text-[11.5px] text-muted-foreground">
              {active.agent_id} • Account: {active.account_id} • {fmtTime(active.timestamp)} UTC
            </p>

            <div className="mt-5">
              <SectionLabel>Why Sentinel flagged this</SectionLabel>
              <ol className="list-inside list-decimal space-y-1 text-[13px]">
                <li>
                  Amount ({fmtMoney(active.amount)}) exceeds auto-approve limit ($50.00)
                </li>
                <li>Risk Score: {active.risk_score}/100 — above the 50 HITL threshold</li>
                <li>OPA Policy: REQUIRE_HITL — {active.policy_rule ?? "manager approval needed"}</li>
              </ol>
            </div>

            <div className="mt-5">
              <SectionLabel>Account Context</SectionLabel>
              <dl className="grid grid-cols-2 gap-y-1.5 text-[13px]">
                <Ctx k="Account ID" v={active.account_id} mono />
                <Ctx k="Account Age" v="8 months (NEW)" />
                <Ctx k="Credit Score" v="680 (FAIR)" />
                <Ctx k="Current Status" v="ACTIVE" />
                <Ctx k="Previous Waivers" v="2 this month" />
                <Ctx k="Chargebacks" v="0" />
              </dl>
            </div>

            <div className="mt-5">
              <SectionLabel>Agent's stated reason</SectionLabel>
              <blockquote className="rounded-md border-l-2 border-link bg-surface-elevated p-3 text-[13px] italic">
                "Customer called about unexpected annual fee charge. Account is in good standing.
                Requesting one-time goodwill waiver as per retention policy."
              </blockquote>
            </div>

            <div className="mt-5">
              <SectionLabel>Sentinel Audit Hash</SectionLabel>
              <p className="mono text-[12px]">
                AUD-{String(active.entry_id).padStart(4, "0")} | Hash: {shortHash(active.hash, 12)} |
                Chain: <span className="text-allow">INTACT</span>
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-4">
              <button
                onClick={() => setConfirming(true)}
                className="btn-pill btn-secondary text-[12px]"
              >
                 Approve &amp; Execute
              </button>
              <button
                onClick={() => setRejecting(true)}
                className="btn-pill btn-destructive text-[12px] disabled:opacity-40"
              >
                 Reject &amp; Notify Agent
              </button>
            </div>
          </section>
        )}
      </div>

      {confirming && active && (
        <Modal onClose={() => setConfirming(false)} title="Confirm approval">
          <p className="text-[13px] text-muted-foreground">
            Are you sure? This will execute a {fmtMoney(active.amount)}{" "}
            {(active.action_type || "UNKNOWN_ACTION").replace(/_/g, " ").toLowerCase()} on {active.account_id} and record{" "}
            <span className="mono">APPROVED_BY_HUMAN</span> in the immutable ledger.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <GhostBtn onClick={() => setConfirming(false)}>Cancel</GhostBtn>
            <button
              onClick={() => resolve(true, "Manager approved via HITL console.")}
              className="btn-pill btn-secondary text-[12px]"
            >
              Confirm
            </button>
          </div>
        </Modal>
      )}

      {rejecting && active && (
        <Modal onClose={() => setRejecting(false)} title="Reject request">
          <label className="text-[12px] font-semibold text-muted-foreground">
            Enter rejection reason for the agent
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-md border border-border bg-surface-elevated p-2.5 text-[13px] outline-none focus:border-link"
            placeholder="e.g. Account has 2 waivers this month — decline per retention policy."
          />
          <div className="mt-4 flex justify-end gap-2">
            <GhostBtn onClick={() => setRejecting(false)}>Cancel</GhostBtn>
            <button
              disabled={!rejectReason.trim()}
              onClick={() => resolve(false, rejectReason)}
              className="btn-pill btn-destructive text-[12px] disabled:opacity-40"
            >
              Submit rejection
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Ctx({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={mono ? "mono text-[12px]" : ""}>{v}</dd>
    </>
  );
}
