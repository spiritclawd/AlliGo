/**
 * AlliGo SDK TypeScript Definitions
 */

export interface AlliGoConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface AgentScore {
  agentId: string;
  riskScore: number;
  confidence: number;
  totalClaims: number;
  openClaims: number;
  totalValueLost: number;
  grade: string;
  summary: string;
  lastUpdated: number;
}

export interface Claim {
  id: string;
  agentId: string;
  agentName?: string;
  developer?: string;
  claimType: string;
  category: string;
  severity: { score: number; level: string; factors: string[] };
  amountLost: number;
  assetType?: string;
  chain?: string;
  title: string;
  description: string;
  rootCause?: string;
  resolution: string;
  timestamp: number;
  platform?: string;
  verified: boolean;
}

export interface Stats {
  totalClaims: number;
  totalValueLost: number;
  totalValueRecovered: number;
  recoveryRate: number;
  claimsByType: Record<string, number>;
  claimsByCategory: Record<string, number>;
  claimsByChain: Record<string, number>;
  topAgents: Array<{ agentId: string; claims: number; valueLost: number; name?: string }>;
  recentClaims: Claim[];
  trends: {
    claimsLast30Days: number;
    claimsLast7Days: number;
    avgLossPerClaim: number;
  };
}

export interface SubmitClaimRequest {
  agentId: string;
  agentName?: string;
  developer?: string;
  claimType: 'loss' | 'error' | 'security' | 'breach' | 'fraud' | 'unknown';
  category: 'trading' | 'payment' | 'security' | 'execution' | 'governance' | 'other';
  amountLost: number;
  assetType?: string;
  chain?: string;
  title: string;
  description: string;
  rootCause?: string;
  evidence?: string[];
  platform?: string;
}

export class AlliGo {
  constructor(config?: AlliGoConfig);
  getAgentScore(agentId: string): Promise<AgentScore>;
  getAgentClaims(agentId: string): Promise<Claim[]>;
  getStats(): Promise<Stats>;
  getPublicStats(): Promise<Stats>;
  submitClaim(claim: SubmitClaimRequest): Promise<{ success: boolean; claimId: string; message: string }>;
  getBadgeUrl(agentId: string, type?: 'default' | 'compact' | 'banner'): string;
  getBadgeEmbed(agentId: string, options?: { type?: 'default' | 'compact' | 'banner'; link?: boolean }): string;
  isCertified(agentId: string): Promise<boolean>;
  getRiskLevel(agentId: string): Promise<'low' | 'medium' | 'high' | 'critical' | 'unknown'>;
}

export class AlliGoError extends Error {
  constructor(message: string, statusCode: number);
  statusCode: number;
}

export const alligo: AlliGo;

export default AlliGo;
