import os
import json
import subprocess
import urllib.request
import platform

OPA_BIN_DIR = os.path.join(os.path.dirname(__file__), "bin")
OPA_BIN_PATH = os.path.join(OPA_BIN_DIR, "opa.exe" if os.name == "nt" else "opa")

def _ensure_opa_installed():
    if not os.path.exists(OPA_BIN_PATH):
        os.makedirs(OPA_BIN_DIR, exist_ok=True)
        url = "https://openpolicyagent.org/downloads/v0.61.0/opa_windows_amd64.exe" if os.name == "nt" else "https://openpolicyagent.org/downloads/v0.61.0/opa_linux_amd64_static"
        
        # In case we're on Mac
        if platform.system() == "Darwin":
            arch = "arm64" if platform.machine() == "arm64" else "amd64"
            url = f"https://openpolicyagent.org/downloads/v0.61.0/opa_darwin_{arch}"
            
        print(f"[OPA ENGINE] Downloading OPA binary from {url}...")
        urllib.request.urlretrieve(url, OPA_BIN_PATH)
        if os.name != "nt":
            os.chmod(OPA_BIN_PATH, 0o755)
        print("[OPA ENGINE] Download complete.")

def evaluate_policy(policy_file: str, input_data: dict, package_path: str) -> dict:
    """
    Evaluates a structured JSON intent against a Rego policy file.
    
    Args:
        policy_file: Path to the .rego file
        input_data: The dictionary to pass as 'input' to OPA
        package_path: The Rego package to evaluate (e.g., 'data.sentinel.servicing_disputes')
    """
    _ensure_opa_installed()
    
    try:
        # Opa evaluates stdin as the 'input' document
        payload = json.dumps(input_data).encode("utf-8")
        
        process = subprocess.run(
            [OPA_BIN_PATH, "eval", "-d", policy_file, "-I", package_path],
            input=payload,
            capture_output=True,
            check=True
        )
        result = json.loads(process.stdout)
        
        # OPA eval returns: {"result": [{"expressions": [{"value": {"decision": "ALLOW", "reason": "..."}}]}]}
        if "result" in result and len(result["result"]) > 0:
            value = result["result"][0]["expressions"][0]["value"]
            return {
                "decision": value.get("decision", "DENY"),
                "reason": value.get("reason", "Unknown policy reason.")
            }
        return {"decision": "DENY", "reason": "Policy returned no result."}
    except subprocess.CalledProcessError as e:
        err = e.stderr.decode("utf-8") if e.stderr else str(e)
        print(f"[OPA ENGINE] Evaluation failed: {err}")
        return {"decision": "DENY", "reason": f"OPA Engine Error: {err}"}
    except Exception as e:
        print(f"[OPA ENGINE] Internal Error: {e}")
        return {"decision": "DENY", "reason": f"Internal Engine Error: {str(e)}"}
