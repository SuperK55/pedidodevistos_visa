import { config as dotenvConfig } from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from '../utils/logger.js';

// Load environment variables
dotenvConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');

class Config {
  constructor() {
    // CapSolver Configuration
    this.capsolverApiKey = process.env.CAPSOLVER_API_KEY || '';

    // Telegram Configuration
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID || '';

    // Automation Settings
    this.parallelSessions = parseInt(process.env.PARALLEL_SESSIONS || '15', 10);
    this.sessionTimeoutMs = parseInt(process.env.SESSION_TIMEOUT_MS || '300000', 10);
    this.retryAttempts = parseInt(process.env.RETRY_ATTEMPTS || '2', 10);

    // Debug Settings
    this.headless = process.env.HEADLESS !== 'false';
    this.screenshotsOnError = process.env.SCREENSHOTS_ON_ERROR !== 'false';

    // Site Configuration
    this.baseUrl = 'https://pedidodevistos.mne.gov.pt/VistosOnline';
    this.loginUrl = `${this.baseUrl}/Authentication.jsp`;
  }

  /**
   * Load accounts from JSON file
   */
  loadAccounts(filePath = null) {
    const accountsPath = filePath || join(rootDir, 'config', 'accounts.json');
    
    if (!existsSync(accountsPath)) {
      logger.error(`Accounts file not found: ${accountsPath}`);
      throw new Error('Accounts file not found');
    }

    try {
      const content = readFileSync(accountsPath, 'utf-8');
      const accounts = JSON.parse(content);
      
      if (!Array.isArray(accounts) || accounts.length === 0) {
        throw new Error('Accounts file must contain an array of accounts');
      }

      logger.info(`Loaded ${accounts.length} accounts from ${accountsPath}`);
      return accounts;
    } catch (error) {
      logger.error('Failed to load accounts', { error: error.message });
      throw error;
    }
  }

  /**
   * Load proxies from text file
   */
  loadProxies(filePath = null) {
    const proxiesPath = filePath || join(rootDir, 'config', 'proxies.txt');
    
    if (!existsSync(proxiesPath)) {
      logger.warn(`Proxies file not found: ${proxiesPath}, continuing without proxies`);
      return [];
    }

    try {
      const content = readFileSync(proxiesPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      
      logger.info(`Loaded ${lines.length} proxies from ${proxiesPath}`);
      return lines;
    } catch (error) {
      logger.error('Failed to load proxies', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate configuration
   */
  validate() {
    const errors = [];

    if (!this.capsolverApiKey) {
      errors.push('CAPSOLVER_API_KEY is required');
    }

    if (!this.telegramBotToken) {
      logger.warn('TELEGRAM_BOT_TOKEN not set, notifications will be disabled');
    }

    if (!this.telegramChatId && this.telegramBotToken) {
      logger.warn('TELEGRAM_CHAT_ID not set, notifications will be disabled');
    }

    if (this.parallelSessions < 1 || this.parallelSessions > 50) {
      errors.push('PARALLEL_SESSIONS must be between 1 and 50');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }

    logger.info('Configuration validated successfully');
    return true;
  }

  /**
   * Get configuration summary
   */
  getSummary() {
    return {
      parallelSessions: this.parallelSessions,
      sessionTimeout: `${this.sessionTimeoutMs / 1000}s`,
      retryAttempts: this.retryAttempts,
      headless: this.headless,
      screenshotsOnError: this.screenshotsOnError,
      telegramEnabled: !!(this.telegramBotToken && this.telegramChatId),
      capsolverEnabled: !!this.capsolverApiKey
    };
  }
}

// Export singleton instance
const config = new Config();
export default config;

