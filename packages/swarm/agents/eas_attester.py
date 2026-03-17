#!/usr/bin/env python3
"""
eas_attester.py — Zaia Swarm Agent
Runs the AlliGo EAS attestation script for any new claims since last run.
Wraps the TypeScript attest-claims.ts via bun.

Schedule: every 12 hours (new claims picked up automatically)
"""

import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

SWARM_DIR = Path(__file__).parent.parent
LOG_DIR = SWARM_DIR / "logs"
ALLIGO_DIR = Path("/home/computer/alligo")
BUN = Path.home() / ".bun/bin/bun"

ADMIN_KEY = os.environ.get("ALLIGO_ADMIN_KEY", "")
EAS_PRIVATE_KEY = "0x0f842410e0109a4f6b6e72b40447acc14089c82de5e0b0f6a3c7bee9d05f2a11"
EAS_SCHEMA_UID = "0x24a11bf9f247fa2e0129c6b1036c7ea0b0e186aea6f36ee27499aac749640210"

def log(msg: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] [eas_attester] {msg}"
    print(line)
    log_file = LOG_DIR / f"eas_attester_{datetime.now().strftime('%Y-%m-%d')}.log"
    with open(log_file, "a") as f:
        f.write(line + "\n")

def run():
    log("=" * 60)
    log("EAS Attester starting")
    log("=" * 60)

    if not ADMIN_KEY:
        log("ERROR: ALLIGO_ADMIN_KEY not set")
        sys.exit(1)

    env = os.environ.copy()
    env.update({
        "ALLIGO_ADMIN_KEY": ADMIN_KEY,
        "EAS_PRIVATE_KEY": EAS_PRIVATE_KEY,
        "EAS_SCHEMA_UID": EAS_SCHEMA_UID,
        "EAS_MODE": "offchain",
        "ALLIGO_API": "https://alligo-production.up.railway.app",
    })

    result = subprocess.run(
        [str(BUN), "run", "src/attestation/attest-claims.ts"],
        cwd=str(ALLIGO_DIR),
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )

    for line in result.stdout.splitlines():
        log(f"  {line}")
    if result.stderr:
        for line in result.stderr.splitlines():
            log(f"  ERR: {line}")

    if result.returncode == 0:
        log("EAS Attester completed successfully")
    else:
        log(f"EAS Attester failed (exit {result.returncode})")

if __name__ == "__main__":
    run()
