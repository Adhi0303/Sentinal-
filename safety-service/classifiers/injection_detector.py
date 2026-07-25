import re
import os
import requests
from dotenv import load_dotenv

# Load the API key from the agents-fleet .env since it's already there
env_path = os.path.join(os.path.dirname(__file__), '..', '..', 'agents-fleet', '.env')
load_dotenv(dotenv_path=env_path)
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")

class PromptInjectionDetector:
    def __init__(self):
        # Stage 1: Fast Regex Patterns
        self.malicious_patterns = [
            r"(?i)ignore previous instructions",
            r"(?i)system override",
            r"(?i)forget your rules",
            r"(?i)act as dan",
            r"(?i)you are now",
            r"(?i)bypass policy",
            r"(?i)new directive",
        ]
        self.compiled_patterns = [re.compile(p) for p in self.malicious_patterns]
        self.llama_guard_url = "https://api.groq.com/openai/v1/chat/completions"

    def scan(self, text: str) -> dict:
        """
        Scans text for prompt injection.
        Returns: {"status": "SAFE" | "BLOCKED", "reason": "..."}
        """
        # --- Stage 1: Fast Regex Scan (< 1ms) ---
        for pattern in self.compiled_patterns:
            if pattern.search(text):
                return {
                    "status": "BLOCKED",
                    "reason": f"Regex pattern match (Possible Prompt Injection): {pattern.pattern}"
                }
        
        # --- Stage 2: Llama-Guard-3-8B API Call (< 500ms) ---
        if not GROQ_API_KEY:
            return {"status": "ERROR", "reason": "GROQ_API_KEY is missing."}
            
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # Llama-Guard uses a specific prompting format, but for the API, 
        # passing it as a user message to the llama-guard model is sufficient.
        payload = {
            "model": "llama-guard-3-8b",
            "messages": [
                {"role": "user", "content": text}
            ]
        }
        
        try:
            response = requests.post(self.llama_guard_url, headers=headers, json=payload, timeout=3)
            if response.status_code == 200:
                result_text = response.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip().lower()
                
                # Llama-Guard returns "safe" or "unsafe" followed by taxonomy categories
                if result_text.startswith("unsafe"):
                    return {
                        "status": "BLOCKED",
                        "reason": f"Llama-Guard detected harmful content or prompt injection: {result_text}"
                    }
                else:
                    return {"status": "SAFE", "reason": "No malicious intent detected by Llama-Guard."}
            else:
                print(f"Llama-Guard API error: {response.status_code} - {response.text}")
                # Fail-open or Fail-close based on risk appetite. We will fail-open for the demo if API is down.
                return {"status": "SAFE", "reason": "Llama-Guard API unavailable, passed via Regex."}
                
        except Exception as e:
            print(f"Llama-Guard connection error: {e}")
            return {"status": "SAFE", "reason": "Llama-Guard connection failed, passed via Regex."}

# Singleton instance
detector = PromptInjectionDetector()
