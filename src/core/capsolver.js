import axios from 'axios';
import logger from '../utils/logger.js';

class CapSolver {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.capsolver.com';
  }

  /**
   * Create a CAPTCHA solving task
   */
  async createTask(taskData) {
    try {
      const response = await axios.post(`${this.baseUrl}/createTask`, {
        clientKey: this.apiKey,
        task: taskData
      });

      if (response.data.errorId !== 0) {
        throw new Error(response.data.errorDescription || 'Failed to create task');
      }

      logger.debug('CapSolver task created', { taskId: response.data.taskId });
      return response.data.taskId;
    } catch (error) {
      logger.error('Failed to create CapSolver task', {
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Get task result (poll until ready)
   */
  async getTaskResult(taskId, maxAttempts = 60, pollInterval = 2000) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await axios.post(`${this.baseUrl}/getTaskResult`, {
          clientKey: this.apiKey,
          taskId: taskId
        });

        if (response.data.errorId !== 0) {
          throw new Error(response.data.errorDescription || 'Failed to get task result');
        }

        const status = response.data.status;

        if (status === 'ready') {
          logger.debug('CapSolver task completed', { taskId });
          return response.data.solution;
        } else if (status === 'processing') {
          logger.debug(`CapSolver task processing (attempt ${attempt + 1}/${maxAttempts})`);
          await this.sleep(pollInterval);
        } else {
          throw new Error(`Unexpected task status: ${status}`);
        }
      } catch (error) {
        logger.error('Error polling CapSolver task result', {
          taskId,
          attempt: attempt + 1,
          error: error.message
        });
        
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        await this.sleep(pollInterval);
      }
    }

    throw new Error(`CapSolver task timeout after ${maxAttempts} attempts`);
  }

  /**
   * Solve hCaptcha
   */
  async solveHCaptcha(websiteURL, websiteKey, proxyInfo = null) {
    const taskData = {
      type: proxyInfo ? 'HCaptchaTask' : 'HCaptchaTaskProxyless',
      websiteURL,
      websiteKey
    };

    if (proxyInfo) {
      // CapSolver expects: host:port:username:password format
      if (proxyInfo.username && proxyInfo.password) {
        taskData.proxy = `${proxyInfo.host}:${proxyInfo.port}:${proxyInfo.username}:${proxyInfo.password}`;
      } else if (proxyInfo.username) {
        taskData.proxy = `${proxyInfo.host}:${proxyInfo.port}:${proxyInfo.username}`;
      } else {
        taskData.proxy = `${proxyInfo.host}:${proxyInfo.port}`;
      }
    }

    logger.info('Solving hCaptcha', { websiteURL });

    const taskId = await this.createTask(taskData);
    const solution = await this.getTaskResult(taskId);

    return solution.gRecaptchaResponse;
  }

  /**
   * Solve Cloudflare Turnstile
   */
  async solveTurnstile(websiteURL, websiteKey, proxyInfo = null) {
    const taskData = {
      type: proxyInfo ? 'AntiTurnstileTask' : 'AntiTurnstileTaskProxyless',
      websiteURL,
      websiteKey
    };

    if (proxyInfo) {
      // CapSolver expects: host:port:username:password format
      if (proxyInfo.username && proxyInfo.password) {
        taskData.proxy = `${proxyInfo.host}:${proxyInfo.port}:${proxyInfo.username}:${proxyInfo.password}`;
      } else if (proxyInfo.username) {
        taskData.proxy = `${proxyInfo.host}:${proxyInfo.port}:${proxyInfo.username}`;
      } else {
        taskData.proxy = `${proxyInfo.host}:${proxyInfo.port}`;
      }
    }

    logger.info('Solving Turnstile', { websiteURL });

    const taskId = await this.createTask(taskData);
    const solution = await this.getTaskResult(taskId);

    return solution.token;
  }

  /**
   * Solve reCAPTCHA v2
   */
  async solveReCaptchaV2(websiteURL, websiteKey, proxyInfo = null) {
    const taskData = {
      type: proxyInfo ? 'ReCaptchaV2Task' : 'ReCaptchaV2TaskProxyless',
      websiteURL,
      websiteKey
    };

    if (proxyInfo) {
      // CapSolver expects: host:port:username:password format
      if (proxyInfo.username && proxyInfo.password) {
        taskData.proxy = `${proxyInfo.host}:${proxyInfo.port}:${proxyInfo.username}:${proxyInfo.password}`;
      } else if (proxyInfo.username) {
        taskData.proxy = `${proxyInfo.host}:${proxyInfo.port}:${proxyInfo.username}`;
      } else {
        taskData.proxy = `${proxyInfo.host}:${proxyInfo.port}`;
      }
    }

    logger.info('Solving reCAPTCHA v2 with proxy', { 
      websiteURL, 
      hasProxy: !!proxyInfo,
      proxyHost: proxyInfo?.host,
      taskType: taskData.type
    });

    const taskId = await this.createTask(taskData);
    const solution = await this.getTaskResult(taskId);
    
    logger.info('reCAPTCHA v2 solution received', { 
      tokenLength: solution.gRecaptchaResponse?.length 
    });

    return solution.gRecaptchaResponse;
  }

  /**
   * Detect and solve CAPTCHA on page
   */
  async detectAndSolve(page, proxyInfo = null, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        logger.info(`Detecting CAPTCHA (attempt ${attempt + 1}/${maxRetries})`);

        // Wait a bit for CAPTCHA to load
        await this.sleep(2000);

        // Check for hCaptcha
        const hcaptchaData = await page.evaluate(() => {
          const hcaptchaIframe = document.querySelector('iframe[src*="hcaptcha.com"]');
          if (hcaptchaIframe) {
            const container = document.querySelector('[data-hcaptcha-widget-id], .h-captcha');
            const sitekey = container?.getAttribute('data-sitekey');
            return { found: true, sitekey };
          }
          return { found: false };
        });

        if (hcaptchaData.found && hcaptchaData.sitekey) {
          logger.info('hCaptcha detected', { sitekey: hcaptchaData.sitekey });
          const token = await this.solveHCaptcha(page.url(), hcaptchaData.sitekey, proxyInfo);
          
          // Inject hCaptcha response
          await page.evaluate((token) => {
            const textarea = document.querySelector('[name="h-captcha-response"]');
            if (textarea) {
              textarea.innerHTML = token;
            }
            const textareaG = document.querySelector('[name="g-recaptcha-response"]');
            if (textareaG) {
              textareaG.innerHTML = token;
            }
          }, token);

          logger.info('hCaptcha solved and injected');
          return { type: 'hcaptcha', token };
        }

        // Check for any CAPTCHA with data-sitekey and determine type by sitekey format
        const captchaData = await page.evaluate(() => {
          // Check for reCAPTCHA (iframe or div with g-recaptcha class)
          const recaptchaIframe = document.querySelector('iframe[src*="google.com/recaptcha"]');
          const recaptchaDiv = document.querySelector('.g-recaptcha, #g-recaptcha');
          
          if (recaptchaIframe || recaptchaDiv) {
            const element = recaptchaDiv || document.querySelector('[data-sitekey]');
            const sitekey = element?.getAttribute('data-sitekey');
            if (sitekey) {
              return { found: true, type: 'recaptcha', sitekey };
            }
          }

          // Check for Turnstile (Cloudflare)
          const turnstileDiv = document.querySelector('[data-sitekey]');
          if (turnstileDiv) {
            const sitekey = turnstileDiv.getAttribute('data-sitekey');
            // reCAPTCHA keys start with 6L, Turnstile keys have different format
            if (sitekey && sitekey.startsWith('6L')) {
              return { found: true, type: 'recaptcha', sitekey };
            } else if (sitekey) {
              return { found: true, type: 'turnstile', sitekey };
            }
          }

          return { found: false };
        });

        if (captchaData.found && captchaData.sitekey) {
          if (captchaData.type === 'recaptcha') {
            logger.info('reCAPTCHA v2 detected', { sitekey: captchaData.sitekey });
            const token = await this.solveReCaptchaV2(page.url(), captchaData.sitekey, proxyInfo);
            
            // Inject reCAPTCHA response into ALL possible locations
            const injectionResult = await page.evaluate((token) => {
              let injected = false;
              
              // Method 1: Standard textarea
              const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
              if (textarea) {
                textarea.value = token;
                textarea.innerHTML = token;
                injected = true;
              }
              
              // Method 2: All textareas with g-recaptcha in ID
              const allTextareas = document.querySelectorAll('textarea[id*="g-recaptcha-response"]');
              allTextareas.forEach(ta => {
                ta.value = token;
                ta.innerHTML = token;
                injected = true;
              });
              
              // Method 3: Set via grecaptcha.enterprise if available
              try {
                if (window.grecaptcha && window.grecaptcha.enterprise) {
                  // Store token in a way the page can read it
                  window.__recaptcha_token__ = token;
                  injected = true;
                }
              } catch (e) {
                console.log('Could not set via grecaptcha:', e);
              }
              
              // Verify injection
              const verifyTextarea = document.querySelector('textarea[name="g-recaptcha-response"]');
              const actualValue = verifyTextarea ? verifyTextarea.value : '';
              
              return {
                injected: injected,
                tokenLength: token.length,
                verifiedLength: actualValue.length,
                textareaFound: !!verifyTextarea
              };
            }, token);

            logger.info('reCAPTCHA v2 solved and injected', injectionResult);
            
            if (!injectionResult.injected || injectionResult.verifiedLength === 0) {
              logger.warn('CAPTCHA injection may have failed', injectionResult);
            }
            
            // Trigger the onCaptchaSuccess callback if it exists
            await page.evaluate((token) => {
              // Hide error message
              const errorEl = document.getElementById('captchaError');
              if (errorEl) {
                errorEl.style.display = 'none';
              }
              
              // Call onCaptchaSuccess if defined
              if (typeof onCaptchaSuccess === 'function') {
                onCaptchaSuccess(token);
              }
            }, token);
            
            return { type: 'recaptcha', token };
          } else if (captchaData.type === 'turnstile') {
            logger.info('Turnstile detected', { sitekey: captchaData.sitekey });
            const token = await this.solveTurnstile(page.url(), captchaData.sitekey, proxyInfo);
            
            // Inject Turnstile response
            await page.evaluate((token) => {
              const input = document.querySelector('[name="cf-turnstile-response"]');
              if (input) {
                input.value = token;
              }
            }, token);

            logger.info('Turnstile solved and injected');
            return { type: 'turnstile', token };
          }
        }

        logger.info('No CAPTCHA detected on page');
        return { type: 'none', token: null };

      } catch (error) {
        logger.error(`CAPTCHA detection/solving failed (attempt ${attempt + 1}/${maxRetries})`, {
          error: error.message
        });

        if (attempt === maxRetries - 1) {
          throw error;
        }

        await this.sleep(3000);
      }
    }
  }

  /**
   * Helper to check CapSolver balance
   */
  async getBalance() {
    try {
      const response = await axios.post(`${this.baseUrl}/getBalance`, {
        clientKey: this.apiKey
      });

      if (response.data.errorId !== 0) {
        throw new Error(response.data.errorDescription || 'Failed to get balance');
      }

      return response.data.balance;
    } catch (error) {
      logger.error('Failed to get CapSolver balance', { error: error.message });
      throw error;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default CapSolver;

