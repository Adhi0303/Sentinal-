import { useQuery } from "@tanstack/react-query";

import { fetchRecent, DECISION_META } from "@/lib/sentinel";
import { cn } from "@/lib/utils";
import { TOKEN_BG, TOKEN_TEXT } from "./primitives";

export function OpaActivity() {
  const { data: entries = [] } = useQuery({
    queryKey: ["recent", 10],
    queryFn: () => fetchRecent(10),
    refetchInterval: 5000,
  });

  return (
    <section className="panel">
      <header className="flex items-center gap-2 border-b border-hairline px-5 py-4">
        <h2 className="section-label text-foreground">OPA Policy Activity</h2>
        <span className="mono ml-auto text-[10px] text-muted-foreground">last 10 evaluations</span>
      </header>
      <ul className="divide-y divide-border">
        {entries.map((e) => {
          const meta = DECISION_META[e.decision];
          return (
            <li key={e.entry_id} className="flex items-center gap-3 px-4 py-2">
              <span className="mono w-32 shrink-0 truncate text-[11px] text-muted-foreground">
                {e.action_type} #{e.entry_id}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-sm bg-border/70">
                {e.risk_score === null ? (
                  <div className="mono flex h-full items-center bg-deny/15 px-2 text-[9px] text-deny">
                    BLOCKED {e.gate_failed}
                  </div>
                ) : (
                  <div
                    className={cn("h-full", TOKEN_BG[meta.token])}
                    style={{ width: `${e.risk_score}%` }}
                  />
                )}
              </div>
              <span className={cn("mono w-36 shrink-0 text-right text-[11px]", TOKEN_TEXT[meta.token])}>
                {e.risk_score === null ? "—" : `Risk ${e.risk_score}`} → {meta.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
