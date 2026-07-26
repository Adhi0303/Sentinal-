"""
Agent 2: Treasury & Liquidity Agent
=====================================
Monitors corporate cash flow and executes intraday sweeps and wire transfers.
Governed by Sentinel SDK — every action is screened through the full 6-gate pipeline.

Demo Scenario:
  - Small transfer ($5,000)        → ALLOWED automatically
  - Medium transfer ($50,000)      → REQUIRE_HITL (needs CFO approval)
  - Large transfer ($5,000,000)    → DENIED by OPA hard block

Rego Policy: trading_limits.rego
  - ≤ $10,000          → ALLOW
  - $10,001–$50,000    → REQUIRE_HITL
  - > $50,000          → DENY (hard block)
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sentinel_sdk import execute_governed_tool
import requests

BANKING_API = "http://localhost:8000/api/v1"
AGENT_ID    = "agent_treasury_001"
ACCOUNT_ID  = "corp_treasury_001"


def get_balance() -> dict:
    """Check the current treasury balance before executing any operation."""
    resp = requests.get(f"{BANKING_API}/ledger/accounts/{ACCOUNT_ID}/balance", timeout=5)
    return resp.json()


def execute_wire_transfer(to_account: str, amount: float, reference: str) -> dict:
    """
    Execute an intraday wire transfer via the Sentinel-governed SDK.
    The SDK will:
      1. Check if agent is quarantined (Gate 0)
      2. Check idempotency (Gate 0.5)
      3. Validate schema (Gate 2)
      4. Score risk based on amount (Gate 4) — large amounts = high risk
      5. Evaluate OPA trading_limits.rego (Gate 5) — may DENY or REQUIRE_HITL
      6. Only then call the Banking API (Gate 6)
    """
    return execute_governed_tool(
        agent_id    = AGENT_ID,
        action_type = "WIRE_TRANSFER",
        parameters  = {
            "from_account": ACCOUNT_ID,
            "to_account":   to_account,
            "amount":       amount,
            "reference":    reference,
            "currency":     "USD",
        }
    )


def run_demo():
    """
    Treasury Agent Demo — 3 scenarios showing Sentinel's graduated response.
    """
    print("\n" + "=" * 60)
    print("TREASURY & LIQUIDITY AGENT — SENTINEL DEMO")
    print("=" * 60)

    # --- Check balance first ---
    print("\n[TREASURY AGENT] Checking current treasury balance...")
    balance = get_balance()
    print(f"  Ledger Balance:    ${balance['ledger_balance']:,.2f}")
    print(f"  Available Balance: ${balance['available_balance']:,.2f}")

    # --- Scenario 1: Small routine transfer → ALLOW ---
    print("\n" + "-" * 60)
    print("[SCENARIO 1] Routine vendor payment — $5,000 (should be ALLOWED)")
    result1 = execute_wire_transfer(
        to_account = "corp_vendor_aws",
        amount     = 5_000.0,
        reference  = "ROUTINE-VENDOR-PMT-001"
    )
    print(f"  RESULT: {result1.get('status')} | {result1.get('reason', result1.get('message', ''))}")

    # --- Scenario 2: Medium transfer → REQUIRE_HITL ---
    print("\n" + "-" * 60)
    print("[SCENARIO 2] Mid-size sweep — $30,000 (should escalate to HITL)")
    result2 = execute_wire_transfer(
        to_account = "corp_vendor_aws",
        amount     = 30_000.0,
        reference  = "INTRADAY-SWEEP-002"
    )
    print(f"  RESULT: {result2.get('status')} | {result2.get('reason', '')}")

    # --- Scenario 3: Large transfer → DENY (OPA hard block) ---
    print("\n" + "-" * 60)
    print("[SCENARIO 3] Massive intraday sweep — $5,000,000 (should be DENIED)")
    result3 = execute_wire_transfer(
        to_account = "corp_vendor_aws",
        amount     = 5_000_000.0,
        reference  = "LARGE-SWEEP-003"
    )
    print(f"  RESULT: {result3.get('status')} | {result3.get('reason', '')}")

    print("\n" + "=" * 60)
    print("TREASURY AGENT DEMO COMPLETE")
    print("All actions are cryptographically logged in the Sentinel audit ledger.")
    print("=" * 60)


if __name__ == "__main__":
    run_demo()
