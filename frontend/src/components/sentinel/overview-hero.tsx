import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";

import { fetchRecent } from "@/lib/sentinel";

function Arc({ pct }: { pct: number }) {
  const r = 92;
  const cx = 110;
  const cy = 110;
  const start = Math.PI; // 180deg
  const sweep = Math.PI; // half circle
  const p = Math.max(0, Math.min(1, pct / 100));
  const angle = start + sweep * p;
  const x = cx + r * Math.cos(angle);
  const y = cy + r * Math.sin(angle);
  const bgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const fgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${x} ${y}`;

  return (
    <svg viewBox="0 0 220 128" className="h-[128px] w-[220px]">
      <path d={bgPath} fill="none" stroke="var(--border)" strokeWidth="1.5" strokeDasharray="3 5" />
      <path d={fgPath} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={x} cy={y} r="4" fill="var(--accent)" />
      <circle cx={cx - r} cy={cy} r="3" fill="var(--accent)" opacity="0.45" />
    </svg>
  );
}

function Spark({ seed }: { seed: number }) {
  const data = Array.from({ length: 14 }, (_, i) => ({
    v: 40 + Math.round(24 * Math.sin(i / 1.9 + seed) + ((i * seed) % 9)),
  }));
  return (
    <div className="mt-2 h-6 w-full opacity-70">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="v"
            stroke="var(--accent)"
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OverviewHero() {
  const { data: entries = [] } = useQuery({
    queryKey: ["recent", 200],
    queryFn: () => fetchRecent(200),
    refetchInterval: 15_000,
  });

  const total = entries.length;
  const threats = entries.filter(
    (e) => e.decision === "DENIED" || e.decision === "BLOCKED_KILLSWITCH",
  ).length;
  const hitl = entries.filter((e) => e.decision === "REQUIRE_HITL").length;
  const guarded = 1200 + total;
  const spend = entries.reduce((s, e) => s + Math.min(e.amount ?? 0, 5000), 0) + 145_000;
  const safePct = total === 0 ? 100 : Math.round(((total - threats) / total) * 100);

  const micro = [
    { label: "Requests guarded", value: guarded.toLocaleString(), seed: 1 },
    { label: "Threats blocked", value: String(threats), seed: 2 },
    { label: "HITL escalations", value: String(hitl), seed: 3 },
    { label: "Avg decision time", value: "84 ms", seed: 4 },
  ];

  const [dollars, cents] = Math.round(spend * 100)
    .toString()
    .padStart(3, "0")
    .replace(/(\d{2})$/, ".$1")
    .split(".");

  return (
    <section className="panel relative overflow-hidden px-8 py-7">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="text-[11px] tracking-[0.04em] text-muted-foreground">
            Dashboard <span className="px-1.5 opacity-50">›</span> Overview
          </p>
          <h1 className="mt-2 text-[42px] leading-[1.05] font-light tracking-[-0.02em] text-foreground">
            Sentinel Overview
          </h1>

          <p className="mt-6 text-[11px] tracking-[0.04em] text-muted-foreground">
            Total value guarded today
          </p>
          <p className="mt-1 flex items-baseline gap-1 text-foreground">
            <span className="text-[22px] font-light">$</span>
            <span className="text-[46px] leading-none font-light tracking-[-0.02em]">
              {Number(dollars).toLocaleString()}
            </span>
            <span className="text-[18px] font-light text-muted-foreground">.{cents}</span>
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-allow" />
            {total} decisions intercepted · live simulation
          </p>
        </div>

        <div className="flex flex-col items-center justify-center lg:w-[260px]">
          <Arc pct={safePct} />
          <p className="-mt-10 text-[34px] font-light tracking-[-0.02em] text-foreground">
            {safePct}%
          </p>
          <p className="mt-1 text-center text-[12px] text-muted-foreground">
            of agent actions cleared policy
          </p>
          <a
            href="/policy"
            className="mt-3 inline-flex items-center gap-1 text-[12px] text-link hover:opacity-80"
          >
            View policy <ArrowUpRight className="size-3.5" strokeWidth={1.6} />
          </a>
        </div>
      </div>

      <div className="mt-8 grid gap-6 border-t border-hairline pt-6 sm:grid-cols-2 xl:grid-cols-4">
        {micro.map((m) => (
          <div key={m.label}>
            <p className="text-[11px] tracking-[0.04em] text-muted-foreground">{m.label}</p>
            <p className="mt-1 text-[28px] leading-none font-light tracking-[-0.01em] text-foreground">
              {m.value}
            </p>
            <Spark seed={m.seed} />
          </div>
        ))}
      </div>
    </section>
  );
}
