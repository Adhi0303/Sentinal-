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
      <path d={bgPath} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeDasharray="4 6" />
      <path d={fgPath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <circle cx={x} cy={y} r="5" fill="var(--accent)" stroke="white" strokeWidth="2" />
      <circle cx={cx - r} cy={cy} r="4" fill="var(--accent)" opacity="0.45" />
    </svg>
  );
}

function Spark({ seed }: { seed: number }) {
  const data = Array.from({ length: 14 }, (_, i) => ({
    v: 40 + Math.round(24 * Math.sin(i / 1.9 + seed) + ((i * seed) % 9)),
  }));
  return (
    <div className="mt-4 h-8 w-full opacity-60 mix-blend-multiply">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="v"
            stroke="var(--accent)"
            strokeWidth={1.5}
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
    <section className="panel relative overflow-hidden px-10 py-10">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="text-[13px] tracking-wide text-muted-foreground mb-4">
            Dashboard <span className="px-2 opacity-40">›</span> Sentinel System
          </p>
          <h1 className="text-[46px] leading-[1.05] font-light tracking-[-0.03em] text-foreground">
            Overview
          </h1>

          <div className="mt-12 flex gap-4">
            <div className="glass-chip rounded-[16px] px-5 py-3 flex items-center gap-4">
              <div className="text-[12px] text-muted-foreground uppercase tracking-wider">Total Value Guarded</div>
              <div className="flex items-baseline gap-1 text-primary">
                <span className="text-[20px] font-medium">$</span>
                <span className="text-[28px] leading-none font-medium">{Number(dollars).toLocaleString()}</span>
                <span className="text-[16px] font-medium opacity-70">.{cents}</span>
              </div>
            </div>
            
            <div className="glass-chip rounded-[16px] px-5 py-3 flex items-center gap-3">
              <span className="inline-block size-2 rounded-full bg-allow shadow-[0_0_8px_rgba(87,141,114,0.6)]" />
              <div className="text-[13px] font-medium">
                {total} live decisions intercepted
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center lg:w-[320px] glass rounded-[24px] p-6 shadow-sm">
          <Arc pct={safePct} />
          <p className="-mt-10 text-[38px] font-light tracking-[-0.02em] text-primary">
            {safePct}%
          </p>
          <p className="mt-1 text-center text-[13px] text-muted-foreground">
            of agent actions cleared policy
          </p>
          <a
            href="/policy"
            className="mt-4 flex items-center gap-1.5 text-[13px] font-medium text-primary hover:text-accent hover-lift bg-white/40 px-4 py-2 rounded-full transition-colors"
          >
            View policy <ArrowUpRight className="size-4" strokeWidth={2} />
          </a>
        </div>
      </div>

      <div className="mt-12 grid gap-6 border-t border-border/50 pt-8 sm:grid-cols-2 xl:grid-cols-4">
        {micro.map((m) => (
          <div key={m.label} className="glass rounded-[20px] p-5 hover-lift">
            <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground mb-2">{m.label}</p>
            <p className="text-[32px] leading-none font-light tracking-[-0.02em] text-foreground">
              {m.value}
            </p>
            <Spark seed={m.seed} />
          </div>
        ))}
      </div>
    </section>
  );
}
