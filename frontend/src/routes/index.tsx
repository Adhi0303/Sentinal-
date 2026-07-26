import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ExecutionGraph } from "@/components/sentinel/execution-graph";
import { OverviewHero } from "@/components/sentinel/overview-hero";
import { FleetSnapshot } from "@/components/sentinel/fleet-snapshot";
import { LiveFeed } from "@/components/sentinel/live-feed";
import { OpaActivity } from "@/components/sentinel/opa-activity";
import { RiskScatter } from "@/components/sentinel/risk-scatter";
import { EntryDrawer } from "@/components/sentinel/entry-drawer";
import type { AuditEntry } from "@/lib/sentinel";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — Sentinel Gateway AI Safety Console" },
      {
        name: "description",
        content:
          "Real-time overview of guarded AI agent requests, blocked threats, HITL escalations and protected spend.",
      },
      { property: "og:title", content: "Overview — Sentinel Gateway" },
      {
        property: "og:description",
        content: "Live monitor for every intercepted AI agent decision.",
      },
    ],
  }),
  component: Overview,
});

function Overview() {
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  return (
    <div className="space-y-6">
      <OverviewHero />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <LiveFeed onSelect={setSelected} />
        <FleetSnapshot />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="space-y-6">
          <ExecutionGraph />
          <OpaActivity />
        </div>
        <RiskScatter onSelect={setSelected} />
      </div>


      <EntryDrawer entry={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
