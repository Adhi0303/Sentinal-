import json
import redis
import requests
import jsonschema
import os

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

def execute_governed_tool(agent_id: str, action_type: str, parameters: dict):
    """
    This is the Sentinel Interceptor. It sits between the Agent and the Bank.
    """
    print(f"\\n[SENTINEL INTERCEPTOR] Intercepted tool call from {agent_id}: {action_type}")
    
    # 1. JSON Schema Validation (Module 0.1)
    try:
        if action_type == "FEE_WAIVER":
            schema = load_schema("fee_waiver_schema.json")
            jsonschema.validate(instance=parameters, schema=schema)
            print("[SENTINEL] Schema Validation: PASSED")
    except jsonschema.exceptions.ValidationError as e:
        print(f"[SENTINEL] Schema Validation: FAILED - {e.message}")
        return {"status": "DENIED", "reason": f"Sentinel JSON Schema Violation: {e.message}"}

    # 2. Redis Rate Limiting (Module 0.2)
    # Check if the agent is exceeding the $100 per minute limit
    if action_type == "FEE_WAIVER":
        import time
        now_ms = int(time.time() * 1000)
        amount = parameters.get("amount", 0)
        
        # Args: [current_timestamp, window_ms (60s), max_amount_in_window ($100), requested_amount]
        allowed = rate_limit_script(
            keys=[f"rate:{agent_id}:fee_waivers"], 
            args=[now_ms, 60000, 100.00, amount]
        )
        
        if not allowed:
            print("[SENTINEL] Redis Velocity Check: FAILED (Salami Slicing detected)")
            return {"status": "DENIED", "reason": "Sentinel Velocity Violation: Exceeded $100 fee waiver limit per minute. Possible Salami Slicing Attack detected."}
        print("[SENTINEL] Redis Velocity Check: PASSED")

    # 3. Forward to Mock Banking API (Module 8.1)
    try:
        print("[SENTINEL] Forwarding valid request to Core Banking API...")
        if action_type == "FEE_WAIVER":
            response = requests.post("http://localhost:8000/api/v1/cards/fee-waiver", json=parameters)
            return response.json()
    except Exception as e:
        return {"status": "ERROR", "reason": str(e)}

    return {"status": "UNKNOWN_ACTION"}
