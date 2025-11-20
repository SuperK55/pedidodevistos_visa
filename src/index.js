#!/usr/bin/env node

import config from './config/config.js';
import Orchestrator from './core/orchestrator.js';
import CapSolver from './core/capsolver.js';
import { loadProxiesFromFile } from './utils/proxy-parser.js';
import logger from './utils/logger.js';

/**
 * Main entry point
 */
async function main() {
  try {
    // Print banner
    console.log('\n' + '='.repeat(70));
    console.log('   PORTUGUESE VISA BOOKING AUTOMATION SYSTEM');
    console.log('   Automated appointment booking with parallel sessions');
    console.log('='.repeat(70) + '\n');

    // Validate configuration
    config.validate();

    // Check CapSolver balance
    try {
      const capsolver = new CapSolver(config.capsolverApiKey);
      const balance = await capsolver.getBalance();
      logger.info(`CapSolver balance: $${balance}`);
      
      if (balance < 1) {
        logger.warn('⚠️  CapSolver balance is low! Please top up to avoid failures.');
      }
    } catch (error) {
      logger.warn('Could not check CapSolver balance', { error: error.message });
    }

    // Load accounts
    logger.info('Loading accounts...');
    const accounts = config.loadAccounts();
    
    if (accounts.length === 0) {
      throw new Error('No accounts found in configuration');
    }

    // Load proxies
    logger.info('Loading proxies...');
    const proxyLines = config.loadProxies();
    const proxies = proxyLines.length > 0 ? proxyLines : [];

    if (proxies.length === 0) {
      logger.warn('⚠️  No proxies configured. This may cause issues with Cloudflare protection!');
    } else {
      logger.info(`Loaded ${proxies.length} proxies`);
    }

    // Create and run orchestrator
    const orchestrator = new Orchestrator(accounts, proxies, config);
    await orchestrator.run();

    // Retry failed sessions if configured
    if (config.retryAttempts > 0 && orchestrator.stats.errors > 0) {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info('RETRY ATTEMPT');
      logger.info('='.repeat(60));
      await orchestrator.retryFailed();
    }

    // Exit with appropriate code
    const exitCode = orchestrator.stats.success > 0 ? 0 : 1;
    logger.info(`\nExiting with code ${exitCode}`);
    process.exit(exitCode);

  } catch (error) {
    logger.error('Fatal error in main execution', {
      error: error.message,
      stack: error.stack
    });
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  console.error('❌ Uncaught exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason: reason,
    promise: promise
  });
  console.error('❌ Unhandled rejection:', reason);
  process.exit(1);
});

// Run main function
main();

