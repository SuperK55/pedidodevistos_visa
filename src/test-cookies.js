/**
 * Test script to analyze cookies after consent
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { parseProxy, formatProxyForPuppeteer } from './utils/proxy-parser.js';

puppeteer.use(StealthPlugin());

async function testCookies() {
  const proxyString = 'p.webshare.io:80:Mylist1234-residential-MA-1:Saulo12345';
  const parsedProxy = parseProxy(proxyString);
  const proxyUrl = formatProxyForPuppeteer(parsedProxy);

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--proxy-server=${proxyUrl}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });

  const page = await browser.newPage();

  // Authenticate proxy
  await page.authenticate({
    username: parsedProxy.username,
    password: parsedProxy.password,
  });

  console.log('🔗 Navigating to login page...');
  await page.goto('https://pedidodevistos.mne.gov.pt/VistosOnline/Authentication.jsp', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });

  console.log('\n📊 Cookies BEFORE consent:');
  let cookies = await page.cookies();
  console.log(JSON.stringify(cookies, null, 2));

  await page.waitForTimeout(3000);

  // Accept cookie consent
  console.log('\n✅ Accepting cookie consent...');
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const acceptButton = buttons.find(btn => 
      btn.textContent.includes('Aceitar todas') || 
      btn.textContent.includes('Aceitar')
    );
    if (acceptButton) {
      acceptButton.click();
      return true;
    }
    return false;
  });

  console.log(`Cookie consent button clicked: ${clicked}`);
  await page.waitForTimeout(3000);

  console.log('\n📊 Cookies AFTER cookie consent:');
  cookies = await page.cookies();
  console.log(JSON.stringify(cookies, null, 2));

  console.log('\n📊 Current cookies in document:');
  const docCookies = await page.evaluate(() => document.cookie);
  console.log(docCookies);

  console.log('\n✋ Browser will stay open for 60 seconds for manual inspection...');
  console.log('You can now interact with the page, login manually, and compare.');
  
  await page.waitForTimeout(60000);

  await browser.close();
}

testCookies().catch(console.error);

