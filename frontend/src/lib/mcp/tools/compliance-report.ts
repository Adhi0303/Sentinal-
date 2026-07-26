import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fetchReport } from "@/lib/sentinel";

export default defineTool({
  name: "compliance_report",
  title: "Compliance report",
  description:
    "Generate a regulator-ready Sentinel Gateway compliance summary: decision totals, spend evaluated and audit chain integrity.",
  inputSchema: {
    include_log: z
      .boolean()
      .default(false)
      .describe("Include the most recent 20 ledger entries in the response."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ include_log }) => {
    const report = await fetchReport();
    const payload = {
      report_id: report.report_id,
      generated_at: report.generated_at,
      totals: report.totals,
      total_decisions: report.total_decisions,
      spend_evaluated: report.spend_evaluated,
      chain_intact: report.chain_intact,
      ...(include_log ? { log: report.log.slice(0, 20) } : {}),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: { ...payload },
    };
  },
});
