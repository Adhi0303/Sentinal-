"""
Module 5 + 7.2: Cryptographic Audit Trail, Immutable Ledger & Telemetry
========================================================================
Every Sentinel decision (ALLOW / DENY / HITL) is written to an append-only
ledger file using SHA-256 hash chaining. Each entry's hash is computed from
the PREVIOUS entry's hash + the current entry's data, making it mathematically
impossible to tamper with any past record without breaking the chain.

Module 7.2 integration: Every new ledger entry also updates Prometheus metrics
via telemetry.record_decision() so live counters stay in sync automatically.
"""

import hashlib
import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

# Module 7.2 — import telemetry (lazy to avoid circular imports at startup)
def _update_telemetry(decision: str, agent_id: str, risk_score: int, parameters: dict):
    """Non-blocking telemetry update — silently ignores errors."""
    try:
        from telemetry import record_decision
        amount = float(parameters.get("amount", 0) or 0)
        record_decision(decision=decision, agent_id=agent_id,
                        risk_score=risk_score, amount=amount)
    except Exception:
        pass  # Telemetry is non-blocking — never crash the ledger over metrics

LEDGER_PATH = os.path.join(os.path.dirname(__file__), "audit_log.jsonl")
GENESIS_HASH = "0" * 64   # The "Genesis Block" — the chain starts here


def _get_last_entry() -> Optional[Dict]:
    """Read the last line of the append-only ledger to get the previous hash."""
    if not os.path.exists(LEDGER_PATH):
        return None
    last = None
    with open(LEDGER_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                last = json.loads(line)
    return last


def _compute_hash(entry_data: Dict) -> str:
    """
    Computes SHA-256 hash of the entry.
    The hash is over the CANONICAL JSON (sorted keys) to prevent ordering tricks.
    The prev_hash field is included, so changing any past entry breaks all future hashes.
    """
    canonical = json.dumps(entry_data, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def append_audit_entry(
    agent_id: str,
    action_type: str,
    decision: str,
    reason: str,
    parameters: Dict[str, Any],
    risk_score: int = 0
) -> Dict:
    """
    Appends a new tamper-proof audit entry to the ledger.
    Returns the full entry including its hash.
    """
    # Get the hash of the last entry (or genesis)
    last_entry = _get_last_entry()
    if last_entry:
        prev_hash = last_entry.get("entry_hash", GENESIS_HASH)
        entry_id  = last_entry.get("entry_id", 0) + 1
    else:
        prev_hash = GENESIS_HASH
        entry_id  = 1

    # Build the entry (without hash first)
    entry = {
        "entry_id":    entry_id,
        "timestamp":   datetime.now(timezone.utc).isoformat(),
        "agent_id":    agent_id,
        "action_type": action_type,
        "decision":    decision,
        "reason":      reason,
        "parameters":  parameters,
        "risk_score":  risk_score,
        "prev_hash":   prev_hash,
    }

    # Compute the hash over the full entry (including prev_hash)
    entry["entry_hash"] = _compute_hash(entry)

    # Append to the ledger (append-only)
    with open(LEDGER_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")

    print(f"[AUDIT LEDGER] Entry #{entry_id} written | Decision={decision} | Hash={entry['entry_hash'][:16]}...")
    # Module 7.2: Update Prometheus counters (non-blocking)
    _update_telemetry(decision, agent_id, risk_score, parameters)
    return entry


def get_recent_entries(limit: int = 20) -> list:
    """Returns the last N entries from the audit log for the dashboard."""
    if not os.path.exists(LEDGER_PATH):
        return []
    entries = []
    with open(LEDGER_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                entries.append(json.loads(line))
    return entries[-limit:]


def verify_chain_integrity() -> Dict:
    """
    Walks the ENTIRE ledger from entry #1 to the last entry.
    Re-computes each entry's hash and compares it to the stored hash.
    Also verifies that each entry's prev_hash matches the previous entry's entry_hash.

    Returns:
      - {"status": "INTACT", "total_entries": N}   if everything is fine
      - {"status": "TAMPERED", "broken_at_entry": N, ...}  if tampering is detected
    """
    if not os.path.exists(LEDGER_PATH):
        return {"status": "EMPTY", "total_entries": 0, "message": "No audit log found."}

    entries = []
    with open(LEDGER_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                entries.append(json.loads(line))

    if not entries:
        return {"status": "EMPTY", "total_entries": 0, "message": "Audit log is empty."}

    expected_prev = GENESIS_HASH

    for i, entry in enumerate(entries):
        entry_id = entry.get("entry_id", i + 1)

        # 1. Verify prev_hash linkage
        if entry.get("prev_hash") != expected_prev:
            return {
                "status": "TAMPERED",
                "broken_at_entry": entry_id,
                "reason": f"Chain link broken at entry #{entry_id}. prev_hash mismatch.",
                "expected_prev_hash": expected_prev,
                "found_prev_hash": entry.get("prev_hash"),
                "total_entries": len(entries)
            }

        # 2. Re-compute the hash for this entry and verify it matches stored hash
        stored_hash = entry.pop("entry_hash", None)
        recomputed_hash = _compute_hash(entry)
        entry["entry_hash"] = stored_hash  # restore

        if stored_hash != recomputed_hash:
            return {
                "status": "TAMPERED",
                "broken_at_entry": entry_id,
                "reason": f"Data integrity violation at entry #{entry_id}. Content was modified.",
                "expected_hash": recomputed_hash[:16] + "...",
                "found_hash":    stored_hash[:16] + "...",
                "total_entries": len(entries)
            }

        expected_prev = stored_hash

    return {
        "status": "INTACT",
        "total_entries": len(entries),
        "message": f"All {len(entries)} audit entries verified. Chain is tamper-proof.",
        "chain_tip_hash": entries[-1]["entry_hash"][:16] + "..."
    }
