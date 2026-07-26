"""
Module 5.2: Idempotency & Duplicate Execution Prevention
=========================================================
Prevents AI agents from double-processing the same financial operation
during network retries — the most common source of financial data corruption
in distributed payment systems.

How it works:
  1. Before ANY processing, generate a deterministic SHA-256 key from the
     request's financial fingerprint (agent + action + account + amount + date).
  2. Check Redis atomically (SETNX) — if the key already exists, it's a duplicate.
  3. On a fresh request: mark as PROCESSING, then on completion, store the result.
  4. On a duplicate: return the cached original result instantly. Banking API is NEVER called.

Key Design Decisions:
  - Keys include the DATE (not time) so the same request the next day is allowed.
  - Keys expire after 24 hours (TTL) as a safety net.
  - The check is ATOMIC using Redis SETNX — no race conditions even under concurrent load.
  - A short-lived PROCESSING marker prevents duplicate concurrent requests from both
    slipping through during the milliseconds before the result is stored.
"""

import hashlib
import json
import redis
from datetime import datetime, timezone
from typing import Optional, Tuple, Dict, Any

redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

IDEMPOTENCY_KEY_PREFIX = "idempotency:"
RESULT_TTL_SECONDS     = 86400   # 24 hours — keys expire after one day
PROCESSING_TTL_SECONDS = 30      # 30 seconds — prevents race conditions on concurrent identical requests


def generate_idempotency_key(agent_id: str, action_type: str, parameters: dict) -> str:
    """
    Generate a deterministic idempotency key from the financial fingerprint.

    Fields used (all define WHAT is being done financially):
      - agent_id:    Which agent is acting
      - action_type: What action (FEE_WAIVER, TRANSFER, etc.)
      - account_id:  Which customer account
      - amount:      Exact dollar amount
      - date:        Today's date (UTC) — allows the same request tomorrow

    Fields deliberately EXCLUDED:
      - Timestamps, trace IDs, session IDs — retries are identical except for these
    """
    account_id = str(parameters.get("account_id", ""))
    amount     = str(parameters.get("amount", ""))
    date_str   = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    fingerprint = f"{agent_id}:{action_type}:{account_id}:{amount}:{date_str}"
    key_hash    = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()

    return key_hash


def check_duplicate(key: str) -> Tuple[bool, Optional[Dict]]:
    """
    Check if a request with this key was already processed.

    Uses a two-key approach:
      1. "idempotency:{key}:result"     — stores the final result (TTL 24h)
      2. "idempotency:{key}:processing" — temporary marker during execution (TTL 30s)

    Returns:
      (True, cached_result)  if this is a duplicate of an already-COMPLETED request
      (True, None)           if this is a concurrent duplicate (still PROCESSING)
      (False, None)          if this is a fresh, never-seen request
    """
    full_key    = f"{IDEMPOTENCY_KEY_PREFIX}{key}:result"
    proc_key    = f"{IDEMPOTENCY_KEY_PREFIX}{key}:processing"

    # Check if a completed result exists
    cached_raw = redis_client.get(full_key)
    if cached_raw:
        return True, json.loads(cached_raw)

    # Check if an identical request is currently being processed concurrently
    if redis_client.get(proc_key):
        return True, None

    return False, None


def mark_processing(key: str):
    """
    Set a short-lived PROCESSING marker to handle concurrent identical requests.
    This prevents two identical requests arriving within milliseconds of each other
    from both passing the duplicate check before either has stored its result.
    """
    proc_key = f"{IDEMPOTENCY_KEY_PREFIX}{key}:processing"
    redis_client.setex(proc_key, PROCESSING_TTL_SECONDS, "1")


def store_result(key: str, result: Dict[str, Any], decision: str):
    """
    Store the final result of a successfully processed request.
    Called after the Banking API responds — the result is now cacheable.
    Also clears the PROCESSING marker.
    """
    full_key = f"{IDEMPOTENCY_KEY_PREFIX}{key}:result"
    proc_key = f"{IDEMPOTENCY_KEY_PREFIX}{key}:processing"

    payload = {
        "result":       result,
        "decision":     decision,
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }
    redis_client.setex(full_key, RESULT_TTL_SECONDS, json.dumps(payload))
    redis_client.delete(proc_key)  # Clear the processing marker

    print(f"[IDEMPOTENCY] Result stored for key {key[:16]}... (expires in 24h)")


def clear_processing(key: str):
    """
    Clear the PROCESSING marker without storing a result.
    Called when a request is DENIED or hits an ERROR — so the agent
    can retry with corrected parameters (which would generate a new key anyway).
    Only clears the processing marker, not any stored result.
    """
    proc_key = f"{IDEMPOTENCY_KEY_PREFIX}{key}:processing"
    redis_client.delete(proc_key)
