/**
 * AlliGo - On-Chain x402 Payment Verification
 * Verifies USDC payments on Base, Ethereum, Polygon, Arbitrum, Optimism
 * 
 * Uses ethers.js v6 for RPC calls
 * Requires ALCHEMY_RPC_URL or PUBLIC_RPC_URL env var
 */

import { ethers, JsonRpcProvider, Contract, TransactionReceipt } from "ethers";

// Supported chains and their USDC contract addresses
export const USDC_CONTRACTS: Record<string, { address: string; chainId: number; rpcEnv: string; defaultRpc: string }> = {
  base: {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    chainId: 8453,
    rpcEnv: "ALCHEMY_BASE_RPC_URL",
    defaultRpc: "https://mainnet.base.org",
  },
  ethereum: {
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    chainId: 1,
    rpcEnv: "ALCHEMY_ETH_RPC_URL",
    defaultRpc: "https://eth.llamarpc.com",
  },
  polygon: {
    address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    chainId: 137,
    rpcEnv: "ALCHEMY_POLYGON_RPC_URL",
    defaultRpc: "https://polygon.llamarpc.com",
  },
  arbitrum: {
    address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    chainId: 42161,
    rpcEnv: "ALCHEMY_ARB_RPC_URL",
    defaultRpc: "https://arb1.arbitrum.io/rpc",
  },
  optimism: {
    address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    chainId: 10,
    rpcEnv: "ALCHEMY_OPT_RPC_URL",
    defaultRpc: "https://mainnet.optimism.io",
  },
};

// ERC20 Transfer event ABI (minimal)
const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function balanceOf(address owner) view returns (uint256)",
];

export interface PaymentVerificationResult {
  verified: boolean;
  chain?: string;
  amount?: number;      // USDC amount (6 decimals, in cents)
  from?: string;
  to?: string;
  timestamp?: number;
  error?: string;
  txHash?: string;
  blockNumber?: number;
}

// Cache providers to avoid recreating connections
const providerCache: Map<string, JsonRpcProvider> = new Map();

/**
 * Get or create a provider for the specified chain
 */
function getProvider(chain: string): JsonRpcProvider | null {
  if (providerCache.has(chain)) {
    return providerCache.get(chain)!;
  }
  
  const chainConfig = USDC_CONTRACTS[chain];
  if (!chainConfig) return null;
  
  // Try Alchemy RPC first, then fallback to public RPC
  const rpcUrl = process.env[chainConfig.rpcEnv] || process.env.ALCHEMY_RPC_URL || chainConfig.defaultRpc;
  
  try {
    const provider = new JsonRpcProvider(rpcUrl);
    providerCache.set(chain, provider);
    return provider;
  } catch (error: any) {
    console.error(`[x402] Failed to create provider for ${chain}:`, error.message);
    return null;
  }
}

/**
 * Verify an on-chain USDC payment
 * 
 * @param txHash - Transaction hash
 * @param expectedAmountCents - Expected amount in USDC cents (e.g., 100 = $1.00)
 * @param recipientAddress - Expected recipient address
 * @param chain - Chain to verify on (default: base)
 * @param timeoutMs - Timeout for RPC calls (default: 10000ms)
 */
export async function verifyOnChainPayment(
  txHash: string,
  expectedAmountCents: number,
  recipientAddress: string,
  chain: string = "base",
  timeoutMs: number = 10000
): Promise<PaymentVerificationResult> {
  const chainConfig = USDC_CONTRACTS[chain];
  
  if (!chainConfig) {
    return {
      verified: false,
      error: `Unsupported chain: ${chain}. Supported: ${Object.keys(USDC_CONTRACTS).join(", ")}`,
      txHash,
    };
  }
  
  // Normalize addresses
  const normalizedRecipient = recipientAddress.toLowerCase();
  const expectedUnits = BigInt(expectedAmountCents) * BigInt(1e6) / BigInt(100); // cents to USDC units (6 decimals)
  
  try {
    const provider = getProvider(chain);
    if (!provider) {
      return {
        verified: false,
        error: `No RPC provider available for ${chain}. Set ${chainConfig.rpcEnv} or ALCHEMY_RPC_URL env var.`,
        txHash,
        chain,
      };
    }
    
    console.log(`[x402] Verifying tx ${txHash} on ${chain}...`);
    
    // Get transaction receipt with timeout
    const receiptPromise = provider.getTransactionReceipt(txHash);
    const timeoutPromise = new Promise<null>((_, reject) => 
      setTimeout(() => reject(new Error("RPC timeout")), timeoutMs)
    );
    
    const receipt = await Promise.race([receiptPromise, timeoutPromise]) as TransactionReceipt | null;
    
    if (!receipt) {
      return {
        verified: false,
        error: "Transaction not found or still pending",
        txHash,
        chain,
      };
    }
    
    // Check if transaction was successful
    if (receipt.status !== 1) {
      return {
        verified: verified,
        error: "Transaction failed (status = 0)",
        txHash,
        chain,
        blockNumber: receipt.blockNumber,
      };
    }
    
    // Get USDC contract instance
    const usdcContract = new Contract(chainConfig.address, ERC20_ABI, provider);
    
    // Parse Transfer events from receipt logs
    const transferTopic = ethers.id("Transfer(address,address,uint256)");
    
    for (const log of receipt.logs) {
      // Check if this is a USDC Transfer event
      if (log.address.toLowerCase() !== chainConfig.address.toLowerCase()) continue;
      if (log.topics[0] !== transferTopic) continue;
      
      try {
        // Decode the Transfer event
        // topics[1] = from (indexed), topics[2] = to (indexed), data = value
        const from = "0x" + log.topics[1].slice(26); // Extract address from 32-byte word
        const to = "0x" + log.topics[2].slice(26);
        const value = BigInt(log.data);
        
        // Check if this transfer matches our expected payment
        if (to.toLowerCase() === normalizedRecipient) {
          const valueCents = Number(value * BigInt(100) / BigInt(1e6)); // Convert to cents
          
          // Verify amount (allow 1% tolerance for rounding)
          const tolerance = expectedAmountCents * 0.01;
          const amountMatch = Math.abs(valueCents - expectedAmountCents) <= tolerance;
          
          if (amountMatch || valueCents >= expectedAmountCents) {
            console.log(`[x402] ✅ Verified: ${valueCents} cents from ${from} to ${to}`);
            
            return {
              verified: true,
              chain,
              amount: valueCents,
              from,
              to,
              txHash,
              blockNumber: receipt.blockNumber,
            };
          } else {
            console.log(`[x402] ⚠️ Amount mismatch: expected ${expectedAmountCents} cents, got ${valueCents}`);
            return {
              verified: false,
              error: `Amount mismatch: expected ${expectedAmountCents} cents, received ${valueCents} cents`,
              chain,
              amount: valueCents,
              from,
              to,
              txHash,
              blockNumber: receipt.blockNumber,
            };
          }
        }
      } catch (decodeError: any) {
        console.error(`[x402] Error decoding log:`, decodeError.message);
      }
    }
    
    // No matching Transfer event found
    return {
      verified: false,
      error: `No USDC transfer to ${recipientAddress} found in transaction`,
      txHash,
      chain,
      blockNumber: receipt.blockNumber,
    };
    
  } catch (error: any) {
    console.error(`[x402] Verification error:`, error.message);
    return {
      verified: false,
      error: error.message || "Unknown error during verification",
      txHash,
      chain,
    };
  }
}

/**
 * Quick verification check - just confirm tx exists and was successful
 */
export async function quickVerifyTx(txHash: string, chain: string = "base"): Promise<{
  exists: boolean;
  success: boolean;
  blockNumber?: number;
  error?: string;
}> {
  const provider = getProvider(chain);
  if (!provider) {
    return { exists: false, success: false, error: "No RPC provider available" };
  }
  
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return { exists: false, success: false, error: "Transaction not found" };
    }
    
    return {
      exists: true,
      success: receipt.status === 1,
      blockNumber: receipt.blockNumber,
    };
  } catch (error: any) {
    return { exists: false, success: false, error: error.message };
  }
}

/**
 * Get USDC balance for an address
 */
export async function getUSDCBalance(
  address: string,
  chain: string = "base"
): Promise<{ balance: number; error?: string }> {
  const chainConfig = USDC_CONTRACTS[chain];
  if (!chainConfig) {
    return { balance: 0, error: `Unsupported chain: ${chain}` };
  }
  
  const provider = getProvider(chain);
  if (!provider) {
    return { balance: 0, error: "No RPC provider available" };
  }
  
  try {
    const usdcContract = new Contract(chainConfig.address, ERC20_ABI, provider);
    const balanceWei = await usdcContract.balanceOf(address);
    const balanceCents = Number(balanceWei * BigInt(100) / BigInt(1e6));
    
    return { balance: balanceCents };
  } catch (error: any) {
    return { balance: 0, error: error.message };
  }
}

/**
 * Generate a unique payment reference for tracking
 */
export function generatePaymentReference(clientId: string, tier: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `alligo_${tier}_${timestamp}_${random}`;
}

/**
 * Calculate required USDC amount for a tier
 */
export function calculateUSDCAmount(priceUsdCents: number): { 
  usdcUnits: bigint; 
  usdcCents: number;
  displayAmount: string;
} {
  // USDC has 6 decimals
  const usdcUnits = BigInt(priceUsdCents) * BigInt(1e6) / BigInt(100);
  const displayAmount = `$${(priceUsdCents / 100).toFixed(2)}`;
  
  return {
    usdcUnits,
    usdcCents: priceUsdCents,
    displayAmount,
  };
}

/**
 * Export verification status for admin dashboard
 */
export function getVerificationStatus(): {
  enabled: boolean;
  chainsSupported: string[];
  rpcConfigured: boolean;
  lastVerification: number | null;
} {
  const rpcConfigured = !!(process.env.ALCHEMY_RPC_URL || process.env.ALCHEMY_BASE_RPC_URL);
  
  return {
    enabled: rpcConfigured,
    chainsSupported: Object.keys(USDC_CONTRACTS),
    rpcConfigured,
    lastVerification: null,
  };
}

/**
 * Get chain config for payment flow
 */
export function getChainConfig(chain: string) {
  return USDC_CONTRACTS[chain] || null;
}
