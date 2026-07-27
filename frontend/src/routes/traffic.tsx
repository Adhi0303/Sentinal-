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
    <div className="space-y-6">
      <header>
        <h1 className="text-[28px] font-normal tracking-[-0.01em]">Live Traffic</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Auto-refreshing every 5s · {rows.length} of {entries.length} entries shown
        </p>
      </header>

      <div
        className={cn(
          "glass rounded-[20px] flex flex-wrap items-center gap-3 px-6 py-4 text-[13px]",
          chain.data?.intact ? "border-allow/30 bg-[#578d72]/10" : "border-deny/30 bg-[#b06266]/10",
        )}
      >
        {chain.data?.intact ? (
          <ShieldCheck className="size-5 text-allow" strokeWidth={2} />
        ) : (
          <ShieldAlert className="size-5 text-deny" strokeWidth={2} />
        )}
        <span className={cn("font-medium", chain.data?.intact ? "text-allow" : "text-deny")}>
          {chain.data?.intact ? "AUDIT CHAIN INTACT" : "AUDIT CHAIN TAMPERED"}
        </span>
        <span className="text-muted-foreground ml-2">
          {chain.data
            ? chain.data.intact
              ? `All ${chain.data.total_entries} entries verified. Last checked: ${fmtTime(chain.data.verified_at)} UTC`
              : `Break detected at Entry #${chain.data.break_at}. Alert dispatched!`
            : "Verifying…"}
        </span>
        <button
          onClick={() => chain.refetch()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/40 hover:bg-white/60 px-4 py-1.5 text-[12px] font-medium transition-colors backdrop-blur-sm"
        >
          <RefreshCw className={cn("size-3.5", chain.isFetching && "animate-spin")} /> Re-verify
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={decision} onChange={setDecision} options={DECISIONS} />
        <Select value={agent} onChange={setAgent} options={agents} />
        <Select value={action} onChange={setAction} options={actions} />
        <Select value={risk} onChange={setRisk} options={["Any", "High (50+)", "Low (<50)"]} />
        <label className="glass rounded-full flex items-center gap-2 px-4 py-2 ml-auto shadow-sm">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search hash or account…"
            className="mono w-56 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
          />
        </label>
      </div>

      <div className="glass rounded-[28px] overflow-hidden shadow-sm">
        <table className="w-full table-fixed text-left text-[13px] whitespace-nowrap">
          <thead className="glass-head border-b border-border/50 text-[12px] tracking-wider text-muted-foreground uppercase">
            <tr>
              {/* Define specific column widths for a balanced fixed layout */}
              <th className="px-3 py-4 font-medium w-[4%]">#</th>
              <th className="px-3 py-4 font-medium w-[9%]">Timestamp</th>
              <th className="px-3 py-4 font-medium w-[15%]">Agent</th>
              <th className="px-3 py-4 font-medium w-[15%]">Action</th>
              <th className="px-3 py-4 font-medium w-[9%]">Amount</th>
              <th className="px-3 py-4 font-medium w-[12%]">Risk</th>
              <th className="px-3 py-4 font-medium w-[12%]">Gate Failed</th>
              <th className="px-3 py-4 font-medium w-[10%]">Decision</th>
              <th className="px-3 py-4 font-medium w-[8%]">Hash</th>
              <th className="px-3 pr-6 py-4 font-medium w-[8%]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/20">
            {rows.map((e) => (
              <tr key={e.entry_id} className="row-hover">
                <td className="mono px-3 py-3.5 text-muted-foreground truncate">{e.entry_id}</td>
                <td className="mono px-3 py-3.5 truncate">{fmtTime(e.timestamp)}</td>
                <td className="mono px-3 py-3.5 text-link truncate" title={e.agent_id}>{e.agent_id}</td>
                <td className="px-3 py-3.5 font-medium truncate" title={(e.action_type || "UNKNOWN_ACTION").replace(/_/g, " ")}>
                  {(e.action_type || "UNKNOWN_ACTION").replace(/_/g, " ")}
                </td>
                <td className="mono px-3 py-3.5 truncate">{fmtMoney(e.amount)}</td>
                <td className="px-3 py-3.5">
                  <RiskBar score={e.risk_score} />
                </td>
                <td className="px-3 py-3.5 text-muted-foreground truncate" title={e.gate_failed ?? ""}>
                  {e.gate_failed ?? "—"}
                </td>
                <td className="px-3 py-3.5">
                  <DecisionBadge decision={e.decision} />
                </td>
                <td className="mono px-3 py-3.5 text-muted-foreground/70 truncate" title={e.hash}>
                  {shortHash(e.hash, 6)}
                </td>
                <td className="px-3 pr-6 py-3.5 text-right">
                  <button
                    onClick={() => setSelected(e)}
                    className="glass-chip rounded-full px-4 py-1 text-[12px] font-medium text-primary shadow-sm"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-[14px]">
            No traffic matches the current filters.
          </div>
        )}
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
      className="glass rounded-full px-4 py-2 text-[13px] font-medium outline-none text-foreground cursor-pointer shadow-sm appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%231e293b%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[position:calc(100%-12px)_center] bg-[size:10px_10px]"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
