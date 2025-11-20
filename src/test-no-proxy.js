#!/usr/bin/env node

/**
 * Test script WITHOUT proxy to isolate the issue
 */

import config from './config/config.js';
import SessionManager from './core/session-manager.js';
import CapSolver from './core/capsolver.js';
import logger from './utils/logger.js';

async function testWithoutProxy() {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('   VISA BOOKING AUTOMATION - TEST WITHOUT PROXY');
    console.log('   Testing to isolate proxy vs credentials issue');
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

    // Test with first account WITHOUT proxy
    const testAccount = accounts[0];
    logger.info(`Testing with account: ${testAccount.email || testAccount.username}`);
    logger.warn('Running WITHOUT proxy to isolate issue');

    // Create session manager WITHOUT proxy
    const session = new SessionManager(testAccount, null, config);

    // Execute
    logger.info('\nStarting test session (no proxy)...\n');
    const result = await session.execute();

    // Display result
    console.log('\n' + '='.repeat(70));
    console.log('TEST RESULT (NO PROXY)');
    console.log('='.repeat(70));
    console.log(JSON.stringify(result, null, 2));
    console.log('='.repeat(70));

    if (result.status === 'success') {
      console.log('\n✅ TEST PASSED - Login works WITHOUT proxy!');
      console.log('   → Issue is proxy-related');
      process.exit(0);
    } else if (result.error?.includes('Foi encontrado um erro')) {
      console.log('\n❌ TEST FAILED - Same error without proxy');
      console.log('   → Issue is NOT proxy-related');
      console.log('   → Likely wrong credentials or account blocked');
      process.exit(1);
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
testWithoutProxy();

