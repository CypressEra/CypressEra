# CypressEra Deployment

One-command deployment of the CypressEra platform on a cloud VM.

## Architecture

```
                    ┌──────────────┐
Internet ──443/80──▶│    Caddy     │  (auto-HTTPS via Let's Encrypt)
                    │  reverse     │
                    │   proxy      │
                    └──┬───┬───┬───┘
                       │   │   │         Docker internal network
            ┌──────────┘   │   └──────────┐
            ▼              ▼              ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐
      │ react-ui │  │api-server│  │agent-svr │
      │  :3000   │  │  :8080   │  │  :3001   │
      └──────────┘  └────┬─────┘  └──────────┘
                         │              │
                    ┌────┴────┐    ┌────┴────┐
                    │postgres │    │user-data│
                    │  :5432  │    │ (volume)│
                    └─────────┘    └─────────┘
```

- **Caddy**: Reverse proxy with automatic HTTPS. Only ports 80/443 exposed externally.
- **Docker DNS**: Services communicate using service names (e.g., `http://api-server:8080`).
- **Flow-solver binary**: Extracted from its image at deploy time, mounted into api-server as a read-only volume.
- **User data**: Shared Docker named volume between api-server and agent-server.

## Prerequisites

### Server requirements
- **OS**: Ubuntu 22.04/24.04 LTS (or any Debian-based Linux)
- **RAM**: 4 GB minimum, 8 GB recommended
- **Disk**: 40 GB minimum
- **Network**: Public IP with ports 80 and 443 open

### DNS setup
Point your domain's A record to the server's public IP:
```
A    cypressera.ai    →    <your-server-ip>
```

All images are public on ghcr.io — no registry authentication is needed.

## Quick Start

```bash
# 1. Clone the deploy repo
git clone https://github.com/CypressEra/product-deploy.git
cd product-deploy

# 2. Run deploy.sh (installs Docker, generates secrets, pulls images, starts services)
./deploy.sh

# 3. Add your two API keys
nano .env   # Fill in: OPENAI_API_KEY, KB_EMBEDDING_API_KEY

# 4. Restart to pick up new env vars
docker compose up -d
```

That's it. Everything else — login system, email verification, Google sign-in — is optional and off/basic by default (see Authentication Modes below).

## Authentication Modes

`AUTH_MODE` in `.env` selects how much login machinery you want:

| Mode | What you get | When to use |
|------|--------------|-------------|
| `password` (default) | Email/password login. An admin account is seeded from `AUTH_ADMIN_EMAIL`/`AUTH_ADMIN_PASSWORD`. | Any instance reachable by others |
| `none` | No login at all. Everyone shares one local workspace; postgres is never touched. | Localhost / trusted networks only |

**Security caveat for `none` mode:** anyone who can reach the server has full access — including the AI assistant, which spends **your** LLM API credits. Never expose a `none`-mode instance to the public internet. For a single-user box on a public VPS, prefer `none` plus a `basic_auth` block in the Caddyfile, or use `password` mode.

**Optional add-ons in `password` mode** (enabled by presence of their keys):

- **Mailgun** (`MAILGUN_API_KEY` + `MAILGUN_DOMAIN`): new registrations must verify their email. Without Mailgun, signups are open and **auto-verified** — fine for private instances, but configure Mailgun if your instance is public and accepts strangers' signups.
- **Google sign-in** (`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`): adds the "Sign in with Google" button.

**Switching modes later:** data is keyed by user. The `none`-mode workspace belongs to a fixed synthetic user, so flipping to `password` mode hides it (and flipping back recovers it) — nothing is deleted, but data does not migrate between modes.

## Configuration Reference

All configuration is in `.env`. See `.env.template` for the full list.

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | LLM API key for the AI assistant | **Required** |
| `KB_EMBEDDING_API_KEY` | Embedding API key for the knowledge base | **Required** |
| `AUTH_MODE` | `password` or `none` (see above) | `password` |
| `DOMAIN` | Public domain for HTTPS | `flow.cypressera.ai` |
| `IMAGE_TAG` | Image tag to pull from ghcr.io | `latest` |
| `POSTGRES_USER` | PostgreSQL username | `xflow` |
| `POSTGRES_PASSWORD` | PostgreSQL password | Auto-generated |
| `AUTH_JWT_SECRET` | JWT signing secret | Auto-generated |
| `SERVICE_AUTH_SECRET` | Inter-service auth secret | Auto-generated |
| `MAILGUN_API_KEY` | Enables email verification for signups | Optional |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Enables Google sign-in | Optional |
| `AUTH_ADMIN_EMAIL` | Initial admin email | `admin@example.com` |
| `AUTH_ADMIN_PASSWORD` | Initial admin password | `ChangeMe123!` |

Variables marked "Auto-generated" are created on first deploy. Only the two keys marked **Required** must be set by hand.

## Updating

To update to the latest images:
```bash
./deploy.sh
```
The script is idempotent — it preserves your `.env` and data volumes, pulls fresh images, extracts the latest flow-solver binary, and restarts services.

To update to a specific image tag:
```bash
# Edit .env
IMAGE_TAG=abc1234    # git SHA from CI

# Re-run
./deploy.sh
```

## Backup & Restore

### Backup user data
```bash
docker run --rm -v product-deploy_user-data:/data -v $(pwd):/backup \
    alpine tar czf /backup/user-data-backup.tar.gz -C /data .
```

### Backup postgres
```bash
docker compose exec -T postgres \
    pg_dump -U xflow xflow > postgres-backup.sql
```

### Restore user data
```bash
docker run --rm -v product-deploy_user-data:/data -v $(pwd):/backup \
    alpine tar xzf /backup/user-data-backup.tar.gz -C /data
```

### Restore postgres
```bash
docker compose exec -T postgres \
    psql -U xflow xflow < postgres-backup.sql
```

## Database Access

### Enter PostgreSQL CLI

```bash
docker compose exec postgres psql -U xflow -d xflow
```

### Quick query (one-liner)

```bash
# Count registered users
docker compose exec postgres psql -U xflow -d xflow -c "SELECT COUNT(*) FROM users;"

# List all tables
docker compose exec postgres psql -U xflow -d xflow -c "\dt"
```

### Common queries

The `users` table has columns: `id`, `email`, `role`, `email_verified`, `created_at`, `updated_at`.

```bash
# View all users (without password hash)
docker compose exec postgres psql -U xflow -d xflow \
  -c "SELECT id, email, role, email_verified, created_at FROM users;"

# View email and registration time only
docker compose exec postgres psql -U xflow -d xflow \
  -c "SELECT email, created_at FROM users ORDER BY created_at DESC;"
```

### Connection info

| Parameter | Value |
|-----------|-------|
| Container | `postgres` |
| User | `xflow` (from `POSTGRES_USER`) |
| Database | `xflow` (from `POSTGRES_DB`) |
| Password | See `POSTGRES_PASSWORD` in `.env` |

To view the password:
```bash
grep POSTGRES_PASSWORD .env
```

## Troubleshooting

```bash
# Check service status
docker compose ps

# View logs for a specific service
docker compose logs api-server --tail=100 -f

# Check Caddy certificates
docker compose logs caddy --tail=50

# Restart a single service
docker compose restart api-server

# Full reset (preserves .env and volumes)
docker compose down && ./deploy.sh
```
