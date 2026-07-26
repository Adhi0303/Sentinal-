import { defineTool } from "@lovable.dev/mcp-js";
import { verifyChain } from "@/lib/sentinel";

export default defineTool({
  name: "verify_audit_chain",
  title: "Verify audit chain",
  description:
    "Verify the cryptographic hash chain of the Sentinel Gateway audit ledger and report whether it is intact.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const result = await verifyChain();
    return {
      content: [
        {
          type: "text",
          text: result.intact
            ? `Chain intact across ${result.total_entries} entries (verified ${result.verified_at}).`
            : `Chain BROKEN at entry ${result.break_at} of ${result.total_entries}.`,
        },
      ],
      structuredContent: { ...result },
    };
  },
});
