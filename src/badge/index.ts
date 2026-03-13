/**
 * AlliGo Badge Generator
 * Dynamic SVG badges for agent trust scores
 */

export interface BadgeConfig {
  agentId: string;
  score: number;
  grade: string;
  claims: number;
  theme?: 'light' | 'dark';
}

// Color schemes based on grade
const GRADE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: '#00ff88', text: '#0a0a0a', border: '#00cc6a' },
  B: { bg: '#00ff88', text: '#0a0a0a', border: '#00cc6a' },
  C: { bg: '#ffaa00', text: '#0a0a0a', border: '#cc8800' },
  D: { bg: '#ff6644', text: '#ffffff', border: '#cc4422' },
  F: { bg: '#ff4444', text: '#ffffff', border: '#cc2222' },
  NR: { bg: '#666666', text: '#ffffff', border: '#444444' },
};

const GRADE_LABELS: Record<string, string> = {
  A: 'Certified',
  B: 'Verified',
  C: 'Monitored',
  D: 'Flagged',
  F: 'Critical',
  NR: 'Not Rated',
};

/**
 * Generate an SVG badge for an agent
 */
export function generateBadge(config: BadgeConfig): string {
  const { agentId, score, grade, claims, theme = 'dark' } = config;
  const colors = GRADE_COLORS[grade] || GRADE_COLORS.NR;
  const label = GRADE_LABELS[grade] || 'Not Rated';
  
  // Badge dimensions
  const width = 220;
  const height = 28;
  const leftWidth = 75;
  const rightWidth = 145;
  const radius = 4;
  
  // Background color based on theme
  const bgColor = theme === 'light' ? '#ffffff' : '#1a1a1a';
  const textColor = theme === 'light' ? '#333333' : '#ffffff';
  const subtextColor = theme === 'light' ? '#666666' : '#888888';
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="alligo-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${colors.bg};stop-opacity:0.15" />
      <stop offset="100%" style="stop-color:${colors.bg};stop-opacity:0.05" />
    </linearGradient>
    <filter id="shadow" x="-2%" y="-2%" width="104%" height="104%">
      <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.3"/>
    </filter>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" rx="${radius}" fill="${bgColor}" stroke="${colors.border}" stroke-width="1" filter="url(#shadow)"/>
  
  <!-- Left section (logo) -->
  <rect width="${leftWidth}" height="${height}" rx="${radius}" fill="${colors.bg}"/>
  <rect x="${radius}" y="0" width="${leftWidth - radius}" height="${height}" fill="${colors.bg}"/>
  
  <!-- Shield icon -->
  <g transform="translate(8, 6)">
    <path d="M8 0 L16 3 L16 9 C16 13 12 16 8 18 C4 16 0 13 0 9 L0 3 Z" fill="${colors.text}" opacity="0.3"/>
    <path d="M8 2 L14 4.5 L14 9 C14 12 11 14.5 8 16 C5 14.5 2 12 2 9 L2 4.5 Z" fill="${colors.text}" opacity="0.2"/>
  </g>
  
  <!-- AlliGo text -->
  <text x="28" y="18" font-family="Inter, -apple-system, sans-serif" font-size="11" font-weight="600" fill="${colors.text}">
    AlliGo
  </text>
  
  <!-- Right section -->
  <rect x="${leftWidth}" width="${rightWidth}" height="${height}" fill="url(#alligo-gradient)"/>
  
  <!-- Grade badge -->
  <rect x="${leftWidth + 8}" y="5" width="24" height="18" rx="3" fill="${colors.bg}"/>
  <text x="${leftWidth + 20}" y="18" font-family="Inter, -apple-system, sans-serif" font-size="11" font-weight="700" fill="${colors.text}" text-anchor="middle">
    ${grade}
  </text>
  
  <!-- Label -->
  <text x="${leftWidth + 38}" y="12" font-family="Inter, -apple-system, sans-serif" font-size="9" font-weight="500" fill="${subtextColor}">
    ${label}
  </text>
  
  <!-- Score -->
  <text x="${leftWidth + 38}" y="22" font-family="Inter, -apple-system, sans-serif" font-size="10" font-weight="600" fill="${textColor}">
    ${score.toFixed(0)} score${claims > 0 ? ` · ${claims} claims` : ''}
  </text>
</svg>`;
}

/**
 * Generate a large banner badge for an agent
 */
export function generateBannerBadge(config: BadgeConfig & { totalValueLost?: number }): string {
  const { agentId, score, grade, claims, totalValueLost, theme = 'dark' } = config;
  const colors = GRADE_COLORS[grade] || GRADE_COLORS.NR;
  const label = GRADE_LABELS[grade] || 'Not Rated';
  
  const width = 400;
  const height = 80;
  
  const bgColor = theme === 'light' ? '#ffffff' : '#1a1a1a';
  const textColor = theme === 'light' ? '#333333' : '#ffffff';
  const subtextColor = theme === 'light' ? '#666666' : '#888888';
  
  const formattedValue = totalValueLost 
    ? `$${(totalValueLost / 1000000).toFixed(1)}M` 
    : 'N/A';
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="banner-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.bg};stop-opacity:0.2" />
      <stop offset="100%" style="stop-color:${colors.bg};stop-opacity:0.05" />
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" rx="8" fill="${bgColor}" stroke="${colors.border}" stroke-width="2"/>
  <rect width="${width}" height="${height}" rx="8" fill="url(#banner-gradient)"/>
  
  <!-- Left accent bar -->
  <rect width="6" height="${height}" rx="8 0 0 8" fill="${colors.bg}"/>
  
  <!-- Shield icon -->
  <g transform="translate(24, 16)">
    <circle cx="24" cy="24" r="24" fill="${colors.bg}" opacity="0.15"/>
    <path d="M24 8 L40 14 L40 28 C40 38 32 46 24 50 C16 46 8 38 8 28 L8 14 Z" fill="${colors.bg}" opacity="0.3"/>
    <path d="M24 12 L36 17 L36 28 C36 35 30 41 24 44 C18 41 12 35 12 28 L12 17 Z" fill="${colors.bg}"/>
    <text x="24" y="32" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="${colors.text}" text-anchor="middle">
      ${grade}
    </text>
  </g>
  
  <!-- Agent info -->
  <text x="90" y="30" font-family="Inter, sans-serif" font-size="14" font-weight="600" fill="${textColor}">
    ${agentId}
  </text>
  <text x="90" y="48" font-family="Inter, sans-serif" font-size="11" fill="${subtextColor}">
    ${label} · Risk Score: ${score.toFixed(1)}
  </text>
  
  <!-- Stats -->
  <g transform="translate(280, 20)">
    <text x="0" y="15" font-family="Inter, sans-serif" font-size="11" fill="${subtextColor}">Claims</text>
    <text x="60" y="15" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="${textColor}">${claims}</text>
    
    <text x="0" y="38" font-family="Inter, sans-serif" font-size="11" fill="${subtextColor}">Value Lost</text>
    <text x="60" y="38" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="${textColor}">${formattedValue}</text>
  </g>
  
  <!-- AlliGo branding -->
  <text x="${width - 16}" y="${height - 12}" font-family="Inter, sans-serif" font-size="9" fill="${subtextColor}" text-anchor="end">
    AlliGo
  </text>
</svg>`;
}

/**
 * Generate a minimal compact badge
 */
export function generateCompactBadge(config: BadgeConfig): string {
  const { score, grade } = config;
  const colors = GRADE_COLORS[grade] || GRADE_COLORS.NR;
  
  const width = 90;
  const height = 20;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="3" fill="${colors.bg}"/>
  <text x="8" y="14" font-family="monospace" font-size="11" font-weight="600" fill="${colors.text}">
    ${grade} ${score.toFixed(0)}
  </text>
</svg>`;
}

/**
 * Get badge color scheme by grade
 */
export function getBadgeColors(grade: string): { bg: string; text: string; border: string } {
  return GRADE_COLORS[grade] || GRADE_COLORS.NR;
}

/**
 * Get badge label by grade
 */
export function getBadgeLabel(grade: string): string {
  return GRADE_LABELS[grade] || 'Not Rated';
}

export default {
  generateBadge,
  generateBannerBadge,
  generateCompactBadge,
  getBadgeColors,
  getBadgeLabel,
};
