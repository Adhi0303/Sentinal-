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
  Bell,
  Mail,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { fetchFleet, fetchRecent } from "@/lib/sentinel";
import { Dot } from "./primitives";

const NAV: Array<{ to: string; label: string; icon: typeof Gauge; badge?: boolean }> = [
  { to: "/", label: "Home", icon: Gauge },
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
  const [isCollapsed, setIsCollapsed] = useState(false);

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
          "relative flex items-center gap-3 rounded-[12px] py-2.5 transition-all duration-200",
          isCollapsed ? "mx-4 justify-center px-0" : "mx-4 px-4",
          isActive
            ? "text-primary font-medium bg-white/40 shadow-sm backdrop-blur-md"
            : "font-normal text-muted-foreground hover:bg-white/20 hover:text-foreground",
        )}
        title={isCollapsed ? item.label : undefined}
      >
        {isActive && !isCollapsed && (
          <span className="absolute left-2 top-1/2 h-5 w-[4px] -translate-y-1/2 rounded-full bg-accent" />
        )}
        {isActive && isCollapsed && (
          <span className="absolute left-1 top-1/2 h-5 w-[4px] -translate-y-1/2 rounded-full bg-accent" />
        )}
        <item.icon className="size-4 shrink-0" strokeWidth={1.8} />
        {!isCollapsed && <span className="truncate">{item.label}</span>}
        {item.badge && pendingHitl > 0 && !isCollapsed && (
          <span className="mono ml-auto text-[12px] text-muted-foreground">{pendingHitl}</span>
        )}
        {item.badge && pendingHitl > 0 && isCollapsed && (
          <span className="absolute top-1 right-2 size-2 rounded-full bg-red-500" />
        )}
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex text-foreground">
      {/* Floating Glass Sidebar */}
      <aside 
        className={cn(
          "fixed top-6 bottom-6 left-6 z-30 glass rounded-[32px] py-8 flex flex-col transition-all duration-300 ease-in-out overflow-hidden",
          isCollapsed ? "w-[88px]" : "w-[260px]"
        )}
      >
        <div className={cn("flex items-center mb-10", isCollapsed ? "justify-center px-0 flex-col gap-4" : "justify-between px-8")}>
          <Link to="/" className={cn("flex items-center gap-2.5", isCollapsed && "justify-center")}>
            {!isCollapsed && <span className="text-[20px] font-medium tracking-tight text-foreground">Sentinel</span>}
          </Link>
          
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)} 
            className="grid size-8 place-items-center hover:bg-white/40 rounded-full transition-colors text-muted-foreground hover:text-foreground glass-chip"
          >
            {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>

        <nav className="flex flex-col gap-1">{NAV.map(navItem)}</nav>
        
        <div className={cn("my-6 h-px bg-border/50 transition-all", isCollapsed ? "mx-4" : "mx-8")} />
        
        <nav className="flex flex-col gap-1">
          {navItem({ to: "/settings", label: "Settings", icon: SettingsIcon })}
        </nav>

        <div className={cn("mt-auto", isCollapsed ? "px-4" : "px-8")}>
          <div className={cn("glass-chip rounded-[16px] flex flex-col gap-2", isCollapsed ? "p-3 items-center" : "p-4")}>
            <div className={cn("flex items-center gap-2 font-medium", isCollapsed ? "justify-center" : "text-[13px]")}>
              <Dot token={systemToken} />
              {!isCollapsed && systemLabel}
            </div>
            {!isCollapsed && (
              <div className="text-[12px] text-muted-foreground">
                {active} Agents Active
                {quarantined > 0 && <br />}
                {quarantined > 0 && `${quarantined} Quarantined`}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={cn("flex-1 min-w-0 transition-all duration-300 ease-in-out", isCollapsed ? "pl-[124px]" : "pl-[296px]")}>
        {/* Top Header Area - No longer sticky so it scrolls away naturally */}
        <header className="relative z-20 flex h-24 items-center px-10">
          <div className="flex-1" />
          
          {/* Top Right Controls */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 mr-4">
              <button className="grid size-10 place-items-center rounded-full glass hover-lift text-muted-foreground hover:text-foreground">
                <Mail className="size-4" strokeWidth={1.8} />
              </button>
              <button className="grid size-10 place-items-center rounded-full glass hover-lift text-muted-foreground hover:text-foreground">
                <Bell className="size-4" strokeWidth={1.8} />
              </button>
              <button className="grid size-10 place-items-center rounded-full glass hover-lift text-muted-foreground hover:text-foreground">
                <SettingsIcon className="size-4" strokeWidth={1.8} />
              </button>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[14px] font-medium leading-none">Security Admin</div>
                <div className="text-[12px] text-muted-foreground mt-1">{clock}</div>
              </div>
              <div className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-[14px] font-medium text-white shadow-md">
                SA
              </div>
            </div>
          </div>
        </header>

        <div key={pathname} className="animate-fade-in px-10 pb-10">{children}</div>
      </main>
    </div>
  );
}
