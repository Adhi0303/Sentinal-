package sentinel.servicing_disputes

default decision = "DENY"
default reason = "Default deny: No matching policy rule found."

# RULE 1: Deny if no reason is provided
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

# RULE 2: Deny if amount > 500 (Hard block)
decision = "DENY" {
    input.reason != ""
    input.amount > 500
}
reason = "Amount exceeds maximum hard limit of $500. Cannot be overridden." {
    input.reason != ""
    input.amount > 500
}

# RULE 3: Require Human-In-The-Loop if amount > 50
decision = "REQUIRE_HITL" {
    input.reason != ""
    input.amount > 50
    input.amount <= 500
}
reason = "Amount exceeds auto-approve limit of $50. Manager approval required." {
    input.reason != ""
    input.amount > 50
    input.amount <= 500
}

# RULE 4: Allow if amount <= 50
decision = "ALLOW" {
    input.reason != ""
    input.amount <= 50
}
reason = "Auto-approved by policy (Amount <= 50)." {
    input.reason != ""
    input.amount <= 50
}
