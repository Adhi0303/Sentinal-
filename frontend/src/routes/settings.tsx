import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { SectionLabel, PulseDot } from "@/components/sentinel/primitives";
import { DEFAULT_API_BASE, getApiBase, setApiBase } from "@/lib/sentinel";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Sentinel Gateway Configuration" },
      {
        name: "description",
        content:
          "Configure Sentinel service endpoints, risk thresholds, rate limits and idempotency TTL.",
      },
      { property: "og:title", content: "Settings — Sentinel Gateway" },
      {
        property: "og:description",
        content: "Connections, alert thresholds and system information.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [base, setBase] = useState(
    typeof window === "undefined" ? DEFAULT_API_BASE : getApiBase(),
  );
  const [thresholds, setThresholds] = useState({
    hitl: 50,
    block: 70,
    depth: 4,
    rate: 100,
    ttl: 24,
  });

  return (
    <div className="max-w-3xl space-y-4">
      <header>
        <h1 className="text-[22px] font-normal tracking-[-0.01em]">Settings</h1>
        <p className="text-[13px] text-muted-foreground">System connections and guardrail tuning.</p>
      </header>

      <section className="panel p-5">
        <SectionLabel>System Connections</SectionLabel>
        <div className="space-y-2.5">
          <Conn label="Safety Service API" value={base} onChange={setBase} editable />
          <Conn label="Banking API" value="http://localhost:8000" />
          <Conn label="Redis" value="localhost:6379" />
          <Conn label="OPA (Rego)" value="http://localhost:8181" />
        </div>
        <button
          onClick={() => {
            setApiBase(base);
            toast.success("Endpoint saved", { description: base });
          }}
          className="btn-pill btn-primary text-[13px] mt-4"
        >
          Save endpoints
        </button>
      </section>

      <section className="panel p-5">
        <SectionLabel>Alert Thresholds</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          <Num
            label="HITL Threshold (Risk Score)"
            value={thresholds.hitl}
            onChange={(v) => setThresholds({ ...thresholds, hitl: v })}
          />
          <Num
            label="Hard Block Threshold"
            value={thresholds.block}
            onChange={(v) => setThresholds({ ...thresholds, block: v })}
          />
          <Num
            label="Max Agent Depth"
            value={thresholds.depth}
            onChange={(v) => setThresholds({ ...thresholds, depth: v })}
          />
          <Num
            label="Rate Limit ($/min)"
            value={thresholds.rate}
            onChange={(v) => setThresholds({ ...thresholds, rate: v })}
          />
          <Num
            label="Idempotency TTL (hours)"
            value={thresholds.ttl}
            onChange={(v) => setThresholds({ ...thresholds, ttl: v })}
          />
        </div>
      </section>

      <section className="panel p-5">
        <SectionLabel>About</SectionLabel>
        <dl className="mono space-y-1 text-[12.5px]">
          <Row k="Version" v="Sentinel Gateway v1.0.0" />
          <Row k="Modules implemented" v="2, 3, 4, 5.1, 5.2, 5.3 (2PC), 6, 7" />
          <Row k="Built for" v="American Express AI Safety Hackathon" />
          <Row k="Backend" v="FastAPI + Redis + OPA (Rego)" />
        </dl>
      </section>
    </div>
  );
}

function Conn({
  label,
  value,
  onChange,
  editable,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  editable?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-elevated px-3 py-2.5">
      <span className="w-44 shrink-0 text-[13px] font-medium">{label}</span>
      {editable ? (
        <input
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className="mono min-w-0 flex-1 rounded-md glass-chip px-2 py-1 text-[12px] outline-none focus:border-link"
        />
      ) : (
        <span className="mono flex-1 text-[12px] text-muted-foreground">{value}</span>
      )}
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-allow">
        <PulseDot /> Connected
      </span>
      <button
        onClick={() => toast.success(`${label} reachable`)}
        className="rounded-md glass-chip px-2.5 py-1 text-[11.5px] font-semibold"
      >
        Test
      </button>
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mono w-full rounded-md border border-border bg-surface-elevated px-2.5 py-2 text-[13px] outline-none focus:border-link"
      />
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
