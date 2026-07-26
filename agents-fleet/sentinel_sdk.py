import json
import redis
import requests
import jsonschema
import os
import re
import uuid
from idempotency import (
    generate_idempotency_key, check_duplicate,
    mark_processing, store_result, clear_processing
)

SAFETY_SERVICE_URL = "http://localhost:8001/api/v1"
BANKING_API_URL    = "http://localhost:8000/api/v1"

# Connect to our Redis container
redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

# Load the Lua script for rate limiting
LUA_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max_amount = tonumber(ARGV[3])
local request_amount = tonumber(ARGV[4])

local clear_before = now - window
redis.call('ZREMRANGEBYSCORE', key, 0, clear_before)

local elements = redis.call('ZRANGE', key, 0, -1)
local current_sum = 0
for i, member in ipairs(elements) do
    local separator = string.find(member, "_")
    if separator then
        local amt = tonumber(string.sub(member, 1, separator - 1))
        if amt then
            current_sum = current_sum + amt
        end
    end
end

if (current_sum + request_amount) > max_amount then
    return 0 -- Denied
else
    local unique_member = tostring(request_amount) .. "_" .. tostring(now)
    redis.call('ZADD', key, now, unique_member)
    redis.call('PEXPIRE', key, window)
    return 1 -- Allowed
end
"""
rate_limit_script = redis_client.register_script(LUA_SCRIPT)

def load_schema(schema_name):
    schema_path = os.path.join(os.path.dirname(__file__), '..', 'api', 'schemas', schema_name)
    with open(schema_path, 'r') as f:
        return json.load(f)

def _validate_parameters_deep(parameters: dict) -> dict:
    """Submodule 2.2: Deep Parameter Boundary Validator (SQL/Shell Injection)"""
    SQL_INJECTION_PATTERNS = [
        r"(?i)(\s|'|;)(DROP|DELETE|INSERT|UPDATE|SELECT|UNION|EXEC)\s",
        r"'.*--",
        r";\s*--"
    ]
    SHELL_INJECTION_PATTERNS = [
        r"[;&|`$]",
        r"\.\./",
        r"(?i)rm\s+-rf"
    ]
    
    sql_regexes = [re.compile(p) for p in SQL_INJECTION_PATTERNS]
    shell_regexes = [re.compile(p) for p in SHELL_INJECTION_PATTERNS]

    for key, value in parameters.items():
        if isinstance(value, str):
            # Check SQL
            for regex in sql_regexes:
                if regex.search(value):
                    return {"status": "DENIED", "reason": f"Deep Validation Failed: SQL Injection signature detected in parameter '{key}'"}
            # Check Shell
            for regex in shell_regexes:
                if regex.search(value):
                    return {"status": "DENIED", "reason": f"Deep Validation Failed: Shell Injection signature detected in parameter '{key}'"}
    
    return {"status": "PASSED"}

def scan_prompt_via_safety_service(agent_id: str, prompt: str) -> dict:
    """Submodule 2.1: Calls the Safety Service to scan for prompt injections."""
    try:
        resp = requests.post(
            f"{SAFETY_SERVICE_URL}/sanitize/prompt",
            json={"agent_id": agent_id, "text": prompt},
            timeout=5
        )
        return resp.json()
    except Exception as e:
        print(f"[SENTINEL SDK] Warning: Safety Service unreachable. {e}")
        return {"status": "SAFE", "reason": "Service unreachable, bypassing."}

def verify_rag_context_via_safety_service(doc_id: str, retrieved_text: str) -> dict:
    """Submodule 2.3: Calls the Safety Service to verify RAG hash integrity."""
    try:
        resp = requests.post(
            f"{SAFETY_SERVICE_URL}/sanitize/rag-context",
            json={"doc_id": doc_id, "text": retrieved_text},
            timeout=2
        )
        return resp.json()
    except Exception as e:
        print(f"[SENTINEL SDK] Warning: Safety Service unreachable. {e}")
        return {"status": "SAFE", "reason": "Service unreachable, bypassing."}

# ============================================================
# MODULE 3 HELPERS: Graph Tracker + Risk Scorer
# ============================================================

def start_agent_trace(agent_id: str) -> str:
    """Submodule 3.1: Starts a new execution trace. Returns trace_id."""
    try:
        resp = requests.post(
            f"{SAFETY_SERVICE_URL}/graph/start-trace",
            json={"agent_id": agent_id},
            timeout=3
        )
        if resp.status_code == 200:
            return resp.json().get("trace_id", str(uuid.uuid4())[:8])
    except Exception:
        pass
    return str(uuid.uuid4())[:8]  # Fallback local ID

def check_graph_and_cycles(trace_id: str, agent_id: str, tool_name: str) -> dict:
    """Submodule 3.1 + 3.2: Records tool call in graph, checks depth and cycles."""
    try:
        resp = requests.post(
            f"{SAFETY_SERVICE_URL}/graph/record-call",
            json={"trace_id": trace_id, "agent_id": agent_id, "tool_name": tool_name},
            timeout=3
        )
        if resp.status_code == 200:
            return resp.json()
        return {"status": "ALLOWED", "current_depth": 1}
    except Exception as e:
        print(f"[SENTINEL SDK] Warning: Graph Tracker unreachable. {e}")
        return {"status": "ALLOWED", "current_depth": 1}

def compute_contextual_risk(amount: float, account_id: str, call_depth: int = 1) -> dict:
    """Submodule 3.3: Fetches a risk score from the Risk Scoring Engine."""
    try:
        resp = requests.post(
            f"{SAFETY_SERVICE_URL}/risk/score",
            json={"amount": amount, "account_id": account_id, "call_depth": call_depth},
            timeout=3
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        print(f"[SENTINEL SDK] Warning: Risk Scorer unreachable. {e}")
    return {"score": 0, "risk_level": "LOW", "factors": []}

# ============================================================
# MODULE 3 INVESTIGATION TOOLS (called directly by the agent)
# ============================================================

def get_account_details_tool(account_id: str) -> dict:
    """Agent investigation tool: fetches full account profile from Banking API."""
    try:
        resp = requests.get(f"{BANKING_API_URL}/accounts/{account_id}", timeout=3)
        return resp.json()
    except Exception as e:
        return {"error": str(e)}

def get_transaction_history_tool(account_id: str) -> dict:
    """Agent investigation tool: fetches transaction history from Banking API."""
    try:
        resp = requests.get(f"{BANKING_API_URL}/accounts/{account_id}/transactions", timeout=3)
        return resp.json()
    except Exception as e:
        return {"error": str(e)}

def check_waiver_eligibility_tool(account_id: str) -> dict:
    """Agent investigation tool: checks if account qualifies for a fee waiver."""
    try:
        resp = requests.get(f"{BANKING_API_URL}/accounts/{account_id}/eligibility", timeout=3)
        return resp.json()
    except Exception as e:
        return {"error": str(e)}

def _audit_log(agent_id: str, action_type: str, decision: str, reason: str, parameters: dict, risk_score: int = 0):
    """Module 5: Silently calls the Safety Service to write a tamper-proof audit entry."""
    try:
        requests.post(
            f"{SAFETY_SERVICE_URL}/audit/log",
            json={
                "agent_id":    agent_id,
                "action_type": action_type,
                "decision":    decision,
                "reason":      reason,
                "parameters":  parameters,
                "risk_score":  risk_score
            },
            timeout=3
        )
    except Exception as e:
        print(f"[SENTINEL SDK] Warning: Audit logging failed (non-blocking). {e}")


def check_quarantine_status(agent_id: str) -> str:
    """
    Module 6.2: Gate 0 — Read agent quarantine state DIRECTLY from Redis.
    No HTTP call — sub-millisecond. Returns 'QUARANTINED' or 'ACTIVE'.
    """
    state = redis_client.get(f"agent:state:{agent_id}")
    return state if state else "ACTIVE"


def _register_in_flight(agent_id: str, action_type: str, parameters: dict):
    """Module 6.3: Register an operation as in-flight in Redis for Saga compensation."""
    import json
    record = json.dumps({
        "agent_id":    agent_id,
        "action_type": action_type,
        "parameters":  parameters,
    })
    redis_client.setex(f"saga:in-flight:{agent_id}", 60, record)


def _clear_in_flight(agent_id: str):
    """Module 6.3: Clear the in-flight record after successful completion."""
    redis_client.delete(f"saga:in-flight:{agent_id}")


def execute_governed_tool(agent_id: str, action_type: str, parameters: dict, trace_id: str = None):
    """
    The Sentinel Interceptor — sits between the Agent and the Bank.
    Pipeline: Gate 0 (Quarantine) → Graph → Schema → Params → Velocity → Risk → OPA → Bank API
    Every decision is automatically written to the cryptographic audit ledger (Module 5).
    """
    print(f"\n[SENTINEL INTERCEPTOR] Intercepted tool call from {agent_id}: {action_type}")

    # GATE 0: Quarantine Check (Module 6.2) — reads Redis directly, sub-millisecond, no HTTP
    quarantine_state = check_quarantine_status(agent_id)
    if quarantine_state == "QUARANTINED":
        reason = f"Agent '{agent_id}' is QUARANTINED. Kill-switch is active. All operations blocked."
        print(f"[SENTINEL] GATE 0: BLOCKED - {reason}")
        _audit_log(agent_id, action_type, "BLOCKED", reason, parameters)
        return {"status": "BLOCKED", "reason": reason}
    print(f"[SENTINEL] Gate 0: PASSED (agent state=ACTIVE)")

    # GATE 0.5: Idempotency Check (Module 5.2) — sub-millisecond Redis lookup
    idem_key = generate_idempotency_key(agent_id, action_type, parameters)
    is_dup, cached = check_duplicate(idem_key)
    if is_dup:
        if cached:
            # Completed duplicate — return the original result instantly
            reason = f"Duplicate request detected. Original processed at {cached.get('processed_at', 'unknown')}. Banking API NOT called."
            print(f"[SENTINEL] GATE 0.5: DUPLICATE REJECTED - {reason}")
            _audit_log(agent_id, action_type, "DUPLICATE_REJECTED", reason, parameters)
            return {
                "status":           "DUPLICATE_REJECTED",
                "idempotency_key":  idem_key[:16] + "...",
                "original_result":  cached.get("result"),
                "original_decision":cached.get("decision"),
                "processed_at":     cached.get("processed_at"),
                "message":          "This exact request was already processed. Original result returned. No double-processing occurred."
            }
        else:
            # Concurrent duplicate — still being processed right now
            reason = "Concurrent duplicate request detected. An identical request is currently being processed."
            print(f"[SENTINEL] GATE 0.5: CONCURRENT DUPLICATE BLOCKED")
            _audit_log(agent_id, action_type, "DUPLICATE_REJECTED", reason, parameters)
            return {"status": "DUPLICATE_REJECTED", "reason": reason}
    # Fresh request — mark as processing to block concurrent duplicates
    mark_processing(idem_key)
    print(f"[SENTINEL] Gate 0.5: PASSED (fresh request, key={idem_key[:16]}...)")

    # Register as in-flight for Saga compensation (Module 6.3)
    _register_in_flight(agent_id, action_type, parameters)

    # 0. Execution Graph + Cycle Detection (Module 3.1 & 3.2)
    if trace_id is None:
        trace_id = start_agent_trace(agent_id)
    graph_result = check_graph_and_cycles(trace_id, agent_id, action_type)
    if graph_result.get("status") == "BLOCKED":
        reason = graph_result["reason"]
        print(f"[SENTINEL] Graph/Cycle Check: BLOCKED - {reason}")
        _audit_log(agent_id, action_type, "DENIED", reason, parameters)
        return {"status": "DENIED", "reason": reason}
    current_depth = graph_result.get("current_depth", 1)
    print(f"[SENTINEL] Graph/Cycle Check: PASSED (depth={current_depth})")
    
    # 1. JSON Schema Validation (Module 0.1)
    try:
        if action_type == "FEE_WAIVER":
            schema = load_schema("fee_waiver_schema.json")
            jsonschema.validate(instance=parameters, schema=schema)
            print("[SENTINEL] Schema Validation: PASSED")
    except jsonschema.exceptions.ValidationError as e:
        reason = f"Sentinel JSON Schema Violation: {e.message}"
        print(f"[SENTINEL] Schema Validation: FAILED - {e.message}")
        _audit_log(agent_id, action_type, "DENIED", reason, parameters)
        return {"status": "DENIED", "reason": reason}

    # 1.5 Deep Parameter Validation (Module 2.2)
    deep_val = _validate_parameters_deep(parameters)
    if deep_val["status"] != "PASSED":
        reason = deep_val["reason"]
        print(f"[SENTINEL] Deep Parameter Validation: FAILED - {reason}")
        _audit_log(agent_id, action_type, "DENIED", reason, parameters)
        return deep_val
    print("[SENTINEL] Deep Parameter Validation: PASSED")

    # 2. Redis Rate Limiting (Module 0.2)
    if action_type == "FEE_WAIVER":
        import time
        now_ms = int(time.time() * 1000)
        amount = parameters.get("amount", 0)
        allowed = rate_limit_script(
            keys=[f"rate:{agent_id}:fee_waivers"],
            args=[now_ms, 60000, 100.00, amount]
        )
        if not allowed:
            reason = "Sentinel Velocity Violation: Exceeded $100 fee waiver limit per minute. Possible Salami Slicing Attack detected."
            print("[SENTINEL] Redis Velocity Check: FAILED (Salami Slicing detected)")
            _audit_log(agent_id, action_type, "DENIED", reason, parameters)
            return {"status": "DENIED", "reason": reason}
        print("[SENTINEL] Redis Velocity Check: PASSED")

    # 3. Risk Score + OPA Policy Evaluation (Modules 3.3 + 4)
    print(f"[SENTINEL] Computing Contextual Risk Score...")
    account_id = parameters.get("account_id", "unknown")
    amount = parameters.get("amount", 0)
    risk_result = compute_contextual_risk(amount, account_id, current_depth)
    risk_score = risk_result.get("score", 0)
    print(f"[SENTINEL] Risk Score: {risk_score} ({risk_result.get('risk_level')}) | Factors: {risk_result.get('factors')}")

    opa_parameters = {**parameters, "risk_score": risk_score}

    print(f"[SENTINEL] Evaluating OPA Policy for {action_type}...")
    try:
        opa_resp = requests.post(
            f"{SAFETY_SERVICE_URL}/policy/evaluate",
            json={"action_type": action_type, "parameters": opa_parameters},
            timeout=5
        )
        if opa_resp.status_code == 200:
            policy_result = opa_resp.json()
            decision = policy_result.get("decision", "DENY")
            reason   = policy_result.get("reason", "Unknown")
            print(f"[SENTINEL] OPA Decision: {decision} | Reason: {reason}")

            if decision == "DENY":
                _audit_log(agent_id, action_type, "DENIED", reason, parameters, risk_score)
                return {"status": "DENIED", "reason": f"Policy Engine DENY: {reason}"}
            elif decision == "REQUIRE_HITL":
                _audit_log(agent_id, action_type, "REQUIRE_HITL", reason, parameters, risk_score)
                return {"status": "REQUIRE_HITL", "reason": f"Human Approval Required: {reason}"}
        else:
            reason = "Policy Engine Evaluation Failed."
            print(f"[SENTINEL] Error from Policy Engine: {opa_resp.text}")
            _audit_log(agent_id, action_type, "DENIED", reason, parameters, risk_score)
            return {"status": "DENIED", "reason": reason}
    except Exception as e:
        reason = "Policy Engine unreachable. Failsafe: DENY."
        print(f"[SENTINEL] Warning: Policy Engine unreachable. {e}")
        _audit_log(agent_id, action_type, "DENIED", reason, parameters, risk_score)
        return {"status": "DENIED", "reason": reason}

    # 4. Forward to Mock Banking API
    try:
        print("[SENTINEL] Forwarding valid request to Core Banking API...")
        if action_type == "FEE_WAIVER":
            response = requests.post("http://localhost:8000/api/v1/cards/fee-waiver", json=parameters)
            result = response.json()
            _clear_in_flight(agent_id)  # Module 6.3: clear in-flight on success
            store_result(idem_key, result, "ALLOWED")  # Module 5.2: cache result for future duplicates
            _audit_log(agent_id, action_type, "ALLOWED", "OPA approved. Request forwarded to Banking API.", parameters, risk_score)
            return result
    except Exception as e:
        _clear_in_flight(agent_id)
        clear_processing(idem_key)  # Module 5.2: clear processing marker on error (allow retry)
        _audit_log(agent_id, action_type, "ERROR", str(e), parameters, risk_score)
        return {"status": "ERROR", "reason": str(e)}

    _clear_in_flight(agent_id)
    clear_processing(idem_key)  # Module 5.2: clear processing marker for unknown actions
    return {"status": "UNKNOWN_ACTION"}
