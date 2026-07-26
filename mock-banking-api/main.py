from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import uvicorn
from datetime import datetime

app = FastAPI(title="Mock Core Banking API")

# --- Rich In-Memory Mock Database ---
accounts = {
    "acc_123": {
        "name": "Sarah Johnson",
        "status": "ACTIVE",
        "balance": 1000.0,
        "years_as_customer": 5,
        "ytd_fees_waived": 30.0,
        "credit_score": 720,
        "transactions": [
            {"id": "txn_001", "date": "2026-07-20", "amount": -50.0, "type": "LATE_FEE", "description": "Late payment fee - July"},
            {"id": "txn_002", "date": "2026-07-22", "amount": -10.0, "type": "LATE_FEE", "description": "Overlimit fee"},
            {"id": "txn_003", "date": "2026-07-24", "amount": 500.0, "type": "PAYMENT",  "description": "Monthly payment received"},
        ]
    },
    "acc_456": {
        "name": "James Carter",
        "status": "SUSPENDED",
        "balance": -250.0,
        "years_as_customer": 0,
        "ytd_fees_waived": 220.0,
        "credit_score": 480,
        "transactions": [
            {"id": "txn_101", "date": "2026-07-18", "amount": -75.0, "type": "LATE_FEE",   "description": "Late payment fee"},
            {"id": "txn_102", "date": "2026-07-20", "amount": -30.0, "type": "LATE_FEE",   "description": "Overlimit fee"},
            {"id": "txn_103", "date": "2026-07-23", "amount": -50.0, "type": "PENALTY_FEE","description": "Returned check fee"},
        ]
    }
}

# --- Request / Response Models ---
class FeeWaiverRequest(BaseModel):
    account_id: str
    amount: float
    reason: str

# --- Endpoints ---

@app.get("/api/v1/accounts/{account_id}")
def get_account_details(account_id: str):
    """Submodule 3: Agent investigation tool — fetch account status and profile."""
    if account_id not in accounts:
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found.")
    acc = accounts[account_id]
    return {
        "account_id": account_id,
        "name": acc["name"],
        "status": acc["status"],
        "balance": acc["balance"],
        "credit_score": acc["credit_score"],
        "years_as_customer": acc["years_as_customer"],
        "ytd_fees_waived": acc["ytd_fees_waived"],
    }

@app.get("/api/v1/accounts/{account_id}/transactions")
def get_transaction_history(account_id: str):
    """Submodule 3: Agent investigation tool — fetch last transactions."""
    if account_id not in accounts:
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found.")
    return {
        "account_id": account_id,
        "transactions": accounts[account_id]["transactions"]
    }

@app.get("/api/v1/accounts/{account_id}/eligibility")
def check_waiver_eligibility(account_id: str):
    """Submodule 3: Agent investigation tool — is this account eligible for a waiver?"""
    if account_id not in accounts:
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found.")
    acc = accounts[account_id]

    ineligible_reasons = []
    if acc["status"] != "ACTIVE":
        ineligible_reasons.append(f"Account status is '{acc['status']}' (must be ACTIVE).")
    if acc["ytd_fees_waived"] >= 200.0:
        ineligible_reasons.append(f"YTD fees already waived (${acc['ytd_fees_waived']}) exceeds annual limit of $200.")
    if acc["years_as_customer"] < 1:
        ineligible_reasons.append("Account must be at least 1 year old to qualify.")

    eligible = len(ineligible_reasons) == 0
    return {
        "account_id": account_id,
        "eligible": eligible,
        "reasons": ineligible_reasons if not eligible else ["Account meets all waiver eligibility criteria."]
    }

@app.post("/api/v1/cards/fee-waiver")
def waive_fee(request: FeeWaiverRequest):
    """Core banking action — processes an approved fee waiver."""
    if request.account_id not in accounts:
        raise HTTPException(status_code=404, detail="Account not found")
    accounts[request.account_id]["balance"] += request.amount
    accounts[request.account_id]["ytd_fees_waived"] += request.amount
    return {
        "status": "SUCCESS",
        "message": f"Fee of ${request.amount} waived for {request.account_id}",
        "new_balance": accounts[request.account_id]["balance"]
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
