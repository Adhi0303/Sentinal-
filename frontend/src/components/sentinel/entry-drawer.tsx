import { X } from "lucide-react";

import type { AuditEntry } from "@/lib/sentinel";
import { fmtMoney, fmtTime, riskBand } from "@/lib/sentinel";
import { DecisionBadge, JsonBlock, SectionLabel, StatusPill } from "./primitives";

export function EntryDrawer({
  entry,
  onClose,
}: {
  entry: AuditEntry | null;
  onClose: () => void;
}) {
  if (!entry) return null;
  const band = riskBand(entry.risk_score);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/50 backdrop-blur-[8px]"
      />
      <aside className="animate-slide-in scroll-slim relative h-full w-full max-w-[480px] glass-strong overflow-y-auto border-0 border-l border-border shadow-modal">
        <div className="glass-strong sticky top-0 flex items-center justify-between border-0 border-b border-border px-5 py-4">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-brand"
          >
            <X className="size-4" /> Close
          </button>
          <DecisionBadge decision={entry.decision} />
        </div>

        <div className="px-5 py-5">
          <h2 className="text-[16px] font-normal text-brand">{entry.action_type.replace(/_/g, " ")}</h2>
          <p className="mono mt-1 text-xs text-muted-foreground">
            {fmtMoney(entry.amount)} • {entry.account_id} • {fmtTime(entry.timestamp)} UTC
          </p>

          <div className="mt-6">
            <SectionLabel>Sentinel Analysis</SectionLabel>
            <dl className="space-y-2 text-[13px]">
              <Row label="Gate Failed" value={entry.gate_failed ?? "None — all gates passed"} />
              <Row label="Reason" value={entry.reason} />
              <Row label="Policy Rule" value={entry.policy_rule ?? "—"} />
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Risk Score</dt>
                <dd className="flex items-center gap-2">
                  <span className="mono">{entry.risk_score ?? "N/A (blocked pre-score)"}</span>
                  <StatusPill token={band.token}>{band.label}</StatusPill>
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-6">
            <SectionLabel>Audit Entry</SectionLabel>
            <dl className="space-y-2 text-[13px]">
              <Row label="Entry ID" mono value={`AUD-${String(entry.entry_id).padStart(4, "0")}`} />
              <Row label="Hash" mono value={`${entry.hash.slice(0, 24)}…`} />
              <Row label="Prev Hash" mono value={`${entry.prev_hash.slice(0, 24)}…`} />
              <Row label="Agent" mono value={entry.agent_id} />
            </dl>
          </div>

          <div className="mt-6">
            <SectionLabel>Raw Parameters</SectionLabel>
            <JsonBlock value={entry.parameters} />
          </div>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`text-right ${mono ? "mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
