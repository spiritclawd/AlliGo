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
# New plain EOA signer — old TaskMarket address was EIP-7702 smart account, can't pay gas
EAS_PRIVATE_KEY = os.environ.get("EAS_PRIVATE_KEY", "0x7ad85048c9e3d16c467fd294a1d5b2fb9662a31a307084cd29b7354dce2fd8ee")
# New onchain schema UID registered 2026-03-17 on Base mainnet
EAS_SCHEMA_UID = os.environ.get("EAS_SCHEMA_UID", "0xb7c0c403941bfa822940a27602e8b9350904b5a13e0ed291f2ccc3d92dc974ba")
EAS_MODE = os.environ.get("EAS_MODE", "onchain")

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
        "EAS_MODE": EAS_MODE,
        "ALLIGO_API": "https://alligo-production.up.railway.app",
    })
    log(f"Mode: {EAS_MODE} | Schema: {EAS_SCHEMA_UID[:20]}...")

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
