import os
import json
import subprocess
import urllib.request

OPA_BIN_PATH = "opa.exe"
if not os.path.exists(OPA_BIN_PATH):
    urllib.request.urlretrieve("https://openpolicyagent.org/downloads/v0.61.0/opa_windows_amd64.exe", OPA_BIN_PATH)

policy = """
package sentinel.servicing_disputes
decision = "ALLOW" { input.amount <= 50 }
reason = "Auto-approved" { input.amount <= 50 }
"""
with open("test.rego", "w") as f:
    f.write(policy)

input_data = {"amount": 20}
process = subprocess.run(
    [OPA_BIN_PATH, "eval", "-d", "test.rego", "-I", "data.sentinel.servicing_disputes"],
    input=json.dumps(input_data).encode("utf-8"),
    capture_output=True,
    check=True
)
print(json.loads(process.stdout))
