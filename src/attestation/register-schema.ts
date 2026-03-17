/**
 * AlliGo EAS Schema Registration Script
 * 
 * Run once to register the AlliGo schema on Base EAS.
 * 
 * Usage:
 *   EAS_PRIVATE_KEY=0x... bun run src/attestation/register-schema.ts
 *
 * If wallet has no ETH, it will:
 * 1. Print the deterministic schema UID (same whether registered or not)
 * 2. Show the registration transaction that would be sent
 * 3. Write the schema UID to .env.eas for use by attesters
 *
 * The schema UID is deterministic — we can compute it NOW, use it in
 * offchain attestations, and register it on-chain later. Both work.
 */

import { computeSchemaUid, registerSchema, checkSchemaRegistered, ALLIGO_SCHEMA } from "./eas";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const EAS_ENV_FILE = join(process.cwd(), ".env.eas");

async function main() {
  console.log("=".repeat(60));
  console.log("AlliGo EAS Schema Registration");
  console.log("=".repeat(60));
  console.log("\nSchema definition:");
  console.log(ALLIGO_SCHEMA);
  console.log();

  // Compute deterministic UID
  const computedUid = computeSchemaUid();
  console.log("Computed schema UID:", computedUid);
  console.log("View (if registered): https://base.easscan.org/schema/view/" + computedUid);
  console.log();

  // Check if already registered
  console.log("Checking if schema is registered on Base...");
  const isRegistered = await checkSchemaRegistered(computedUid);
  
  if (isRegistered) {
    console.log("✅ Schema already registered!");
    writeEnv(computedUid);
    return;
  }

  console.log("Schema not yet registered on Base.");
  
  const privateKey = process.env.EAS_PRIVATE_KEY;
  if (!privateKey) {
    console.log("\n⚠️  No EAS_PRIVATE_KEY set.");
    console.log("Using computed UID for offchain attestations (no gas needed).");
    console.log("Set EAS_PRIVATE_KEY + fund wallet to register on-chain.\n");
    writeEnv(computedUid);
    return;
  }

  // Try to register on-chain
  try {
    console.log("Attempting on-chain registration...");
    const uid = await registerSchema(privateKey);
    writeEnv(uid);
    console.log("\nUID written to", EAS_ENV_FILE);
  } catch (e: any) {
    if (e.message?.includes("insufficient funds") || e.code === "INSUFFICIENT_FUNDS") {
      console.log("⚠️  Insufficient ETH for gas. Using computed UID for offchain mode.");
      writeEnv(computedUid);
    } else {
      throw e;
    }
  }
}

function writeEnv(uid: string) {
  const content = `# AlliGo EAS Configuration — Base Mainnet
EAS_SCHEMA_UID=${uid}
EAS_CONTRACT=0x4200000000000000000000000000000000000021
EAS_SCHEMA_REGISTRY=0x4200000000000000000000000000000000000020
EAS_CHAIN_ID=8453
EAS_MODE=offchain
# Set EAS_MODE=onchain and fund EAS_ATTESTER_ADDRESS to write on-chain
# EAS_ATTESTER_ADDRESS=0x7a7a2A55e042c87cafA9163e0E410aef97b402Bf
`;
  writeFileSync(EAS_ENV_FILE, content);
  console.log("✅ Schema UID:", uid);
  console.log("   Written to:", EAS_ENV_FILE);
}

main().catch(console.error);
