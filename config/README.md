# Configuration Directory

This directory contains the configuration files for the visa booking automation system.

## Files

### accounts.json

Contains the list of accounts to process. Each account should have:

```json
{
  "username": "login_username",
  "password": "login_password",
  "email": "email@example.com",
  "consulate": "5084",
  "formData": {
    "nome_completo": "Full Name",
    "nome_pai": "Father's Name",
    "nascimento": "YYYY/MM/DD",
    "local_nascimento": "Birth Place",
    "passaporte": "Passport Number",
    "validade_passaporte_inicio": "YYYY/MM/DD",
    "validade_passaporte_fim": "YYYY/MM/DD",
    "motivo": "Reason",
    "data_viagem_partida": "YYYY/MM/DD",
    "data_viagem_retorno": "YYYY/MM/DD",
    "patrocinador": "Sponsor Name",
    "endereco_patrocinador": "Sponsor Address"
  }
}
```

**Note:** Copy `accounts.example.json` to `accounts.json` and fill in your data.

### proxies.txt

Contains the list of proxies (one per line). Supports two formats:

**Standard Format** (Webshare, most providers):
```
host:port:username:password
```

Example:
```
p.webshare.io:80:Mylist1234-residential-MA-1:Saulo12345
```

**SOAX Format**:
```
host:port:auth:country
```

Example:
```
proxy.soax.com:9000:Fg2bMz06fhV8h3ba:wifi;al;
```

**Note:** Copy `proxies.example.txt` to `proxies.txt` and fill in your proxies. The system auto-detects the format.

## Consulate IDs

Common consulate IDs:
- `5084` - Recife (from example)
- (Add more as you discover them)

## Security

⚠️ **IMPORTANT**: Never commit `accounts.json` or `proxies.txt` to version control!

These files are automatically ignored by `.gitignore`.

