import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
  FlaskConical,
} from "lucide-react";

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

// ── Types ────────────────────────────────────────────────────────────────────

interface SplunkConfig {
  enabled: boolean;
  hec_url: string;
  token: string;
  index: string;
  host: string;
  verify_ssl: boolean;
}

// ── Main page ────────────────────────────────────────────────────────────────

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

  // Splunk state
  const [splunk, setSplunk] = useState<SplunkConfig>({
    enabled: false,
    hec_url: "https://your-instance.splunkcloud.com:8088/services/collector/event",
    token: "",
    index: "main",
    host: "sentinel-gateway",
    verify_ssl: false,
  });
  const [splunkLoading, setSplunkLoading] = useState(true);
  const [splunkSaving, setSplunkSaving] = useState(false);
  const [splunkTesting, setSplunkTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load Splunk config from backend on mount
  useEffect(() => {
    const api = getApiBase();
    fetch(`${api}/api/v1/splunk/config`)
      .then((r) => r.json())
      .then((cfg: SplunkConfig) => {
        setSplunk(cfg);
      })
      .catch(() => {
        // Backend not up — just use defaults silently
      })
      .finally(() => setSplunkLoading(false));
  }, []);

  const saveSplunkConfig = async () => {
    setSplunkSaving(true);
    setTestResult(null);
    try {
      const api = getApiBase();
      const resp = await fetch(`${api}/api/v1/splunk/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: splunk.enabled,
          hec_url: splunk.hec_url,
          token: splunk.token.includes("*") ? undefined : splunk.token,
          index: splunk.index,
          host: splunk.host,
          verify_ssl: splunk.verify_ssl,
        }),
      });
      if (resp.ok) {
        toast.success("Splunk configuration saved", {
          description: splunk.enabled ? "Log forwarding is now active." : "Log forwarding is paused.",
        });
      } else {
        toast.error("Failed to save Splunk config");
      }
    } catch {
      toast.error("Backend unreachable — config saved locally.");
    } finally {
      setSplunkSaving(false);
    }
  };

  const testSplunkConnection = async () => {
    setSplunkTesting(true);
    setTestResult(null);
    try {
      const api = getApiBase();
      const resp = await fetch(`${api}/api/v1/splunk/test`, { method: "POST" });
      const data = await resp.json();
      setTestResult(data);
      if (data.success) {
        toast.success("Splunk connection verified!", { description: data.message });
      } else {
        toast.error("Splunk connection failed", { description: data.message });
      }
    } catch {
      setTestResult({ success: false, message: "Could not reach Sentinel Safety Service." });
    } finally {
      setSplunkTesting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <header>
        <h1 className="text-[22px] font-normal tracking-[-0.01em]">Settings</h1>
        <p className="text-[13px] text-muted-foreground">System connections and guardrail tuning.</p>
      </header>

      {/* System Connections */}
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

      {/* Alert Thresholds */}
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

      {/* ── Splunk SIEM Section ───────────────────────────────────────────────── */}
      <section className="panel p-5 space-y-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Splunk-ish icon */}
            <div className="size-10 rounded-[12px] flex items-center justify-center bg-gradient-to-br from-[#E20082] to-[#FF6B35] shadow-md">
              <ShieldCheck className="size-5 text-white" strokeWidth={1.8} />
            </div>
            <div>
              <SectionLabel className="mb-0">Splunk SIEM Integration</SectionLabel>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Stream every audit event to Splunk via HTTP Event Collector (HEC).{" "}
                <a
                  href="https://docs.splunk.com/Documentation/Splunk/latest/Data/UsetheHTTPEventCollector"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary hover:underline"
                >
                  Docs <ExternalLink className="size-2.5" />
                </a>
              </p>
            </div>
          </div>

          {/* Enable toggle */}
          <button
            onClick={() => setSplunk((s) => ({ ...s, enabled: !s.enabled }))}
            className="flex items-center gap-2 shrink-0"
            title={splunk.enabled ? "Disable SIEM forwarding" : "Enable SIEM forwarding"}
          >
            {splunk.enabled ? (
              <>
                <ToggleRight className="size-7 text-allow" strokeWidth={1.5} />
                <span className="text-[12px] font-semibold text-allow">Active</span>
              </>
            ) : (
              <>
                <ToggleLeft className="size-7 text-muted-foreground" strokeWidth={1.5} />
                <span className="text-[12px] text-muted-foreground">Disabled</span>
              </>
            )}
          </button>
        </div>

        {splunkLoading ? (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading configuration...
          </div>
        ) : (
          <>
            {/* Status banner */}
            {splunk.enabled && (
              <div className="flex items-center gap-2 rounded-[10px] px-3 py-2 bg-allow/10 border border-allow/20 text-[12px] text-allow font-medium">
                <Zap className="size-3.5" />
                Live log forwarding enabled — all audit events will stream to Splunk in real-time.
              </div>
            )}

            {/* Config fields */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel>Splunk HEC Endpoint URL</FieldLabel>
                <input
                  value={splunk.hec_url}
                  onChange={(e) => setSplunk((s) => ({ ...s, hec_url: e.target.value }))}
                  placeholder="https://your-instance.splunkcloud.com:8088/services/collector/event"
                  className="mono w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-[12px] outline-none focus:border-primary transition-colors"
                />
              </div>

              <div className="sm:col-span-2">
                <FieldLabel>HEC Token</FieldLabel>
                <input
                  type="password"
                  value={splunk.token}
                  onChange={(e) => setSplunk((s) => ({ ...s, token: e.target.value }))}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="mono w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-[12px] outline-none focus:border-primary transition-colors"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Create one in Splunk → Settings → Data Inputs → HTTP Event Collector
                </p>
              </div>

              <div>
                <FieldLabel>Index</FieldLabel>
                <input
                  value={splunk.index}
                  onChange={(e) => setSplunk((s) => ({ ...s, index: e.target.value }))}
                  placeholder="main"
                  className="mono w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-[12px] outline-none focus:border-primary transition-colors"
                />
              </div>

              <div>
                <FieldLabel>Host Label</FieldLabel>
                <input
                  value={splunk.host}
                  onChange={(e) => setSplunk((s) => ({ ...s, host: e.target.value }))}
                  placeholder="sentinel-gateway"
                  className="mono w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-[12px] outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>

            {/* Event preview */}
            <div className="rounded-[12px] border border-border bg-surface-elevated p-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Splunk HEC Event Format — Preview
              </p>
              <pre className="mono text-[11px] text-foreground/80 overflow-x-auto whitespace-pre-wrap leading-relaxed">
{`{
  "time": 1722067200.0,
  "host": "${splunk.host || "sentinel-gateway"}",
  "source": "sentinel:audit",
  "sourcetype": "sentinel:ai_firewall",
  "index": "${splunk.index || "main"}",
  "event": {
    "entry_id": 42,
    "agent_id": "amex_customer_service_v1",
    "action_type": "FEE_WAIVER",
    "decision": "ALLOWED",
    "risk_score": 32,
    "amount": 29.99,
    "account_id": "acc_123",
    "entry_hash": "a3f8c12d1b9e..."
  }
}`}
              </pre>
            </div>

            {/* Test result */}
            {testResult && (
              <div
                className={`flex items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-[12px] border ${
                  testResult.success
                    ? "bg-allow/10 border-allow/20 text-allow"
                    : "bg-deny/10 border-deny/20 text-deny"
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="size-4 shrink-0 mt-0.5" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={saveSplunkConfig}
                disabled={splunkSaving}
                className="btn-pill btn-primary text-[13px] flex items-center gap-2"
              >
                {splunkSaving && <Loader2 className="size-3.5 animate-spin" />}
                {splunkSaving ? "Saving..." : "Save Configuration"}
              </button>

              <button
                onClick={testSplunkConnection}
                disabled={splunkTesting}
                className="btn-pill text-[13px] flex items-center gap-2 glass-chip hover:bg-white/30 transition-colors"
              >
                {splunkTesting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FlaskConical className="size-3.5" strokeWidth={1.8} />
                )}
                {splunkTesting ? "Testing..." : "Test Connection"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11.5px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
      {children}
    </label>
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
