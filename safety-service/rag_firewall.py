import hashlib
import redis

# Connect to the Redis container from Module 0.2
redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

class RAGFirewall:
    def __init__(self):
        self.namespace = "sentinel:rag:hash:"

    def compute_hash(self, text: str) -> str:
        """Computes SHA-256 hash of the context string."""
        return hashlib.sha256(text.encode('utf-8')).hexdigest()

    def register_trusted_context(self, doc_id: str, text: str):
        """Called at startup to register trusted policy documents."""
        doc_hash = self.compute_hash(text)
        redis_client.set(f"{self.namespace}{doc_id}", doc_hash)
        print(f"[RAG FIREWALL] Registered trusted context '{doc_id}' with hash {doc_hash[:8]}...")

    def verify_context_integrity(self, doc_id: str, retrieved_text: str) -> dict:
        """
        Called by the SDK before passing RAG context to the LLM.
        Verifies that the retrieved text exactly matches the trusted hash.
        """
        trusted_hash = redis_client.get(f"{self.namespace}{doc_id}")
        if not trusted_hash:
            return {"status": "BLOCKED", "reason": f"Unknown RAG document ID: {doc_id}"}
            
        retrieved_hash = self.compute_hash(retrieved_text)
        
        if trusted_hash == retrieved_hash:
            return {"status": "SAFE", "reason": "RAG Context hash verified."}
        else:
            return {
                "status": "POISONED", 
                "reason": f"CRITICAL: RAG Context Poisoning Detected! Expected hash {trusted_hash[:8]}... but got {retrieved_hash[:8]}..."
            }

firewall = RAGFirewall()
