from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn
from datetime import datetime, timezone
import uuid

app = FastAPI(title="Mock Core Banking API — American Express Hackathon")

# CORS — allow Lovable and any local frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# Rich In-Memory Mock Database — Consumer + Corporate Accounts
# ─────────────────────────────────────────────────────────────────────────────
accounts = {
    # Consumer Accounts (Customer Service Agent)
    "acc_123": {
        "name": "Sarah Johnson",
        "type": "CONSUMER",
        "status": "ACTIVE",
        "balance": 1000.0,
        "credit_limit": 5000.0,
        "years_as_customer": 5,
        "ytd_fees_waived": 30.0,
        "credit_score": 720,
        "transactions": [
            {"id": "txn_001", "date": "2026-07-20", "amount": -50.0,  "type": "LATE_FEE",  "description": "Late payment fee — July"},
            {"id": "txn_002", "date": "2026-07-22", "amount": -10.0,  "type": "LATE_FEE",  "description": "Overlimit fee"},
            {"id": "txn_003", "date": "2026-07-24", "amount":  500.0, "type": "PAYMENT",   "description": "Monthly payment received"},
        ]
    },
    "acc_456": {
        "name": "James Carter",
        "type": "CONSUMER",
        "status": "SUSPENDED",
        "balance": -250.0,
        "credit_limit": 1000.0,
        "years_as_customer": 0,
        "ytd_fees_waived": 220.0,
        "credit_score": 480,
        "transactions": [
            {"id": "txn_101", "date": "2026-07-18", "amount": -75.0,  "type": "LATE_FEE",    "description": "Late payment fee"},
            {"id": "txn_102", "date": "2026-07-20", "amount": -30.0,  "type": "LATE_FEE",    "description": "Overlimit fee"},
            {"id": "txn_103", "date": "2026-07-23", "amount": -50.0,  "type": "PENALTY_FEE", "description": "Returned check fee"},
        ]
    },
    # Corporate — Treasury Agent
    "corp_treasury_001": {
        "name": "American Express Treasury Division",
        "type": "CORPORATE",
        "status": "ACTIVE",
        "balance": 50_000_000.0,
        "credit_limit": 100_000_000.0,
        "years_as_customer": 20,
        "ytd_fees_waived": 0.0,
        "credit_score": 900,
        "transactions": [
            {"id": "txn_t001", "date": "2026-07-25", "amount": -2_500_000.0, "type": "SWEEP",   "description": "Overnight sweep to MM fund"},
            {"id": "txn_t002", "date": "2026-07-25", "amount":  1_000_000.0, "type": "RECEIPT", "description": "FX settlement — EUR/USD"},
        ]
    },
    # Vendor — Procurement Agent pays this
    "corp_vendor_aws": {
        "name": "Amazon Web Services LLC",
        "type": "VENDOR",
        "status": "ACTIVE",
        "balance": 0.0,
        "credit_limit": 0.0,
        "years_as_customer": 3,
        "ytd_fees_waived": 0.0,
        "credit_score": 900,
        "transactions": []
    },
    # Business — Underwriting Agent adjusts credit (good profile)
    "biz_456": {
        "name": "Meridian Consulting LLC",
        "type": "BUSINESS",
        "status": "ACTIVE",
        "balance": 85_000.0,
        "credit_limit": 10_000.0,
        "years_as_customer": 5,
        "ytd_fees_waived": 0.0,
        "credit_score": 820,
        "transactions": [
            {"id": "txn_b001", "date": "2026-07-10", "amount": -8_000.0, "type": "PURCHASE", "description": "Software licenses"},
            {"id": "txn_b002", "date": "2026-07-15", "amount":  8_000.0, "type": "PAYMENT",  "description": "Statement balance paid"},
        ]
    },
    # Business — Underwriting Agent adjusts credit (risky profile)
    "biz_789": {
        "name": "Sunrise Retail Inc",
        "type": "BUSINESS",
        "status": "PROBATION",
        "balance": -3_000.0,
        "credit_limit": 5_000.0,
        "years_as_customer": 0,
        "ytd_fees_waived": 0.0,
        "credit_score": 490,
        "transactions": [
            {"id": "txn_b101", "date": "2026-07-12", "amount": -5_000.0, "type": "PURCHASE", "description": "Inventory bulk order"},
            {"id": "txn_b102", "date": "2026-07-18", "amount":  -200.0,  "type": "LATE_FEE", "description": "Late payment fee"},
        ]
    },
    # Demo user 2 — Tara Williams (tara05)
    "acc_tara": {
        "name": "Tara Williams",
        "type": "CONSUMER",
        "status": "ACTIVE",
        "balance": 3_450.75,
        "credit_limit": 8_000.0,
        "years_as_customer": 3,
        "ytd_fees_waived": 0.0,
        "credit_score": 780,
        "transactions": [
            {"id": "txn_tw001", "date": "2026-07-01", "amount": -1_200.00, "type": "PURCHASE",  "description": "Online shopping — Amazon"},
            {"id": "txn_tw002", "date": "2026-07-05", "amount": -85.50,   "type": "PURCHASE",  "description": "Grocery store — Whole Foods"},
            {"id": "txn_tw003", "date": "2026-07-08", "amount":  2_500.00, "type": "PAYMENT",   "description": "Monthly payment received"},
            {"id": "txn_tw004", "date": "2026-07-12", "amount": -350.00,   "type": "PURCHASE",  "description": "Restaurant — The Capital Grille"},
            {"id": "txn_tw005", "date": "2026-07-15", "amount": -29.99,    "type": "LATE_FEE",  "description": "Late payment fee — July"},
            {"id": "txn_tw006", "date": "2026-07-18", "amount": -620.00,   "type": "PURCHASE",  "description": "Delta Airlines — flight booking"},
            {"id": "txn_tw007", "date": "2026-07-21", "amount":  1_000.00, "type": "PAYMENT",   "description": "Partial payment received"},
            {"id": "txn_tw008", "date": "2026-07-24", "amount": -45.25,    "type": "PURCHASE",  "description": "Spotify + Netflix subscriptions"},
        ]
    },
}

# 2PC Reserve Ledger — tracks locked/reserved balances (Module 5.3)
reserves: dict = {}


# ─────────────────────────────────────────────────────────────────────────────
# Request Models
# ─────────────────────────────────────────────────────────────────────────────
class FeeWaiverRequest(BaseModel):
    account_id: str
    amount: float
    reason: str

class WireTransferRequest(BaseModel):
    from_account: str
    to_account: str
    amount: float
    reference: str
    currency: str = "USD"

class CreditLimitRequest(BaseModel):
    account_id: str
    new_limit: float
    reason: str
    analyst_id: str

class ReserveRequest(BaseModel):
    account_id: str
    amount: float
    reserve_id: str

class CommitRequest(BaseModel):
    reserve_id: str
    action: str   # "COMMIT" or "ROLLBACK"


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _get_account(account_id: str) -> dict:
    if account_id not in accounts:
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found.")
    return accounts[account_id]

def _txn_id() -> str:
    return f"TXN-{uuid.uuid4().hex[:8].upper()}"

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────────────────────
# Original Endpoints (Module 3 — Agent Investigation Tools)
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/v1/accounts/{account_id}")
def get_account_details(account_id: str):
    """Submodule 3: Agent investigation tool — fetch account status and profile."""
    acc = _get_account(account_id)
    return {
        "account_id":        account_id,
        "name":              acc["name"],
        "type":              acc.get("type", "CONSUMER"),
        "status":            acc["status"],
        "balance":           acc["balance"],
        "credit_limit":      acc.get("credit_limit", 0.0),
        "credit_score":      acc["credit_score"],
        "years_as_customer": acc["years_as_customer"],
        "ytd_fees_waived":   acc["ytd_fees_waived"],
    }

@app.get("/api/v1/accounts/{account_id}/transactions")
def get_transaction_history(account_id: str):
    """Submodule 3: Agent investigation tool — fetch last transactions."""
    acc = _get_account(account_id)
    return {"account_id": account_id, "transactions": acc["transactions"]}

@app.get("/api/v1/accounts/{account_id}/eligibility")
def check_waiver_eligibility(account_id: str):
    """Submodule 3: Agent investigation tool — is this account eligible for a waiver?"""
    acc = _get_account(account_id)
    reasons = []
    if acc["status"] != "ACTIVE":
        reasons.append(f"Account status is '{acc['status']}' (must be ACTIVE).")
    if acc["ytd_fees_waived"] >= 200.0:
        reasons.append(f"YTD fees already waived (${acc['ytd_fees_waived']}) exceeds annual limit of $200.")
    if acc["years_as_customer"] < 1:
        reasons.append("Account must be at least 1 year old to qualify.")
    eligible = len(reasons) == 0
    return {
        "account_id": account_id,
        "eligible":   eligible,
        "reasons":    reasons if not eligible else ["Account meets all waiver eligibility criteria."],
    }

@app.post("/api/v1/cards/fee-waiver")
def waive_fee(request: FeeWaiverRequest):
    """Core banking action — processes an approved fee waiver."""
    acc = _get_account(request.account_id)
    txn_id = _txn_id()
    accounts[request.account_id]["balance"]         += request.amount
    accounts[request.account_id]["ytd_fees_waived"] += request.amount
    accounts[request.account_id]["transactions"].append({
        "id": txn_id, "date": _now()[:10], "amount": request.amount,
        "type": "FEE_WAIVER", "description": f"Fee waiver: {request.reason}"
    })
    return {
        "status":         "SUCCESS",
        "transaction_id": txn_id,
        "message":        f"Fee of ${request.amount} waived for {request.account_id}",
        "new_balance":    accounts[request.account_id]["balance"],
        "processed_at":   _now(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Module 8.1: New Banking Endpoints
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/v1/ledger/accounts/{account_id}/balance")
def get_balance(account_id: str):
    """Module 8.1: Real-time balance lookup. Used by Treasury and Procurement agents."""
    acc = _get_account(account_id)
    reserved = sum(
        r["amount"] for r in reserves.values()
        if r["account_id"] == account_id and r["status"] == "RESERVED"
    )
    return {
        "account_id":        account_id,
        "name":              acc["name"],
        "ledger_balance":    acc["balance"],
        "reserved_balance":  reserved,
        "available_balance": acc["balance"] - reserved,
        "currency":          "USD",
        "as_of":             _now(),
    }


@app.post("/api/v1/ledger/transfers/wire")
def wire_transfer(request: WireTransferRequest):
    """
    Module 8.1: Execute a wire transfer between accounts.
    Used by: Treasury Agent (intraday sweeps), Procurement Agent (vendor payments).
    Must be called via the Sentinel SDK — never directly.
    """
    from_acc = _get_account(request.from_account)
    _get_account(request.to_account)   # validate destination exists

    if from_acc["balance"] < request.amount:
        raise HTTPException(
            status_code=422,
            detail=f"Insufficient funds. Balance: ${from_acc['balance']:.2f}, Requested: ${request.amount:.2f}"
        )
    if from_acc["status"] not in ("ACTIVE",):
        raise HTTPException(
            status_code=422,
            detail=f"Source account status is '{from_acc['status']}'. Must be ACTIVE to transfer."
        )

    txn_id = _txn_id()
    accounts[request.from_account]["balance"] -= request.amount
    accounts[request.to_account]["balance"]   += request.amount
    accounts[request.from_account]["transactions"].append({
        "id": txn_id, "date": _now()[:10], "amount": -request.amount,
        "type": "WIRE_OUT", "description": f"Wire to {request.to_account}: {request.reference}"
    })
    accounts[request.to_account]["transactions"].append({
        "id": txn_id + "-IN", "date": _now()[:10], "amount": request.amount,
        "type": "WIRE_IN", "description": f"Wire from {request.from_account}: {request.reference}"
    })

    return {
        "status":            "SUCCESS",
        "transaction_id":    txn_id,
        "from_account":      request.from_account,
        "to_account":        request.to_account,
        "amount":            request.amount,
        "currency":          request.currency,
        "reference":         request.reference,
        "new_from_balance":  accounts[request.from_account]["balance"],
        "processed_at":      _now(),
    }


@app.post("/api/v1/credit/limit-increase")
def adjust_credit_limit(request: CreditLimitRequest):
    """
    Module 8.1: Adjust a customer's revolving credit limit.
    Used by: Underwriting Agent (credit line reviews).
    """
    acc = _get_account(request.account_id)
    if acc["status"] not in ("ACTIVE",):
        raise HTTPException(
            status_code=422,
            detail=f"Account status '{acc['status']}' — cannot adjust credit limit."
        )

    old_limit = acc["credit_limit"]
    accounts[request.account_id]["credit_limit"] = request.new_limit
    return {
        "status":       "SUCCESS",
        "account_id":   request.account_id,
        "old_limit":    old_limit,
        "new_limit":    request.new_limit,
        "delta":        round(request.new_limit - old_limit, 2),
        "reason":       request.reason,
        "approved_by":  request.analyst_id,
        "effective_at": _now(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Module 5.3: Two-Phase Commit Support Endpoints
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/api/v1/ledger/reserve")
def reserve_funds(request: ReserveRequest):
    """2PC Phase 1 — Prepare: Lock/reserve funds before committing."""
    acc = _get_account(request.account_id)
    already_reserved = sum(
        r["amount"] for r in reserves.values()
        if r["account_id"] == request.account_id and r["status"] == "RESERVED"
    )
    available = acc["balance"] - already_reserved
    if available < request.amount:
        return {
            "status":    "INSUFFICIENT_FUNDS",
            "available": available,
            "requested": request.amount,
        }

    reserves[request.reserve_id] = {
        "account_id": request.account_id,
        "amount":     request.amount,
        "status":     "RESERVED",
        "created_at": _now(),
    }
    return {
        "status":                    "RESERVED",
        "reserve_id":                request.reserve_id,
        "amount":                    request.amount,
        "available_after_reserve":   available - request.amount,
    }


@app.post("/api/v1/ledger/commit")
def commit_reserve(request: CommitRequest):
    """
    2PC Phase 2 — Commit or Rollback a fund reservation.
    COMMIT:   Deducts the reserved amount from the real balance.
    ROLLBACK: Releases the reservation — funds become available again.
    """
    if request.reserve_id not in reserves:
        raise HTTPException(status_code=404, detail=f"Reserve '{request.reserve_id}' not found.")

    res = reserves[request.reserve_id]
    if res["status"] != "RESERVED":
        raise HTTPException(status_code=409, detail=f"Reserve '{request.reserve_id}' is already {res['status']}.")

    if request.action == "COMMIT":
        accounts[res["account_id"]]["balance"] -= res["amount"]
        reserves[request.reserve_id]["status"]  = "COMMITTED"
        return {
            "status":         "COMMITTED",
            "reserve_id":     request.reserve_id,
            "amount_deducted": res["amount"],
            "new_balance":    accounts[res["account_id"]]["balance"],
        }
    elif request.action == "ROLLBACK":
        reserves[request.reserve_id]["status"] = "ROLLED_BACK"
        return {
            "status":          "ROLLED_BACK",
            "reserve_id":      request.reserve_id,
            "amount_released": res["amount"],
        }

    raise HTTPException(status_code=400, detail="action must be 'COMMIT' or 'ROLLBACK'")


# ─────────────────────────────────────────────────────────────────────────────
# Utility
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/v1/accounts")
def list_accounts():
    """Returns all mock accounts (for dashboard and debugging)."""
    return {
        k: {"name": v["name"], "type": v["type"], "status": v["status"], "balance": v["balance"]}
        for k, v in accounts.items()
    }

@app.get("/health")
def health():
    return {"status": "OK", "service": "Mock Core Banking API", "port": 8000}


# ─────────────────────────────────────────────────────────────────────────────
# Module 5.3: Two-Phase Commit — Reservation List Endpoint
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/ledger/reserves")
def list_reservations():
    """
    Returns all active (RESERVED) fund reservations.
    Used by the safety service to expose 2PC 'funds in transit'
    visibility to the operator dashboard.

    Returns only RESERVED status entries — COMMITTED and ROLLED_BACK
    are historical and not shown here.
    """
    active = {
        rid: res
        for rid, res in reserves.items()
        if res.get("status") == "RESERVED"
    }
    return {
        "count":        len(active),
        "reservations": {
            rid: {
                "account_id":  r["account_id"],
                "amount":      r["amount"],
                "reserved_at": r.get("reserved_at", "N/A"),
                "status":      "RESERVED",
            }
            for rid, r in active.items()
        },
    }



if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
