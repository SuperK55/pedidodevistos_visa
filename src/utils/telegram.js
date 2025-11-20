import axios from 'axios';
import logger from './logger.js';

class TelegramNotifier {
  constructor(botToken, chatId) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  /**
   * Send a text message to Telegram
   */
  async sendMessage(text, options = {}) {
    try {
      const response = await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: this.chatId,
        text: text,
        parse_mode: options.parseMode || 'HTML',
        disable_web_page_preview: options.disablePreview !== false,
        ...options
      });

      logger.debug('Telegram message sent successfully');
      return response.data;
    } catch (error) {
      logger.error('Failed to send Telegram message', {
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Send booking success notification
   */
  async notifyBookingSuccess(bookingDetails) {
    const {
      account,
      consulate,
      date,
      time,
      confirmationNumber,
      proxyCountry,
      duration,
      email
    } = bookingDetails;

    const message = `
✅ <b>APPOINTMENT BOOKED!</b>

📧 <b>Account:</b> ${email || account}
🏢 <b>Consulate:</b> ${consulate}
📅 <b>Date:</b> ${date}
🕒 <b>Time:</b> ${time}
🎫 <b>Confirmation:</b> ${confirmationNumber}
🌍 <b>Proxy:</b> ${proxyCountry}
⏱️ <b>Duration:</b> ${duration}

${new Date().toLocaleString()}
    `.trim();

    return this.sendMessage(message);
  }

  /**
   * Send error notification
   */
  async notifyError(errorDetails) {
    const { account, error, sessionId, email } = errorDetails;

    const message = `
❌ <b>BOOKING FAILED</b>

📧 <b>Account:</b> ${email || account}
🆔 <b>Session:</b> ${sessionId}
⚠️ <b>Error:</b> ${error}

${new Date().toLocaleString()}
    `.trim();

    return this.sendMessage(message);
  }

  /**
   * Send batch status notification
   */
  async notifyBatchStatus(stats) {
    const { total, success, failed, pending } = stats;

    const message = `
📊 <b>BATCH STATUS UPDATE</b>

✅ <b>Success:</b> ${success}
❌ <b>Failed:</b> ${failed}
⏳ <b>Pending:</b> ${pending}
📈 <b>Total:</b> ${total}
📉 <b>Success Rate:</b> ${((success / total) * 100).toFixed(1)}%

${new Date().toLocaleString()}
    `.trim();

    return this.sendMessage(message);
  }

  /**
   * Send session started notification
   */
  async notifySessionStarted(sessionInfo) {
    const { totalAccounts, batchSize, email } = sessionInfo;

    const message = `
🚀 <b>AUTOMATION STARTED</b>

📋 <b>Total Accounts:</b> ${totalAccounts}
🔄 <b>Batch Size:</b> ${batchSize}
${email ? `📧 <b>Starting with:</b> ${email}` : ''}

${new Date().toLocaleString()}
    `.trim();

    return this.sendMessage(message);
  }

  /**
   * Test connection
   */
  async testConnection() {
    try {
      const response = await axios.get(`${this.baseUrl}/getMe`);
      logger.info('Telegram connection test successful', {
        bot: response.data.result.username
      });
      return true;
    } catch (error) {
      logger.error('Telegram connection test failed', {
        error: error.message
      });
      return false;
    }
  }
}

/**
 * Create Telegram notifier instance
 */
export function createTelegramNotifier(botToken, chatId) {
  if (!botToken || !chatId) {
    logger.warn('Telegram credentials not provided, notifications disabled');
    return null;
  }
  return new TelegramNotifier(botToken, chatId);
}

export default TelegramNotifier;

