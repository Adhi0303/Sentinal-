import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";

import { EntryDrawer } from "@/components/sentinel/entry-drawer";
import { DecisionBadge, TOKEN_TEXT } from "@/components/sentinel/primitives";
import {
  fetchRecent,
  fmtMoney,
  fmtTime,
  shortHash,
  verifyChain,
  DECISION_META,
  type AuditEntry,
} from "@/lib/sentinel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit Ledger — SHA-256 Hash Chain Browser" },
      {
        name: "description",
        content:
          "Browse the tamper-proof audit ledger: every AI decision hashed and chained with SHA-256.",
      },
      { property: "og:title", content: "Audit Ledger — Sentinel Gateway" },
      {
        property: "og:description",
        content: "Cryptographic proof for every automated decision.",
      },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const { data: entries = [] } = useQuery({
    queryKey: ["recent", 100],
    queryFn: () => fetchRecent(100),
    refetchInterval: 10_000,
  });
  const chain = useQuery({ queryKey: ["verify"], queryFn: verifyChain });
  const lastFive = [...entries].slice(0, 5).reverse();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-normal tracking-[-0.01em]">Audit Ledger</h1>
        <p className="text-[13px] text-muted-foreground">
          Immutable, hash-chained record of every gate decision.
        </p>
      </header>

      <div
        className={cn(
          "panel p-4",
          chain.data?.intact ? "border-allow/40 bg-allow/5" : "border-deny/40 bg-deny/5",
        )}
      >
        <div className="flex flex-wrap items-center gap-3">
          {chain.data?.intact ? (
            <ShieldCheck className="size-5 text-allow" />
          ) : (
            <ShieldAlert className="size-5 text-deny" />
          )}
          <div>
            <p className={cn("text-[14px] font-bold", chain.data?.intact ? "text-allow" : "text-deny")}>
              {chain.data?.intact ? "AUDIT CHAIN INTACT" : "AUDIT CHAIN TAMPERED"}
            </p>
            <p className="text-[12px] text-muted-foreground">
              {chain.data
                ? `${chain.data.total_entries} entries verified. SHA-256 hash chain ${chain.data.intact ? "unbroken" : `broken at #${chain.data.break_at}`}. Last verified: ${fmtTime(chain.data.verified_at)} UTC`
                : "Verifying…"}
            </p>
          </div>
          <button
            onClick={() => chain.refetch()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md glass-chip px-3 py-1.5 text-[12px] font-semibold"
          >
            <RefreshCw className={cn("size-3.5", chain.isFetching && "animate-spin")} /> Re-Verify
          </button>
        </div>
      </div>

      <div className="panel scroll-slim overflow-x-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead className="glass-head border-b border-border text-[11px] tracking-wide text-muted-foreground uppercase">
            <tr>
              {["#", "Timestamp", "Agent", "Action", "Decision", "Risk", "Amount", "Entry Hash", "Prev Hash"].map(
                (h) => (
                  <th key={h} className="px-3 py-2.5 font-semibold">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {entries.map((e) => (
              <tr
                key={e.entry_id}
                onClick={() => setSelected(e)}
                className={cn(
                  "cursor-pointer transition-colors hover:bg-surface-elevated",
                  e.decision === "DUPLICATE_REJECTED" && "border-l-3 border-l-duplicate bg-duplicate/4",
                )}
              >
                <td className="mono px-3 py-2 text-muted-foreground">{e.entry_id}</td>
                <td className="mono px-3 py-2">{fmtTime(e.timestamp)}</td>
                <td className="mono px-3 py-2 text-link">{e.agent_id}</td>
                <td className="px-3 py-2 font-medium">{e.action_type}</td>
                <td className="px-3 py-2">
                  <DecisionBadge decision={e.decision} />
                </td>
                <td className="mono px-3 py-2">{e.risk_score ?? "—"}</td>
                <td className="mono px-3 py-2">{fmtMoney(e.amount)}</td>
                <td className="mono px-3 py-2 text-muted-foreground" title={e.hash}>
                  {shortHash(e.hash, 6)}
                </td>
                <td className="mono px-3 py-2 text-muted-foreground" title={e.prev_hash}>
                  {shortHash(e.prev_hash, 6)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="panel p-4">
        <p className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Hash Chain — last 5 entries
        </p>
        <div className="scroll-slim flex items-center gap-2 overflow-x-auto pb-2">
          {lastFive.map((e, i) => (
            <div key={e.entry_id} className="flex shrink-0 items-center gap-2">
              <div className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-center">
                <p className="mono text-[11px] font-bold">Entry {e.entry_id}</p>
                <p
                  className={cn(
                    "mono text-[10px] font-semibold",
                    TOKEN_TEXT[DECISION_META[e.decision].token],
                  )}
                >
                  {DECISION_META[e.decision].label}
                </p>
              </div>
              {i < lastFive.length - 1 && (
                <span className="flex items-center gap-1">
                  <span
                    className={cn(
                      "block h-0.5 w-10",
                      chain.data?.intact === false ? "bg-deny" : "bg-allow",
                    )}
                  />
                  <span className="mono text-[9px] text-muted-foreground">hash</span>
                  <span
                    className={cn(
                      "block h-0.5 w-4",
                      chain.data?.intact === false ? "bg-deny" : "bg-allow",
                    )}
                  />
                  <span className={chain.data?.intact === false ? "text-deny" : "text-allow"}>▶</span>
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      <EntryDrawer entry={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
