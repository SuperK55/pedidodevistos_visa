# Quick Start Guide

Get the Visa Booking Automation running in 5 minutes!

## 🚀 Fast Track

### 1. Setup Configuration (2 minutes)

```bash
# Copy example files
cp .env.example .env
cp config/accounts.example.json config/accounts.json
cp config/proxies.example.txt config/proxies.txt
```

### 2. Edit Configuration Files (2 minutes)

**Edit `.env`:**
```bash
nano .env
```
- Set `CAPSOLVER_API_KEY` (REQUIRED)
- Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (optional)

**Edit `config/accounts.json`:**
```bash
nano config/accounts.json
```
- Replace example with your account(s)
- Update `formData` fields

**Edit `config/proxies.txt`:**
```bash
nano config/proxies.txt
```
- Add your SOAX proxies (one per line)

### 3. Run! (1 minute)

**Local (with Node.js):**
```bash
npm install
npm start
```

**Docker (on VPS):**
```bash
bash docker/deploy.sh
```

Done! 🎉

## 📋 Minimum Required Config

### .env
```env
CAPSOLVER_API_KEY=CAP-AAAAD7EA89937E8CD6DD03158747B46E84F7D4E55F74DC4CBD6FBA6C02891BB2
```

### accounts.json
```json
[{
  "username": "zuca2030",
  "password": "Saulooliveira2020@",
  "email": "matildeoliveiracabral34@gmail.com",
  "consulate": "5084",
  "formData": {
    "nome_completo": "Gomes",
    "nome_pai": "Leonardo",
    "nascimento": "2007/01/13",
    "local_nascimento": "Santiago",
    "passaporte": "PA4284766",
    "validade_passaporte_inicio": "2024/04/15",
    "validade_passaporte_fim": "2029/04/14",
    "motivo": "Ferias",
    "data_viagem_partida": "2026/01/17",
    "data_viagem_retorno": "2026/01/30",
    "patrocinador": "Carlos Antonio Correia Morais Chantre",
    "endereco_patrocinador": "R Bombeiro voluntarios 3A Loures"
  }
}]
```

### proxies.txt
```
proxy.soax.com:9000:Fg2bMz06fhV8h3ba:wifi;al;
proxy.soax.com:9001:Fg2bMz06fhV8h3ba:wifi;al;
```

## 🧪 Test First

Test with single account before running all:

```bash
npm run test
```

## 📊 Monitor

**Docker:**
```bash
docker-compose logs -f
```

**Local:**
Check `logs/combined.log`

## 🛑 Stop

**Docker:**
```bash
docker-compose down
```

**Local:**
Press Ctrl+C

## ⚡ Common Issues

**"CAPTCHA solving failed"**
- Check CapSolver balance
- Verify API key

**"Login failed"**
- Check username/password
- Check if account is locked

**"No slots available"**
- Normal! Just means no appointments right now
- Try again later

**"Proxy connection failed"**
- Verify proxy format
- Test proxy manually

## 📱 Get Telegram Notifications

1. Message @BotFather → `/newbot` → get token
2. Start chat with your bot → send any message
3. Visit: `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Copy chat ID from response
5. Add to `.env`

## 🎯 Ready for Production?

See [DEPLOYMENT.md](DEPLOYMENT.md) for full VPS setup.

## ℹ️ Need Help?

- Check [README.md](README.md) for full documentation
- View logs: `cat logs/errors.log`
- Check screenshots: `ls screenshots/`

