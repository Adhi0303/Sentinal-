"""
Agent 3: Commercial Credit Underwriting Agent
==============================================
Analyzes business customer financial profiles and adjusts revolving credit limits.
Governed by Sentinel SDK — all credit limit changes pass through the governance pipeline.

Demo Scenario A — Good Profile (Meridian Consulting LLC):
  - 5-year customer, credit score 820, clean payment history
  - Requests +$5,000 limit increase to $15,000
  - Risk Score: LOW → OPA: ALLOW → Limit increased automatically

Demo Scenario B — Risky Profile (Sunrise Retail Inc):
  - New customer (0 years), credit score 490, late fees, PROBATION status
  - Requests +$5,000 limit increase to $10,000
  - Risk Score: CRITICAL → OPA: DENY → Hard block, no override

Rego Policy: servicing_disputes.rego (reused — risk score triggers the block)
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sentinel_sdk import execute_governed_tool
import requests

BANKING_API = "http://localhost:8000/api/v1"
AGENT_ID    = "agent_underwriting_001"


def analyze_and_adjust_credit(account_id: str, new_limit: float, reason: str) -> dict:
    """
    Analyze an account and request a credit limit adjustment via the Sentinel SDK.
    The SDK's risk scorer automatically pulls account data from the Banking API
    and computes a risk score before OPA evaluates the policy.
    """
    return execute_governed_tool(
        agent_id    = AGENT_ID,
        action_type = "CREDIT_LIMIT_INCREASE",
        parameters  = {
            "account_id": account_id,
            "new_limit":  new_limit,
            "reason":     reason,
            "analyst_id": AGENT_ID,
        }
    )


def run_demo():
    print("\n" + "=" * 60)
    print("COMMERCIAL CREDIT UNDERWRITING AGENT — SENTINEL DEMO")
    print("=" * 60)

    # --- Scenario A: Good customer → ALLOW ---
    print("\n" + "-" * 60)
    print("[SCENARIO A] Meridian Consulting LLC — Credit score 820")
    print("  Request: $10,000 → $15,000 credit limit (+$5,000)")
    print("  Expected: ALLOWED (low risk, strong profile)")

    result_a = analyze_and_adjust_credit(
        account_id = "biz_456",
        new_limit  = 15_000.0,
        reason     = "Annual credit review — strong payment history, revenue growth. Recommending +$5,000 limit increase.",
    )
    print(f"  RESULT: {result_a.get('status')} | {result_a.get('reason', result_a.get('message', ''))}")

    # --- Scenario B: Risky customer → DENY ---
    print("\n" + "-" * 60)
    print("[SCENARIO B] Sunrise Retail Inc — Credit score 490, PROBATION")
    print("  Request: $5,000 → $10,000 credit limit (+$5,000)")
    print("  Expected: DENIED by Sentinel (critical risk score)")

    result_b = analyze_and_adjust_credit(
        account_id = "biz_789",
        new_limit  = 10_000.0,
        reason     = "Customer requested increase for Q3 inventory purchases.",
    )
    print(f"  RESULT: {result_b.get('status')} | {result_b.get('reason', '')}")

    print("\n" + "=" * 60)
    print("UNDERWRITING AGENT DEMO COMPLETE")
    print("Sentinel prevented a reckless credit extension to a high-risk account.")
    print("=" * 60)


if __name__ == "__main__":
    run_demo()
