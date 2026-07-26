import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { evaluatePolicy } from "@/lib/sentinel";

export default defineTool({
  name: "evaluate_policy",
  title: "Evaluate policy",
  description:
    "Run a proposed agent action through the Sentinel Gateway policy engine and return the decision, matched rule and reason.",
  inputSchema: {
    action_type: z.string().describe("Action type, e.g. issue_refund or transfer_funds."),
    amount: z.number().describe("Dollar amount involved in the action."),
    risk_score: z.number().min(0).max(100).describe("Risk score from 0 (safe) to 100 (critical)."),
    reason: z.string().default("").describe("Business justification supplied by the agent."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ action_type, amount, risk_score, reason }) => {
    const result = await evaluatePolicy({
      action_type,
      amount,
      risk_score,
      reason: reason ?? "",
    });
    return {
      content: [
        { type: "text", text: `${result.decision} — ${result.rule}: ${result.reason}` },
      ],
      structuredContent: { ...result },
    };
  },
});
