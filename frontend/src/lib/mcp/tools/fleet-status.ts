import { defineTool } from "@lovable.dev/mcp-js";
import { fetchFleet } from "@/lib/sentinel";

export default defineTool({
  name: "fleet_status",
  title: "Fleet status",
  description:
    "Report the status of every AI agent in the Sentinel Gateway fleet: active or quarantined, request volume, blocked count and average risk.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const agents = await fetchFleet();
    const summary = {
      total: agents.length,
      active: agents.filter((a) => a.status === "ACTIVE").length,
      quarantined: agents.filter((a) => a.status === "QUARANTINED").length,
      agents,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: { ...summary },
    };
  },
});
