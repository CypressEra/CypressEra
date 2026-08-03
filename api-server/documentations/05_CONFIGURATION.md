# Configuration Guide

## Configuration File

The API server uses `config.yaml` for configuration. The file should be located in the project root directory.

## Configuration Structure

```yaml
server:
  host: "0.0.0.0"
  port: 8080

storage:
  base_path: "../user-data"
  max_file_size: 10485760
  max_sessions_per_user: 5

solver:
  path: "../flow-solver/target/release/flow-solver"

log:
  level: "info"
  format: "json"

gin:
  mode: "debug"
```

## Server Configuration

### host

**Type:** string  
**Default:** `"0.0.0.0"`  
**Description:** Server host address. Use `0.0.0.0` to listen on all interfaces, or `127.0.0.1` for localhost only.

**Example:**
```yaml
server:
  host: "0.0.0.0"  # Listen on all interfaces
  # or
  host: "127.0.0.1"  # Localhost only
```

### port

**Type:** integer  
**Default:** `8080`  
**Description:** Server port number.

**Example:**
```yaml
server:
  port: 8080
```

## Storage Configuration

### base_path

**Type:** string  
**Default:** `"../user-data"` (relative to project root)  
**Description:** Base directory for storing user files, sessions, and results. Can be absolute or relative path. Environment variable `STORAGE_BASE_PATH` overrides this setting.

**Storage Structure:**
```
{base_path}/
├── models/              # User model files
│   └── {user_id}/
├── knowledge/           # Knowledge base files
│   └── {user_id}/
├── sessions/            # Session workspaces
│   └── {user_id}/
│       └── {session_id}/
└── results/             # Calculation results
    └── {user_id}/
        └── {session_id}/
```

**Example:**
```yaml
storage:
  base_path: "../user-data"  # Relative path
  # or
  base_path: "/var/lib/x-flow/data"  # Absolute path
```

**Environment Variable:**
```bash
export STORAGE_BASE_PATH="/custom/path/to/data"
```

### max_file_size

**Type:** integer (bytes)  
**Default:** `10485760` (10 MB)  
**Description:** Maximum file size for uploads in bytes.

**Example:**
```yaml
storage:
  max_file_size: 10485760  # 10 MB
  # or
  max_file_size: 52428800  # 50 MB
```

### max_sessions_per_user

**Type:** integer  
**Default:** `5`  
**Description:** Maximum number of active sessions per user. When exceeded, oldest sessions are automatically cleaned up (FIFO).

**Example:**
```yaml
storage:
  max_sessions_per_user: 5
```

## Solver Configuration

### path

**Type:** string  
**Default:** `"../flow-solver/target/release/flow-solver"`  
**Description:** Path to the Rust flow-solver binary. Can be absolute or relative path. The path is automatically resolved to absolute.

**⚠️ Important:** This path must point to a valid, executable Rust solver binary.

**Example:**
```yaml
solver:
  path: "../flow-solver/target/release/flow-solver"  # Relative path
  # or
  path: "/usr/local/bin/flow-solver"  # Absolute path
```

**Verification:**
```bash
# Check if solver exists
ls -la ../flow-solver/target/release/flow-solver

# Check if executable
file ../flow-solver/target/release/flow-solver
```

## Logging Configuration

### level

**Type:** string  
**Default:** `"info"`  
**Options:** `"debug"`, `"info"`, `"warn"`, `"error"`  
**Description:** Logging level. Lower levels include higher levels (debug includes all, error only errors).

**Example:**
```yaml
log:
  level: "info"  # Production
  # or
  level: "debug"  # Development
```

### format

**Type:** string  
**Default:** `"json"`  
**Options:** `"json"`, `"console"`  
**Description:** Log output format. Use `json` for production (structured logging), `console` for development (human-readable).

**Example:**
```yaml
log:
  format: "json"  # Production
  # or
  format: "console"  # Development
```

## Gin Framework Configuration

### mode

**Type:** string  
**Default:** `"debug"`  
**Options:** `"debug"`, `"release"`  
**Description:** Gin framework mode. Use `debug` for development (verbose logging), `release` for production (optimized).

**Example:**
```yaml
gin:
  mode: "debug"  # Development
  # or
  mode: "release"  # Production
```

## Environment Variables

The following environment variables can override configuration file settings:

### STORAGE_BASE_PATH

Overrides `storage.base_path`:

```bash
export STORAGE_BASE_PATH="/custom/path/to/data"
```

### API_SERVER_URL

Sets the API server URL for Rust solver callbacks:

```bash
export API_SERVER_URL="http://localhost:8080"
```

**Default:** `"http://localhost:8080"`

### AUTH_JWT_SECRET

Secret key used to sign JWT access tokens for user authentication.

```bash
export AUTH_JWT_SECRET="a-strong-random-secret"
```

- **Required in production** – do not rely on the default.
- Should be a long, random string managed via your secret store.

### AUTH_TOKEN_TTL_HOURS

Controls how long issued access tokens are valid (in hours).

```bash
export AUTH_TOKEN_TTL_HOURS=24
```

- **Default:** `24` (if not set or invalid).

### AUTH_ADMIN_EMAIL / AUTH_ADMIN_PASSWORD

Used to seed an initial admin user on startup (optional but recommended for first-run):

```bash
export AUTH_ADMIN_EMAIL="admin@example.com"
export AUTH_ADMIN_PASSWORD="ChangeMe123!"
```

If both are set, the server will:

- Ensure a `users` table exists in PostgreSQL.
- Create an admin user with the given email and password if it does not exist.

## Configuration Precedence

1. **Environment variables** (highest priority)
2. **config.yaml** file
3. **Default values** (lowest priority)

## Example Configurations

### Development Configuration

```yaml
server:
  host: "127.0.0.1"
  port: 8080

storage:
  base_path: "./dev-data"
  max_file_size: 52428800  # 50 MB
  max_sessions_per_user: 10

solver:
  path: "../flow-solver/target/debug/flow-solver"

log:
  level: "debug"
  format: "console"

gin:
  mode: "debug"
```

### Production Configuration

```yaml
server:
  host: "0.0.0.0"
  port: 8080

storage:
  base_path: "/var/lib/x-flow/data"
  max_file_size: 10485760  # 10 MB
  max_sessions_per_user: 5

solver:
  path: "/usr/local/bin/flow-solver"

log:
  level: "info"
  format: "json"

gin:
  mode: "release"
```

### Docker Configuration

```yaml
server:
  host: "0.0.0.0"
  port: 8080

storage:
  base_path: "/app/data"
  max_file_size: 10485760
  max_sessions_per_user: 5

solver:
  path: "/app/bin/flow-solver"

log:
  level: "info"
  format: "json"

gin:
  mode: "release"
```

## Configuration Validation

The server validates configuration on startup:

1. **Solver path** - Checks if binary exists and is executable
2. **Storage path** - Creates directories if they don't exist
3. **Port availability** - Checks if port is available for binding

## Troubleshooting

### Solver Not Found

**Error:** `solver binary not found at: ...`

**Solutions:**
1. Verify solver path in `config.yaml`
2. Check file exists: `ls -la <path>`
3. Check file is executable: `file <path>`
4. Use absolute path if relative path doesn't work
5. Ensure Rust solver is built: `cd flow-solver && cargo build --release`

### Port Already in Use

**Error:** `Port already in use`

**Solutions:**
1. Change port in `config.yaml`
2. Kill existing process:
   ```bash
   lsof -i :8080
   kill -9 <PID>
   ```
3. Use different port

### Storage Path Issues

**Error:** `failed to create directory`

**Solutions:**
1. Check directory permissions
2. Ensure parent directory exists
3. Use absolute path
4. Check disk space

### Configuration Not Loading

**Error:** Configuration not taking effect

**Solutions:**
1. Verify `config.yaml` is in project root
2. Check YAML syntax (use YAML validator)
3. Restart server after configuration changes
4. Check environment variables aren't overriding

## Best Practices

1. **Use absolute paths** for production deployments
2. **Set appropriate file size limits** based on use case
3. **Use JSON logging** in production for structured logs
4. **Set Gin mode to release** in production
5. **Validate configuration** before deployment
6. **Document custom configurations** for your environment

## Next Steps

- See [Getting Started Guide](./01_GETTING_STARTED.md) for initial setup
- Read [Architecture Guide](./02_ARCHITECTURE.md) for system details
- Check [Development Guide](./04_DEVELOPMENT.md) for development setup

