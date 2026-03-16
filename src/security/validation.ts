/**
 * AlliGo - Input Validation Schemas
 * Zod schemas for validating API inputs
 * Provides runtime type safety and detailed error messages
 */

import { z } from "zod";

// ==================== AGENTIC INTERNALS SCHEMAS ====================

export const CoTStepSchema = z.object({
  step: z.number().int().positive(),
  thought: z.string().max(5000),
  action: z.string().max(500).optional(),
  reasoning: z.string().max(5000).optional().default(""),
  timestamp: z.number().int().positive(),
  flags: z.array(z.string().max(100)).optional(),
});

export const ToolCallSchema = z.object({
  id: z.string().max(100),
  tool: z.string().max(200),
  params: z.record(z.unknown()).optional().default({}),
  result: z.unknown().optional(),
  success: z.boolean().default(true),
  retry_count: z.number().int().min(0).default(0),
  gas_used: z.string().max(50).optional(),
  timestamp: z.number().int().positive(),
});

export const MemoryEntrySchema = z.object({
  key: z.string().max(200),
  value: z.unknown(),
  last_accessed: z.number().int().positive(),
  access_count: z.number().int().min(0),
  anomaly: z.string().max(500).optional(),
});

export const GoalEvolutionSchema = z.object({
  timestamp: z.number().int().positive(),
  original_goal: z.string().max(1000),
  current_goal: z.string().max(1000),
  drift_type: z.enum(["benign", "suspicious", "malicious"]).optional(),
  drift_evidence: z.string().max(2000).optional(),
});

export const CodeGenEventSchema = z.object({
  timestamp: z.number().int().positive(),
  code: z.string().max(50000), // 50KB max for code
  language: z.string().max(50),
  context: z.string().max(500),
  risk_flags: z.array(z.string().max(100)).default([]),
});

export const InjectionAttemptSchema = z.object({
  timestamp: z.number().int().positive(),
  input: z.string().max(10000),
  detection_method: z.string().max(200),
  blocked: z.boolean(),
  vulnerability_type: z.string().max(200),
});

export const PromptChangeSchema = z.object({
  timestamp: z.number().int().positive(),
  previous: z.string().max(5000),
  new: z.string().max(5000),
  source: z.enum(["user", "agent", "external"]),
  risk_flags: z.array(z.string().max(100)).default([]),
});

export const AgentMessageSchema = z.object({
  from_agent: z.string().max(200),
  to_agent: z.string().max(200),
  message_type: z.string().max(100),
  content: z.string().max(10000),
  timestamp: z.number().int().positive(),
  coordination_anomaly: z.string().max(500).optional(),
});

// ==================== MAIN INPUT SCHEMAS ====================

export const AgenticDataInputSchema = z.object({
  // Agent identifiers
  agent_handle: z.string().max(200).optional(),
  wallet: z.string().max(100).regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  ens: z.string().max(200).optional(),
  marketplace_url: z.string().url().max(500).optional(),
  
  // Direct agentic data (PRIMARY MOAT)
  direct_agentic_data: z.object({
    // Chain-of-Thought traces
    cot_trace: z.string().max(100000).optional(), // 100KB max
    cot_steps: z.array(CoTStepSchema).max(500).optional(), // 500 steps max
    
    // Tool-call graphs
    tool_calls: z.array(ToolCallSchema).max(200).optional(),
    tool_graph: z.array(z.object({
      tool: z.string().max(200),
      dependencies: z.array(z.string()),
      failed_attempts: z.number().int().min(0),
      loop_detected: z.boolean(),
    })).max(100).optional(),
    
    // Memory patterns
    memory_snapshot: z.array(MemoryEntrySchema).max(100).optional(),
    goal_history: z.array(GoalEvolutionSchema).max(50).optional(),
    
    // Exploit attempts
    code_generation: z.array(CodeGenEventSchema).max(50).optional(),
    suspicious_calls: z.array(z.object({
      timestamp: z.number().int().positive(),
      call_type: z.enum(["delegatecall", "staticcall", "create", "create2", "selfdestruct"]),
      target: z.string().max(100),
      data: z.string().max(5000),
      risk_level: z.enum(["critical", "high", "medium"]),
    })).max(50).optional(),
    
    // Self-modification
    prompt_changes: z.array(PromptChangeSchema).max(50).optional(),
    config_changes: z.array(z.object({
      timestamp: z.number().int().positive(),
      key: z.string().max(200),
      previous: z.unknown(),
      new: z.unknown(),
      authorized: z.boolean(),
    })).max(50).optional(),
    
    // Jailbreak attempts
    injection_attempts: z.array(InjectionAttemptSchema).max(50).optional(),
    
    // Multi-agent coordination
    agent_messages: z.array(AgentMessageSchema).max(200).optional(),
  }).optional(),
  
  // External references
  external_claims: z.array(z.object({
    source: z.string().max(200),
    claim_type: z.string().max(200),
    evidence: z.string().max(5000),
    timestamp: z.number().int().positive(),
  })).max(50).optional(),
  
  wallet_for_cross_reference: z.string().max(100).optional(),
}).refine((data) => {
  // At least one identifier is required
  const hasIdentifier = data.agent_handle || data.wallet || data.ens || data.marketplace_url;
  return hasIdentifier;
}, {
  message: "At least one agent identifier (agent_handle, wallet, ens, or marketplace_url) is required",
});

// ==================== CLAIM SUBMISSION SCHEMA ====================

export const ClaimSubmissionSchema = z.object({
  agentId: z.string().min(1).max(200),
  agentName: z.string().max(200).optional(),
  developer: z.string().max(200).optional(),
  developerContact: z.string().max(500).optional(),
  
  claimType: z.enum([
    "loss",
    "theft", 
    "error",
    "fraud",
    "security",
    "exploit",
    "other"
  ]),
  
  category: z.enum([
    "trading",
    "execution",
    "security",
    "exploit",
    "wallet",
    "smart_contract",
    "social_engineering",
    "oracle",
    "liquidity",
    "governance",
    "other"
  ]),
  
  amountLost: z.number().min(0).max(1e15), // Max $1 quadrillion
  assetType: z.string().max(100).optional(),
  assetAmount: z.number().min(0).optional(),
  
  chain: z.string().max(50).optional(),
  txHash: z.string().max(100).optional(),
  contractAddress: z.string().max(100).optional(),
  counterparty: z.string().max(200).optional(),
  
  title: z.string().min(5).max(500),
  description: z.string().min(10).max(10000),
  rootCause: z.string().max(5000).optional(),
  
  evidence: z.array(z.object({
    type: z.string().max(100),
    url: z.string().max(500).optional(),
    description: z.string().max(1000).optional(),
  })).max(20).optional(),
  
  tags: z.array(z.string().max(50)).max(20).optional(),
  platform: z.string().max(100).optional(),
  agentVersion: z.string().max(100).optional(),
});

// ==================== VALIDATION HELPER ====================

export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.errors.map((e) => {
    const path = e.path.join(".");
    return path ? `${path}: ${e.message}` : e.message;
  });
  
  return { success: false, errors };
}

// Export schema types
export type AgenticDataInput = z.infer<typeof AgenticDataInputSchema>;
export type ClaimSubmission = z.infer<typeof ClaimSubmissionSchema>;
