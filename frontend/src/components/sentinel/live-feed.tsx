import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchRecent, fmtMoney, fmtTime, type AuditEntry, type Decision } from "@/lib/sentinel";
import { cn } from "@/lib/utils";
import { DecisionBadge, RiskBar } from "./primitives";

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
    <section className="glass rounded-[28px] flex h-full flex-col shadow-sm overflow-hidden">
      <header className="px-6 py-5">
        <div className="flex items-center gap-2">
          <h2 className="text-[16px] font-medium text-foreground">Latest Operations</h2>
          <span className="ml-auto text-[12px] text-muted-foreground">Live Updates</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-[12px] font-normal transition-all duration-200 backdrop-blur-sm",
                filter === f.value
                  ? "bg-white/80 border-transparent text-primary shadow-sm"
                  : "border-border/50 text-muted-foreground hover:bg-white/40 hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>


      <div className="scroll-slim max-h-[560px] flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-2">
          {rows.map((e, i) => (
            <button
              key={e.entry_id}
              onClick={() => onSelect(e)}
              className={cn(
                "w-full px-4 py-4 text-left transition-all duration-200 rounded-[20px]",
                "bg-white/30 hover:bg-white/60 hover:shadow-sm border border-white/40",
                i === 0 && "animate-slide-in",
                i > 8 && "opacity-70",
              )}
            >
              <div className="flex items-center gap-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-white shadow-sm">
                  {e.action_type[0]}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-[14px] font-medium text-foreground">
                      {(e.action_type || "UNKNOWN_ACTION").replace(/_/g, " ")}
                    </span>
                    <span className="text-[14px] font-medium text-primary ml-4">
                      {fmtMoney(e.amount)}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3 mt-1">
                    <span className="truncate text-[12px] text-muted-foreground">
                      {e.agent_id.replace("agent_", "").replace(/_/g, " ")}
                    </span>
                    <span className="text-[11px] text-muted-foreground/50">•</span>
                    <span className="mono text-[11px] text-muted-foreground">
                      {fmtTime(e.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="mt-3 flex items-center justify-between border-t border-white/30 pt-3">
                {e.risk_score === null ? (
                  <span className="mono text-[11px] text-muted-foreground">
                    Risk: N/A ({e.gate_failed})
                  </span>
                ) : (
                  <RiskBar score={e.risk_score} />
                )}
                <DecisionBadge decision={e.decision} />
              </div>
            </button>
          ))}
        </div>
        {rows.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-[14px] text-muted-foreground">No operations match this filter.</p>
          </div>
        )}
      </div>
    </section>
  );
}
