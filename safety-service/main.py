from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import uvicorn
from classifiers.injection_detector import detector
from rag_firewall import firewall
from opa_evaluator import evaluate_policy
from graph_tracker import start_trace, record_tool_call, get_trace_graph
from risk_scorer import compute_risk_score
import os
import requests as http_requests

BANKING_API_URL = "http://localhost:8000/api/v1"

app = FastAPI(title="Sentinel Safety Service — Modules 2, 3, 4")

class PromptRequest(BaseModel):
    agent_id: str
    text: str

class RagRequest(BaseModel):
    doc_id: str
    text: str

class SafetyResponse(BaseModel):
    status: str
    reason: str

class PolicyRequest(BaseModel):
    action_type: str
    parameters: Dict[str, Any]

class PolicyResponse(BaseModel):
    decision: str
    reason: str

# --- Module 3 Models ---
class GraphCallRequest(BaseModel):
    trace_id: str
    agent_id: str
    tool_name: str
    parent_span_id: Optional[str] = None

class GraphStartRequest(BaseModel):
    agent_id: str

class RiskScoreRequest(BaseModel):
    amount: float
    account_id: str
    call_depth: Optional[int] = 1

class RiskScoreResponse(BaseModel):
    score: int
    risk_level: str
    factors: list

@app.post("/api/v1/sanitize/prompt", response_model=SafetyResponse)
async def sanitize_prompt(req: PromptRequest):
    """
    Submodule 2.1: Prompt Injection & Goal Hijacking Detector
    Scans the incoming prompt using Regex and Llama-Guard.
    """
    print(f"\n[SAFETY SERVICE] Scanning prompt for agent {req.agent_id}...")
    result = detector.scan(req.text)
    
    print(f"[SAFETY SERVICE] Result: {result['status']} | Reason: {result['reason']}")
    return SafetyResponse(status=result["status"], reason=result["reason"])

@app.post("/api/v1/sanitize/rag-context", response_model=SafetyResponse)
async def sanitize_rag_context(req: RagRequest):
    """
    Submodule 2.3: Context Poisoning & Vector RAG Memory Firewall
    Verifies the integrity of retrieved RAG documents against known trusted hashes.
    """
    print(f"\n[SAFETY SERVICE] Verifying RAG context for doc '{req.doc_id}'...")
    result = firewall.verify_context_integrity(req.doc_id, req.text)
    
    print(f"[SAFETY SERVICE] Result: {result['status']} | Reason: {result['reason']}")
    return SafetyResponse(status=result["status"], reason=result["reason"])

@app.post("/api/v1/admin/register-rag-doc")
async def register_rag_doc(req: RagRequest):
    """Admin endpoint to register trusted context hashes at startup."""
    firewall.register_trusted_context(req.doc_id, req.text)
    return {"status": "SUCCESS"}

@app.post("/api/v1/policy/evaluate", response_model=PolicyResponse)
async def policy_evaluate(req: PolicyRequest):
    """
    Submodule 4.3: OPA Policy Evaluation
    Passes intent to the embedded OPA engine and Rego policies.
    """
    print(f"\n[SAFETY SERVICE] Evaluating OPA Policy for action: {req.action_type}")
    
    # Map action_type to policy file and package
    policy_file_map = {
        "FEE_WAIVER": {
            "file": os.path.join(os.path.dirname(__file__), "policies", "servicing_disputes.rego"),
            "package": "data.sentinel.servicing_disputes"
        },
        "TRADE": {
            "file": os.path.join(os.path.dirname(__file__), "policies", "trading_limits.rego"),
            "package": "data.sentinel.trading_limits"
        }
    }
    
    mapping = policy_file_map.get(req.action_type)
    if not mapping:
        return PolicyResponse(decision="DENY", reason=f"No policy mapped for action: {req.action_type}")
        
    result = evaluate_policy(mapping["file"], req.parameters, mapping["package"])
    
    print(f"[SAFETY SERVICE] OPA Decision: {result['decision']} | Reason: {result['reason']}")
    return PolicyResponse(decision=result["decision"], reason=result["reason"])

# ==========================================
# MODULE 3: MULTI-AGENT COORDINATOR ENDPOINTS
# ==========================================

@app.post("/api/v1/graph/start-trace")
async def graph_start_trace(req: GraphStartRequest):
    """Submodule 3.1: Start a new execution trace for an agent request."""
    trace_id = start_trace(req.agent_id)
    return {"trace_id": trace_id, "status": "STARTED"}

@app.post("/api/v1/graph/record-call")
async def graph_record_call(req: GraphCallRequest):
    """
    Submodule 3.1 + 3.2: Record a tool call edge in the execution graph.
    Runs depth check (3.1) and Tarjan's cycle detection (3.2) on every call.
    """
    print(f"\n[SAFETY SERVICE] Graph recording: {req.agent_id} -> {req.tool_name} (trace={req.trace_id})")
    result = record_tool_call(req.trace_id, req.agent_id, req.tool_name, req.parent_span_id)
    print(f"[SAFETY SERVICE] Graph result: {result['status']}")
    return result

@app.get("/api/v1/graph/trace/{trace_id}")
async def graph_get_trace(trace_id: str):
    """Returns the full execution graph for audit/debug purposes."""
    return get_trace_graph(trace_id)

@app.post("/api/v1/risk/score", response_model=RiskScoreResponse)
async def risk_score(req: RiskScoreRequest):
    """
    Submodule 3.3: Compute contextual risk score.
    Fetches account data from Banking API, runs weighted risk formula.
    """
    print(f"\n[SAFETY SERVICE] Computing risk score for account={req.account_id}, amount={req.amount}")
    try:
        acc_resp = http_requests.get(f"{BANKING_API_URL}/accounts/{req.account_id}", timeout=3)
        account_data = acc_resp.json() if acc_resp.status_code == 200 else {}
    except Exception:
        account_data = {}

    result = compute_risk_score(req.amount, account_data, req.call_depth)
    return RiskScoreResponse(**result)

if __name__ == "__main__":
    print("Starting Sentinel Safety Service on port 8001...")
    uvicorn.run(app, host="0.0.0.0", port=8001)
