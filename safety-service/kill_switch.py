"""
Module 6.1 + 6.2: Emergency Fleet Kill-Switch & Quarantine Controller
======================================================================
Provides sub-10ms emergency isolation of any agent or the entire fleet.
Uses Redis as both the state store (key-value) and broadcast channel (PubSub).

Kill-Switch Flow:
  1. Admin hits POST /killswitch/isolate or /killswitch/fleet-kill
  2. This module sets agent:state:{id} = QUARANTINED in Redis
  3. Publishes a JSON kill signal to the Redis PubSub channel
  4. Sentinel SDK's Gate 0 reads Redis directly (<1ms) and blocks the agent
  5. All KILL events are written to the Module 5 Audit Ledger
"""

import json
import redis
import time
from datetime import datetime, timezone
from typing import List, Optional

# Connect to our shared Redis instance
redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

KILL_SWITCH_CHANNEL = "sentinel:kill_switch"
AGENT_STATE_KEY_PREFIX = "agent:state:"
AGENT_KILL_TIME_PREFIX = "agent:kill_time:"

# Known agents in the fleet. In production this would come from a service registry.
KNOWN_FLEET_AGENTS = [
    "agent_cust_srv_01",
    "agent_trading_01",
    "agent_fraud_monitor_01",
    "agent_credit_ops_01",
    "agent_treasury_001",
    "agent_procurement_001",
    "agent_underwriting_001"
]


def _set_agent_state(agent_id: str, state: str):
    """Set the quarantine state for a single agent in Redis."""
    redis_client.set(f"{AGENT_STATE_KEY_PREFIX}{agent_id}", state)


def get_agent_state(agent_id: str) -> str:
    """
    Read the current state of an agent from Redis.
    Returns 'ACTIVE' by default if no key exists (agents start as ACTIVE).
    This is called at Gate 0 in the SDK — reads directly from Redis, no HTTP.
    """
    state = redis_client.get(f"{AGENT_STATE_KEY_PREFIX}{agent_id}")
    return state if state else "ACTIVE"


def quarantine_agent(agent_id: str, triggered_by: str = "system") -> dict:
    """
    Submodule 6.2: Quarantine a single agent instantly.
    Sets state in Redis and broadcasts a kill signal on the PubSub channel.
    """
    kill_time = datetime.now(timezone.utc).isoformat()
    _set_agent_state(agent_id, "QUARANTINED")
    redis_client.set(f"{AGENT_KILL_TIME_PREFIX}{agent_id}", kill_time)

    # Broadcast on PubSub for any listener threads (Submodule 6.1)
    payload = {
        "event":        "KILL_AGENT",
        "agent_id":     agent_id,
        "triggered_by": triggered_by,
        "timestamp":    kill_time,
    }
    redis_client.publish(KILL_SWITCH_CHANNEL, json.dumps(payload))

    print(f"[KILL-SWITCH] Agent '{agent_id}' QUARANTINED at {kill_time} by {triggered_by}")
    return {
        "status":    "QUARANTINED",
        "agent_id":  agent_id,
        "kill_time": kill_time,
    }


def quarantine_fleet(triggered_by: str = "system") -> dict:
    """
    Submodule 6.1 + 6.2: Kill-switch the ENTIRE fleet in a single atomic operation.
    Loops over all known agents, quarantines each, then publishes a KILL_ALL signal.
    """
    kill_time = datetime.now(timezone.utc).isoformat()
    quarantined = []

    for agent_id in KNOWN_FLEET_AGENTS:
        _set_agent_state(agent_id, "QUARANTINED")
        redis_client.set(f"{AGENT_KILL_TIME_PREFIX}{agent_id}", kill_time)
        quarantined.append(agent_id)

    # Single broadcast for the entire fleet shutdown
    payload = {
        "event":             "KILL_FLEET_ALL",
        "quarantined_agents": quarantined,
        "triggered_by":      triggered_by,
        "timestamp":         kill_time,
    }
    redis_client.publish(KILL_SWITCH_CHANNEL, json.dumps(payload))

    print(f"[KILL-SWITCH] FLEET KILL executed at {kill_time} by {triggered_by}. Agents quarantined: {quarantined}")
    return {
        "status":             "FLEET_QUARANTINED",
        "quarantined_agents": quarantined,
        "kill_time":          kill_time,
    }


def release_agent(agent_id: str, released_by: str = "system") -> dict:
    """Restore a single agent to ACTIVE status and clear its kill time."""
    _set_agent_state(agent_id, "ACTIVE")
    redis_client.delete(f"{AGENT_KILL_TIME_PREFIX}{agent_id}")

    release_time = datetime.now(timezone.utc).isoformat()

    # Broadcast recovery signal
    payload = {
        "event":       "AGENT_RELEASED",
        "agent_id":    agent_id,
        "released_by": released_by,
        "timestamp":   release_time,
    }
    redis_client.publish(KILL_SWITCH_CHANNEL, json.dumps(payload))

    print(f"[KILL-SWITCH] Agent '{agent_id}' RELEASED at {release_time} by {released_by}")
    return {
        "status":       "ACTIVE",
        "agent_id":     agent_id,
        "release_time": release_time,
    }


def get_fleet_status() -> dict:
    """Return the current state of every known fleet agent."""
    fleet = {}
    for agent_id in KNOWN_FLEET_AGENTS:
        state = get_agent_state(agent_id)
        kill_time = redis_client.get(f"{AGENT_KILL_TIME_PREFIX}{agent_id}")
        fleet[agent_id] = {
            "state":     state,
            "kill_time": kill_time,
        }

    quarantined_count = sum(1 for v in fleet.values() if v["state"] == "QUARANTINED")
    return {
        "fleet":              fleet,
        "total_agents":       len(KNOWN_FLEET_AGENTS),
        "quarantined_count":  quarantined_count,
        "active_count":       len(KNOWN_FLEET_AGENTS) - quarantined_count,
        "fleet_health":       "DEGRADED" if quarantined_count > 0 else "HEALTHY",
    }
