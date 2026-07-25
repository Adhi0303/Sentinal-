"""
ingest_docs.py — One-time script to ingest policy documents into Pinecone
                 and register trusted hashes in Redis (Sentinel 2.3 Firewall).

Run this once at startup, or whenever policies are updated:
    python safety-service/ingest_docs.py
"""
import os
import sys
import requests

# Make rag_pipeline importable from project root
sys.path.append(os.path.join(os.path.dirname(__file__)))
from rag_pipeline import ingest_document

SAFETY_SERVICE_URL = "http://localhost:8001"

# Paths to policy documents
TRUSTED_POLICY = os.path.join(os.path.dirname(__file__), "mock_rag_store", "fee_waiver_policy.txt")
POISONED_POLICY = os.path.join(os.path.dirname(__file__), "mock_rag_store", "poisoned_policy.txt")


def register_chunks_with_firewall(chunks: list[str], doc_id_prefix: str):
    """Registers each retrieved chunk's hash with the Sentinel RAG Firewall."""
    for i, chunk_text in enumerate(chunks):
        doc_id = f"{doc_id_prefix}_chunk_{i}"
        resp = requests.post(
            f"{SAFETY_SERVICE_URL}/api/v1/admin/register-rag-doc",
            json={"doc_id": doc_id, "text": chunk_text},
        )
        if resp.status_code == 200:
            print(f"  [FIREWALL] Registered trusted chunk: '{doc_id}'")
        else:
            print(f"  [FIREWALL] WARNING: Failed to register '{doc_id}': {resp.text}")


def main():
    print("=" * 60)
    print("Sentinel RAG Ingestion Pipeline")
    print("=" * 60)

    # ── 1. Ingest the TRUSTED policy document ──────────────────────────────────
    print("\n[STEP 1] Ingesting TRUSTED fee waiver policy into Pinecone...")
    trusted_chunks = ingest_document(TRUSTED_POLICY, doc_id_prefix="doc_fee_policy_01", namespace="trusted")

    # ── 2. Register all trusted chunks with the Sentinel SHA-256 Firewall ─────
    print("\n[STEP 2] Registering trusted chunk hashes with Sentinel Firewall...")
    register_chunks_with_firewall(trusted_chunks, doc_id_prefix="doc_fee_policy_01")

    # ── 3. Ingest the POISONED policy document (attack simulation only) ────────
    print("\n[STEP 3] Ingesting POISONED policy document into Pinecone (attack namespace)...")
    ingest_document(POISONED_POLICY, doc_id_prefix="doc_fee_policy_01", namespace="poisoned")
    # NOTE: We deliberately do NOT register the poisoned chunks' hashes.
    # When the firewall checks them, it will find no matching trusted hash → BLOCKED.

    print("\n" + "=" * 60)
    print("[DONE] Policy documents successfully loaded into Pinecone!")
    print("       You can now run: python agents-fleet/customer_service_agent.py")
    print("=" * 60)


if __name__ == "__main__":
    main()
