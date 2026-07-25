package sentinel.trading_limits

default decision = "DENY"
default reason = "Default deny: No matching policy rule found."

decision = "ALLOW" {
    input.trade_value <= 10000
}
reason = "Auto-approved trade (value <= 10000)." {
    input.trade_value <= 10000
}

decision = "REQUIRE_HITL" {
    input.trade_value > 10000
    input.trade_value <= 50000
}
reason = "Trade value exceeds auto-approve limit. Human approval required." {
    input.trade_value > 10000
    input.trade_value <= 50000
}

decision = "DENY" {
    input.trade_value > 50000
}
reason = "Trade value exceeds absolute max limit. Blocked." {
    input.trade_value > 50000
}
