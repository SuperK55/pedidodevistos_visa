import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createSessionLogger } from '../utils/logger.js';
import CapSolver from './capsolver.js';
import { parseProxy, getProxyArgs, authenticateProxy } from '../utils/proxy-parser.js';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Add stealth plugin
puppeteer.use(StealthPlugin());

class SessionManager {
  constructor(account, proxy, config) {
    this.account = account;
    this.proxy = proxy ? parseProxy(proxy) : null;
    this.config = config;
    this.sessionId = `${account.username}_${Date.now()}`;
    this.logger = createSessionLogger(this.sessionId);
    this.browser = null;
    this.page = null;
    this.capsolver = new CapSolver(config.capsolverApiKey);
    this.startTime = Date.now();
    this.screenshotsDir = join(__dirname, '../../screenshots');

    // Ensure screenshots directory exists
    if (!existsSync(this.screenshotsDir)) {
      mkdirSync(this.screenshotsDir, { recursive: true });
    }
  }

  /**
   * Initialize browser with proxy and stealth settings
   */
  async initBrowser() {
    try {
      this.logger.info('Initializing browser', {
        proxy: this.proxy ? `${this.proxy.country}:${this.proxy.port}` : 'none'
      });

      const launchOptions = {
        headless: this.config.headless ? 'new' : false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-size=1920,1080',
          ...(this.proxy ? getProxyArgs(this.proxy) : [])
        ],
        defaultViewport: {
          width: 1920,
          height: 1080
        }
      };

      this.browser = await puppeteer.launch(launchOptions);
      this.page = await this.browser.newPage();

      // Listen to console messages for debugging
      this.page.on('console', msg => {
        const type = msg.type();
        if (type === 'error' || type === 'warning') {
          this.logger.warn(`Browser console [${type}]: ${msg.text()}`);
        } else {
          this.logger.debug(`Browser console [${type}]: ${msg.text()}`);
        }
      });

      // Authenticate proxy if needed
      if (this.proxy) {
        await authenticateProxy(this.page, this.proxy);
        this.logger.info('Proxy authenticated');
      }

      // Set realistic user agent
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      );

      // Set additional headers (avoid headers that cause CORS issues with reCAPTCHA)
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br'
        // Removed headers that cause CORS issues with Google reCAPTCHA
      });

      // Additional anti-detection measures
      await this.page.evaluateOnNewDocument(() => {
        // Override the navigator properties to avoid detection
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });

        // Mock plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });

        // Mock languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['pt-PT', 'pt', 'en-US', 'en'],
        });

        // Chrome specific
        window.chrome = {
          runtime: {},
        };

        // Permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
      });

      this.logger.info('Browser initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize browser', { error: error.message });
      throw error;
    }
  }

  /**
   * Navigate to login page and perform login
   */
  async login() {
    try {
      this.logger.info('Navigating to login page');
      
      // Try navigation with retries (Cloudflare might block first attempt)
      let navigationSuccess = false;
      let lastError = null;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          this.logger.info(`Navigation attempt ${attempt}/3`);
          
          await this.page.goto(this.config.loginUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 45000
          });
          
          // Wait for page to fully load
          await this.page.waitForSelector('input[name="username"], body', { timeout: 10000 });
          
          navigationSuccess = true;
          this.logger.info('Navigation successful');
          break;
        } catch (navError) {
          lastError = navError;
          this.logger.warn(`Navigation attempt ${attempt}/3 failed`, { error: navError.message });
          
          if (attempt < 3) {
            // Wait before retry (exponential backoff)
            const waitTime = attempt * 2000;
            this.logger.info(`Waiting ${waitTime}ms before retry...`);
            await this.sleep(waitTime);
          }
        }
      }
      
      if (!navigationSuccess) {
        throw new Error(`Failed to navigate after 3 attempts: ${lastError.message}`);
      }

      await this.randomDelay(2000, 3000);

      // Fill login credentials FIRST (before CAPTCHA solving)
      this.logger.info('Filling login credentials');
      await this.page.type('input[name="username"], input#username', this.account.username, {
        delay: this.randomNumber(50, 150)
      });

      await this.randomDelay(300, 700);

      await this.page.type('input[name="password"], input#password, input[type="password"]', this.account.password, {
        delay: this.randomNumber(50, 150)
      });

      await this.randomDelay(500, 1000);

      // Solve CAPTCHA if present
      const captchaResult = await this.capsolver.detectAndSolve(this.page, this.proxy);
      
      if (captchaResult && captchaResult.type !== 'none') {
        this.logger.info('Triggering CAPTCHA callback');
        
        // Trigger reCAPTCHA callback if it exists
        await this.page.evaluate(() => {
          if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
            Object.keys(window.___grecaptcha_cfg.clients).forEach(key => {
              const client = window.___grecaptcha_cfg.clients[key];
              if (client && client.callback) {
                client.callback();
              }
            });
          }
        });
        
        // Wait for reCAPTCHA to be fully ready
        this.logger.info('Waiting for reCAPTCHA to be ready');
        await this.page.waitForFunction(() => {
          try {
            return typeof grecaptcha !== 'undefined' && 
                   grecaptcha.enterprise && 
                   typeof grecaptcha.enterprise.getResponse === 'function';
          } catch (e) {
            return false;
          }
        }, { timeout: 10000 }).catch(() => {
          this.logger.warn('reCAPTCHA enterprise API not fully loaded, continuing anyway');
        });
        
        await this.randomDelay(2000, 3000);
      }

      // Take screenshot before submitting (for debugging)
      await this.takeScreenshot('before_login');

      // Login via AJAX (the site uses AJAX, not form navigation)
      this.logger.info('Submitting login via AJAX');
      
      const loginResult = await this.page.evaluate(async () => {
        return new Promise((resolve) => {
          // Get CAPTCHA response
          let captchaResponse = '';
          try {
            if (typeof grecaptcha !== 'undefined' && grecaptcha.enterprise) {
              captchaResponse = grecaptcha.enterprise.getResponse();
              console.log('CAPTCHA response retrieved, length:', captchaResponse?.length || 0);
            } else {
              console.log('grecaptcha.enterprise not available');
            }
          } catch (e) {
            console.log('Could not get reCAPTCHA response:', e);
          }

          // Validate CAPTCHA was retrieved
          if (!captchaResponse || captchaResponse.length === 0) {
            resolve({ 
              success: false, 
              error: 'CAPTCHA response is empty - token not retrieved properly' 
            });
            return;
          }

          // Prepare data (matching the AJAX format from the page)
          const formId = 'NewloginForm-d';
          const username = document.querySelector(`#${formId} input[name='username']`)?.value || 
                          document.querySelector('input[name="username"]')?.value;
          const password = document.querySelector(`#${formId} input[name='password']`)?.value ||
                          document.querySelector('input[name="password"]')?.value;

          // Validate credentials
          if (!username || !password) {
            resolve({ 
              success: false, 
              error: `Missing credentials - username: ${!!username}, password: ${!!password}` 
            });
            return;
          }

          console.log('Submitting login with:', {
            username: username,
            passwordLength: password?.length || 0,
            captchaLength: captchaResponse?.length || 0
          });

          const dataValues = {
            username: username,
            password: password,
            language: 'PT',
            rgpd: 'Y',
            captchaResponse: captchaResponse
          };

          // Make AJAX call (same as the page does)
          fetch('/VistosOnline/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(dataValues)
          })
          .then(response => {
            // Capture the status before reading body
            const status = response.status;
            const statusText = response.statusText;
            
            return response.text().then(text => ({
              status: status,
              statusText: statusText,
              body: text
            }));
          })
          .then(responseData => {
            try {
              // Check if it's a 429 (rate limit)
              if (responseData.status === 429) {
                resolve({ 
                  success: false, 
                  error: 'Rate limit exceeded - account blocked',
                  httpStatus: 429 
                });
                return;
              }
              
              // Check for other HTTP errors
              if (responseData.status >= 400) {
                resolve({ 
                  success: false, 
                  error: `HTTP ${responseData.status}: ${responseData.statusText}`,
                  httpStatus: responseData.status 
                });
                return;
              }
              
              // Try to parse JSON response
              const resultObj = JSON.parse(responseData.body);
              
              if (resultObj.type === 'error') {
                resolve({ success: false, error: resultObj.description || 'Login failed' });
              } else if (resultObj.type === 'ReCaptchaError') {
                resolve({ success: false, error: 'CAPTCHA validation failed: ' + (resultObj.description || 'Invalid token') });
              } else if (resultObj.type === 'secblock') {
                resolve({ success: false, error: resultObj.description || 'Security block' });
              } else {
                // Success!
                resolve({ success: true, data: resultObj });
              }
            } catch (e) {
              resolve({ 
                success: false, 
                error: `Parse error: ${e.message}. Response: ${responseData.body.substring(0, 200)}` 
              });
            }
          })
          .catch(error => {
            resolve({ success: false, error: `Network error: ${error.message}` });
          });
        });
      });

      this.logger.info('Login AJAX response received', loginResult);

      if (!loginResult.success) {
        await this.takeScreenshot('login_ajax_failed');
        throw new Error(`Login failed: ${loginResult.error}`);
      }

      // Successful login - page will reload, wait for it
      this.logger.info('Login successful, waiting for page reload');
      try {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      } catch (e) {
        // Page might not reload immediately, reload manually
        await this.page.reload({ waitUntil: 'networkidle2' });
      }

      // Verify we're logged in
      const currentUrl = this.page.url();
      if (currentUrl.includes('Authentication')) {
        await this.takeScreenshot('still_on_auth_page');
        throw new Error('Login appeared successful but still on authentication page');
      }

      this.logger.info('Login successful', { url: currentUrl });
      await this.randomDelay(1000, 2000);
    } catch (error) {
      this.logger.error('Login failed', { error: error.message });
      await this.takeScreenshot('login_error');
      throw error;
    }
  }

  /**
   * Fill and submit questionnaire form
   */
  async fillQuestionario() {
    try {
      this.logger.info('Filling Questionario form');

      // Wait for page to be ready
      await this.page.waitForSelector('#mainContent, body', { timeout: 30000 });
      await this.randomDelay(1000, 2000);

      // Create and submit questionnaire form (from Tampermonkey script)
      await this.page.evaluate(() => {
        // Check if form already exists
        if (!document.querySelector('#questForm')) {
          const mainContent = document.querySelector('#mainContent') || document.body;
          const form = document.createElement('form');
          form.name = 'questForm';
          form.id = 'questForm';
          form.className = 'form';
          form.method = 'post';
          form.action = 'Formulario';

          form.innerHTML = `
            <input type="hidden" name="lang" value="PT">
            <input type="hidden" name="nacionalidade" id="nacionalidade" value="CPV">
            <input type="hidden" name="pais_residencia" id="pais_residencia" value="CPV">
            <input type="hidden" name="tipo_passaporte" id="tipo_passaporte" value="01">
            <input type="hidden" name="copia_pedido" id="copia_pedido" value="null">
            <input type="hidden" id="cb_next_1" name="cb_next_1" value="21">
            <input type="hidden" id="cb_next_21" value="2">
            <input type="hidden" id="cb_next_2" value="3">
            <input type="hidden" id="cb_next_3" value="5">
            <input type="hidden" id="cb_next_5" value="6">
            <input type="hidden" id="cb_next_6" value="16">
            <input type="hidden" id="tipo_visto" name="tipo_visto" value="C">
            <input type="hidden" id="tipo_visto_desc" name="tipo_visto_desc" value="VISTO DE CURTA DURAÇÃO">
            <input type="hidden" id="class_visto" name="class_visto" value="SCH">
            <input type="hidden" id="cod_estada" name="cod_estada" value="10">
            <input type="hidden" id="id_visto_doc" name="id_visto_doc" value="36">
          `;

          mainContent.appendChild(form);
        }
      });

      await this.randomDelay(500, 1000);

      // Submit form
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
        this.page.evaluate(() => {
          document.querySelector('#questForm, form[name="questForm"]').submit();
        })
      ]);

      this.logger.info('Questionario submitted successfully');
      await this.randomDelay(1000, 2000);
    } catch (error) {
      this.logger.error('Failed to fill Questionario', { error: error.message });
      await this.takeScreenshot('questionario_error');
      throw error;
    }
  }

  /**
   * Fill and submit main application form
   */
  async fillFormulario() {
    try {
      this.logger.info('Filling Formulario form');

      // Wait for form to load
      await this.page.waitForSelector('form[name="vistoForm"], form#vistoForm, form', {
        timeout: 30000
      });

      await this.randomDelay(1000, 2000);

      const formData = this.account.formData;

      // Fill form fields using jQuery-style selectors (from Tampermonkey script)
      await this.page.evaluate((data) => {
        const setValue = (selector, value) => {
          const element = document.querySelector(selector);
          if (element) {
            element.value = value;
            // Trigger change event
            const event = new Event('change', { bubbles: true });
            element.dispatchEvent(event);
          }
        };

        // Email and consulate
        setValue('input[name="f0"]', data.email);
        setValue('select[name="f0sf1"]', data.consulate || '5084');

        // Personal information
        setValue('input[name="f1"]', data.nome_completo);
        setValue('input[name="f2"]', data.nome_completo);
        setValue('input[name="f3"]', data.nome_pai);
        setValue('input[name="f4"]', data.nascimento);
        setValue('input[name="f6"]', data.local_nascimento);
        setValue('select[name="f6sf1"]', 'CPV');
        setValue('select[name="f7sf1"]', 'CPV');
        setValue('select[name="f8"]', 'CPV');

        // Contact information
        setValue('input[name="f45"]', 'Praia');
        setValue('input[name="f46"]', '9951033');

        // Additional fields
        setValue('select[name="f10"]', '1');
        setValue('select[name="f13"]', '01');
        setValue('select[name="f19"]', '14');
        setValue('input[name="f20sf1"]', 'Irmaos Correia');
        setValue('input[name="f20sf2"]', 'Achada Grande Frente');

        // Passport information
        setValue('input[name="f14"]', data.passaporte);
        setValue('input[name="f16"]', data.validade_passaporte_inicio);
        setValue('input[name="f17"]', data.validade_passaporte_fim);
        setValue('select[name="f15"]', 'CPV');

        // Trip information
        setValue('input[name="txtInfoMotEstada"]', data.motivo);
        setValue('select[name="f32"]', 'PRT');
        setValue('input[name="f25"]', '15');
        setValue('select[name="f34sf5"]', '6');
        setValue('input[name="f30"]', data.data_viagem_partida);
        setValue('input[name="f31"]', data.data_viagem_retorno);

        // Sponsor information
        setValue('select[name="cmbDespesasRequerente_1"]', '1');
        setValue('select[name="cmbDespesasPatrocinador_1"]', '2');
        setValue('input[name="f34"]', data.patrocinador);
        setValue('input[name="f34sf2"]', data.endereco_patrocinador);
      }, {
        email: this.account.email,
        consulate: this.account.consulate,
        ...formData
      });

      await this.randomDelay(1000, 2000);

      // Submit form
      this.logger.info('Submitting Formulario');
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
        this.page.evaluate(() => {
          const form = document.querySelector('form[name="vistoForm"]') || document.querySelector('form');
          if (form) {
            form.submit();
          }
        })
      ]);

      this.logger.info('Formulario submitted successfully');
      await this.randomDelay(2000, 3000);
    } catch (error) {
      this.logger.error('Failed to fill Formulario', { error: error.message });
      await this.takeScreenshot('formulario_error');
      throw error;
    }
  }

  /**
   * Navigate to calendar/search page and search for appointments
   */
  async searchAppointments() {
    try {
      this.logger.info('Searching for available appointments');

      // Wait for calendar/search page to load
      await this.page.waitForSelector('select, .calendar, #posto, [name="posto"]', {
        timeout: 30000
      });

      await this.randomDelay(1000, 2000);

      // Select consulate if dropdown exists
      const consulateSelected = await this.page.evaluate((consulate) => {
        const consulateSelect = document.querySelector('select[name="posto"], select#posto, select');
        if (consulateSelect) {
          consulateSelect.value = consulate;
          const event = new Event('change', { bubbles: true });
          consulateSelect.dispatchEvent(event);
          return true;
        }
        return false;
      }, this.account.consulate || '5084');

      if (consulateSelected) {
        this.logger.info('Consulate selected', { consulate: this.account.consulate });
        await this.randomDelay(500, 1000);
      }

      // Click search button
      const searchButtonClicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
        const searchButton = buttons.find(btn => 
          btn.textContent.includes('Pesquisar') || 
          btn.textContent.includes('Procurar') ||
          btn.value?.includes('Pesquisar') ||
          btn.value?.includes('Procurar')
        );
        
        if (searchButton) {
          searchButton.click();
          return true;
        }
        return false;
      });

      if (!searchButtonClicked) {
        this.logger.warn('Search button not found, continuing anyway');
      } else {
        this.logger.info('Search button clicked');
      }

      await this.randomDelay(2000, 3000);
    } catch (error) {
      this.logger.error('Failed to search appointments', { error: error.message });
      await this.takeScreenshot('search_error');
      throw error;
    }
  }

  /**
   * Find and book the first available appointment slot
   */
  async bookAppointment() {
    try {
      this.logger.info('Looking for available appointment slots');

      // Wait for calendar or time slots to appear
      await this.page.waitForSelector('.calendar, .timeslots, table, .available, [data-date]', {
        timeout: 30000
      });

      await this.randomDelay(1000, 2000);

      // Find first available slot
      const slotFound = await this.page.evaluate(() => {
        // Look for available dates (various possible selectors)
        const selectors = [
          '.available-date:not(.disabled)',
          '.calendar-day.available',
          'td.available:not(.disabled)',
          'a.available',
          '[data-available="true"]',
          '.slot-available',
          'button.available:not(:disabled)'
        ];

        for (const selector of selectors) {
          const availableSlot = document.querySelector(selector);
          if (availableSlot) {
            availableSlot.click();
            return { found: true, selector };
          }
        }

        return { found: false };
      });

      if (!slotFound.found) {
        this.logger.warn('No available appointment slots found');
        return { success: false, reason: 'No slots available' };
      }

      this.logger.info('Available slot found and clicked', { selector: slotFound.selector });
      await this.randomDelay(1000, 2000);

      // Find and click time slot if needed
      const timeSlotClicked = await this.page.evaluate(() => {
        const timeSlots = document.querySelectorAll('.time-slot:not(.disabled), .hora:not(.disabled), button[data-time]:not(:disabled)');
        if (timeSlots.length > 0) {
          timeSlots[0].click();
          return true;
        }
        return false;
      });

      if (timeSlotClicked) {
        this.logger.info('Time slot selected');
        await this.randomDelay(500, 1000);
      }

      // Click confirm button
      const confirmed = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
        const confirmButton = buttons.find(btn =>
          btn.textContent.includes('Confirmar') ||
          btn.textContent.includes('Marcar') ||
          btn.value?.includes('Confirmar') ||
          btn.value?.includes('Marcar')
        );

        if (confirmButton) {
          confirmButton.click();
          return true;
        }
        return false;
      });

      if (!confirmed) {
        throw new Error('Confirm button not found');
      }

      this.logger.info('Confirmation button clicked');
      await this.randomDelay(2000, 3000);

      // Extract confirmation details
      const confirmationDetails = await this.page.evaluate(() => {
        const getText = (selectors) => {
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element.textContent.trim();
          }
          return 'N/A';
        };

        return {
          number: getText(['.conf-number', '.confirmation-number', '#confirmationNumber', '[data-confirmation]']),
          date: getText(['.conf-date', '.appointment-date', '.data', '[data-date]']),
          time: getText(['.conf-time', '.appointment-time', '.hora', '[data-time]'])
        };
      });

      this.logger.info('Appointment booked successfully', confirmationDetails);
      await this.takeScreenshot('booking_success');

      return {
        success: true,
        ...confirmationDetails
      };
    } catch (error) {
      this.logger.error('Failed to book appointment', { error: error.message });
      await this.takeScreenshot('booking_error');
      return { success: false, reason: error.message };
    }
  }

  /**
   * Execute full automation flow
   */
  async execute() {
    try {
      this.logger.info('Starting session execution');

      await this.initBrowser();
      await this.login();
      await this.fillQuestionario();
      await this.fillFormulario();
      await this.searchAppointments();
      const bookingResult = await this.bookAppointment();

      const duration = this.formatDuration(Date.now() - this.startTime);

      if (bookingResult.success) {
        return {
          status: 'success',
          account: this.account.username,
          email: this.account.email,
          consulate: this.account.consulate,
          confirmation: bookingResult.number,
          date: bookingResult.date,
          time: bookingResult.time,
          proxyCountry: this.proxy?.country || 'none',
          duration
        };
      } else {
        return {
          status: 'failed',
          account: this.account.username,
          email: this.account.email,
          reason: bookingResult.reason,
          duration
        };
      }
    } catch (error) {
      this.logger.error('Session execution failed', { error: error.message });
      const duration = this.formatDuration(Date.now() - this.startTime);
      
      return {
        status: 'error',
        account: this.account.username,
        email: this.account.email,
        error: error.message,
        duration
      };
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Take screenshot for debugging
   */
  async takeScreenshot(name) {
    if (!this.config.screenshotsOnError || !this.page) return;

    try {
      const filename = `${this.sessionId}_${name}_${Date.now()}.png`;
      const filepath = join(this.screenshotsDir, filename);
      await this.page.screenshot({ path: filepath, fullPage: true });
      this.logger.debug('Screenshot saved', { filename });
    } catch (error) {
      this.logger.warn('Failed to take screenshot', { error: error.message });
    }
  }

  /**
   * Random delay to mimic human behavior
   */
  async randomDelay(min, max) {
    const delay = this.randomNumber(min, max);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Sleep for specified milliseconds
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate random number
   */
  randomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Format duration in human-readable format
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Cleanup browser resources
   */
  async cleanup() {
    try {
      if (this.browser) {
        await this.browser.close();
        this.logger.info('Browser closed');
      }
    } catch (error) {
      this.logger.warn('Error during cleanup', { error: error.message });
    }
  }
}

export default SessionManager;

