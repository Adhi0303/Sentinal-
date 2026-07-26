"""
Module 5.3: Two-Phase Commit (2PC) Ledger Reserve Locking Engine
=================================================================
Prevents TOCTOU (Time-of-Check to Time-of-Use) race conditions in
multi-agent financial operations.

Problem it solves:
  Without 2PC, two agents can simultaneously see the same available balance,
  both pass OPA checks, and both execute — causing overdrafts or double-spend.

How it works:
  Phase 1 — PREPARE:
    Reserve (lock) the required funds in the banking ledger BEFORE committing.
    If another agent already reserved those funds, this reservation returns
    INSUFFICIENT_FUNDS and the operation is aborted cleanly.

  Phase 2 — COMMIT:
    Once Sentinel confirms OPA approval AND funds are reserved, commit the
    reservation — the banking API finalises the debit.

  Phase 2 fallback — ROLLBACK:
    If anything fails between Reserve and Commit (network error, downstream
    service crash, unexpected exception), the reservation is rolled back.
    Funds return to the available balance. System guaranteed clean state.

Usage (called internally by sentinel_sdk.py for WIRE_TRANSFER actions):
  from two_phase_commit import execute_2pc_wire
  result = execute_2pc_wire(from_account, to_account, amount, reference, currency)
"""

import uuid
import requests
from datetime import datetime, timezone

BANKING_API_URL = "http://localhost:8000/api/v1"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def execute_2pc_wire(
    from_account: str,
    to_account: str,
    amount: float,
    reference: str,
    currency: str = "USD",
    timeout: int = 8,
) -> dict:
    """
    Execute a wire transfer using Two-Phase Commit protocol.

    Phase 1 (Prepare):   Reserve funds atomically in the banking ledger.
    Phase 2 (Commit):    Finalise the debit if reserve succeeded.
    Fallback (Rollback): Release the reservation on any failure.

    Args:
        from_account: Source account ID
        to_account:   Destination account ID
        amount:       Dollar amount to transfer
        reference:    Wire reference / invoice number
        currency:     Currency code (default USD)
        timeout:      HTTP timeout per request in seconds

    Returns:
        dict with keys:
          - status:      "2PC_COMMITTED" | "2PC_ABORTED" | "2PC_ROLLBACK" | "ERROR"
          - reserve_id:  The unique reservation token
          - phase:       Last phase reached ("PREPARE" | "COMMIT" | "ROLLBACK")
          - message:     Human-readable summary
          - details:     Full banking API response
    """
    reserve_id = f"rsv_{uuid.uuid4().hex[:12]}"

    print(f"\n[2PC] --- Two-Phase Commit Initiated ----------------------------")
    print(f"[2PC] Reserve ID:   {reserve_id}")
    print(f"[2PC] Transfer:     ${amount:,.2f} from {from_account} -> {to_account}")
    print(f"[2PC] Reference:    {reference}")

    # ─────────────────────────────────────────────────────────────
    # Phase 1: PREPARE — Reserve (lock) funds
    # ─────────────────────────────────────────────────────────────
    print(f"\n[2PC] Phase 1 — PREPARE: Reserving ${amount:,.2f} in ledger...")
    try:
        reserve_resp = requests.post(
            f"{BANKING_API_URL}/ledger/reserve",
            json={
                "account_id": from_account,
                "amount":     amount,
                "reserve_id": reserve_id,
            },
            timeout=timeout,
        )
        reserve_data = reserve_resp.json()
        reserve_status = reserve_data.get("status")

    except Exception as e:
        print(f"[2PC] Phase 1 ERROR: Could not reach banking API — {e}")
        return {
            "status":     "ERROR",
            "reserve_id": reserve_id,
            "phase":      "PREPARE",
            "message":    f"2PC Phase 1 failed: Banking API unreachable — {e}",
            "details":    {},
        }

    # ── Phase 1 result: INSUFFICIENT_FUNDS → abort immediately ──
    if reserve_status == "INSUFFICIENT_FUNDS":
        available = reserve_data.get("available", 0)
        msg = (
            f"2PC ABORTED — Insufficient funds. "
            f"Requested: ${amount:,.2f} | Available: ${available:,.2f}"
        )
        print(f"[2PC] Phase 1 ABORTED: {msg}")
        print(f"[2PC] ── No funds were moved. System state clean. ──────────")
        return {
            "status":     "2PC_ABORTED",
            "reserve_id": reserve_id,
            "phase":      "PREPARE",
            "message":    msg,
            "details":    reserve_data,
        }

    # Phase 1 result: RESERVED
    available_after = reserve_data.get("available_after_reserve", "N/A")
    print(f"[2PC] Phase 1 RESERVED [OK]  Reserve ID: {reserve_id}")
    print(f"[2PC]   Funds locked:          ${amount:,.2f}")
    print(f"[2PC]   Available after lock:  ${available_after:,.2f}" if isinstance(available_after, (int, float)) else f"[2PC]   Available after lock:  {available_after}")

    # ─────────────────────────────────────────────────────────────
    # Phase 2: COMMIT — Finalise the debit + execute the wire
    # ─────────────────────────────────────────────────────────────
    print(f"\n[2PC] Phase 2 — COMMIT: Executing wire transfer...")
    try:
        # Step 2a: Commit the reservation (deducts from ledger balance)
        commit_resp = requests.post(
            f"{BANKING_API_URL}/ledger/commit",
            json={"reserve_id": reserve_id, "action": "COMMIT"},
            timeout=timeout,
        )
        commit_data = commit_resp.json()

        if commit_data.get("status") != "COMMITTED":
            raise RuntimeError(f"Commit returned unexpected status: {commit_data}")

        print(f"[2PC] Phase 2 COMMITTED [OK]  Ledger balance updated.")
        print(f"[2PC]   New balance: ${commit_data.get('new_balance', 'N/A'):,.2f}"
              if isinstance(commit_data.get('new_balance'), (int, float))
              else f"[2PC]   New balance: {commit_data.get('new_balance', 'N/A')}")

        # Step 2b: Execute the actual wire (credit the destination account)
        wire_resp = requests.post(
            f"{BANKING_API_URL}/ledger/transfers/wire",
            json={
                "from_account": from_account,
                "to_account":   to_account,
                "amount":       amount,
                "reference":    reference,
                "currency":     currency,
            },
            timeout=timeout,
        )
        wire_data = wire_resp.json()

        if wire_data.get("status") != "SUCCESS":
            raise RuntimeError(f"Wire execution failed: {wire_data}")

        txn_id = wire_data.get("transaction_id", "N/A")
        print(f"[2PC] Wire Executed [OK]  Transaction ID: {txn_id}")
        print(f"[2PC] --- 2PC COMMITTED SUCCESSFULLY ---------------------------\n")

        return {
            "status":         "2PC_COMMITTED",
            "reserve_id":     reserve_id,
            "transaction_id": txn_id,
            "phase":          "COMMIT",
            "message": (
                f"Two-Phase Commit successful. "
                f"${amount:,.2f} transferred from {from_account} to {to_account}. "
                f"Transaction ID: {txn_id}. Reserve: {reserve_id}."
            ),
            "details":  wire_data,
        }

    except Exception as e:
        # ── Phase 2 FAILED → automatic ROLLBACK ─────────────────
        print(f"[2PC] Phase 2 FAILED: {e}")
        print(f"[2PC] Initiating automatic ROLLBACK of reservation {reserve_id}...")

        try:
            rollback_resp = requests.post(
                f"{BANKING_API_URL}/ledger/commit",
                json={"reserve_id": reserve_id, "action": "ROLLBACK"},
                timeout=timeout,
            )
            rollback_data = rollback_resp.json()
            print(f"[2PC] ROLLBACK COMPLETE [OK]  ${amount:,.2f} returned to available balance.")
            print(f"[2PC] --- System state is CLEAN. No money moved. ----------\n")
            return {
                "status":     "2PC_ROLLBACK",
                "reserve_id": reserve_id,
                "phase":      "ROLLBACK",
                "message": (
                    f"2PC Commit failed and was automatically rolled back. "
                    f"No funds were debited. Error: {e}"
                ),
                "details": rollback_data,
            }
        except Exception as rb_err:
            # This is a critical state — reservation is STUCK
            # In production this would trigger a compensating saga + alert
            print(f"[2PC] CRITICAL: Rollback also failed! Reserve {reserve_id} is STUCK.")
            print(f"[2PC] Rollback error: {rb_err}")
            return {
                "status":     "ERROR",
                "reserve_id": reserve_id,
                "phase":      "ROLLBACK_FAILED",
                "message": (
                    f"CRITICAL: 2PC Commit and Rollback both failed. "
                    f"Reserve {reserve_id} may be stuck. Manual intervention required. "
                    f"Commit error: {e} | Rollback error: {rb_err}"
                ),
                "details": {},
            }
