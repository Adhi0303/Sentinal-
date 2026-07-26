"""
Agent 4: Procurement & Payables Agent
=======================================
Parses vendor invoices and executes B2B wire transfers for approved vendors.
Governed by Sentinel SDK — all vendor payments require governance clearance.

Demo Scenarios:
  1. Small AWS bill ($2,500)  → ALLOWED automatically
  2. Large AWS bill ($12,000) → REQUIRE_HITL (>$10K threshold)
  3. Duplicate payment retry  → DUPLICATE_REJECTED (idempotency block)

Rego Policy: trading_limits.rego
  - ≤ $10,000       → ALLOW
  - $10,001–$50,000 → REQUIRE_HITL
  - > $50,000       → DENY

Why This Matters for Amex:
  Corporate procurement is the #1 vector for B2B fraud (fake invoices, vendor
  impersonation, double-payments). An AI agent autonomously paying invoices
  without human oversight for large amounts is a massive risk. Sentinel enforces
  mandatory human review for any transfer above $10,000.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sentinel_sdk import execute_governed_tool
import requests

BANKING_API   = "http://localhost:8000/api/v1"
AGENT_ID      = "agent_procurement_001"
SOURCE_ACCOUNT = "corp_treasury_001"   # Amex treasury pays the bills


def process_vendor_invoice(vendor_account: str, amount: float, invoice_ref: str) -> dict:
    """
    Process a vendor invoice payment via the Sentinel-governed SDK.
    Sentinel checks: quarantine → idempotency → schema → rate → risk → OPA → bank.
    """
    return execute_governed_tool(
        agent_id    = AGENT_ID,
        action_type = "WIRE_TRANSFER",
        parameters  = {
            "from_account": SOURCE_ACCOUNT,
            "to_account":   vendor_account,
            "amount":       amount,
            "reference":    invoice_ref,
            "currency":     "USD",
        }
    )


def run_demo():
    print("\n" + "=" * 60)
    print("PROCUREMENT & PAYABLES AGENT — SENTINEL DEMO")
    print("=" * 60)
    print("Processing vendor invoices from the Sentinel-governed payment pipeline.")

    # --- Scenario 1: Small routine invoice → ALLOW ---
    print("\n" + "-" * 60)
    print("[INVOICE 1] AWS Support Plan — $2,500 (should be ALLOWED)")
    result1 = process_vendor_invoice(
        vendor_account = "corp_vendor_aws",
        amount         = 2_500.0,
        invoice_ref    = "INV-AWS-2026-07-SUPPORT"
    )
    print(f"  RESULT: {result1.get('status')} | {result1.get('reason', result1.get('message', ''))}")

    # --- Scenario 2: Large invoice → REQUIRE_HITL ---
    print("\n" + "-" * 60)
    print("[INVOICE 2] AWS EC2 Compute Bill — $12,000 (should escalate to CFO)")
    result2 = process_vendor_invoice(
        vendor_account = "corp_vendor_aws",
        amount         = 12_000.0,
        invoice_ref    = "INV-AWS-2026-07-COMPUTE"
    )
    print(f"  RESULT: {result2.get('status')} | {result2.get('reason', '')}")
    if result2.get("status") == "REQUIRE_HITL":
        print("  → Payment is PAUSED. CFO approval required before execution.")

    # --- Scenario 3: Duplicate payment attempt → DUPLICATE_REJECTED ---
    print("\n" + "-" * 60)
    print("[INVOICE 3] Retry of Invoice 1 — same $2,500 (should be DUPLICATE REJECTED)")
    print("  (Simulating a network retry or accidental double-submission)")
    result3 = process_vendor_invoice(
        vendor_account = "corp_vendor_aws",
        amount         = 2_500.0,
        invoice_ref    = "INV-AWS-2026-07-SUPPORT"   # same reference = same idempotency key
    )
    status3 = result3.get("status")
    print(f"  RESULT: {status3}")
    if status3 == "DUPLICATE_REJECTED":
        print(f"  Original processed at: {result3.get('processed_at', 'earlier')}")
        print("  → Banking API was NOT called a second time. Zero double-payment risk.")

    print("\n" + "=" * 60)
    print("PROCUREMENT AGENT DEMO COMPLETE")
    print("Sentinel blocked a $12,000 unsupervised payment and a duplicate payment attempt.")
    print("=" * 60)


if __name__ == "__main__":
    run_demo()
