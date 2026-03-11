/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    ALLIMOLT PROPRIETARY LICENSE                           ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                           ║
 * ║  This file is part of Allimolt Pro - The Credit Bureau for AI Agents.    ║
 * ║                                                                           ║
 * ║  LICENSE: PROPRIETARY / COMMERCIAL                                        ║
 * ║  This code is NOT part of the open-source release.                        ║
 * ║                                                                           ║
 * ║  For licensing inquiries: license@allimolt.io                             ║
 * ║                                                                           ║
 * ║  Open source version uses: src/core/scoring_open.ts                       ║
 * ║  Pro/Enterprise version uses: src/core/scoring_pro.ts (this file)         ║
 * ║                                                                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * IP PROTECTION STRATEGY:
 * ─────────────────────────────
 * The open-source community version includes a basic risk scoring algorithm
 * suitable for transparency and community contributions.
 *
 * The Pro version includes:
 * - Advanced ML-based risk prediction
 * - Temporal pattern recognition
 * - Cross-agent correlation analysis
 * - Insurance underwriting optimization
 * - Real-time threat intelligence integration
 *
 * This separation ensures:
 * 1. Community can build on transparent, auditable core
 * 2. Commercial value is preserved for sustainability
 * 3. Enterprise customers get enhanced capabilities
 */

export const SCORING_VERSION = "pro-2.1.0";
export const LICENSE_TYPE = "PROPRIETARY";

// Feature flags for pro features
export const PRO_FEATURES = {
  ADVANCED_SCORING: true,
  ML_PREDICTION: true,
  CROSS_AGENT_ANALYSIS: true,
  INSURANCE_API: true,
  REAL_TIME_ALERTS: true,
};
