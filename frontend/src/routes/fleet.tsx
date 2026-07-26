import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Zap } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/sentinel/primitives";
import { GhostBtn, Modal } from "@/components/sentinel/modal";
import { fetchFleet, fleetKill, fmtTime, isolateAgent, releaseAgent } from "@/lib/sentinel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/fleet")({
  head: () => ({
    meta: [
      { title: "Agent Fleet — Quarantine & Kill-Switch Control" },
      {
        name: "description",
        content:
          "Bird's eye view of every AI agent with per-agent quarantine and an emergency fleet kill-switch.",
      },
      { property: "og:title", content: "Agent Fleet — Sentinel Gateway" },
      {
        property: "og:description",
        content: "Isolate a rogue agent instantly or kill the entire fleet.",
      },
    ],
  }),
  component: FleetPage,
});

function FleetPage() {
  const qc = useQueryClient();
  const { data: agents = [] } = useQuery({
    queryKey: ["fleet"],
    queryFn: fetchFleet,
    refetchInterval: 10_000,
  });
  const [killOpen, setKillOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [killedAt, setKilledAt] = useState<string | null>(null);

  const mutate = useMutation({
    mutationFn: async (task: { kind: "isolate" | "release" | "kill"; id?: string }) => {
      if (task.kind === "isolate") return isolateAgent(task.id!);
      if (task.kind === "release") return releaseAgent(task.id!);
      return fleetKill();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fleet"] }),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-normal tracking-[-0.01em]">Agent Fleet</h1>
          <p className="text-[13px] text-muted-foreground">
            {agents.filter((a) => a.status === "ACTIVE").length} active ·{" "}
            {agents.filter((a) => a.status === "QUARANTINED").length} quarantined
          </p>
        </div>
        <button
          onClick={() => setKillOpen(true)}
          className="btn-pill btn-destructive text-[12px] disabled:opacity-40"
        >
          <Zap className="size-4" /> Fleet Kill-Switch
        </button>
      </header>

      {killedAt && (
        <div className="animate-flash rounded-lg border border-kill/40 bg-kill/10 px-4 py-3 text-[13px] font-semibold text-kill">
           FLEET KILL-SWITCH ACTIVATED — All agents quarantined at {killedAt} UTC
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((a) => {
          const quarantined = a.status === "QUARANTINED";
          const offline = a.status === "OFFLINE";
          return (
            <article
              key={a.agent_id}
              className={cn(
                "panel hover-lift border-l-3 p-4",
                quarantined && "border-l-deny bg-deny/4",
                !quarantined && !offline && "border-l-allow",
                offline && "border-l-info opacity-70",
              )}
            >
              <StatusPill token={quarantined ? "deny" : offline ? "info" : "allow"} pulse={quarantined}>
                {quarantined ? " Quarantined" : offline ? " Offline" : " Active"}
              </StatusPill>
              <h2 className="mono mt-3 text-[14px] font-bold text-brand">{a.agent_id}</h2>
              <p className="text-[12px] text-muted-foreground">{a.name}</p>

              <dl className="mt-4 space-y-1.5 text-[12.5px]">
                <Stat k="Requests Today" v={String(a.requests_today)} />
                <Stat k="Last Active" v={`${fmtTime(a.last_active)} UTC`} />
                <Stat k="Blocked" v={String(a.blocked)} />
                <Stat k="Avg Risk Score" v={String(a.avg_risk)} />
              </dl>

              <div className="mt-4 flex gap-2">
                {quarantined ? (
                  <button
                    onClick={() => {
                      mutate.mutate({ kind: "release", id: a.agent_id });
                      toast.success(`${a.agent_id} released`);
                    }}
                    className="btn-pill btn-secondary text-[12px] flex-1"
                  >
                     Release
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      mutate.mutate({ kind: "isolate", id: a.agent_id });
                      toast.error(`${a.agent_id} quarantined`, {
                        description: "In-flight operations compensated. Action audited.",
                      });
                    }}
                    className="btn-pill btn-destructive text-[12px] disabled:opacity-40 flex-1"
                  >
                     Quarantine
                  </button>
                )}
                <button className="rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold text-link hover:bg-accent">
                   Details
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {killOpen && (
        <Modal title=" Emergency Fleet Kill-Switch" onClose={() => setKillOpen(false)}>
          <p className="text-[13px] text-muted-foreground">
            This will immediately quarantine ALL {agents.length} agents. All in-flight operations
            will be compensated. This action is logged to the immutable audit ledger.
          </p>
          <label className="mt-4 block text-[12px] font-semibold text-muted-foreground">
            Type "CONFIRM KILL" to proceed
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mono mt-1.5 w-full rounded-md border border-border bg-surface-elevated p-2.5 text-[13px] outline-none focus:border-deny"
            placeholder="CONFIRM KILL"
          />
          <div className="mt-4 flex justify-end gap-2">
            <GhostBtn onClick={() => setKillOpen(false)}>Cancel</GhostBtn>
            <button
              disabled={confirmText !== "CONFIRM KILL"}
              onClick={() => {
                mutate.mutate({ kind: "kill" });
                setKilledAt(fmtTime(new Date().toISOString()));
                setKillOpen(false);
                setConfirmText("");
                toast.error("Fleet kill-switch executed", {
                  description: "Every agent is now quarantined.",
                });
              }}
              className="btn-pill btn-destructive text-[12px] disabled:opacity-40"
            >
               Execute Fleet Kill
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="mono">{v}</dd>
    </div>
  );
}
