import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { RefreshCw, Search, ShieldAlert, ShieldCheck } from "lucide-react";

import { EntryDrawer } from "@/components/sentinel/entry-drawer";
import { DecisionBadge, RiskBar } from "@/components/sentinel/primitives";
import {
  fetchRecent,
  fmtMoney,
  fmtTime,
  shortHash,
  verifyChain,
  type AuditEntry,
} from "@/lib/sentinel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/traffic")({
  head: () => ({
    meta: [
      { title: "Live Traffic — Sentinel Gateway" },
      {
        name: "description",
        content:
          "Deep-dive monitoring table of every intercepted agent action with gate, risk score and audit hash.",
      },
      { property: "og:title", content: "Live Traffic — Sentinel Gateway" },
      {
        property: "og:description",
        content: "Searchable, filterable stream of guarded AI agent requests.",
      },
    ],
  }),
  component: TrafficPage,
});

const DECISIONS = ["All Decisions", "ALLOWED", "DENIED", "REQUIRE_HITL", "BLOCKED_KILLSWITCH", "DUPLICATE_REJECTED"];

function TrafficPage() {
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [decision, setDecision] = useState("All Decisions");
  const [agent, setAgent] = useState("All Agents");
  const [action, setAction] = useState("All Actions");
  const [risk, setRisk] = useState("Any");
  const [q, setQ] = useState("");

  const { data: entries = [] } = useQuery({
    queryKey: ["recent", 100],
    queryFn: () => fetchRecent(100),
    refetchInterval: 5000,
  });
  const chain = useQuery({ queryKey: ["verify"], queryFn: verifyChain });

  const agents = useMemo(
    () => ["All Agents", ...new Set(entries.map((e) => e.agent_id))],
    [entries],
  );
  const actions = useMemo(
    () => ["All Actions", ...new Set(entries.map((e) => e.action_type))],
    [entries],
  );

  const rows = entries.filter((e) => {
    if (decision !== "All Decisions" && e.decision !== decision) return false;
    if (agent !== "All Agents" && e.agent_id !== agent) return false;
    if (action !== "All Actions" && e.action_type !== action) return false;
    if (risk === "High (50+)" && (e.risk_score ?? 0) < 50) return false;
    if (risk === "Low (<50)" && (e.risk_score ?? 100) >= 50) return false;
    if (q && !e.hash.includes(q.toLowerCase()) && !e.account_id.includes(q)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-normal tracking-[-0.01em]">Live Traffic</h1>
        <p className="text-[13px] text-muted-foreground">
          Auto-refreshing every 5s · {rows.length} of {entries.length} entries shown
        </p>
      </header>

      <div
        className={cn(
          "panel flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]",
          chain.data?.intact ? "border-allow/40 bg-allow/5" : "border-deny/40 bg-deny/5",
        )}
      >
        {chain.data?.intact ? (
          <ShieldCheck className="size-4 text-allow" />
        ) : (
          <ShieldAlert className="size-4 text-deny" />
        )}
        <span className={cn("font-semibold", chain.data?.intact ? "text-allow" : "text-deny")}>
          {chain.data?.intact ? "AUDIT CHAIN INTACT" : "AUDIT CHAIN TAMPERED"}
        </span>
        <span className="text-muted-foreground">
          {chain.data
            ? chain.data.intact
              ? `All ${chain.data.total_entries} entries verified. Last checked: ${fmtTime(chain.data.verified_at)} UTC`
              : `Break detected at Entry #${chain.data.break_at}. Alert dispatched!`
            : "Verifying…"}
        </span>
        <button
          onClick={() => chain.refetch()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md glass-chip px-2.5 py-1 text-[12px] font-semibold"
        >
          <RefreshCw className={cn("size-3.5", chain.isFetching && "animate-spin")} /> Re-verify
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={decision} onChange={setDecision} options={DECISIONS} />
        <Select value={agent} onChange={setAgent} options={agents} />
        <Select value={action} onChange={setAction} options={actions} />
        <Select value={risk} onChange={setRisk} options={["Any", "High (50+)", "Low (<50)"]} />
        <label className="panel flex items-center gap-2 px-2.5 py-1.5">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search hash or account…"
            className="mono w-52 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      <div className="panel scroll-slim overflow-x-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead className="glass-head border-b border-border text-[11px] tracking-wide text-muted-foreground uppercase">
            <tr>
              {["#", "Timestamp", "Agent", "Action", "Amount", "Risk", "Gate Failed", "Decision", "Hash", ""].map(
                (h) => (
                  <th key={h} className="px-3 py-2.5 font-semibold">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((e) => (
              <tr key={e.entry_id} className="row-hover even:bg-secondary/40">
                <td className="mono px-3 py-2 text-muted-foreground">{e.entry_id}</td>
                <td className="mono px-3 py-2">{fmtTime(e.timestamp)}</td>
                <td className="mono px-3 py-2 text-link">{e.agent_id}</td>
                <td className="px-3 py-2 font-medium">{e.action_type}</td>
                <td className="mono px-3 py-2">{fmtMoney(e.amount)}</td>
                <td className="px-3 py-2">
                  <RiskBar score={e.risk_score} />
                </td>
                <td className="px-3 py-2 text-muted-foreground">{e.gate_failed ?? "—"}</td>
                <td className="px-3 py-2">
                  <DecisionBadge decision={e.decision} />
                </td>
                <td className="mono px-3 py-2 text-muted-foreground" title={e.hash}>
                  {shortHash(e.hash, 6)}
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => setSelected(e)}
                    className="glass-chip rounded-md px-2 py-0.5 text-[11px] font-semibold text-link"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EntryDrawer entry={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="panel px-2.5 py-1.5 text-[12px] font-medium outline-none"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
