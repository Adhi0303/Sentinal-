from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="Mock Core Banking API")

# In-memory mock database
accounts = {
    "acc_123": {"balance": 1000.0, "status": "ACTIVE"}
}

class FeeWaiverRequest(BaseModel):
    account_id: str
    amount: float
    reason: str

@app.post("/api/v1/cards/fee-waiver")
def waive_fee(request: FeeWaiverRequest):
    if request.account_id not in accounts:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Process fee waiver
    accounts[request.account_id]["balance"] += request.amount
    return {
        "status": "SUCCESS",
        "message": f"Fee of ${request.amount} waived for {request.account_id}",
        "new_balance": accounts[request.account_id]["balance"]
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
