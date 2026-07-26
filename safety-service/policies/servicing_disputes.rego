package sentinel.servicing_disputes

default decision = "DENY"
default reason = "Default deny: No matching policy rule found."

# -----------------------------------------------
# RULE 0: CRITICAL risk score — hard block always
# -----------------------------------------------
decision = "DENY" {
    input.risk_score >= 70
}
reason = "Risk Score Critical: Automatic hard block triggered." {
    input.risk_score >= 70
}

# -----------------------------------------------
# RULE 1: Deny if no reason is provided
# -----------------------------------------------
decision = "DENY" {
    not input.reason
}
reason = "Missing business justification (reason is blank or missing)." {
    not input.reason
}

decision = "DENY" {
    input.reason == ""
}
reason = "Missing business justification (reason is blank or missing)." {
    input.reason == ""
}

# -----------------------------------------------
# RULE 2: Deny if amount > 500 (Hard block)
# -----------------------------------------------
decision = "DENY" {
    input.reason != ""
    input.risk_score < 70
    input.amount > 500
}
reason = "Amount exceeds maximum hard limit of $500. Cannot be overridden." {
    input.reason != ""
    input.risk_score < 70
    input.amount > 500
}

# -----------------------------------------------
# RULE 3: HITL if risk score is HIGH (50-69)
# -----------------------------------------------
decision = "REQUIRE_HITL" {
    input.reason != ""
    input.risk_score >= 50
    input.risk_score < 70
}
reason = "Risk Score HIGH: Manager approval required before proceeding." {
    input.reason != ""
    input.risk_score >= 50
    input.risk_score < 70
}

# -----------------------------------------------
# RULE 4: HITL if amount > 50 (normal policy gate)
# -----------------------------------------------
decision = "REQUIRE_HITL" {
    input.reason != ""
    input.risk_score < 50
    input.amount > 50
    input.amount <= 500
}
reason = "Amount exceeds auto-approve limit of $50. Manager approval required." {
    input.reason != ""
    input.risk_score < 50
    input.amount > 50
    input.amount <= 500
}

# -----------------------------------------------
# RULE 5: Allow if low risk and amount <= 50
# -----------------------------------------------
decision = "ALLOW" {
    input.reason != ""
    input.risk_score < 50
    input.amount <= 50
}
reason = "Auto-approved by policy (Low risk, Amount <= $50)." {
    input.reason != ""
    input.risk_score < 50
    input.amount <= 50
}

