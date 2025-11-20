# Visa Booking Automation System

Automated Portuguese visa appointment booking with parallel session management, CAPTCHA solving, and proxy rotation.

## Features

- **Parallel Processing**: 10-15 concurrent browser sessions
- **CAPTCHA Solving**: Integrated CapSolver for hCaptcha and Turnstile
- **Proxy Rotation**: Residential proxy support (SOAX format)
- **Cloudflare Bypass**: Stealth plugins and human-like behavior
- **Telegram Notifications**: Real-time booking confirmations
- **Docker Support**: Easy VPS deployment

## Quick Start

### 1. Installation

```bash
npm install
```

### 2. Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:
- `CAPSOLVER_API_KEY`: Your CapSolver API key
- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
- `TELEGRAM_CHAT_ID`: Your Telegram chat ID

### 3. Setup Accounts and Proxies

Create `config/accounts.json`:

```json
[
  {
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
  }
]
```

Create `config/proxies.txt` (one proxy per line):

**Standard Format** (Webshare, most providers):
```
p.webshare.io:80:username:password
```

**SOAX Format**:
```
proxy.soax.com:9000:Fg2bMz06fhV8h3ba:wifi;al;
```

The system auto-detects which format you're using.

### 4. Run

```bash
npm start
```

## Docker Deployment

### Build and Run

```bash
docker-compose up -d
```

### View Logs

```bash
docker logs -f visa-automation
```

### Stop

```bash
docker-compose down
```

## Project Structure

```
/
├── src/
│   ├── core/
│   │   ├── orchestrator.js       # Main coordinator
│   │   ├── session-manager.js    # Browser session handler
│   │   └── capsolver.js          # CAPTCHA solver
│   ├── utils/
│   │   ├── proxy-parser.js       # Proxy format parser
│   │   ├── telegram.js           # Notification sender
│   │   └── logger.js             # Logging utility
│   ├── config/
│   │   └── config.js             # Configuration loader
│   └── index.js                  # Entry point
├── config/
│   ├── accounts.json             # Account credentials
│   └── proxies.txt               # Proxy list
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
└── package.json
```

## Configuration Details

### Accounts Format

Each account requires:
- `username`: Login username
- `password`: Login password
- `email`: Email for form
- `consulate`: Consulate ID (e.g., "5084" for Recife)
- `formData`: Complete form data object

### Proxy Format

SOAX format: `host:port:auth:country`

Example: `proxy.soax.com:9000:Fg2bMz06fhV8h3ba:wifi;al;`

## Troubleshooting

### CAPTCHA Not Solving

- Check CapSolver API key is valid
- Verify CapSolver balance
- Check logs for specific error messages

### Proxy Connection Issues

- Verify proxy format is correct
- Test proxy connection manually
- Check proxy credentials and allowlist

### No Available Slots

- System will continue checking
- Increase refresh frequency if needed
- Check consulate selection is correct

## License

MIT

