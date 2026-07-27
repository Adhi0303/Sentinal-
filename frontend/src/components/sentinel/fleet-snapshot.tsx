import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ShieldAlert, ShieldCheck } from "lucide-react";

import { fetchFleet, fetchRecent } from "@/lib/sentinel";

export function FleetSnapshot() {
  const { data: fleet = [] } = useQuery({
    queryKey: ["fleet"],
    queryFn: fetchFleet,
    refetchInterval: 10_000,
  });
  const { data: entries = [] } = useQuery({
    queryKey: ["recent", 40],
    queryFn: () => fetchRecent(40),
    refetchInterval: 5000,
  });

  const active = fleet.filter((a) => a.status === "ACTIVE").length;
  const quarantined = fleet.filter((a) => a.status === "QUARANTINED").length;
  const avgRisk =
    entries.length === 0
      ? 0
      : Math.round(
          entries.reduce((s, e) => s + (e.risk_score ?? 0), 0) / Math.max(1, entries.length),
        );

  return (
    <section className="panel-dark flex h-full flex-col p-8">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-[16px] font-medium text-white">Agent Fleet</h2>
        <span className="text-[13px] text-white/70 bg-white/10 px-3 py-1 rounded-full">{active} Active</span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-[20px] bg-white/10 p-5 backdrop-blur-md">
          <p className="text-[12px] uppercase tracking-wider text-white/60 mb-1">Average Risk</p>
          <div className="flex items-baseline gap-2">
            <p className="text-[36px] leading-none font-light text-white">{avgRisk}</p>
            <span className="text-[14px] text-white/60">/ 100</span>
          </div>
        </div>
        <div className="rounded-[20px] bg-white/10 p-5 backdrop-blur-md">
          <p className="text-[12px] uppercase tracking-wider text-white/60 mb-1">Quarantined</p>
          <p className="text-[36px] leading-none font-light text-white">{quarantined}</p>
        </div>
      </div>

      <ul className="flex-1 space-y-2">
        {fleet.slice(0, 5).map((a) => (
          <li key={a.agent_id} className="flex items-center gap-4 py-2 px-3 hover:bg-white/5 rounded-[12px] transition-colors">
            <div className={`grid size-8 place-items-center rounded-full shadow-inner ${a.status === 'ACTIVE' ? 'bg-[#578d72]/20 text-[#578d72]' : 'bg-[#b06266]/20 text-[#b06266]'}`}>
              {a.status === 'ACTIVE' ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
            </div>
            <span className="text-[14px] font-medium text-white/90">{a.name}</span>
            <span className="mono ml-auto text-[12px] text-white/50">
              {a.requests_today} req
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-6">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-allow shadow-[0_0_8px_rgba(87,141,114,0.6)]" />
          <span className="text-[13px] text-white/70">Hash chain intact</span>
        </div>
        <Link
          to="/fleet"
          className="bg-white/10 hover:bg-white/20 text-white rounded-full px-5 py-2 text-[13px] transition-colors backdrop-blur-sm"
        >
          Manage fleet
        </Link>
      </div>
    </section>
  );
}
