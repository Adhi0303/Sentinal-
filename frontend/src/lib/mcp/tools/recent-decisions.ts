import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fetchRecent } from "@/lib/sentinel";

export default defineTool({
  name: "recent_decisions",
  title: "Recent decisions",
  description:
    "List the most recent Sentinel Gateway safety decisions (allow, deny, human-review) with risk score, gate, reason and hash.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(10).describe("How many entries to return."),
    decision: z
      .string()
      .optional()
      .describe("Optional decision filter, e.g. ALLOWED, DENIED, REQUIRE_HITL."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, decision }) => {
    let entries = await fetchRecent(limit ?? 10);
    if (decision) {
      const want = decision.toUpperCase();
      entries = entries.filter((e) => e.decision === want);
    }
    const rows = entries.map((e) => ({
      entry_id: e.entry_id,
      timestamp: e.timestamp,
      agent_id: e.agent_id,
      action_type: e.action_type,
      amount: e.amount,
      risk_score: e.risk_score,
      decision: e.decision,
      gate_failed: e.gate_failed,
      reason: e.reason,
      hash: e.hash.slice(0, 16),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { entries: rows },
    };
  },
});
