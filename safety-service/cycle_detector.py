"""
Submodule 3.2: Circular Dependency & Infinite Loop Breaker
Uses Tarjan's Strongly Connected Components (SCC) algorithm via NetworkX
to detect cycles in the agent execution graph in real-time.
"""
import networkx as nx


def detect_cycle(graph_data: dict) -> dict:
    """
    Runs Tarjan's SCC cycle detection on the current execution graph.
    A Strongly Connected Component with more than 1 node = a cycle.

    Args:
        graph_data: The graph dict from graph_tracker (has 'edges' list)

    Returns:
        {"has_cycle": False}
        {"has_cycle": True, "cycle_path": ["agent_A", "tool_X", "agent_A"], "alert": "CRITICAL"}
    """
    if not graph_data.get("edges"):
        return {"has_cycle": False}

    G = nx.DiGraph()
    for edge in graph_data["edges"]:
        G.add_edge(edge["from"], edge["to"])

    # Tarjan's algorithm — finds all SCCs
    # Any SCC with more than 1 node means we have a real cycle
    sccs = list(nx.strongly_connected_components(G))
    
    for scc in sccs:
        if len(scc) > 1:
            # Reconstruct the cycle path for the alert message
            cycle_nodes = list(scc)
            cycle_path = cycle_nodes + [cycle_nodes[0]]  # Close the loop visually
            return {
                "has_cycle": True,
                "cycle_path": cycle_path,
                "alert": "CRITICAL",
                "message": f"Circular agent dependency detected among: {cycle_nodes}"
            }

    return {"has_cycle": False}
