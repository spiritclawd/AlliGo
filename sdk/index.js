/**
 * AlliGo JavaScript SDK
 * @alligo/sdk - Official SDK for the AlliGo API
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
  private apiKey?: string;
  private baseUrl: string;

  constructor(config: AlliGoConfig = {}) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.alligo.io';
  }

  /**
   * Get the risk score for an agent
   */
  async getAgentScore(agentId: string): Promise<AgentScore> {
    const response = await this.request('GET', `/api/agents/${encodeURIComponent(agentId)}/score`);
    return response;
  }

  /**
   * Get all claims for an agent
   */
  async getAgentClaims(agentId: string): Promise<Claim[]> {
    const response = await this.request('GET', `/api/agents/${encodeURIComponent(agentId)}/claims`);
    return response.claims;
  }

  /**
   * Get global statistics
   */
  async getStats(): Promise<Stats> {
    const response = await this.request('GET', '/api/stats');
    return response.stats;
  }

  /**
   * Get public statistics (no auth required)
   */
  async getPublicStats(): Promise<Stats> {
    const response = await this.request('GET', '/api/public/stats');
    return response.stats;
  }

  /**
   * Submit a new claim
   */
  async submitClaim(claim: SubmitClaimRequest): Promise<{ success: boolean; claimId: string; message: string }> {
    return this.request('POST', '/api/claims', claim);
  }

  /**
   * Get a badge URL for an agent
   */
  getBadgeUrl(agentId: string, type: 'default' | 'compact' | 'banner' = 'default'): string {
    const params = type !== 'default' ? `?type=${type}` : '';
    return `${this.baseUrl}/api/badge/${encodeURIComponent(agentId)}.svg${params}`;
  }

  /**
   * Get badge embed code
   */
  getBadgeEmbed(agentId: string, options: { type?: 'default' | 'compact' | 'banner'; link?: boolean } = {}): string {
    const { type = 'default', link = true } = options;
    const badgeUrl = this.getBadgeUrl(agentId, type);
    const agentUrl = `${this.baseUrl}/agent/${encodeURIComponent(agentId)}`;
    
    const img = `<img src="${badgeUrl}" alt="AlliGo Score" />`;
    return link ? `<a href="${agentUrl}" target="_blank" rel="noopener">${img}</a>` : img;
  }

  /**
   * Check if agent is certified (A or B grade)
   */
  async isCertified(agentId: string): Promise<boolean> {
    const score = await this.getAgentScore(agentId);
    return ['A', 'B'].includes(score.grade);
  }

  /**
   * Get risk level for an agent
   */
  async getRiskLevel(agentId: string): Promise<'low' | 'medium' | 'high' | 'critical' | 'unknown'> {
    const score = await this.getAgentScore(agentId);
    if (score.grade === 'NR') return 'unknown';
    if (['A', 'B'].includes(score.grade)) return 'low';
    if (score.grade === 'C') return 'medium';
    if (score.grade === 'D') return 'high';
    return 'critical';
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, options);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new AlliGoError(error.error || 'Request failed', response.status);
    }

    return response.json();
  }
}

/**
 * AlliGo SDK Error
 */
export class AlliGoError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'AlliGoError';
  }
}

// Default export
export default AlliGo;

// Create default instance
export const alligo = new AlliGo();

// Also support CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AlliGo, AlliGoError, alligo };
}
