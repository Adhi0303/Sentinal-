from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
import uvicorn
from classifiers.injection_detector import detector
from rag_firewall import firewall
from opa_evaluator import evaluate_policy
from graph_tracker import start_trace, record_tool_call, get_trace_graph
from risk_scorer import compute_risk_score
from audit_ledger import append_audit_entry, get_recent_entries, verify_chain_integrity
from kill_switch import (
    quarantine_agent, quarantine_fleet, release_agent,
    get_fleet_status, KNOWN_FLEET_AGENTS
)
from saga_compensator import compensate_and_clear, compensate_fleet
from telemetry import get_metrics_output
from report_generator import generate_json_report, generate_pdf_report
import os
import requests as http_requests

BANKING_API_URL = "http://localhost:8000/api/v1"

app = FastAPI(title="Sentinel Safety Service — Modules 2, 3, 4, 5, 6, 7 | 2PC Enabled")

# CORS — allow Lovable and any local frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    Scans the incoming prompt using Regex and Llama-Guard, and logs only malicious prompts to the ledger.
    """
    print(f"\n[SAFETY SERVICE] Scanning prompt for agent {req.agent_id}...")
    result = detector.scan(req.text)
    
    # Log the prompt scan to the Audit Ledger ONLY if it was blocked (malicious)
    if result["status"] == "BLOCKED":
        append_audit_entry(
            agent_id=req.agent_id,
            action_type="PROMPT_INJECTION",
            decision="DENIED",
            reason=result["reason"],
            parameters={"prompt": req.text},
            risk_score=0
        )
    
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
            "file":    os.path.join(os.path.dirname(__file__), "policies", "servicing_disputes.rego"),
            "package": "data.sentinel.servicing_disputes"
        },
        "TRADE": {
            "file":    os.path.join(os.path.dirname(__file__), "policies", "trading_limits.rego"),
            "package": "data.sentinel.trading_limits"
        },
        # Treasury & Procurement wire transfers use the trading limits policy
        "WIRE_TRANSFER": {
            "file":    os.path.join(os.path.dirname(__file__), "policies", "trading_limits.rego"),
            "package": "data.sentinel.trading_limits"
        },
        # Underwriting credit limit changes use the servicing disputes policy (risk-based)
        "CREDIT_LIMIT_INCREASE": {
            "file":    os.path.join(os.path.dirname(__file__), "policies", "servicing_disputes.rego"),
            "package": "data.sentinel.servicing_disputes"
        },
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

# ==========================================
# MODULE 5: CRYPTOGRAPHIC AUDIT TRAIL
# ==========================================

class AuditEntryRequest(BaseModel):
    agent_id: str
    action_type: str
    decision: str
    reason: str
    parameters: Dict[str, Any]
    risk_score: Optional[int] = 0

@app.post("/api/v1/audit/log")
async def audit_log_entry(req: AuditEntryRequest):
    """
    Module 5: Append a new tamper-proof entry to the cryptographic audit ledger.
    Called automatically by the Sentinel SDK after every governance decision.
    """
    entry = append_audit_entry(
        agent_id=req.agent_id,
        action_type=req.action_type,
        decision=req.decision,
        reason=req.reason,
        parameters=req.parameters,
        risk_score=req.risk_score
    )
    return {"status": "LOGGED", "entry_id": entry["entry_id"], "entry_hash": entry["entry_hash"]}

@app.get("/api/v1/audit/recent")
async def audit_get_recent(limit: int = Query(default=20, le=500)):
    """
    Module 5: Returns the last N audit entries for the dashboard feed.
    """
    entries = get_recent_entries(limit=limit)
    return {"entries": entries, "count": len(entries)}

@app.get("/api/v1/audit/verify")
async def audit_verify_chain():
    """
    Module 5: Walks the ENTIRE audit chain and verifies every SHA-256 hash.
    Returns INTACT or TAMPERED with the exact entry number where the chain broke.
    """
    print("\n[AUDIT] Running full chain integrity verification...")
    result = verify_chain_integrity()
    print(f"[AUDIT] Verification result: {result['status']}")
    return result

# ==========================================
# MODULE 6: EMERGENCY KILL-SWITCH SYSTEM
# ==========================================

class KillSwitchRequest(BaseModel):
    agent_id: Optional[str] = None
    triggered_by: Optional[str] = "admin"

def _audit_kill_event(agent_id: str, event: str, details: dict):
    """Write kill-switch events to the Module 5 Audit Ledger."""
    append_audit_entry(
        agent_id=agent_id,
        action_type="KILL_SWITCH",
        decision=event,
        reason=f"Emergency kill-switch event: {event}",
        parameters=details,
        risk_score=0,
    )

@app.post("/api/v1/killswitch/isolate")
async def killswitch_isolate(req: KillSwitchRequest):
    """
    Module 6.2: Quarantine a single agent immediately.
    All subsequent requests from this agent will be blocked at Gate 0.
    """
    if not req.agent_id:
        raise HTTPException(status_code=400, detail="agent_id is required.")
    print(f"\n[KILL-SWITCH] ISOLATE signal received for agent: {req.agent_id}")
    result = quarantine_agent(req.agent_id, triggered_by=req.triggered_by)
    # Compensate any in-flight operations
    compensation = compensate_and_clear(req.agent_id, audit_callback=append_audit_entry)
    # Write kill event to immutable audit ledger
    _audit_kill_event(req.agent_id, "AGENT_QUARANTINED", {"triggered_by": req.triggered_by})
    return {
        **result,
        "in_flight_compensation": compensation or "No in-flight operations found.",
    }

@app.post("/api/v1/killswitch/fleet-kill")
async def killswitch_fleet_kill(req: KillSwitchRequest):
    """
    Module 6.1 + 6.2: Execute a fleet-wide kill-switch.
    ALL agents are quarantined simultaneously via Redis. Pub/Sub broadcasts the event.
    """
    print(f"\n[KILL-SWITCH] FLEET KILL signal received from: {req.triggered_by}")
    result = quarantine_fleet(triggered_by=req.triggered_by)
    # Compensate all in-flight operations across the fleet
    compensations = compensate_fleet(KNOWN_FLEET_AGENTS, audit_callback=append_audit_entry)
    # Write fleet kill event to immutable audit ledger
    _audit_kill_event("FLEET", "FLEET_QUARANTINED", {
        "triggered_by":      req.triggered_by,
        "agents_quarantined": result.get("quarantined_agents", []),
        "compensations":     len(compensations),
    })
    return {
        **result,
        "in_flight_compensations": compensations or [],
    }

@app.post("/api/v1/killswitch/release")
async def killswitch_release(req: KillSwitchRequest):
    """
    Module 6.2: Release a quarantined agent back to ACTIVE status.
    The agent will resume normal operation on its next request.
    """
    if not req.agent_id:
        raise HTTPException(status_code=400, detail="agent_id is required.")
    print(f"\n[KILL-SWITCH] RELEASE signal received for agent: {req.agent_id}")
    result = release_agent(req.agent_id, released_by=req.triggered_by)
    _audit_kill_event(req.agent_id, "AGENT_RELEASED", {"released_by": req.triggered_by})
    return result

@app.get("/api/v1/killswitch/status")
@app.get("/api/v1/fleet/status")
async def killswitch_status():
    """
    Module 6.2: Get the current quarantine status of the entire known fleet.
    Returns HEALTHY if all agents are ACTIVE, DEGRADED if any are QUARANTINED.
    """
    return get_fleet_status()

# ==========================================
# MODULE 7: TELEMETRY & REGULATORY REPORTS
# ==========================================

@app.get("/metrics")
async def prometheus_metrics():
    """
    Module 7.2: Prometheus-format metrics endpoint.
    Exposes live counters for all Sentinel governance decisions,
    kill-switch events, risk scores, and spend guarded.
    Scrape this every 5 seconds for real-time dashboard charts.
    """
    content, content_type = get_metrics_output()
    return Response(content=content, media_type=content_type)

@app.get("/api/v1/audit/report")
async def audit_report_json():
    """
    Module 7.3: Generate a full regulatory compliance report in JSON format.
    Translates every cryptographic audit entry into plain English that
    compliance officers, regulators (RBI, SEC, FINRA, EU AI Act), and
    judges can read without any technical knowledge.
    """
    print("\n[REPORT] Generating regulatory compliance report (JSON)...")
    report = generate_json_report()
    print(f"[REPORT] Report generated: {report['report_id']} | "
          f"{report['summary']['total_decisions']} decisions translated.")
    return report

@app.get("/api/v1/audit/report/pdf")
async def audit_report_pdf():
    """
    Module 7.3: Generate and download the regulatory compliance report as a PDF.
    Produces a professionally formatted document with Amex Blue branding,
    an executive summary table, and a full plain-English decision log.
    """
    print("\n[REPORT] Generating regulatory compliance report (PDF)...")
    output_path = os.path.join(os.path.dirname(__file__), "sentinel_audit_report.pdf")
    try:
        generate_pdf_report(output_path)
        print(f"[REPORT] PDF generated at: {output_path}")
        return FileResponse(
            path=output_path,
            media_type="application/pdf",
            filename="sentinel_audit_report.pdf"
        )
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="PDF generation unavailable. Install reportlab: pip install reportlab"
        )


# ==========================================
# DASHBOARD: Unified Summary Endpoint for UI
# ==========================================

@app.get("/api/v1/dashboard/summary")
async def dashboard_summary():
    """
    Unified dashboard summary endpoint for the Lovable frontend.
    Aggregates fleet status, audit metrics, chain integrity, and recent events
    into a single JSON response — the UI calls this once every 5 seconds.
    """
    # Fleet status
    fleet_data = get_fleet_status()

    # Audit report (metrics + entries)
    report = generate_json_report()
    summary = report.get("summary", {})
    recent_raw = get_recent_entries(limit=10)

    # Chain integrity (lightweight — just status)
    chain = verify_chain_integrity()

    # Format recent entries for the live feed
    recent_entries = []
    for e in recent_raw:
        recent_entries.append({
            "entry_id":   e.get("entry_id"),
            "timestamp":  e.get("timestamp"),
            "agent_id":   e.get("agent_id"),
            "action_type":e.get("action_type"),
            "decision":   e.get("decision"),
            "risk_score": e.get("risk_score", 0),
            "amount":     e.get("parameters", {}).get("amount",
                          e.get("parameters", {}).get("new_limit",
                          e.get("parameters", {}).get("trade_value", None))),
            "reason":     e.get("reason", ""),
            "hash":       e.get("entry_hash", "")[:16] + "...",
        })

    # Determine overall system health
    quarantined_count = fleet_data.get("quarantined_count", 0)
    if quarantined_count == 0:
        system_status = "ONLINE"
    elif quarantined_count == fleet_data.get("total_agents", 1):
        system_status = "FLEET_KILL_ACTIVE"
    else:
        system_status = "DEGRADED"

    return {
        "system_status":   system_status,
        "generated_at":    report.get("generated_at"),
        "fleet":           fleet_data,
        "metrics": {
            "total_decisions":      summary.get("total_decisions", 0),
            "allowed":              summary.get("allowed", 0),
            "denied":               summary.get("denied", 0),
            "hitl_escalations":     summary.get("hitl_escalations", 0),
            "blocked_by_killswitch":summary.get("blocked_by_killswitch", 0),
            "duplicate_rejections": summary.get("duplicate_rejections", 0),
            "compensated":          summary.get("compensated", 0),
            "kill_switch_events":   summary.get("kill_switch_events", 0),
            "total_spend_evaluated":summary.get("total_spend_evaluated", 0.0),
        },
        "chain_integrity": {
            "status":         chain.get("status"),
            "total_entries":  chain.get("total_entries", 0),
            "verified_at":    chain.get("verified_at", ""),
        },
        "recent_entries": recent_entries,
    }


@app.get("/health")
async def health():
    return {"status": "OK", "service": "Sentinel Safety Service", "port": 8001}


# ─────────────────────────────────────────────────────────────────────────────
# Module 5.3: Two-Phase Commit Status Endpoint
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/2pc/reserves")
async def get_active_reserves():
    """
    Returns all active fund reservations in the banking ledger.
    These are funds that have been reserved (Phase 1 PREPARE done) but not
    yet committed or rolled back — i.e., money currently "in transit" through 2PC.
    Useful for the dashboard to show real-time liquidity in motion.
    """
    try:
        resp = http_requests.get(f"{BANKING_API_URL}/ledger/reserves", timeout=5)
        data = resp.json()
        reservations = data.get("reservations", {})

        return {
            "active_reservations": len(reservations),
            "total_locked_amount": sum(
                r.get("amount", 0) for r in reservations.values()
            ),
            "reservations": [
                {
                    "reserve_id":  rid,
                    "account_id":  r.get("account_id"),
                    "amount":      r.get("amount"),
                    "reserved_at": r.get("reserved_at"),
                    "status":      "LOCKED",
                }
                for rid, r in reservations.items()
            ],
        }
    except Exception as e:
        return {
            "active_reservations": 0,
            "total_locked_amount": 0.0,
            "reservations": [],
            "error": f"Could not fetch reservations: {e}",
        }


# ─────────────────────────────────────────────────────────────────────────────
# DEMO SANDBOX: Real Agent Chat Endpoint with SSE Telemetry Streaming
# ─────────────────────────────────────────────────────────────────────────────

import queue
import threading
import sys as _sys
from fastapi.responses import StreamingResponse
import json as _json

class DemoChatRequest(BaseModel):
    message: str
    account_id: Optional[str] = "acc_123"
    use_poisoned_rag: Optional[bool] = False

@app.post("/api/v1/demo/chat")
async def demo_chat(req: DemoChatRequest):
    """
    Demo Sandbox: Runs the real Customer Service Agent and streams live
    Sentinel gate-by-gate telemetry back to the UI as Server-Sent Events.
    Each SSE event is either a 'log' line or the final 'reply'.
    """
    telemetry_q: queue.Queue = queue.Queue()

    # Patch sys.path so the agent can find its deps
    agents_dir = os.path.join(os.path.dirname(__file__), '..', 'agents-fleet')
    if agents_dir not in _sys.path:
        _sys.path.insert(0, agents_dir)

    def _run_agent():
        """Run the real agent in a background thread, capturing all print output."""
        import io
        import contextlib

        # Intercept print statements from the agent + SDK to build telemetry
        class TelemetryCapture(io.StringIO):
            def write(self, s: str):
                stripped = s.strip()
                if stripped:
                    # Classify the log line for the frontend coloriser
                    token = "default"
                    sl = stripped.lower()
                    if "blocked" in sl or "denied" in sl or "tampered" in sl or "injection" in sl:
                        token = "deny"
                    elif "allowed" in sl or "safe" in sl or "passed" in sl or "intact" in sl or "approved" in sl or "complete" in sl or "committed" in sl:
                        token = "allow"
                    elif "hitl" in sl or "escalat" in sl or "require_hitl" in sl:
                        token = "hitl"
                    elif "duplicate" in sl or "idempotency" in sl or "cached" in sl:
                        token = "duplicate"
                    telemetry_q.put({"type": "log", "text": stripped, "token": token})
                return super().write(s)

        capture = TelemetryCapture()
        try:
            # Redirect stdout/stderr so all agent print() calls become telemetry events
            with contextlib.redirect_stdout(capture), contextlib.redirect_stderr(capture):
                import importlib
                import importlib.util
                # Load agent fresh each call so module-level globals reset
                spec = importlib.util.spec_from_file_location(
                    "customer_service_agent",
                    os.path.join(agents_dir, "customer_service_agent.py")
                )
                csa = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(csa)
                reply = csa.run_agent(req.message, use_poisoned_rag=req.use_poisoned_rag)

            telemetry_q.put({"type": "reply", "text": reply or "Done."})
        except Exception as e:
            telemetry_q.put({"type": "log", "text": f"[ERROR] Agent execution failed: {e}", "token": "deny"})
            telemetry_q.put({"type": "reply", "text": "I'm sorry, an internal error occurred. Please check that all backend services are running."})
        finally:
            telemetry_q.put(None)  # Sentinel: stream is done

    # Start agent in background thread
    t = threading.Thread(target=_run_agent, daemon=True)
    t.start()

    async def event_stream():
        import asyncio
        start_time = asyncio.get_event_loop().time()
        while True:
            try:
                item = telemetry_q.get_nowait()
            except queue.Empty:
                if asyncio.get_event_loop().time() - start_time > 60:
                    yield f"data: {_json.dumps({'type': 'error', 'text': 'Agent timed out'})}\n\n"
                    break
                await asyncio.sleep(0.1)
                continue
            
            # Reset timeout on successful read
            start_time = asyncio.get_event_loop().time()
            
            if item is None:
                yield f"data: {_json.dumps({'type': 'done'})}\n\n"
                break
            yield f"data: {_json.dumps(item)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


if __name__ == "__main__":
    print("Starting Sentinel Safety Service on port 8001...")
    uvicorn.run(app, host="0.0.0.0", port=8001)
