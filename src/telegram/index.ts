/**
 * AlliGo - Telegram Module
 * Export Telegram bot functionality
 */

export {
  sendTelegramMessage,
  sendClaimAlert,
  sendDailyStats,
  sendLeaderboardUpdate,
  testTelegramConnection,
  formatClaimMessage,
  formatStatsMessage,
} from './bot';

export { default as telegramBot } from './bot';
