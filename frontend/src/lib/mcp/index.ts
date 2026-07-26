import { defineMcp } from "@lovable.dev/mcp-js";
import recentDecisions from "./tools/recent-decisions";
import fleetStatus from "./tools/fleet-status";
import evaluatePolicyTool from "./tools/evaluate-policy";
import verifyAuditChain from "./tools/verify-audit-chain";
import complianceReport from "./tools/compliance-report";
import listPolicies from "./tools/list-policies";

export default defineMcp({
  name: "sentinel-gateway-mcp",
  title: "Sentinel Gateway MCP",
  version: "0.1.0",
  instructions:
    "Tools for Sentinel Gateway, an AI safety firewall for agent actions. Use `recent_decisions` to inspect the live decision feed, `fleet_status` for agent health, `evaluate_policy` to test a proposed action against the policy engine, `list_policies` to read the production rule set, `verify_audit_chain` for ledger integrity and `compliance_report` for a regulator-ready summary. All data is read-only demo telemetry.",
  tools: [
    recentDecisions,
    fleetStatus,
    evaluatePolicyTool,
    listPolicies,
    verifyAuditChain,
    complianceReport,
  ],
});
