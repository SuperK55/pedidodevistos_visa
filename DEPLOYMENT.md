# Deployment Guide

Complete guide for deploying the Visa Booking Automation System to a VPS.

## Prerequisites

- Ubuntu 22.04 or 20.04 VPS
- At least 4GB RAM, 2 vCPUs
- Docker and Docker Compose (will be installed if missing)
- CapSolver API key
- Telegram Bot token and Chat ID (optional)
- Account credentials
- Proxy list

## Step 1: VPS Setup

### 1.1 Connect to VPS

```bash
ssh root@your-vps-ip
```

### 1.2 Update System

```bash
apt update && apt upgrade -y
```

### 1.3 Install Git (if not installed)

```bash
apt install -y git
```

## Step 2: Clone or Upload Project

### Option A: Clone from Git (if you have a repository)

```bash
git clone <your-repo-url>
cd captha
```

### Option B: Upload via SCP

From your local machine:

```bash
scp -r /path/to/captha root@your-vps-ip:/root/
```

Then on VPS:

```bash
cd /root/captha
```

## Step 3: Configure Environment

### 3.1 Create .env file

```bash
cp .env.example .env
nano .env
```

Edit with your credentials:

```env
# CapSolver API Key (REQUIRED)
CAPSOLVER_API_KEY=CAP-AAAAD7EA89937E8CD6DD03158747B46E84F7D4E55F74DC4CBD6FBA6C02891BB2

# Telegram Configuration (OPTIONAL)
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# Automation Settings
PARALLEL_SESSIONS=15
SESSION_TIMEOUT_MS=300000
RETRY_ATTEMPTS=2

# Debug Settings
HEADLESS=true
SCREENSHOTS_ON_ERROR=true
```

Save and exit (Ctrl+X, Y, Enter)

### 3.2 Create accounts.json

```bash
cp config/accounts.example.json config/accounts.json
nano config/accounts.json
```

Add your accounts (see example format in file). Save and exit.

### 3.3 Create proxies.txt

```bash
cp config/proxies.example.txt config/proxies.txt
nano config/proxies.txt
```

Add your proxies (one per line in SOAX format). Save and exit.

## Step 4: Deploy with Docker

### 4.1 Run Deployment Script

```bash
chmod +x docker/*.sh
bash docker/deploy.sh
```

This script will:
- Install Docker if needed
- Install Docker Compose if needed
- Build the Docker image
- Start the container

### 4.2 Verify Container is Running

```bash
docker-compose ps
```

You should see the `visa-booking-automation` container running.

## Step 5: Monitor Execution

### View Live Logs

```bash
docker-compose logs -f
```

Press Ctrl+C to exit logs (container keeps running).

### View Last 100 Lines

```bash
docker-compose logs --tail=100
```

### Check Container Status

```bash
docker ps
```

## Step 6: Check Results

### View Log Files

```bash
cat logs/combined.log
```

### View Error Logs

```bash
cat logs/errors.log
```

### View Screenshots (if errors occurred)

```bash
ls -la screenshots/
```

## Management Commands

### Stop the Automation

```bash
docker-compose down
```

or

```bash
bash docker/stop.sh
```

### Restart the Automation

```bash
docker-compose restart
```

### Start Again

```bash
docker-compose up -d
```

or

```bash
bash docker/start.sh
```

### Rebuild After Code Changes

```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### View Resource Usage

```bash
docker stats
```

## Troubleshooting

### Container Exits Immediately

Check logs:
```bash
docker-compose logs
```

Common issues:
- Missing .env file
- Missing accounts.json
- Invalid CapSolver API key

### Out of Memory

Increase VPS RAM or reduce `PARALLEL_SESSIONS` in `.env`:

```env
PARALLEL_SESSIONS=10
```

Then restart:
```bash
docker-compose restart
```

### Proxy Connection Issues

Test proxy manually:
```bash
curl -x http://auth@proxy.soax.com:9000 https://api.ipify.org
```

### CAPTCHA Solving Fails

1. Check CapSolver balance:
   - Login to CapSolver dashboard
   - Verify you have credit

2. Check API key in `.env`

3. View CAPTCHA-related errors:
   ```bash
   grep -i "captcha" logs/combined.log
   ```

### No Available Slots

This is expected if no appointment slots are available. The system will:
- Mark as "failed" with reason "No slots available"
- Continue to next account
- Can be retried later

### Telegram Notifications Not Working

1. Verify bot token and chat ID in `.env`

2. Test Telegram bot:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getMe"
   ```

3. Check logs for Telegram errors:
   ```bash
   grep -i "telegram" logs/combined.log
   ```

## Getting Telegram Bot Token and Chat ID

### Create Bot

1. Message @BotFather on Telegram
2. Send `/newbot`
3. Follow instructions
4. Copy the token (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### Get Chat ID

1. Start a chat with your bot
2. Send any message
3. Visit: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
4. Find `"chat":{"id":123456789}` in the response
5. Copy the chat ID

## Performance Tuning

### For High Volume (50+ accounts)

1. Increase parallel sessions:
   ```env
   PARALLEL_SESSIONS=20
   ```

2. Increase Docker resources in `docker-compose.yml`:
   ```yaml
   resources:
     limits:
       cpus: '4'
       memory: 8G
   ```

3. Upgrade VPS to 8GB RAM, 4 vCPUs

### For Low Memory VPS (2GB)

1. Reduce parallel sessions:
   ```env
   PARALLEL_SESSIONS=5
   ```

2. Run in batches manually

## Security Best Practices

1. **Never commit sensitive files**:
   - `.env`
   - `config/accounts.json`
   - `config/proxies.txt`

2. **Use strong passwords** for VPS

3. **Restrict SSH access**:
   ```bash
   nano /etc/ssh/sshd_config
   # Set: PermitRootLogin no
   # Set: PasswordAuthentication no
   systemctl restart sshd
   ```

4. **Use firewall**:
   ```bash
   ufw allow 22
   ufw enable
   ```

## Backup and Recovery

### Backup Configuration

```bash
tar -czf backup-$(date +%Y%m%d).tar.gz config/ .env logs/
```

### Download Backup to Local Machine

```bash
scp root@your-vps-ip:/root/captha/backup-*.tar.gz ./
```

### Restore from Backup

```bash
tar -xzf backup-20241120.tar.gz
```

## Cron Job for Scheduled Runs

To run automation daily at 2 AM:

```bash
crontab -e
```

Add:
```
0 2 * * * cd /root/captha && docker-compose up -d >> /var/log/visa-automation.log 2>&1
```

## Support

For issues:
1. Check logs: `docker-compose logs`
2. Check screenshots: `ls screenshots/`
3. Verify configuration files
4. Test with single account first: `npm run test` (without Docker)

## Clean Up

### Remove All Data

```bash
docker-compose down -v
rm -rf logs/* screenshots/*
```

### Complete Uninstall

```bash
docker-compose down
docker rmi $(docker images -q visa-booking-automation)
cd ..
rm -rf captha
```

