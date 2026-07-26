import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  ClipboardCheck,
  Cpu,
  FileBarChart,
  Gauge,
  Scale,
  Settings as SettingsIcon,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { fetchFleet, fetchRecent } from "@/lib/sentinel";
import { Dot } from "./primitives";

const NAV: Array<{ to: string; label: string; icon: typeof Gauge; badge?: boolean }> = [
  { to: "/", label: "Overview", icon: Gauge },
  { to: "/traffic", label: "Live Traffic", icon: Activity },
  { to: "/hitl", label: "HITL Queue", icon: ClipboardCheck, badge: true },
  { to: "/fleet", label: "Agent Fleet", icon: Cpu },
  { to: "/policy", label: "Policy Engine", icon: Scale },
  { to: "/audit", label: "Audit Ledger", icon: ShieldCheck },
  { to: "/report", label: "Compliance Report", icon: FileBarChart },
  { to: "/demo", label: "Demo Sandbox", icon: TerminalSquare },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
        }) + " UTC",
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const { data: fleet = [] } = useQuery({
    queryKey: ["fleet"],
    queryFn: fetchFleet,
    refetchInterval: 10_000,
  });
  const { data: recent = [] } = useQuery({
    queryKey: ["recent", 100],
    queryFn: () => fetchRecent(100),
    refetchInterval: 5000,
  });

  const active = fleet.filter((a) => a.status === "ACTIVE").length;
  const quarantined = fleet.filter((a) => a.status === "QUARANTINED").length;
  const pendingHitl = recent.filter((e) => e.decision === "REQUIRE_HITL").length;
  const systemToken =
    fleet.length > 0 && active === 0 ? "kill" : quarantined > 0 ? "hitl" : "allow";
  const systemLabel =
    fleet.length > 0 && active === 0
      ? "FLEET HALTED"
      : quarantined > 0
        ? "DEGRADED"
        : "SYSTEM ONLINE";

  const navItem = (item: { to: string; label: string; icon: typeof Gauge; badge?: boolean }) => {
    const isActive = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
    return (
      <Link
        key={item.to}
        to={item.to as never}
        className={cn(
          "relative mx-3 flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] transition-colors duration-200",
          isActive
            ? "bg-secondary font-medium text-foreground"
            : "font-normal text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
        )}
      >
        {isActive && (
          <span className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
        )}
        <item.icon className="size-4" strokeWidth={1.6} />
        {item.label}
        {item.badge && pendingHitl > 0 && (
          <span className="mono ml-auto text-[11px] text-muted-foreground">{pendingHitl}</span>
        )}
      </Link>
    );
  };

  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-5 border-b border-border bg-card px-6">
        <Link to="/" className="flex items-center gap-2">
          <ShieldCheck className="size-[18px] text-accent" strokeWidth={1.6} />
          <span className="text-[16px] font-normal tracking-tight text-foreground">Sentinel</span>
        </Link>

        <span className="ml-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Dot token={systemToken} />
          {systemLabel}
        </span>

        <Link to="/fleet" className="hidden text-xs text-muted-foreground/80 md:block">
          {active} Agents Active
          {quarantined > 0 ? ` · ${quarantined} Quarantined` : ""}
        </Link>

        <div className="ml-auto flex items-center gap-5">
          <span className="hidden text-xs text-muted-foreground/80 lg:block">{clock}</span>
          <span className="grid size-8 place-items-center rounded-full bg-accent-light text-[12px] font-normal text-accent">
            A
          </span>
        </div>
      </header>

      <aside className="fixed top-14 bottom-0 left-0 z-30 w-[232px] border-r border-border bg-card py-5">
        <nav className="flex flex-col gap-0.5">{NAV.map(navItem)}</nav>
        <div className="mx-3 my-4 h-px bg-border" />
        {navItem({ to: "/settings", label: "Settings", icon: SettingsIcon })}

        <p className="absolute right-5 bottom-5 left-5 text-[11px] leading-relaxed tracking-[0.02em] text-muted-foreground/70">
          Every AI decision.
          <br />
          Mathematically justified.
        </p>
      </aside>

      <main className="pt-14 pl-[232px]">
        <div key={pathname} className="animate-fade-in p-8 lg:p-10">{children}</div>
      </main>
    </div>
  );
}
