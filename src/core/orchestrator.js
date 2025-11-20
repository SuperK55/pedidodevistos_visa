import SessionManager from './session-manager.js';
import { createTelegramNotifier } from '../utils/telegram.js';
import logger from '../utils/logger.js';

class Orchestrator {
  constructor(accounts, proxies, config) {
    this.accounts = accounts;
    this.proxies = proxies;
    this.config = config;
    this.telegram = createTelegramNotifier(config.telegramBotToken, config.telegramChatId);
    this.stats = {
      total: accounts.length,
      success: 0,
      failed: 0,
      pending: accounts.length,
      errors: 0
    };
    this.results = [];
  }

  /**
   * Run automation in batches
   */
  async run() {
    try {
      logger.info('='.repeat(60));
      logger.info('VISA BOOKING AUTOMATION STARTED');
      logger.info('='.repeat(60));
      logger.info('Configuration:', this.config.getSummary());
      logger.info(`Total accounts: ${this.accounts.length}`);
      logger.info(`Batch size: ${this.config.parallelSessions}`);
      logger.info(`Proxies available: ${this.proxies.length}`);
      logger.info('='.repeat(60));

      // Test Telegram connection
      if (this.telegram) {
        const connected = await this.telegram.testConnection();
        if (connected) {
          await this.telegram.notifySessionStarted({
            totalAccounts: this.accounts.length,
            batchSize: this.config.parallelSessions,
            email: this.accounts[0]?.email
          });
        }
      }

      const accountQueue = [...this.accounts];
      let batchNumber = 0;

      while (accountQueue.length > 0) {
        batchNumber++;
        const batchSize = Math.min(this.config.parallelSessions, accountQueue.length);
        const batch = accountQueue.splice(0, batchSize);

        logger.info(`\n${'='.repeat(60)}`);
        logger.info(`BATCH ${batchNumber} - Processing ${batch.length} accounts`);
        logger.info(`Remaining: ${accountQueue.length}`);
        logger.info('='.repeat(60));

        await this.processBatch(batch, batchNumber);

        // Send batch status update
        if (this.telegram) {
          await this.telegram.notifyBatchStatus(this.stats);
        }

        // Small delay between batches
        if (accountQueue.length > 0) {
          logger.info(`Waiting 5 seconds before next batch...`);
          await this.sleep(5000);
        }
      }

      // Final summary
      await this.printFinalSummary();

    } catch (error) {
      logger.error('Orchestrator execution failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Process a batch of accounts in parallel
   */
  async processBatch(accounts, batchNumber) {
    const sessions = accounts.map((account, index) => {
      // Assign proxy (round-robin)
      const proxyIndex = (batchNumber * this.config.parallelSessions + index) % this.proxies.length;
      const proxy = this.proxies.length > 0 ? this.proxies[proxyIndex] : null;

      return {
        account,
        proxy,
        index: (batchNumber - 1) * this.config.parallelSessions + index
      };
    });

    // Create timeout promise
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve({ timedOut: true }), this.config.sessionTimeoutMs);
    });

    // Execute sessions in parallel
    const sessionPromises = sessions.map(async ({ account, proxy, index }) => {
      try {
        logger.info(`[${index + 1}/${this.stats.total}] Starting session for ${account.email || account.username}`);
        
        const sessionManager = new SessionManager(account, proxy, this.config);
        
        // Race between session execution and timeout
        const result = await Promise.race([
          sessionManager.execute(),
          timeoutPromise
        ]);

        if (result.timedOut) {
          logger.error(`[${index + 1}/${this.stats.total}] Session timed out for ${account.email}`);
          return {
            status: 'timeout',
            account: account.username,
            email: account.email,
            error: 'Session timeout'
          };
        }

        return result;
      } catch (error) {
        logger.error(`[${index + 1}/${this.stats.total}] Session error for ${account.email}`, {
          error: error.message
        });
        return {
          status: 'error',
          account: account.username,
          email: account.email,
          error: error.message
        };
      }
    });

    // Wait for all sessions to complete
    const results = await Promise.allSettled(sessionPromises);

    // Process results
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const sessionData = result.status === 'fulfilled' ? result.value : {
        status: 'error',
        account: sessions[i].account.username,
        email: sessions[i].account.email,
        error: result.reason?.message || 'Unknown error'
      };

      this.processSessionResult(sessionData, sessions[i].account, sessions[i].proxy);
    }
  }

  /**
   * Process individual session result
   */
  async processSessionResult(result, account, proxy) {
    this.results.push(result);
    this.stats.pending--;

    if (result.status === 'success') {
      this.stats.success++;
      logger.info(`✅ SUCCESS - ${result.email}`, {
        confirmation: result.confirmation,
        date: result.date,
        time: result.time,
        duration: result.duration
      });

      // Send Telegram notification
      if (this.telegram) {
        try {
          await this.telegram.notifyBookingSuccess({
            account: result.account,
            email: result.email,
            consulate: result.consulate,
            date: result.date,
            time: result.time,
            confirmationNumber: result.confirmation,
            proxyCountry: result.proxyCountry,
            duration: result.duration
          });
        } catch (error) {
          logger.warn('Failed to send Telegram notification', { error: error.message });
        }
      }
    } else if (result.status === 'failed') {
      this.stats.failed++;
      logger.warn(`❌ FAILED - ${result.email}: ${result.reason}`);
    } else {
      this.stats.errors++;
      logger.error(`⚠️ ERROR - ${result.email}: ${result.error}`);

      // Send error notification for critical errors
      if (this.telegram && result.error !== 'No slots available') {
        try {
          await this.telegram.notifyError({
            account: result.account,
            email: result.email,
            error: result.error,
            sessionId: result.sessionId
          });
        } catch (error) {
          logger.warn('Failed to send error notification', { error: error.message });
        }
      }
    }
  }

  /**
   * Print final summary
   */
  async printFinalSummary() {
    logger.info('\n' + '='.repeat(60));
    logger.info('AUTOMATION COMPLETED - FINAL SUMMARY');
    logger.info('='.repeat(60));
    logger.info(`✅ Successful bookings: ${this.stats.success}`);
    logger.info(`❌ Failed (no slots): ${this.stats.failed}`);
    logger.info(`⚠️ Errors: ${this.stats.errors}`);
    logger.info(`📊 Total processed: ${this.stats.total}`);
    logger.info(`📈 Success rate: ${((this.stats.success / this.stats.total) * 100).toFixed(1)}%`);
    logger.info('='.repeat(60));

    // Show successful bookings
    if (this.stats.success > 0) {
      logger.info('\n✅ SUCCESSFUL BOOKINGS:');
      this.results
        .filter(r => r.status === 'success')
        .forEach((r, i) => {
          logger.info(`  ${i + 1}. ${r.email}`);
          logger.info(`     Confirmation: ${r.confirmation}`);
          logger.info(`     Date: ${r.date} at ${r.time}`);
          logger.info(`     Duration: ${r.duration}`);
        });
    }

    // Show errors (excluding "no slots")
    const criticalErrors = this.results.filter(r => 
      r.status === 'error' && !r.error?.includes('No slots')
    );
    
    if (criticalErrors.length > 0) {
      logger.info('\n⚠️ ERRORS:');
      criticalErrors.forEach((r, i) => {
        logger.info(`  ${i + 1}. ${r.email}: ${r.error}`);
      });
    }

    logger.info('\n' + '='.repeat(60));
    logger.info('Check logs/ directory for detailed logs');
    logger.info('Check screenshots/ directory for error screenshots');
    logger.info('='.repeat(60));
  }

  /**
   * Retry failed sessions
   */
  async retryFailed() {
    const failedAccounts = this.results
      .filter(r => r.status === 'error' || r.status === 'timeout')
      .map(r => this.accounts.find(a => a.username === r.account))
      .filter(Boolean);

    if (failedAccounts.length === 0) {
      logger.info('No failed sessions to retry');
      return;
    }

    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`RETRYING ${failedAccounts.length} FAILED SESSIONS`);
    logger.info('='.repeat(60));

    const retryOrchestrator = new Orchestrator(failedAccounts, this.proxies, this.config);
    await retryOrchestrator.run();

    // Merge results
    this.stats.success += retryOrchestrator.stats.success;
    this.stats.failed += retryOrchestrator.stats.failed;
    this.stats.errors += retryOrchestrator.stats.errors;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default Orchestrator;

