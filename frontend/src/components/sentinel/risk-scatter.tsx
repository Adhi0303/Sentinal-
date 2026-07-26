import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { fetchRecent, fmtMoney, fmtTime, type AuditEntry } from "@/lib/sentinel";

const FILL: Record<string, string> = {
  ALLOWED: "var(--allow)",
  APPROVED_BY_HUMAN: "var(--allow)",
  DENIED: "var(--deny)",
  REJECTED_BY_HUMAN: "var(--deny)",
  REQUIRE_HITL: "var(--hitl)",
  BLOCKED_KILLSWITCH: "var(--kill)",
  DUPLICATE_REJECTED: "var(--duplicate)",
};

export function RiskScatter({ onSelect }: { onSelect: (e: AuditEntry) => void }) {
  const { data: entries = [] } = useQuery({
    queryKey: ["recent", 60],
    queryFn: () => fetchRecent(60),
    refetchInterval: 5000,
  });

  const points = entries
    .filter((e) => e.risk_score !== null)
    .map((e) => ({ x: e.risk_score as number, y: Math.min(e.amount ?? 0, 1500), entry: e }));

  return (
    <section className="panel flex h-full flex-col">
      <header className="border-b border-hairline px-5 py-4">
        <h2 className="section-label text-foreground">Risk Distribution</h2>
        <p className="text-[11px] text-muted-foreground">Risk score vs. transaction value</p>
      </header>
      <div className="flex-1 p-3">
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 12, bottom: 18, left: 4 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <ReferenceArea
                x1={60}
                x2={100}
                y1={300}
                y2={1500}
                fill="var(--deny)"
                fillOpacity={0.08}
                stroke="var(--deny)"
                strokeOpacity={0.2}
                label={{ value: "DANGER ZONE", fill: "var(--deny)", fontSize: 10 }}
              />
              <XAxis
                type="number"
                dataKey="x"
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                label={{ value: "Risk Score", position: "insideBottom", offset: -12, fontSize: 10 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                width={48}
                tickFormatter={(v: number) => `$${v}`}
              />
              <ZAxis range={[60, 60]} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const e = (payload[0].payload as { entry: AuditEntry }).entry;
                  return (
                    <div className="mono rounded-md glass-chip px-2.5 py-1.5 text-[11px] shadow-elevated">
                      {e.action_type} {fmtMoney(e.amount)} | Risk: {e.risk_score} |{" "}
                      {e.decision.replace("REQUIRE_", "")} | {fmtTime(e.timestamp)}
                    </div>
                  );
                }}
              />
              <Scatter
                data={points}
                onClick={(p: unknown) => {
                  const entry = (p as { entry?: AuditEntry })?.entry;
                  if (entry) onSelect(entry);
                }}
                shape={(props: unknown) => {
                  const p = props as { cx: number; cy: number; payload: { entry: AuditEntry } };
                  return (
                    <circle
                      cx={p.cx}
                      cy={p.cy}
                      r={5}
                      fill={FILL[p.payload.entry.decision] ?? "var(--info)"}
                      fillOpacity={0.85}
                      className="cursor-pointer"
                    />
                  );
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
