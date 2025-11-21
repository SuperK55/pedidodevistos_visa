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

      // Listen to network requests for debugging
      this.page.on('request', request => {
        if (request.url().includes('/login')) {
          this.logger.info('HTTP Request to /login', {
            url: request.url(),
            method: request.method(),
            headers: request.headers(),
            postData: request.postData() ? request.postData().substring(0, 300) : 'No post data'
          });
        }
      });

      this.page.on('response', async response => {
        if (response.url().includes('/login')) {
          const status = response.status();
          this.logger.info('HTTP Response from /login', {
            url: response.url(),
            status: status,
            statusText: response.statusText(),
            headers: response.headers()
          });
          
          // Try to get response body for logging
          try {
            const text = await response.text();
            this.logger.info('Response body preview', {
              preview: text.substring(0, 200)
            });
          } catch (e) {
            this.logger.warn('Could not read response body', { error: e.message });
          }
        }
      });

      // Authenticate proxy if needed
      if (this.proxy) {
        await authenticateProxy(this.page, this.proxy);
        this.logger.info('Proxy authenticated');
      }

      // Set realistic user agent
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
      );

      // Set additional headers (avoid headers that cause CORS issues with reCAPTCHA)
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Ch-Ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"'
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

      // Handle cookie consent popup if it appears (MUST be done before login)
      this.logger.info('Checking for cookie consent popup');
      try {
        // Use page.evaluate to find button by text content
        const clicked = await this.page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const acceptButton = buttons.find(btn => 
            btn.textContent.includes('Aceitar todas') || 
            btn.textContent.includes('Aceitar') ||
            btn.textContent.includes('Accept all')
          );
          if (acceptButton) {
            acceptButton.click();
            return true;
          }
          return false;
        });
        
        if (clicked) {
          this.logger.info('Cookie consent accepted');
          await this.randomDelay(2000, 3000);
        } else {
          this.logger.info('No cookie consent popup found');
        }
      } catch (e) {
        this.logger.info('Cookie consent handling skipped', { error: e.message });
      }

      // Handle GDPR/Privacy consent popup if it appears
      this.logger.info('Checking for GDPR consent popup');
      try {
        const gdprHandled = await this.page.evaluate(() => {
          // Look for SPECIFIC GDPR checkboxes (loginCheckbox1 and loginCheckbox2 ONLY)
          const checkbox1 = document.getElementById('loginCheckbox1');
          const checkbox2 = document.getElementById('loginCheckbox2');
          const checkbox3 = document.getElementById('loginCheckbox3'); // refuse checkbox
          
          let found = false;
          
          // Check ONLY the consent checkboxes (not the refuse one)
          if (checkbox1 && !checkbox1.checked) {
            checkbox1.checked = true;
            checkbox1.dispatchEvent(new Event('change', { bubbles: true }));
            found = true;
          }
          
          if (checkbox2 && !checkbox2.checked) {
            checkbox2.checked = true;
            checkbox2.dispatchEvent(new Event('change', { bubbles: true }));
            found = true;
          }
          
          // Ensure refuse checkbox is UNchecked
          if (checkbox3 && checkbox3.checked) {
            checkbox3.checked = false;
            checkbox3.dispatchEvent(new Event('change', { bubbles: true }));
          }
          
          if (found) {
            // Find and click the submit button (#loginSubmit)
            const submitBtn = document.getElementById('loginSubmit');
            if (submitBtn && !submitBtn.disabled) {
              submitBtn.click();
              return true;
            }
          }
          return false;
        });
        
        if (gdprHandled) {
          this.logger.info('GDPR consent accepted and submitted');
          await this.randomDelay(3000, 4000); // Wait for popup to close and reload
        } else {
          this.logger.info('No GDPR consent popup found or already accepted');
        }
      } catch (e) {
        this.logger.info('GDPR consent handling skipped', { error: e.message });
      }

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
        
        // Small delay to ensure token is properly set (don't wait too long or token expires)
        this.logger.info('Brief wait before submission');
        await this.randomDelay(2000, 3000);
      }

      // Take screenshot before submitting (for debugging)
      await this.takeScreenshot('before_login');
      
      // Log page state before submission
      const pageState = await this.page.evaluate(() => {
        return {
          cookies: document.cookie,
          gdprCheckboxes: Array.from(document.querySelectorAll('input[type="checkbox"]')).map(cb => ({
            id: cb.id,
            name: cb.name,
            checked: cb.checked
          })),
          visiblePopups: Array.from(document.querySelectorAll('[id*="popup"], [class*="popup"]'))
            .filter(el => el.style.display !== 'none' && el.offsetParent !== null)
            .map(el => ({ id: el.id, class: el.className }))
        };
      });
      this.logger.info('Page state before login', pageState);

      // Submit login using jQuery AJAX (exactly like the page does)
      this.logger.info('Submitting login using jQuery AJAX (native page method)');
      
      const loginResult = await this.page.evaluate(() => {
        return new Promise((resolve) => {
          // Check if jQuery is loaded
          if (typeof $ === 'undefined' || typeof jQuery === 'undefined') {
            resolve({ success: false, error: 'jQuery not loaded' });
            return;
          }
          
          const formId = 'NewloginForm-d';
          
          // Get values  
          const username = $("#" + formId + " input[name='username']").val();
          const password = $("#" + formId + " input[name='password']").val();
          
          // Check grecaptcha
          if (typeof grecaptcha === 'undefined' || !grecaptcha.enterprise) {
            resolve({ success: false, error: 'grecaptcha.enterprise not loaded' });
            return;
          }
          
          const captchaResponse = grecaptcha.enterprise.getResponse();
          
          if (!captchaResponse || captchaResponse.length === 0) {
            resolve({ success: false, error: 'CAPTCHA response empty' });
            return;
          }
          
          const dataValues = {
            username: username,
            password: password,
            language: 'PT',
            rgpd: 'Y',
            captchaResponse: captchaResponse
          };
          
          console.log('Submitting with jQuery AJAX:', {
            username, 
            passwordLength: password?.length,
            captchaLength: captchaResponse?.length,
            jQueryVersion: $.fn.jquery
          });
          
          // Use jQuery AJAX exactly like the page does
          $.ajax({
            url: '/VistosOnline/login',
            data: dataValues,
            type: 'POST',
            dataType: 'text', // Expect text response (will parse manually)
            timeout: 30000, // 30 second timeout
            success: function(resultData) {
              console.log("AJAX Success", resultData);
              try {
                const resultObj = JSON.parse(resultData);
                console.log("Parsed result:", resultObj);
                
                if (resultObj.type === "error") {
                  resolve({ success: false, error: resultObj.description, responseType: 'error' });
                } else if (resultObj.type === "ReCaptchaError") {
                  resolve({ success: false, error: resultObj.description, responseType: 'ReCaptchaError' });
                } else if (resultObj.type === "secblock") {
                  resolve({ success: false, error: resultObj.description, responseType: 'secblock' });
                } else {
                  // Success!
                  resolve({ success: true, data: resultObj });
                }
              } catch (e) {
                console.error("Parse error:", e);
                resolve({ success: false, error: 'Parse error: ' + e.message + '. Data: ' + resultData });
              }
            },
            error: function(xhr, status, error) {
              console.error("AJAX Error", {
                status: xhr.status,
                statusText: xhr.statusText,
                readyState: xhr.readyState,
                responseText: xhr.responseText,
                error: error,
                ajaxStatus: status
              });
              
              if (xhr.status === 429) {
                resolve({ success: false, error: 'Rate limit exceeded (429)', httpStatus: 429 });
              } else if (xhr.status === 0) {
                resolve({ success: false, error: 'Network error (status 0) - possible CORS or connection issue', httpStatus: 0 });
              } else {
                resolve({ success: false, error: `AJAX failed: ${status} - ${error} (HTTP ${xhr.status})`, httpStatus: xhr.status });
              }
            }
          });
        });
      });

      // Get browser console logs
      const consoleLogs = await this.page.evaluate(() => {
        return window.__consoleLogs__ || [];
      });
      
      this.logger.info('Login AJAX response received', loginResult);
      
      if (consoleLogs.length > 0) {
        this.logger.info('Browser console logs', { logs: consoleLogs });
      }

      if (!loginResult || !loginResult.success) {
        await this.takeScreenshot('login_ajax_failed');
        
        // Log page content for debugging
        const pageDebug = await this.page.evaluate(() => {
          return {
            url: window.location.href,
            cookies: document.cookie,
            hasJQuery: typeof $ !== 'undefined',
            hasGrecaptcha: typeof grecaptcha !== 'undefined',
            formExists: !!document.querySelector('#NewloginForm-d')
          };
        });
        this.logger.info('Page debug info', pageDebug);
        
        throw new Error(`Login failed: ${loginResult?.error || 'Unknown error'}`);
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

