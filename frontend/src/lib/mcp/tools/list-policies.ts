import { defineTool } from "@lovable.dev/mcp-js";
import { SEED_POLICIES, activeRules } from "@/lib/policy-store";

export default defineTool({
  name: "list_policies",
  title: "List policies",
  description:
    "List the Sentinel Gateway policy documents with their live version number and the rules currently in production.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const policies = SEED_POLICIES.map((p) => ({
      id: p.id,
      file: p.file,
      scope: p.scope,
      active_version: p.activeVersion,
      versions: p.versions.length,
      rules: activeRules(p),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(policies, null, 2) }],
      structuredContent: { policies },
    };
  },
});
