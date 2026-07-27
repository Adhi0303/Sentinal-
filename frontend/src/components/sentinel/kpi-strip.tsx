import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, ResponsiveContainer } from "recharts";

import { fetchRecent } from "@/lib/sentinel";

function spark(seed: number) {
  return Array.from({ length: 12 }, (_, i) => ({
    v: 40 + Math.round(30 * Math.sin(i / 1.7 + seed) + ((i * seed) % 11)),
  }));
}

export function KpiStrip() {
  const { data: entries = [] } = useQuery({
    queryKey: ["recent", 200],
    queryFn: () => fetchRecent(200),
    refetchInterval: 30_000,
  });

  const guarded = entries.length;
  const threats = entries.filter(
    (e) => e.decision === "DENIED" || e.decision === "BLOCKED_KILLSWITCH",
  ).length;
  const hitl = entries.filter((e) => e.decision === "REQUIRE_HITL").length;
  const spend = entries.reduce((s, e) => s + (e.amount ?? 0), 0);

  const cards = [
    { label: "Requests Guarded", value: guarded.toLocaleString(), sub: "+12% vs last hour", seed: 1 },
    { label: "Threats Blocked", value: String(threats), sub: "Injections and schema attacks", seed: 2 },
    { label: "HITL Escalations", value: String(hitl), sub: "Awaiting manager review", seed: 3 },
    {
      label: "Spend Protected",
      value: `$${Math.round(spend).toLocaleString()}`,
      sub: "Total value guarded today",
      seed: 4,
    },
  ];

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="panel hover-lift p-6">
          <p className="section-label">{c.label}</p>
          <p className="metric-lg mt-3 text-foreground">{c.value}</p>
          <p className="mt-2 text-xs text-muted-foreground">{c.sub}</p>
          <div className="mt-4 h-10">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={spark(c.seed)}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke="var(--accent)"
                  strokeWidth={1.2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}
