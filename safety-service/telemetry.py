"""
Module 7.2: Structured Telemetry & Prometheus Metric Exporter
=============================================================
Exposes a standard /metrics endpoint in Prometheus text format.
The Lovable dashboard (or any monitoring system) can poll this every 5 seconds
to get live charts of Sentinel's governance activity.

Metrics exposed:
  sentinel_decisions_total{status}       - cumulative count of every governance decision
  sentinel_killswitch_events_total{type} - emergency kill-switch events
  sentinel_risk_score_bucket             - histogram of risk scores
  sentinel_spend_guarded_dollars_total   - total $ value of transactions evaluated
  sentinel_active_quarantines            - current live count of quarantined agents
"""

from prometheus_client import (
    Counter, Histogram, Gauge,
    generate_latest, CONTENT_TYPE_LATEST, CollectorRegistry
)
import redis

# Use a custom registry so we don't conflict with FastAPI's default metrics
REGISTRY = CollectorRegistry()

# ── Counters (always go up, never reset) ─────────────────────────────────────

# Every governance decision ever made, labelled by outcome
DECISIONS_TOTAL = Counter(
    "sentinel_decisions_total",
    "Total number of governance decisions made by the Sentinel control plane.",
    ["status"],          # ALLOWED | DENIED | BLOCKED | COMPENSATED | AGENT_QUARANTINED | FLEET_QUARANTINED | AGENT_RELEASED
    registry=REGISTRY,
)

# Emergency kill-switch events — this should almost always be 0 in a healthy fleet
KILLSWITCH_EVENTS_TOTAL = Counter(
    "sentinel_killswitch_events_total",
    "Total number of emergency kill-switch events fired.",
    ["event_type"],      # AGENT_QUARANTINED | FLEET_QUARANTINED | AGENT_RELEASED
    registry=REGISTRY,
)

# Total financial value (in USD) of all transactions evaluated by Sentinel
SPEND_GUARDED_TOTAL = Counter(
    "sentinel_spend_guarded_dollars_total",
    "Total USD value of financial transactions evaluated and governed by Sentinel.",
    ["agent_id"],
    registry=REGISTRY,
)

# ── Histograms (track distributions) ─────────────────────────────────────────

# Distribution of risk scores — lets the dashboard show a risk heatmap
RISK_SCORE_HISTOGRAM = Histogram(
    "sentinel_risk_score",
    "Distribution of risk scores assigned by the Sentinel Risk Scoring Engine.",
    ["agent_id"],
    buckets=[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    registry=REGISTRY,
)

# ── Gauges (can go up and down) ───────────────────────────────────────────────

# Live count of currently quarantined agents — reads from Redis in real time
ACTIVE_QUARANTINES = Gauge(
    "sentinel_active_quarantines",
    "Current number of agents in QUARANTINED state.",
    registry=REGISTRY,
)

# ── Redis client for live quarantine count ────────────────────────────────────
_redis = redis.Redis(host="localhost", port=6379, db=0, decode_responses=True)

KNOWN_AGENTS = [
    "agent_cust_srv_01",
    "agent_trading_01",
    "agent_fraud_monitor_01",
    "agent_credit_ops_01",
]

KILL_SWITCH_DECISIONS = {
    "AGENT_QUARANTINED", "FLEET_QUARANTINED", "AGENT_RELEASED"
}


def record_decision(
    decision: str,
    agent_id: str,
    risk_score: int = 0,
    amount: float = 0.0,
):
    """
    Called from audit_ledger.append_audit_entry() every time a new entry is written.
    Updates the relevant Prometheus counters and histograms.
    """
    # 1. Decisions counter
    DECISIONS_TOTAL.labels(status=decision).inc()

    # 2. Kill-switch events get their own counter
    if decision in KILL_SWITCH_DECISIONS:
        KILLSWITCH_EVENTS_TOTAL.labels(event_type=decision).inc()

    # 3. Risk score histogram (only for real governance decisions, not kill-switch admin)
    if decision not in KILL_SWITCH_DECISIONS and risk_score > 0:
        RISK_SCORE_HISTOGRAM.labels(agent_id=agent_id).observe(risk_score)

    # 4. Spend guarded counter (only positive amounts)
    if amount and amount > 0:
        SPEND_GUARDED_TOTAL.labels(agent_id=agent_id).inc(amount)

    # 5. Update live quarantine gauge from Redis
    _refresh_quarantine_gauge()


def _refresh_quarantine_gauge():
    """Read all known agent states from Redis and update the live gauge."""
    try:
        quarantined = sum(
            1 for a in KNOWN_AGENTS
            if _redis.get(f"agent:state:{a}") == "QUARANTINED"
        )
        ACTIVE_QUARANTINES.set(quarantined)
    except Exception:
        pass  # Non-blocking — if Redis is down, just skip the gauge update


def get_metrics_output() -> tuple[bytes, str]:
    """
    Generate the Prometheus-format metrics text.
    Returns (content_bytes, content_type) — pass directly to FastAPI Response.
    """
    _refresh_quarantine_gauge()  # Ensure gauge is fresh on every scrape
    return generate_latest(REGISTRY), CONTENT_TYPE_LATEST
