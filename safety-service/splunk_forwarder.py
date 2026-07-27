"""
splunk_forwarder.py
===================
Sentinel Gateway — Splunk HEC (HTTP Event Collector) Forwarder
Module: Enterprise SIEM Integration

Formats every audit entry as a Splunk HEC event and forwards it
to the configured Splunk instance (or logs it locally if disabled).

Splunk HEC format:
  POST https://<host>:<port>/services/collector/event
  Authorization: Splunk <token>
  Body: { "time": <epoch>, "host": "sentinel", "source": "sentinel:audit",
          "sourcetype": "sentinel:ai_firewall", "index": "main", "event": {...} }

Configuration is persisted in config/splunk_config.json so the UI toggle
survives safety-service restarts.
"""

import json
import os
import time
import threading
import logging
from typing import Dict, Any, Optional

try:
    import requests as _requests
    _HAS_REQUESTS = True
except ImportError:
    _HAS_REQUESTS = False

logger = logging.getLogger("sentinel.splunk_forwarder")

# ── Config persistence ────────────────────────────────────────────────────────

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "splunk_config.json")
_DEFAULT_CONFIG = {
    "enabled": False,
    "hec_url": "https://your-splunk-instance.splunkcloud.com:8088/services/collector/event",
    "token": "YOUR-SPLUNK-HEC-TOKEN",
    "index": "main",
    "source": "sentinel:audit",
    "sourcetype": "sentinel:ai_firewall",
    "host": "sentinel-gateway",
    "verify_ssl": False,
}

def _ensure_config_dir() -> None:
    os.makedirs(os.path.dirname(_CONFIG_PATH), exist_ok=True)

def load_config() -> Dict[str, Any]:
    """Load Splunk config from disk, returning defaults if not present."""
    _ensure_config_dir()
    if not os.path.exists(_CONFIG_PATH):
        return dict(_DEFAULT_CONFIG)
    try:
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            on_disk = json.load(f)
        # Merge with defaults so new keys always exist
        merged = dict(_DEFAULT_CONFIG)
        merged.update(on_disk)
        return merged
    except Exception:
        return dict(_DEFAULT_CONFIG)

def save_config(cfg: Dict[str, Any]) -> None:
    """Persist Splunk config to disk."""
    _ensure_config_dir()
    with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)

# ── Internal state ────────────────────────────────────────────────────────────

_config: Dict[str, Any] = load_config()
_config_lock = threading.Lock()

def get_config() -> Dict[str, Any]:
    with _config_lock:
        return dict(_config)

def update_config(updates: Dict[str, Any]) -> Dict[str, Any]:
    global _config
    with _config_lock:
        _config.update(updates)
        save_config(_config)
        return dict(_config)

# ── HEC event builder ─────────────────────────────────────────────────────────

def _build_hec_payload(audit_entry: Dict[str, Any], cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Converts a Sentinel audit entry into a Splunk HEC event envelope.
    The `event` field is the raw audit entry — fully queryable in Splunk SPL.
    """
    ts = audit_entry.get("timestamp", "")
    # Convert ISO timestamp to epoch for Splunk (it prefers Unix time)
    try:
        from datetime import datetime, timezone
        epoch = datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    except Exception:
        epoch = time.time()

    return {
        "time":       epoch,
        "host":       cfg.get("host", "sentinel-gateway"),
        "source":     cfg.get("source", "sentinel:audit"),
        "sourcetype": cfg.get("sourcetype", "sentinel:ai_firewall"),
        "index":      cfg.get("index", "main"),
        "event": {
            # Core identity
            "entry_id":    audit_entry.get("entry_id"),
            "agent_id":    audit_entry.get("agent_id"),
            "action_type": audit_entry.get("action_type"),
            "decision":    audit_entry.get("decision"),
            "reason":      audit_entry.get("reason"),
            "risk_score":  audit_entry.get("risk_score", 0),
            # Financial context
            "amount":       audit_entry.get("parameters", {}).get("amount"),
            "account_id":   audit_entry.get("parameters", {}).get("account_id"),
            "from_account": audit_entry.get("parameters", {}).get("from_account"),
            # Chain integrity
            "entry_hash":  audit_entry.get("entry_hash", "")[:16] + "...",
            # For Splunk time-series
            "timestamp":   ts,
            # Full parameters for deep-dive
            "parameters":  audit_entry.get("parameters", {}),
        }
    }

# ── Forward function ──────────────────────────────────────────────────────────

def forward_audit_entry(audit_entry: Dict[str, Any]) -> None:
    """
    Called after every audit entry is written to the ledger.
    Forwards the entry to Splunk HEC in a background thread (non-blocking).
    If disabled, logs locally for demo visibility.
    """
    cfg = get_config()

    if not cfg.get("enabled", False):
        # Still log so demo observers can see what WOULD be sent to Splunk
        _log_demo_event(audit_entry, cfg)
        return

    # Fire-and-forget in a daemon thread so it never blocks the API response
    t = threading.Thread(
        target=_send_to_splunk,
        args=(audit_entry, cfg),
        daemon=True
    )
    t.start()

def _send_to_splunk(audit_entry: Dict[str, Any], cfg: Dict[str, Any]) -> None:
    """Background worker that actually POSTs to Splunk HEC."""
    if not _HAS_REQUESTS:
        logger.warning("[SPLUNK] 'requests' library not available — skipping HEC forward")
        return

    url   = cfg.get("hec_url", "")
    token = cfg.get("token", "")
    ssl   = cfg.get("verify_ssl", False)

    if not url or not token or token == "YOUR-SPLUNK-HEC-TOKEN":
        logger.warning("[SPLUNK] HEC URL or token not configured — skipping forward")
        return

    payload = _build_hec_payload(audit_entry, cfg)

    try:
        resp = _requests.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Splunk {token}",
                "Content-Type":  "application/json",
            },
            verify=ssl,
            timeout=5,
        )
        if resp.status_code == 200:
            logger.info(f"[SPLUNK] ✓ Entry #{audit_entry.get('entry_id')} forwarded | "
                        f"decision={audit_entry.get('decision')}")
        else:
            logger.error(f"[SPLUNK] ✗ HEC returned {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.error(f"[SPLUNK] ✗ Forward failed: {e}")

def _log_demo_event(audit_entry: Dict[str, Any], cfg: Dict[str, Any]) -> None:
    """When disabled, print the HEC payload so observers can see the integration."""
    payload = _build_hec_payload(audit_entry, cfg)
    decision = audit_entry.get("decision", "?")
    entry_id = audit_entry.get("entry_id", "?")
    # Only log purposeful events — skip trivial ones
    if decision not in ("ALLOWED",):
        print(f"[SPLUNK_FORWARDER] (disabled) Would forward entry #{entry_id} "
              f"| decision={decision} | HEC payload ready ✓")

# ── Test connection ───────────────────────────────────────────────────────────

def test_connection() -> Dict[str, Any]:
    """
    Sends a test event to Splunk HEC to validate connectivity.
    Returns { success: bool, message: str }
    """
    cfg = get_config()

    if not _HAS_REQUESTS:
        return {"success": False, "message": "'requests' library not available on this host."}

    url   = cfg.get("hec_url", "")
    token = cfg.get("token", "")
    ssl   = cfg.get("verify_ssl", False)

    if not url or token == "YOUR-SPLUNK-HEC-TOKEN":
        return {
            "success": False,
            "message": "HEC URL and token are required. Please configure them first."
        }

    test_payload = {
        "time":       time.time(),
        "host":       cfg.get("host", "sentinel-gateway"),
        "source":     cfg.get("source", "sentinel:audit"),
        "sourcetype": cfg.get("sourcetype", "sentinel:ai_firewall"),
        "index":      cfg.get("index", "main"),
        "event": {
            "type":    "SENTINEL_CONNECTION_TEST",
            "message": "Sentinel Gateway SIEM integration test — connection successful.",
            "version": "1.0.0"
        }
    }

    try:
        resp = _requests.post(
            url,
            json=test_payload,
            headers={
                "Authorization": f"Splunk {token}",
                "Content-Type":  "application/json",
            },
            verify=ssl,
            timeout=8,
        )
        if resp.status_code == 200:
            return {"success": True, "message": f"Splunk HEC responded 200 OK. Integration active."}
        else:
            return {
                "success": False,
                "message": f"Splunk returned HTTP {resp.status_code}: {resp.text[:200]}"
            }
    except Exception as e:
        return {"success": False, "message": f"Connection error: {str(e)}"}
