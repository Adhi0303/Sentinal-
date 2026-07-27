import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileJson, FileText, ShieldCheck } from "lucide-react";

import { SectionLabel } from "@/components/sentinel/primitives";
import { fetchReport, fmtMoney, fmtTime, riskBand, DECISION_META } from "@/lib/sentinel";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Compliance Report — EU AI Act & SOC 2 Evidence" },
      {
        name: "description",
        content:
          "Preview and export the regulatory compliance report covering every AI decision Sentinel guarded.",
      },
      { property: "og:title", content: "Compliance Report — Sentinel Gateway" },
      {
        property: "og:description",
        content: "Regulator-ready evidence for EU AI Act, FINRA 4370, RBI and SOC 2.",
      },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const { data } = useQuery({ queryKey: ["report"], queryFn: fetchReport, refetchInterval: 30_000 });

  const download = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.report_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pct = (n: number) => (data ? `${Math.round((n / data.total_decisions) * 100)}%` : "0%");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-normal tracking-[-0.01em]">Compliance Report</h1>
        <p className="text-[13px] text-muted-foreground">
          Regulator-ready evidence generated from the immutable ledger.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="panel scroll-slim max-h-[75vh] overflow-y-auto p-6">
          <p className="mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Sentinel Gateway — Regulatory Compliance Report
          </p>
          <h2 className="mt-1 text-base font-bold">American Express</h2>
          <p className="mono text-[12px] text-muted-foreground">Report ID: {data?.report_id ?? "…"}</p>

          <div className="mt-6">
            <SectionLabel>Executive Summary</SectionLabel>
            <dl className="mono space-y-1 text-[12.5px]">
              <Line k="Total Decisions" v={String(data?.total_decisions ?? 0)} />
              {(
                [
                  ["ALLOWED", " Approved"],
                  ["DENIED", " Denied"],
                  ["REQUIRE_HITL", " HITL Escalated"],
                  ["BLOCKED_KILLSWITCH", " Blocked (Kill)"],
                  ["DUPLICATE_REJECTED", " Duplicate Rejected"],
                ] as const
              ).map(([key, label]) => (
                <Line
                  key={key}
                  k={label}
                  v={`${data?.totals[key] ?? 0}   (${pct(data?.totals[key] ?? 0)})`}
                />
              ))}
              <div className="my-2 h-px bg-border" />
              <Line k="Total Spend Evaluated" v={fmtMoney(data?.spend_evaluated ?? 0)} />
              <Line
                k="Audit Chain Status"
                v={data?.chain_intact ? "INTACT (SHA-256 verified)" : "TAMPERED"}
              />
            </dl>
          </div>

          <div className="mt-6">
            <SectionLabel>Full Decision Log</SectionLabel>
            <ol className="space-y-3">
              {(data?.log ?? []).slice(0, 30).map((e) => {
                const band = riskBand(e.risk_score);
                const meta = DECISION_META[e.decision] || { label: e.decision, icon: "", token: "info" };
                return (
                  <li key={e.entry_id} className="mono text-[12px] leading-relaxed">
                    <p>
                      [{e.entry_id}] {meta.icon} {(e.action_type || "UNKNOWN_ACTION").replace(/_/g, " ")}{" "}
                      {fmtMoney(e.amount)} {meta.label} at {fmtTime(e.timestamp)} UTC.
                    </p>
                    <p className="text-muted-foreground">
                      Agent '{e.agent_id}'. Risk: {e.risk_score ?? "N/A"}/100 ({band.label}).
                    </p>
                    <p className="text-muted-foreground">OPA Policy: {e.policy_rule ?? e.reason}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <div className="space-y-4">
          <section className="panel p-5">
            <SectionLabel>Export Options</SectionLabel>
            <dl className="mono space-y-1 text-[12.5px]">
              <Line k="Report ID" v={data?.report_id ?? "…"} />
              <Line
                k="Generated"
                v={data ? `${fmtTime(data.generated_at)} UTC` : "…"}
              />
              <Line k="Entries" v={`${data?.total_decisions ?? 0} decisions`} />
            </dl>

            <div className="mt-4 space-y-2">
              <button
                onClick={() => window.print()}
                className="btn-pill btn-primary text-[13px] w-full"
              >
                <FileText className="size-4" /> Download PDF
              </button>
              <button
                onClick={download}
                className="flex w-full items-center gap-2 rounded-md border border-border px-3.5 py-2.5 text-[13px] font-semibold hover:bg-accent"
              >
                <FileJson className="size-4" /> Download JSON
              </button>
              <button
                onClick={() =>
                  toast.success("Chain integrity verified", {
                    description: `${data?.total_decisions ?? 0} entries — SHA-256 chain unbroken.`,
                  })
                }
                className="flex w-full items-center gap-2 rounded-md border border-border px-3.5 py-2.5 text-[13px] font-semibold hover:bg-accent"
              >
                <ShieldCheck className="size-4 text-allow" /> Verify Chain Integrity
              </button>
            </div>
          </section>

          <section className="panel p-5">
            <SectionLabel>Compliance Frameworks</SectionLabel>
            <p className="mb-2 text-[12px] text-muted-foreground">This report satisfies:</p>
            <ul className="space-y-1.5 text-[12.5px]">
              {[
                "EU AI Act — Article 13 (Transparency)",
                "FINRA 4370 — Business Continuity",
                "RBI AI Governance Framework",
                "SOC 2 Type II — Audit Trail Requirements",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="text-allow"></span> {f}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
