"""
Module 6.3: In-Flight Transaction Rollback & Saga Compensation Worker
======================================================================
Implements the Saga Pattern for handling transactions that were interrupted
by an emergency kill-switch event.

How it works:
  1. At the START of execute_governed_tool(), the SDK registers the operation
     as "in-flight" in Redis with a 60s TTL.
  2. At the END of a successful operation, the SDK clears the in-flight record.
  3. If a kill-switch fires MID-EXECUTION, the in-flight record is still alive.
  4. The kill-switch endpoint calls compensate_and_clear() which:
     a. Reads the dangling in-flight record
     b. Writes a COMPENSATED entry to the Module 5 Audit Ledger
     c. Deletes the record from Redis

This guarantees no "ghost transactions" — every started operation either
completes cleanly OR has a documented compensation event in the ledger.
"""

import json
import redis
from datetime import datetime, timezone
from typing import Optional, Any

redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

IN_FLIGHT_KEY_PREFIX = "saga:in-flight:"
IN_FLIGHT_TTL_SECONDS = 60  # In-flight records auto-expire after 60s


def register_in_flight(agent_id: str, action_type: str, parameters: dict) -> str:
    """
    Register an operation as 'in-flight' at the start of execution.
    The TTL ensures orphaned records auto-clean even without a kill-switch.
    Returns the in-flight key for later cleanup.
    """
    key = f"{IN_FLIGHT_KEY_PREFIX}{agent_id}"
    record = {
        "agent_id":    agent_id,
        "action_type": action_type,
        "parameters":  parameters,
        "started_at":  datetime.now(timezone.utc).isoformat(),
        "status":      "IN_FLIGHT",
    }
    # Use SETEX so the key auto-expires (TTL-based safety net)
    redis_client.setex(key, IN_FLIGHT_TTL_SECONDS, json.dumps(record))
    return key


def clear_in_flight(agent_id: str):
    """
    Clear the in-flight record after a successful completion.
    Called at the END of execute_governed_tool() when the Banking API responds OK.
    """
    key = f"{IN_FLIGHT_KEY_PREFIX}{agent_id}"
    redis_client.delete(key)


def compensate_and_clear(agent_id: str, audit_callback=None) -> Optional[dict]:
    """
    Submodule 6.3: Compensate any dangling in-flight operation for a given agent.
    Called by the kill-switch when an agent is quarantined.

    Args:
        agent_id:       The agent whose in-flight operations need compensation.
        audit_callback: Optional function(agent_id, action_type, decision, reason, params)
                        so we can write to the Module 5 audit ledger.

    Returns:
        The compensation record if a dangling operation was found, else None.
    """
    key = f"{IN_FLIGHT_KEY_PREFIX}{agent_id}"
    raw = redis_client.get(key)

    if not raw:
        print(f"[SAGA] No in-flight operations found for '{agent_id}'. Nothing to compensate.")
        return None

    record = json.loads(raw)
    compensation_time = datetime.now(timezone.utc).isoformat()

    compensation_record = {
        "agent_id":          agent_id,
        "original_action":   record.get("action_type"),
        "original_params":   record.get("parameters"),
        "started_at":        record.get("started_at"),
        "compensated_at":    compensation_time,
        "compensation_type": "KILL_SWITCH_ABORT",
        "reason":            "Transaction aborted due to emergency kill-switch isolation.",
    }

    print(f"[SAGA] Compensating in-flight transaction for agent '{agent_id}':")
    print(f"       Action: {record.get('action_type')} | Started: {record.get('started_at')}")

    # Write to Audit Ledger (Module 5) via the callback
    if audit_callback:
        audit_callback(
            agent_id=agent_id,
            action_type=record.get("action_type", "UNKNOWN"),
            decision="COMPENSATED",
            reason="Kill-switch abort: in-flight transaction rolled back by Saga Compensation Worker.",
            parameters=record.get("parameters", {}),
            risk_score=0,
        )

    # Clear the record — compensation is complete
    redis_client.delete(key)

    print(f"[SAGA] Compensation complete for '{agent_id}'. Ledger entry written.")
    return compensation_record


def compensate_fleet(known_agents: list, audit_callback=None) -> list:
    """
    Run compensation for ALL known agents — called when a fleet-wide kill fires.
    Returns a list of all compensation records that were processed.
    """
    results = []
    for agent_id in known_agents:
        result = compensate_and_clear(agent_id, audit_callback=audit_callback)
        if result:
            results.append(result)
    return results
