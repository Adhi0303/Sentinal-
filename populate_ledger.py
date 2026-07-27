import json
import os
import hashlib
from datetime import datetime, timezone, timedelta
import random

LEDGER_PATH = os.path.join("safety-service", "audit_log.jsonl")
GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"

# Clear existing to ensure a clean run
if os.path.exists(LEDGER_PATH):
    os.remove(LEDGER_PATH)

def _compute_hash(entry_data):
    canonical = json.dumps(entry_data, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

def append(agent_id, action_type, decision, reason, params, risk_score, time_offset_minutes):
    if not os.path.exists(LEDGER_PATH):
        prev_hash = GENESIS_HASH
        entry_id = 1
    else:
        with open(LEDGER_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()
            if lines:
                last = json.loads(lines[-1])
                prev_hash = last.get("entry_hash", GENESIS_HASH)
                entry_id = last.get("entry_id", 0) + 1
            else:
                prev_hash = GENESIS_HASH
                entry_id = 1
        
    ts = (datetime.now(timezone.utc) - timedelta(minutes=time_offset_minutes)).isoformat()
    
    entry = {
        "entry_id": entry_id,
        "timestamp": ts,
        "agent_id": agent_id,
        "action_type": action_type,
        "decision": decision,
        "reason": reason,
        "parameters": params,
        "risk_score": risk_score,
        "prev_hash": prev_hash
    }
    entry["entry_hash"] = _compute_hash(entry)
    with open(LEDGER_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    return entry

# Generate 35 diverse transactions across different agents

agents = [
    "amex_customer_service_v1", "amex_treasury_agent", 
    "amex_underwriting_agent", "amex_dispute_agent", "amex_procurement_agent"
]

actions = [
    ("FEE_WAIVER", 10, 50, "ALLOWED", "Policy check passed: Amount within auto-approve threshold."),
    ("FEE_WAIVER", 150, 300, "DENIED", "Policy check failed: Fee waiver exceeds agent authorization limit."),
    ("WIRE_TRANSFER", 1000, 5000, "ALLOWED", "Policy check passed: Valid internal vendor payment."),
    ("WIRE_TRANSFER", 20000, 50000, "DENIED", "Policy check failed: Risk Score Exceeds Threshold (High Velocity)."),
    ("WIRE_TRANSFER", 15000, 20000, "REQUIRE_HITL", "Risk Score HIGH: Manager approval required before proceeding."),
    ("CREDIT_LIMIT_INCREASE", 5000, 10000, "ALLOWED", "Policy check passed: Account standing is excellent."),
    ("CREDIT_LIMIT_INCREASE", 20000, 50000, "REQUIRE_HITL", "Policy check: Limit increase requires manual underwriting review."),
    ("PROMPT_INJECTION", 0, 0, "DENIED", "Regex fingerprint match: Contains 'ignore all previous instructions'."),
    ("DISPUTE_RESOLUTION", 20, 100, "ALLOWED", "Policy check passed: Valid dispute history and merchant ID."),
    ("DISPUTE_RESOLUTION", 500, 2000, "DENIED", "Policy check failed: Dispute amount exceeds instant resolution limit."),
    ("REPLAY_ATTACK", 1000, 1000, "DENIED", "Duplicate execution detected. Idempotency layer blocked replay attack.")
]

# Generate a sequence of events
for i in range(35, 0, -1):
    agent = random.choice(agents)
    action_profile = random.choice(actions)
    
    action_type = action_profile[0]
    amount = round(random.uniform(action_profile[1], action_profile[2]), 2)
    decision = action_profile[3]
    reason = action_profile[4]
    
    if decision == "ALLOWED":
        risk = random.randint(1, 40)
    elif decision == "REQUIRE_HITL":
        risk = random.randint(50, 70)
    else:
        risk = random.randint(75, 99)
        if action_type == "PROMPT_INJECTION": risk = 0
        
    params = {"account_id": f"acc_{random.randint(100, 999)}"}
    if amount > 0:
        params["amount"] = amount
        
    append(agent, action_type, decision, reason, params, risk, time_offset_minutes=i*2)

# Ensure some specific edge cases
append("amex_treasury_agent", "WIRE_TRANSFER", "DENIED", "Policy engine DENY: Trade value exceeds absolute max limit. Blocked.", {"amount": 5000000.00, "to": "offshore_acc"}, 95, 1)
append("amex_procurement_agent", "WIRE_TRANSFER", "ALLOWED", "Two-Phase Commit successful. Transaction ID: TXN-0B0B491E.", {"amount": 2500.00, "vendor": "AWS"}, 15, 0)

print("Massive audit log generated.")
