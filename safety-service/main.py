from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from classifiers.injection_detector import detector
from rag_firewall import firewall

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

if __name__ == "__main__":
    print("Starting Sentinel Safety Service on port 8001...")
    uvicorn.run(app, host="0.0.0.0", port=8001)
