"""
Submodule 3.3: Contextual Multi-Agent Risk Scoring Engine
Computes a dynamic risk score (0-100) for every transaction intent.
Pure Python — deterministic, fast, no LLM involved.
The risk score is injected into the OPA payload so Rego rules can use it.
"""
import time
from datetime import datetime


# Risk factor weights
AMOUNT_WEIGHTS = {
    "critical": (500, 50),   # amount > 500 → +50
    "high":     (50,  25),   # amount > 50  → +25
    "low":      (0,    5),   # amount > 0   → +5
}

def compute_risk_score(amount: float, account_data: dict, call_depth: int = 1) -> dict:
    """
    Computes a dynamic risk score from 0 (safe) to 100 (critical).

    Args:
        amount: The dollar amount being requested
        account_data: Dict from Banking API (status, credit_score, ytd_fees_waived, years_as_customer)
        call_depth: Current agent call-stack depth from Graph Tracker

    Returns:
        {
            "score": 72,
            "risk_level": "HIGH",
            "factors": ["Suspended account", "High YTD waivers", "Off-hours request"]
        }
    """
    score = 0
    factors = []

    # --- Factor 1: Amount ---
    if amount > 500:
        score += 50
        factors.append(f"Amount ${amount} exceeds hard threshold of $500")
    elif amount > 50:
        score += 25
        factors.append(f"Amount ${amount} exceeds auto-approve threshold of $50")
    else:
        score += 5

    # --- Factor 2: Account Vulnerability ---
    status = account_data.get("status", "UNKNOWN")
    credit_score = account_data.get("credit_score", 700)
    years = account_data.get("years_as_customer", 1)
    ytd_waived = account_data.get("ytd_fees_waived", 0.0)

    if status == "SUSPENDED":
        score += 30
        factors.append("Account is SUSPENDED")
    elif status != "ACTIVE":
        score += 15
        factors.append(f"Account status is non-standard: {status}")

    if credit_score < 500:
        score += 20
        factors.append(f"Low credit score: {credit_score}")
    elif credit_score < 620:
        score += 10
        factors.append(f"Below-average credit score: {credit_score}")

    if years < 1:
        score += 15
        factors.append("Account is less than 1 year old")

    # --- Factor 3: YTD Abuse ---
    if ytd_waived > 300:
        score += 20
        factors.append(f"YTD fees waived (${ytd_waived}) exceeds $300 abuse threshold")
    elif ytd_waived > 100:
        score += 10
        factors.append(f"YTD fees waived (${ytd_waived}) exceeds $100 caution threshold")

    # --- Factor 4: Time of Day (off-hours = higher risk) ---
    current_hour = datetime.now().hour
    if current_hour < 6 or current_hour > 22:
        score += 10
        factors.append(f"Off-hours request at {current_hour}:00")

    # --- Factor 5: Call Stack Depth ---
    if call_depth > 1:
        depth_penalty = call_depth * 5
        score += depth_penalty
        factors.append(f"Call stack depth {call_depth} (penalty: +{depth_penalty})")

    # Cap at 100
    score = min(score, 100)

    # Determine risk level
    if score >= 70:
        risk_level = "CRITICAL"
    elif score >= 50:
        risk_level = "HIGH"
    elif score >= 25:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    print(f"[RISK SCORER] Score={score} ({risk_level}) | Factors: {factors}")
    return {
        "score": score,
        "risk_level": risk_level,
        "factors": factors
    }
