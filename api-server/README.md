# X-Flow API Server

A high-performance Go API server for power flow analysis that manages user sessions, network editing, and orchestrates calculations using the Rust flow-solver.

## Prerequisites

### Install Go

**macOS (using Homebrew):**
```bash
brew install go
```

**macOS/Linux (Official Installer):**
1. Visit https://go.dev/dl/
2. Download the installer for your OS
3. Run the installer

**Verify installation:**
```bash
go version
```

You should see output like: `go version go1.21.x ...`

**Note:** After installing, make sure `go` is in your PATH. If not found, add Go's bin directory to your PATH:
```bash
# Add to ~/.zshrc (or ~/.bashrc on Linux)
export PATH=$PATH:/usr/local/go/bin
source ~/.zshrc
```

### Setup Rust Solver

The API server requires the Rust-based flow-solver to be built and available.

**If the Rust solver is not yet set up, please refer to the flow-solver project for installation and build instructions.**

After the solver is built, configure the path in `config.yaml` (see [Configuration](#configuration)).

---

## Quick Start

### 1. Setup Rust Solver

**If the Rust solver is not yet set up, go to the flow-solver project and follow its setup instructions.**

Once the solver is built, ensure the solver path in `config.yaml` points to the binary (see [Configuration](#configuration)).

### 2. Run the API Server
```bash
cd api-server
./api-server
```

**Note:** If the binary doesn't exist, build it first: `go build -o api-server src/main.go`

Server starts on `http://localhost:8080`

### 3. Test
```bash
# Health check (no auth required)
curl http://localhost:8080/health

# Login to get a JWT access token (replace credentials as needed)
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "ChangeMe123!"}' | jq -r '.access_token')

# Create session (auth required)
curl -X POST http://localhost:8080/api/v1/session \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' | jq
```

---

## Documentation

The API server documentation is organized into comprehensive guides:

### 📖 [Getting Started Guide](./documentations/01_GETTING_STARTED.md)
**Quick Start and Setup**
- Prerequisites and installation
- Quick start guide
- Basic workflow examples
- Project structure overview
- Troubleshooting basics

### 🏗️ [Architecture Guide](./documentations/02_ARCHITECTURE.md)
**System Design and Architecture**
- System architecture overview
- Service layer design (SessionService, SolverService, EditorService, ParserService)
- Communication patterns (Go ↔ Rust)
- Data flow diagrams
- Storage structure and file lifecycle
- Error handling and concurrency

### 📘 [API Reference](./documentations/03_API_REFERENCE.md)
**Complete API Documentation**
- All endpoints with detailed request/response examples
- User file management APIs
- Session lifecycle management APIs
- Network editing APIs (add/modify/delete elements)
- Power flow calculation APIs
- Error codes and status codes
- Quick reference table

### 💻 [Development Guide](./documentations/04_DEVELOPMENT.md)
**Development and Contributing**
- Development setup
- Code organization and patterns
- Adding new endpoints
- Testing guidelines
- Code style and best practices
- Debugging tips

### ⚙️ [Configuration Guide](./documentations/05_CONFIGURATION.md)
**Configuration and Setup**
- Complete configuration reference
- Environment variables
- Development vs production settings
- Troubleshooting configuration issues
- Best practices

---

## Features

- ✅ **Session Management** - Multi-user session handling with file isolation
- ✅ **File Operations** - Upload and manage RAWX power system files
- ✅ **Network Editing** - Add, modify, delete buses, loads, generators, lines, transformers
- ✅ **Power Flow** - dc / fnsl / fdns calculations with automatic result handling
- ✅ **Dynamic Results** - Auto-includes any new component results from solver without code changes
- ✅ **Async Processing** - Channel-based Go ↔ Rust communication
- ✅ **Temp Files** - Non-destructive editing with automatic cleanup

---

## Architecture

```
Frontend (React) ──▶ API Server (Go) ──▶ Flow Solver (Rust)
                         │
                         ▼
                   File Storage
```

### Service Layer

```
APIHandler
├── SessionService  → Session & file management
├── SolverService   → Power flow calculations
├── EditorService   → Network element editing
└── ParserService   → Network data parsing
```

**See [Architecture Guide](./documentations/02_ARCHITECTURE.md) for detailed architecture.**

---

## Quick Example

```bash
BASE_URL="http://localhost:8080/api/v1"

# 0. Login and get JWT (replace credentials as needed)
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "ChangeMe123!"}' | jq -r '.access_token')

AUTH_HEADER="Authorization: Bearer $TOKEN"

# 1. Create session (user is taken from the JWT)
SESSION_ID=$(curl -s -X POST "$BASE_URL/session" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{}' | jq -r '.session_id')

# 2. Upload file to your user models folder
curl -X POST "$BASE_URL/user/upload" \
  -H "$AUTH_HEADER" \
  -F "file_type=models" \
  -F "file=@network.rawx"

# 3. Create session from uploaded file
SESSION_ID=$(curl -s -X POST "$BASE_URL/session/from-file" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"file_name": "network.rawx"}' | jq -r '.session_id')

# 4. Get network data
curl -X POST "$BASE_URL/session/network" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"session_id": "'$SESSION_ID'"}' | jq

# 5. Edit network (add bus)
curl -X POST "$BASE_URL/session/edit" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "bus",
    "action": "add",
    "data": {
      "ibus": 99999,
      "name": "NEW BUS",
      "baskv": 230.0,
      "ide": 1,
      "vm": 1.0,
      "va": 0.0
    }
  }' | jq

# 6. Solve power flow
curl -X POST "$BASE_URL/session/solve-flow" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "config": {"method": "dc"}
  }' | jq

# 7. Get power flow results
curl -X POST "$BASE_URL/session/powerflow" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "session_id": "'$SESSION_ID'"
  }' | jq
```

**See [Getting Started Guide](./documentations/01_GETTING_STARTED.md) for basic workflows and [API Reference](./documentations/03_API_REFERENCE.md) for complete examples.**

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| **Auth** |
| POST | `/auth/login` | Login. Returns `access_token` (JWT, 15min) + `refresh_token` (30d) when `AUTH_REFRESH_ENABLED=true`. |
| POST | `/auth/refresh` | Trade a refresh token for a new access + refresh pair (rotation; reuse of a rotated token burns the chain). 404 when `AUTH_REFRESH_ENABLED=false`. |
| POST | `/auth/logout` | Revoke the supplied refresh token. Idempotent; 204 even if unknown. 404 when toggle is off. |
| POST | `/auth/logout-all` | Revoke every refresh token for the current user (requires Bearer access token). 404 when toggle is off. |
| POST | `/auth/register` | Register new user account |
| GET | `/auth/verify-email` | Verify email address |
| POST | `/auth/verify-passcode` | Verify email with passcode |
| POST | `/auth/forgot-password` | Request password reset |
| POST | `/auth/reset-password` | Reset password with passcode |
| GET | `/auth/google/url` | Get Google OAuth authorization URL |
| POST | `/auth/google/callback` | Handle Google OAuth callback |
| **Session** |
| POST | `/session` | Create session |
| POST | `/session/info` | Get session info |
| POST | `/session/network` | Get network data |
| POST | `/user/session` | List user sessions |
| DELETE | `/user/session` | Delete user sessions |
| **User File Library** |
| POST | `/user/upload` | Upload a file to the user library (`file_type`: `model`, `knowledge`, `sub`, `mon`, `con`, `diagram`) |
| POST | `/user/files` | List user library files of a given `file_type` |
| POST | `/user/files/download` | Download a user library file |
| POST | `/user/files/delete` | Delete a user library file |
| **Session Case (RAWX)** |
| POST | `/session/load-case` | Create a session from a network case in the library |
| POST | `/session/save-case` | Save the session's case back to its library file |
| POST | `/session/save-case-as` | Save the session's case as a new library file |
| **Session Study Files** |
| POST | `/session/load-sub` | Load a subsystem (`.sub`) file into the session |
| POST | `/session/load-mon` | Load a monitored-elements (`.mon`) file into the session |
| POST | `/session/load-con` | Load a contingency (`.con`) file into the session |
| **Edit** |
| POST | `/session/edit` | Edit network element |
| **Power Flow** |
| POST | `/session/solve-flow` | Solve power flow calculation |
| POST | `/session/powerflow` | Get power flow results |
| **System** |
| GET | `/health` | Health check |
| GET | `/stat` | Statistics |

**See [API Reference](./documentations/03_API_REFERENCE.md) for complete endpoint reference with examples.**

---

## Configuration

Create or edit `config.yaml`:

```yaml
server:
  host: "0.0.0.0"
  port: 8080

storage:
  base_path: "./data"
  max_file_size: 10485760
  max_sessions_per_user: 10
  temp_file_ttl_hours: 24

solver:
  path: "../flow-solver/target/release/flow-solver"

log:
  level: "info"
  format: "json"
```

### User Authentication & Initial Admin Setup

This server uses PostgreSQL for user accounts and JWT for authentication. On first run you typically want one **admin** account for testing.

1. **Ensure Postgres is running**
   - In the repo root (`x-flow/`), start the Postgres service (host port 5433 by default):
     ```bash
     docker compose up -d postgres
     ```
   - The default DB settings (from `docker-compose.yml`) are:
     - `POSTGRES_USER=xflow`
     - `POSTGRES_PASSWORD=xflow_password`
     - `POSTGRES_DB=xflow`
   - The API server uses this database URL by default:
     ```text
     postgres://xflow:xflow_password@localhost:5433/xflow?sslmode=disable
     ```
     You can override it via `DATABASE_URL` or `database.url` in `config.yaml`.

2. **Seed the first admin user**
   - Before starting `api-server` the first time, set these environment variables:
     ```bash
     export AUTH_ADMIN_EMAIL=admin@example.com
     export AUTH_ADMIN_PASSWORD=ChangeMe123!
     export AUTH_JWT_SECRET='a-strong-random-secret'   # required for JWT signing
     ```
   - Then start the server:
     ```bash
go build -o api-server src/main.go
    ./api-server
     ```
   - On startup the auth service will:
     - Create the `users` table in Postgres (if it does not exist)
     - Check for a user with `email = AUTH_ADMIN_EMAIL`
     - If none exists, insert a new user with:
       - **Primary key**: internal UUID (`users.id`, used as `user_id` everywhere)
       - **Login identifier**: `email` (unique)
       - **Role**: `admin`

3. **How `user_id` is used**
   - The internal UUID (`users.id`) is the **canonical user identifier**:
     - All sessions, files, and results are keyed by this `user_id`.
     - Files are stored under:
       - `user-data/models/{user_id}/...`
       - `user-data/knowledge/{user_id}/...`
       - `user-data/sessions/{user_id}/{session_id}/...`
       - `user-data/results/{user_id}/{session_id}/...`
   - The email address is used only for:
     - Login (`/api/v1/auth/login`)
     - Display in the UI
   - JWT tokens contain both:
     - `uid` / `sub`: internal `users.id` (used by the API server)
     - `email`: user email (for convenience in clients)

4. **Logging in from the React UI**
   - Use the credentials you seeded above:
     - Email: `admin@example.com`
     - Password: `ChangeMe123!`
   - The React app will:
     - Call `/api/v1/auth/login`
     - Store the returned JWT
     - Attach `Authorization: Bearer <token>` to all subsequent API and MCP requests

### Refresh-Token Sessions

The server supports an access-token + refresh-token model so active sessions are not abruptly logged out when the short-lived access JWT expires, and so operators can revoke individual sessions or all sessions for a user.

**Environment variables:**

| Var | Default | Purpose |
| --- | --- | --- |
| `AUTH_ACCESS_TTL_MINUTES` | `15` | Lifetime of the access JWT in minutes. |
| `AUTH_REFRESH_TTL_DAYS` | `30` | Absolute lifetime of refresh tokens in days. |
| `AUTH_REFRESH_ENABLED` | `false` | Feature toggle. When `false`, login returns the legacy single-token shape and `/auth/refresh`, `/auth/logout`, `/auth/logout-all` return 404. |
| `AUTH_TOKEN_TTL_HOURS` | _(deprecated)_ | Honored for one release with a startup warning: if set and `AUTH_ACCESS_TTL_MINUTES` is unset, it is applied as `hours * 60` minutes. |

**Recommended rollout sequence** (see [openspec/changes/add-refresh-token-auth/design.md](../openspec/changes/add-refresh-token-auth/design.md)):

1. Deploy api-server with `AUTH_REFRESH_ENABLED=false`. The migration creates the `refresh_tokens` table (idempotent; no impact while the toggle is off).
2. Flip `AUTH_REFRESH_ENABLED=true` on staging. Login now returns `refresh_token` and `expires_in`; `/auth/refresh` is reachable.
3. Deploy react-ui with the interceptor changes. Old api-server is still fine — the interceptor falls back to the existing login-modal path if `/auth/refresh` 404s.
4. Roll the same sequence to production.
5. Monitor api-server logs for `Refresh token reuse detected; burning chain` events for ~1 week. A spike usually means a client race, not an attack — investigate before alarming.
6. Shorten access TTL by setting `AUTH_ACCESS_TTL_MINUTES=15` in production.
7. In the next release, remove the `AUTH_TOKEN_TTL_HOURS` fallback and delete the env var.

**Wire shapes:**

`POST /auth/login` (toggle on):
```json
{ "access_token": "<jwt>", "refresh_token": "<opaque>", "token_type": "Bearer", "expires_in": 900, "user": {...} }
```

`POST /auth/refresh`:
```json
// request
{ "refresh_token": "<opaque>" }
// 200 response
{ "access_token": "<jwt>", "refresh_token": "<new-opaque>", "token_type": "Bearer", "expires_in": 900 }
// 401 response — refresh token not found, expired, or revoked
{ "error": "unauthorized", "message": "Refresh token invalid" }
```

`POST /auth/logout` accepts `{ "refresh_token": "<opaque>" }` and always returns 204.

`POST /auth/logout-all` requires `Authorization: Bearer <access>` and returns 204.

**Security properties:**

- Refresh tokens are stored server-side as SHA-256 hashes (`refresh_tokens.token_hash`, `bytea`). The plaintext is returned to the client at issuance and never persisted again.
- Every `/auth/refresh` call rotates: the old row is marked `revoked_at = NOW()`, a new row is inserted, and `replaced_by_id` links the chain forward.
- Presenting an already-revoked refresh token walks the `replaced_by_id` chain forward and burns every active descendant. This is the leak-detection signal — logged via `Refresh token reuse detected; burning chain` with a hash-prefix for safe correlation.
- Rotation runs in a transaction with `SELECT ... FOR UPDATE` on the old row to serialize concurrent refreshes of the same token.
- agent-server requires **no change** — it continues to verify access JWTs with the shared `AUTH_JWT_SECRET`. Short-lived just means it sees fresher tokens.

**Known limitations / explicit non-goals:**

- An access token issued before logout remains valid until its own `exp` (up to 15 min). Use `/auth/logout-all` to invalidate refresh; a JWT denylist for instant access revocation is deliberately out of scope (would require Redis + a per-request cache lookup).
- HMAC (HS256) signing is unchanged. Migrating to asymmetric (RS256) so per-service key compromise has bounded blast radius is a worthwhile follow-up but independent.
- Tokens still live in `localStorage` on the client. Moving to `httpOnly` cookies is an independent UX/CSRF decision.
- DB-backed integration tests use `testcontainers-go` to spin up a real Postgres per `go test` run. See `src/auth/integration_harness_test.go` (shared container + per-test truncate) and `src/auth/refresh_tokens_integration_test.go` (rotation chain, reuse-detection, concurrent rotation under `FOR UPDATE`, logout semantics, feature-toggle 404 surface). Pure-function unit tests live in `src/auth/refresh_tokens_test.go`. Both run by default with `go test ./src/auth/`; integration tests `t.Skip` cleanly when Docker is unavailable so CI hosts without Docker still pass.

### Google OAuth Authentication

The server supports Google OAuth for user authentication. To enable it:

1. **Create Google OAuth credentials**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create OAuth 2.0 credentials
   - Add authorized redirect URIs:
     - `http://localhost:3000/auth/google/callback` (local development)
     - `https://flow.cypressera.ai/auth/google/callback` (production)

2. **Configure environment variables**
   ```bash
   # In .env file or environment
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   FRONTEND_BASE_URL=http://localhost:3000  # or your production URL
   ```

3. **OAuth flow**
   - Frontend calls `GET /api/v1/auth/google/url` to get authorization URL
   - User authorizes in Google popup
   - Google redirects to `/auth/google/callback?code=...`
   - Frontend sends code to `POST /api/v1/auth/google/callback`
   - Backend exchanges code for Google token, gets user email
   - Backend creates/finds user and returns JWT

4. **Docker configuration**
   Add to your `docker-compose.yml`:
   ```yaml
   environment:
     - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
     - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
     - FRONTEND_BASE_URL=${FRONTEND_BASE_URL}
   ```

### ⚠️ Important: Configure Solver Path

**You must set the `solver.path` in `config.yaml` to point to your built Rust solver binary.**

**Note:** If you haven't built the Rust solver yet, please refer to the flow-solver project for setup instructions.

- **Relative path** (recommended if solver is in sibling directory):
  ```yaml
  solver:
    path: "../flow-solver/target/release/flow-solver"
  ```

- **Absolute path** (if solver is in a different location):
  ```yaml
  solver:
    path: "/absolute/path/to/flow-solver/target/release/flow-solver"
  ```

**Verify the solver binary exists:**
```bash
ls -la ../flow-solver/target/release/flow-solver
# or
ls -la /your/configured/path/to/flow-solver
```

The API server will check for the solver binary on startup and fail if it's not found at the configured path.

**See [Configuration Guide](./documentations/05_CONFIGURATION.md) for detailed configuration options.**

---

## Project Structure

```
api-server/
├── src/
│   ├── main.go              # Entry point & routing
│   ├── handlers/api.go      # HTTP handlers
│   ├── services/            # Business logic services
│   │   ├── session.go       # Session management
│   │   ├── solver.go        # Power flow calculations
│   │   ├── editor.go        # Network editing
│   │   └── parser.go        # Network parsing
│   └── types/               # Type definitions
├── config.yaml              # Configuration
├── README.md                # This file
└── documentations/          # Documentation files
    ├── 01_GETTING_STARTED.md  # 📖 Getting started
    ├── 02_ARCHITECTURE.md      # 🏗️ Architecture guide
    ├── 03_API_REFERENCE.md     # 📘 API reference
    ├── 04_DEVELOPMENT.md        # 💻 Development guide
    ├── 05_CONFIGURATION.md     # ⚙️ Configuration guide
    └── archive/                # Archived documentation
```

---

## Development

### Building the Binary

**Build for current platform:**
```bash
go build -o api-server src/main.go
```

**Build for Linux:**
```bash
GOOS=linux GOARCH=amd64 go build -o api-server-linux src/main.go
```

**Keep binary up-to-date:**
Run the build command after making code changes, or use a file watcher to rebuild automatically.

**Testing:**
```bash
# Run tests
go test ./...

# Run the server directly
go run src/main.go
```

---

## Troubleshooting

**Go not found?**
- Make sure Go is installed (see [Prerequisites](#prerequisites))
- Verify Go is in your PATH: `which go`
- If installed but not found, add `/usr/local/go/bin` to your PATH

**Solver not found?**
- **If the Rust solver is not yet set up:** Go to the flow-solver project and follow its setup instructions
- **Configure the solver path in `config.yaml`:**
  Make sure `solver.path` points to the correct location of the built binary:
  ```yaml
  solver:
    path: "../flow-solver/target/release/flow-solver"
  ```
- **Verify the binary exists:**
  ```bash
  ls -la ../flow-solver/target/release/flow-solver
  ```
- **Check the path is correct:**
  - Use absolute path if relative path doesn't work
  - Ensure the path in `config.yaml` matches where you built the solver

**Timeout errors?**
- The api-server execs the Rust solver as a subprocess and reads results
  from the solver's `--output` file; the solver makes no network calls.
- Verify the solver binary at `solver.path` is executable.
- Check that the session storage directory is writable (the api-server
  allocates per-run result files under `sessions/<user>/<session>/runs/`).
- Check logs for the solver's structured error line on non-zero exit.

**More help:**
- **Architecture issues**: See [Architecture Guide](./documentations/02_ARCHITECTURE.md)
- **API usage**: See [API Reference](./documentations/03_API_REFERENCE.md)
- **Configuration issues**: See [Configuration Guide](./documentations/05_CONFIGURATION.md)
- **Development questions**: See [Development Guide](./documentations/04_DEVELOPMENT.md)

---

## License

MIT License

---

## Getting Help

1. Check the documentation files:
   - [Getting Started Guide](./documentations/01_GETTING_STARTED.md) - Quick start and basics
   - [Architecture Guide](./documentations/02_ARCHITECTURE.md) - How the system works
   - [API Reference](./documentations/03_API_REFERENCE.md) - How to use the APIs
   - [Development Guide](./documentations/04_DEVELOPMENT.md) - Development and contributing
   - [Configuration Guide](./documentations/05_CONFIGURATION.md) - Configuration options

2. Check logs:
   ```bash
   tail -f server.log
   ```

3. Health check:
   ```bash
   curl http://localhost:8080/health
   ```

---

**Documentation**: [Getting Started](./documentations/01_GETTING_STARTED.md) | [Architecture](./documentations/02_ARCHITECTURE.md) | [API Reference](./documentations/03_API_REFERENCE.md) | [Development](./documentations/04_DEVELOPMENT.md) | [Configuration](./documentations/05_CONFIGURATION.md)  
**Last Updated**: 2025-01-15  
**Version**: 1.0.0
