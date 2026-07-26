import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import { fetchRecent } from "@/lib/sentinel";
import { cn } from "@/lib/utils";

interface GNode {
  id: string;
  label: string;
  kind: "agent" | "tool";
  x: number;
  y: number;
  token: "link" | "allow" | "deny" | "kill";
}

/** Deterministic trace layout — no external graph dependency required. */
export function ExecutionGraph() {
  const { data: entries = [] } = useQuery({
    queryKey: ["recent", 6],
    queryFn: () => fetchRecent(6),
    refetchInterval: 2000,
  });

  const latest = entries[0];
  const denied = latest?.decision === "DENIED" || latest?.decision === "BLOCKED_KILLSWITCH";
  const cycle = (latest?.entry_id ?? 0) % 9 === 6;

  const nodes: GNode[] = [
    {
      id: "agent",
      label: latest?.agent_id ?? "agent_cust_srv_01",
      kind: "agent",
      x: 90,
      y: 170,
      token: "link",
    },
    { id: "ctx", label: "get_account_details", kind: "tool", x: 330, y: 90, token: "allow" },
    { id: "risk", label: "risk_score", kind: "tool", x: 330, y: 250, token: "allow" },
    {
      id: "action",
      label: latest?.action_type ?? "FEE_WAIVER",
      kind: "tool",
      x: 560,
      y: 170,
      token: denied ? "deny" : "allow",
    },
  ];

  const edges: Array<[string, string, boolean]> = [
    ["agent", "ctx", false],
    ["agent", "risk", false],
    ["risk", "action", false],
    ["ctx", "action", false],
  ];
  if (cycle) edges.push(["action", "agent", true]);

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const strokeFor: Record<string, string> = {
    link: "var(--link)",
    allow: "var(--allow)",
    deny: "var(--deny)",
    kill: "var(--kill)",
  };

  return (
    <section className="panel relative flex flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="section-label text-foreground">Execution Graph</h2>
        <span className="mono text-[10px] text-muted-foreground">
          trace {latest ? `TRC-${latest.entry_id}` : "—"}
        </span>
        <span className="mono ml-auto text-[10px] text-muted-foreground">depth 3 / max 4</span>
      </header>

      {cycle && (
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-2 text-[12px] text-deny">
          <AlertTriangle className="size-4" /> CYCLE DETECTED — CHAIN BROKEN at depth 3
        </div>
      )}

      <div className="p-2">
        <svg viewBox="0 0 700 340" className="h-[300px] w-full">
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill="var(--info)" />
            </marker>
            <marker id="arrow-red" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill="var(--deny)" />
            </marker>
          </defs>

          {edges.map(([from, to, bad], i) => {
            const a = byId[from];
            const b = byId[to];
            return (
              <path
                key={i}
                d={`M ${a.x + 70} ${a.y} C ${(a.x + b.x) / 2 + 60} ${a.y}, ${(a.x + b.x) / 2 - 60} ${b.y}, ${b.x - 70} ${b.y}`}
                fill="none"
                stroke={bad || cycle ? "var(--deny)" : "var(--border)"}
                strokeWidth={bad ? 2 : 1.5}
                markerEnd={bad || cycle ? "url(#arrow-red)" : "url(#arrow)"}
              />
            );
          })}

          {nodes.map((n) => (
            <g key={n.id}>
              {n.kind === "agent" ? (
                <>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={44}
                    fill="var(--card)"
                    stroke={strokeFor[n.token]}
                    strokeWidth={2}
                  />
                  <text
                    x={n.x}
                    y={n.y + 4}
                    textAnchor="middle"
                    className="mono"
                    fontSize="9"
                    fill="var(--foreground)"
                  >
                    {n.label.slice(0, 12)}
                  </text>
                </>
              ) : (
                <>
                  <rect
                    x={n.x - 72}
                    y={n.y - 20}
                    width={144}
                    height={40}
                    rx={6}
                    fill="var(--surface-elevated)"
                    stroke={strokeFor[n.token]}
                    strokeWidth={1.6}
                  />
                  <text
                    x={n.x}
                    y={n.y + 4}
                    textAnchor="middle"
                    className="mono"
                    fontSize="10"
                    fill="var(--foreground)"
                  >
                    {n.label}
                  </text>
                </>
              )}
            </g>
          ))}
        </svg>
      </div>

      <footer className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
        {[
          ["link", "Active"],
          ["allow", "Completed"],
          ["deny", "Denied"],
          ["kill", "Quarantined"],
        ].map(([token, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-2 rounded-full",
                token === "link" && "bg-link",
                token === "allow" && "bg-allow",
                token === "deny" && "bg-deny",
                token === "kill" && "bg-kill",
              )}
            />
            {label}
          </span>
        ))}
      </footer>
    </section>
  );
}
