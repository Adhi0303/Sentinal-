from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
import uvicorn
from classifiers.injection_detector import detector
from rag_firewall import firewall
from opa_evaluator import evaluate_policy
import os

app = FastAPI(title="Sentinel Safety Service (Module 2)")

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

if __name__ == "__main__":
    print("Starting Sentinel Safety Service on port 8001...")
    uvicorn.run(app, host="0.0.0.0", port=8001)
