import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchRecent, fmtMoney, fmtTime, type AuditEntry, type Decision } from "@/lib/sentinel";
import { cn } from "@/lib/utils";
import { DecisionBadge, PulseDot, RiskBar } from "./primitives";

const FILTERS: Array<{ label: string; value: Decision | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Allowed", value: "ALLOWED" },
  { label: "Denied", value: "DENIED" },
  { label: "HITL", value: "REQUIRE_HITL" },
  { label: "Blocked", value: "BLOCKED_KILLSWITCH" },
];

export function LiveFeed({ onSelect }: { onSelect: (e: AuditEntry) => void }) {
  const [filter, setFilter] = useState<Decision | "ALL">("ALL");
  const { data: entries = [] } = useQuery({
    queryKey: ["recent", 20],
    queryFn: () => fetchRecent(20),
    refetchInterval: 3000,
  });

  const rows = entries.filter((e) => filter === "ALL" || e.decision === filter);

  return (
    <section className="panel flex h-full flex-col">
      <header className="border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="section-label text-foreground">Live Traffic</h2>
          <span className="ml-auto text-[11px] text-muted-foreground">3s poll</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-normal transition-colors",
                filter === f.value
                  ? "border-accent bg-accent-light text-accent"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>


      <div className="scroll-slim max-h-[560px] flex-1 divide-y divide-border overflow-y-auto">
        {rows.map((e, i) => (
          <button
            key={e.entry_id}
            onClick={() => onSelect(e)}
            className={cn(
              "block w-full px-4 py-3 text-left transition-colors hover:bg-surface-elevated",
              i === 0 && "animate-slide-in",
              i > 8 && "opacity-70",
            )}
          >
            <div className="flex items-center gap-3">
              <span className="mono text-[11px] text-muted-foreground">
                {fmtTime(e.timestamp)}
              </span>
              <span className="mono truncate text-[11px] text-link">{e.agent_id}</span>
              <span className="ml-auto text-[12px] font-semibold">
                {e.action_type.replace(/_/g, " ")} {fmtMoney(e.amount)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              {e.risk_score === null ? (
                <span className="mono text-[11px] text-muted-foreground">
                  Risk: N/A ({e.gate_failed})
                </span>
              ) : (
                <RiskBar score={e.risk_score} />
              )}
              <DecisionBadge decision={e.decision} className="ml-auto" />
            </div>
          </button>
        ))}
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No traffic matches this filter.
          </p>
        )}
      </div>
    </section>
  );
}
