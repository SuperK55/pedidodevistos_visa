#!/usr/bin/env node

/**
 * Test script for visa booking automation
 * Tests single session with first account
 */

import config from './config/config.js';
import SessionManager from './core/session-manager.js';
import CapSolver from './core/capsolver.js';
import { parseProxy } from './utils/proxy-parser.js';
import logger from './utils/logger.js';

async function testSingleSession() {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('   VISA BOOKING AUTOMATION - TEST MODE');
    console.log('   Testing single session with first account');
    console.log('='.repeat(70) + '\n');

    // Validate configuration
    config.validate();

    // Check CapSolver
    const capsolver = new CapSolver(config.capsolverApiKey);
    const balance = await capsolver.getBalance();
    logger.info(`CapSolver balance: $${balance}`);

    // Load accounts
    const accounts = config.loadAccounts();
    if (accounts.length === 0) {
      throw new Error('No accounts found');
    }

    // Load proxies
    const proxyLines = config.loadProxies();
    const proxy = proxyLines.length > 0 ? proxyLines[0] : null;

    // Test with first account
    const testAccount = accounts[0];
    logger.info(`Testing with account: ${testAccount.email || testAccount.username}`);

    if (proxy) {
      const parsedProxy = parseProxy(proxy);
      logger.info(`Using proxy: ${parsedProxy.country}:${parsedProxy.port}`);
    } else {
      logger.warn('No proxy configured - may have issues with Cloudflare');
    }

    // Create session manager
    const session = new SessionManager(testAccount, proxy, config);

    // Execute
    logger.info('\nStarting test session...\n');
    const result = await session.execute();

    // Display result
    console.log('\n' + '='.repeat(70));
    console.log('TEST RESULT');
    console.log('='.repeat(70));
    console.log(JSON.stringify(result, null, 2));
    console.log('='.repeat(70));

    if (result.status === 'success') {
      console.log('\n✅ TEST PASSED - Booking successful!');
      process.exit(0);
    } else {
      console.log(`\n❌ TEST FAILED - ${result.reason || result.error}`);
      process.exit(1);
    }

  } catch (error) {
    logger.error('Test failed', { error: error.message, stack: error.stack });
    console.error('\n❌ TEST ERROR:', error.message);
    process.exit(1);
  }
}

// Run test
testSingleSession();

