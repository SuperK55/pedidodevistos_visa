import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parse proxy formats:
 * - Standard: host:port:username:password (e.g., p.webshare.io:80:user:pass)
 * - SOAX: host:port:auth:country (e.g., proxy.soax.com:9000:auth:wifi;al;)
 * Returns: { host, port, username, password, country }
 */
export function parseProxy(proxyString) {
  try {
    const parts = proxyString.trim().split(':');
    if (parts.length < 3) {
      throw new Error(`Invalid proxy format: ${proxyString}`);
    }

    const host = parts[0];
    const port = parts[1];
    
    // Detect format: if 4th part contains semicolon, it's SOAX format
    const isSoaxFormat = parts[3] && parts[3].includes(';');
    
    let username, password, country;
    
    if (isSoaxFormat) {
      // SOAX format: host:port:auth:wifi;country;
      username = parts[2]; // Auth string used as username
      password = ''; // SOAX uses empty password
      country = parts[3].split(';').filter(p => p)[1] || 'unknown';
    } else {
      // Standard format: host:port:username:password
      username = parts[2];
      password = parts[3] || '';
      country = 'unknown';
    }

    return {
      host,
      port,
      username,
      password,
      country,
      format: isSoaxFormat ? 'soax' : 'standard',
      original: proxyString
    };
  } catch (error) {
    logger.error(`Failed to parse proxy: ${proxyString}`, { error: error.message });
    throw error;
  }
}

/**
 * Convert parsed proxy to Puppeteer format
 * Returns: http://username:password@host:port
 */
export function formatProxyForPuppeteer(parsedProxy) {
  if (parsedProxy.password) {
    return `http://${parsedProxy.username}:${parsedProxy.password}@${parsedProxy.host}:${parsedProxy.port}`;
  } else {
    // SOAX format or no password
    return `http://${parsedProxy.username}@${parsedProxy.host}:${parsedProxy.port}`;
  }
}

/**
 * Load proxies from file
 */
export function loadProxiesFromFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    const proxies = lines.map(line => parseProxy(line));
    logger.info(`Loaded ${proxies.length} proxies from ${filePath}`);
    
    return proxies;
  } catch (error) {
    logger.error(`Failed to load proxies from ${filePath}`, { error: error.message });
    throw error;
  }
}

/**
 * Get proxy arguments for Puppeteer launch
 */
export function getProxyArgs(parsedProxy) {
  return [
    `--proxy-server=${parsedProxy.host}:${parsedProxy.port}`
  ];
}

/**
 * Authenticate proxy in page
 */
export async function authenticateProxy(page, parsedProxy) {
  await page.authenticate({
    username: parsedProxy.username,
    password: parsedProxy.password || '' // Empty password for SOAX format
  });
}

export default {
  parseProxy,
  formatProxyForPuppeteer,
  loadProxiesFromFile,
  getProxyArgs,
  authenticateProxy
};

