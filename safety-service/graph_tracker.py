"""
Submodule 3.1: Distributed Execution Graph Tracker
Tracks multi-agent call chains and enforces maximum call-stack depth.
Uses NetworkX in-memory graph backed by Redis for state persistence.
"""
import json
import uuid
import time
import redis
import networkx as nx

MAX_CALL_DEPTH = 4

redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)


def _save_graph(trace_id: str, graph_data: dict):
    redis_client.set(f"graph:{trace_id}", json.dumps(graph_data), ex=3600)


def _load_graph(trace_id: str) -> dict:
    raw = redis_client.get(f"graph:{trace_id}")
    if raw:
        return json.loads(raw)
    return {"nodes": [], "edges": [], "max_depth_seen": 0}


def start_trace(initiating_agent_id: str) -> str:
    """
    Creates a new execution trace for an incoming agent request.
    Returns a trace_id (UUID) that must be passed through all subsequent calls.
    """
    trace_id = str(uuid.uuid4())[:8]  # Short UUID for readability
    graph_data = {
        "trace_id": trace_id,
        "initiated_by": initiating_agent_id,
        "started_at": time.time(),
        "nodes": [initiating_agent_id],
        "edges": [],
        "max_depth_seen": 0
    }
    _save_graph(trace_id, graph_data)
    print(f"[GRAPH TRACKER] New trace started: trace_id={trace_id} | initiator={initiating_agent_id}")
    return trace_id


def record_tool_call(trace_id: str, agent_id: str, tool_name: str, parent_span_id: str = None) -> dict:
    """
    Records an agent's tool call as an edge in the execution graph.
    Checks max depth and delegates to cycle detector after adding each edge.

    Returns:
        {"status": "ALLOWED", "current_depth": 1}
        {"status": "BLOCKED", "reason": "..."}
    """
    from cycle_detector import detect_cycle

    graph_data = _load_graph(trace_id)

    # Build NetworkX directed graph to measure depth
    G = nx.DiGraph()
    for edge in graph_data["edges"]:
        G.add_edge(edge["from"], edge["to"])

    # Compute call depth from initiating node
    initiator = graph_data.get("initiated_by", agent_id)
    node_label = f"{agent_id}::{tool_name}"

    if initiator in G and nx.has_path(G, initiator, agent_id):
        current_depth = nx.shortest_path_length(G, initiator, agent_id) + 1
    else:
        current_depth = 1

    # Depth check
    if current_depth > MAX_CALL_DEPTH:
        print(f"[GRAPH TRACKER] [WARNING] DEPTH VIOLATION: trace={trace_id} depth={current_depth} (max={MAX_CALL_DEPTH})")
        return {
            "status": "BLOCKED",
            "reason": f"Max call-stack depth of {MAX_CALL_DEPTH} exceeded. Current depth: {current_depth}. Possible infinite loop or coordinated attack."
        }

    # Record the new edge
    new_edge = {
        "from": agent_id,
        "to": tool_name,
        "depth": current_depth,
        "timestamp": time.time(),
        "parent_span_id": parent_span_id
    }
    graph_data["edges"].append(new_edge)
    if node_label not in graph_data["nodes"]:
        graph_data["nodes"].append(node_label)
    graph_data["max_depth_seen"] = max(graph_data["max_depth_seen"], current_depth)
    _save_graph(trace_id, graph_data)

    # Cycle check (Submodule 3.2)
    cycle_result = detect_cycle(graph_data)
    if cycle_result["has_cycle"]:
        print(f"[GRAPH TRACKER] [CYCLE] CYCLE DETECTED: trace={trace_id} | path={cycle_result['cycle_path']}")
        return {
            "status": "BLOCKED",
            "reason": f"Circular Agent Loop Detected: {' -> '.join(cycle_result['cycle_path'])}. Execution halted."
        }

    print(f"[GRAPH TRACKER] [OK] Edge recorded: {agent_id} -> {tool_name} | depth={current_depth} | trace={trace_id}")
    return {"status": "ALLOWED", "current_depth": current_depth}


def get_trace_graph(trace_id: str) -> dict:
    """Returns the full execution graph for a given trace (for audit/debug)."""
    return _load_graph(trace_id)
