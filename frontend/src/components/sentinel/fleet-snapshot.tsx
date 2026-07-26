import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { fetchFleet, fetchRecent } from "@/lib/sentinel";
import { Dot } from "./primitives";

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
    <section className="panel-dark flex h-full flex-col p-6">
      <div className="flex items-center gap-3">
        <h2 className="text-[13px] font-normal tracking-[0.06em] text-on-dark uppercase">
          Fleet Control
        </h2>
        <span className="ml-auto text-[11px] text-on-dark-sub">{active} active</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-[14px] border border-white/10 bg-white/5 p-4">
          <p className="text-[11px] tracking-[0.04em] text-on-dark-sub">Average risk</p>
          <p className="mt-1 text-[28px] leading-none font-light text-on-dark">{avgRisk}</p>
        </div>
        <div className="rounded-[14px] border border-white/10 bg-white/5 p-4">
          <p className="text-[11px] tracking-[0.04em] text-on-dark-sub">Quarantined</p>
          <p className="mt-1 text-[28px] leading-none font-light text-on-dark">{quarantined}</p>
        </div>
      </div>

      <ul className="mt-5 flex-1 space-y-3">
        {fleet.slice(0, 5).map((a) => (
          <li key={a.agent_id} className="flex items-center gap-3">
            <Dot token={a.status === "ACTIVE" ? "allow" : "deny"} />
            <span className="truncate text-[13px] text-on-dark">{a.name}</span>
            <span className="mono ml-auto text-[11px] text-on-dark-sub">
              {a.requests_today} req
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex items-center gap-2 border-t border-white/10 pt-4">
        <Dot token="allow" />
        <span className="text-[12px] text-on-dark-sub">Hash chain intact</span>
        <Link
          to="/fleet"
          className="btn-pill ml-auto h-9 border border-white/20 px-4 text-[12px] text-on-dark"
        >
          Manage fleet
        </Link>
      </div>
    </section>
  );
}
